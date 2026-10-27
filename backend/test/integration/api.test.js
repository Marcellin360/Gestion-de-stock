// ============================================================================
// Tests d'intégration : parcours complets de l'application sur une base dédiée.
// Prérequis : une base VIDE dans DATABASE_URL (le test recrée le schéma).
// Exécution : npm run test:integration
//
// Les parcours suivent l'organisation réelle du projet :
//   RÉCEPTION (entrée au dépôt) → TRANSFERT (dépôt → pharmacie) → VENTE (comptoir)
//   + pertes, inventaires et rapports, magasin par magasin.
// Il n'y a ni commande fournisseur ni retour fournisseur.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sequelize, close } from '../../src/config/database.js';
import { User, Role, Product, Setting } from '../../src/models/index.js';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/index.js';

let server;
let base;
let cookie;          // session administrateur
let csrf;
let sessionDepot;    // session du gestionnaire du dépôt
let sessionPharmacie;// session du pharmacien
// 2.7.29 — « aujourd'hui » vu par les tests = la date métier de la pharmacie
// (Indian/Antananarivo), pas le jour UTC de la machine : le programme
// (dates du jour, fenêtres +03:00) raisonne à l'heure locale, sinon les tests
// lancés après 21 h UTC (minuit à Tana) cherchaient dans le mauvais jour.
const formateurDateMetier = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit'
});
const jourMetier = () => formateurDateMetier.format(new Date());
const day = offset => new Date(new Date(`${jourMetier()}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();
let product; let supplier; let category;
let lotA; let lotB;                 // lots du DÉPÔT
let lotAPharmacie; let lotBPharmacie; // leurs jumeaux en PHARMACIE

async function call(path, method = 'GET', body, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.cookie ? { Cookie: options.cookie } : cookie ? { Cookie: cookie } : {}),
    ...(options.noCsrf ? {} : { 'X-CSRF-Token': options.csrf ?? csrf }),
    ...(options.origin ? { Origin: options.origin } : {})
  };
  if (process.env.PHARMA_DEBUG === '1') console.log('[requête]', method, path);
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const setCookie = response.headers.getSetCookie?.()[0];
  const payload = await response.json().catch(() => ({}));
  if (process.env.PHARMA_DEBUG === '1' && response.status >= 400) {
    console.log('[réponse]', response.status, method, path, JSON.stringify(payload));
  }
  return { status: response.status, body: payload, cookie: setCookie?.split(';')[0] };
}

/** Données de travail vues par l'administrateur. */
const data = async () => (await call('/api/data')).body;
const lotDuMagasin = (donnees, numero, magasin) =>
  donnees.lots.find(l => l.number === numero && l.location === magasin);

test('initialisation : schéma recréé, trois rôles (ADMIN, PHARMACIST, DEPOT)', async () => {
  // Garde-fou : ces tests effacent le schéma de la base ciblée. Ils refusent donc
  // de s'exécuter sur autre chose qu'une base de test (nom terminé par « _test »),
  // pour qu'une commande lancée par erreur ne touche jamais la base de l'officine.
  const nomBase = String(config.databaseUrl).split('?')[0].split('/').pop();
  assert.ok(/_test$/.test(nomBase),
    `Refus d'exécuter les tests sur la base « ${nomBase} » : indiquez une base de test, `
    + 'par exemple DATABASE_URL=postgres://pharmastock:motdepasse@127.0.0.1:5432/pharmacie_stock_test');

  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, stdio: 'pipe'
  });
  const roles = await Role.findAll();
  assert.equal(roles.length, 3, 'trois rôles : administrateur, pharmacien, dépôt');
  assert.deepEqual(roles.map(r => r.code).sort(), ['ADMIN', 'DEPOT', 'PHARMACIST']);
  assert.ok(await Setting.findByPk(1), 'les paramètres par défaut doivent exister');

  const motDePasse = await bcrypt.hash('MotDePasse-Test-2026', 4);
  const creer = async (code, name, login) => {
    const role = roles.find(r => r.code === code);
    return User.create({
      name, login, passwordHash: motDePasse, roleId: role.id, active: true,
      phone: '', note: '', createdAt: new Date(), updatedAt: new Date()
    });
  };
  await creer('ADMIN', 'Admin Test', 'admin-test');
  await creer('DEPOT', 'Dépôt Test', 'depot-test');
  await creer('PHARMACIST', 'Pharmacien Test', 'pharmacien-test');

  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test('authentification : mot de passe erroné, session, jeton CSRF, origine', async () => {
  assert.equal((await call('/api/auth/login', 'POST', { login: 'admin-test', password: 'faux' })).status, 401);
  const response = await call('/api/auth/login', 'POST', { login: 'admin-test', password: 'MotDePasse-Test-2026' });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.roleCode, 'ADMIN');
  assert.ok(response.body.user.permissions.includes('receipt'));
  assert.ok(response.body.user.permissions.includes('transfer'));
  assert.ok(!response.body.user.permissions.includes('order'), 'la permission « order » n’existe plus');
  cookie = response.cookie;
  csrf = response.body.csrf;
  assert.ok(cookie.startsWith('ps_session='));
  assert.equal((await call('/api/data', 'POST', {}, { noCsrf: true })).status, 403);
  assert.equal((await call('/api/sales', 'POST', {}, { cookie: 'ps_session=faux', csrf: 'x' })).status, 401);
  assert.equal((await call('/api/losses', 'POST', {}, { origin: 'https://attaquant.example' })).status, 403);

  // Les deux profils métier se connectent aussi.
  const depot = await call('/api/auth/login', 'POST', { login: 'depot-test', password: 'MotDePasse-Test-2026' });
  sessionDepot = { cookie: depot.cookie, csrf: depot.body.csrf };
  assert.equal(depot.body.user.roleCode, 'DEPOT');
  const pharmacie = await call('/api/auth/login', 'POST', { login: 'pharmacien-test', password: 'MotDePasse-Test-2026' });
  sessionPharmacie = { cookie: pharmacie.cookie, csrf: pharmacie.body.csrf };
  assert.equal(pharmacie.body.user.roleCode, 'PHARMACIST');
});

test('routes supprimées : commandes et retours fournisseur ne répondent plus', async () => {
  for (const path of ['/api/orders', '/api/returns']) {
    assert.equal((await call(path)).status, 404, `${path} ne doit plus exister`);
    assert.equal((await call(path, 'POST', {})).status, 404, `${path} en écriture`);
  }
});

test('référentiels : catégorie, fournisseur, médicament', async () => {
  category = (await call('/api/categories', 'POST', { name: 'Antibiotiques', description: 'Famille de test', active: true })).body;
  supplier = (await call('/api/suppliers', 'POST', { name: 'Grossiste Test', contact: '', phone: '0340000000', email: '', address: 'Antananarivo', nif: '', note: '', active: true })).body;
  const response = await call('/api/products', 'POST', {
    code: 'TEST-001', name: 'Amoxicilline 500 mg', ingredient: 'Amoxicilline', dosage: '500 mg',
    form: 'Gélule', presentation: 'Boîte de 20', barcode: '1234567890123', categoryId: category.id,
    manufacturer: 'Laboratoire Test', unit: 'boîte', minStock: 10, maxStock: null,
    storage: 'À l’abri de l’humidité', note: '', active: true, marginRate: 20
  });
  assert.equal(response.status, 201);
  product = response.body;
  assert.equal((await call('/api/categories', 'POST', { name: 'Antibiotiques', description: '', active: true })).status, 409);
});

test('médicament : taux de marge hors plage refusé, montant négatif refusé', async () => {
  const baseProduit = { code: 'TEST-002', name: 'Hors plage', ingredient: '', dosage: '', form: '', presentation: '', barcode: null, categoryId: null, manufacturer: '', unit: 'boîte', minStock: 5, maxStock: null, storage: '', note: '', active: true };
  assert.equal((await call('/api/products', 'POST', { ...baseProduit, marginRate: 45 })).status, 422);
  assert.equal((await call('/api/products', 'POST', { ...baseProduit, marginRate: -2 })).status, 422);
});

test('réception : la marchandise entre au DÉPÔT, coût de revient 8 800 Ar (8 000 × 1,10), CMP, prix 10 560 Ar', async () => {
  const receipt = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '100000', note: 'Réception initiale',
    lines: [{
      productId: product.id, number: 'lot-a', quantity: 100,
      purchasePrice: '8000', receivedOn: day(0), expiresOn: day(300), manufacturedOn: null
    }]
  });
  assert.equal(receipt.status, 201);
  assert.equal(receipt.body.costTotal, '880000.000000');   // 100 × 8 800 (PA 8 000 + frais automatiques 10 %)
  assert.match(receipt.body.reference, /^REC-\d{4}-\d{6}$/);
  assert.equal(receipt.body.location, 'DEPOT', 'toute réception est une entrée au dépôt');

  const donnees = await data();
  lotA = lotDuMagasin(donnees, 'LOT-A', 'DEPOT');       // numéro normalisé en majuscules
  assert.ok(lotA, 'le lot doit exister dans le dépôt');
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'PHARMACY'), undefined,
    'rien ne doit apparaître en pharmacie avant le transfert');
  assert.equal(lotA.unitCost, '8800.000000');   // CU = PA 8 000 × 1,10 (frais automatiques, 2.7.47)
  assert.equal(lotA.quantity, 100);
  assert.equal(lotA.receivedQuantity, 100);
  const stored = donnees.products.find(p => p.id === product.id);
  assert.equal(stored.cmp, '8800.000000');
  assert.equal(stored.sellingPrice, '10560.000000');   // PV = CMP 8 800 × 1,20
  assert.ok(donnees.movements.some(m => m.kind === 'RECEIPT' && m.quantity === 100 && m.location === 'DEPOT'));
});

test('réception : lot expiré refusé, dates incohérentes refusées, date future refusée', async () => {
  const expired = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '', lines: [{
      productId: product.id, number: 'LOT-EXPIRE', quantity: 10, purchasePrice: '1000',
      receivedOn: day(0), expiresOn: day(-1), manufacturedOn: null
    }]
  });
  assert.equal(expired.status, 422);

  const incoherent = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '', lines: [{
      productId: product.id, number: 'LOT-DATE', quantity: 10, purchasePrice: '1000',
      receivedOn: day(0), expiresOn: day(100), manufacturedOn: day(5)
    }]
  });
  assert.equal(incoherent.status, 422);

  const future = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '', lines: [{
      productId: product.id, number: 'LOT-FUTUR', quantity: 10, purchasePrice: '1000',
      receivedOn: day(3), expiresOn: day(100), manufacturedOn: null
    }]
  });
  assert.equal(future.status, 422);
});

test('deuxième lot au dépôt : CMP recalculé (9 533,33 Ar)', async () => {
  const deuxieme = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: 'Deuxième livraison', lines: [{
      productId: product.id, number: 'LOT-B', quantity: 50, purchasePrice: '10000',
      receivedOn: day(0), expiresOn: day(30), manufacturedOn: null
    }]
  });
  assert.equal(deuxieme.status, 201);
  const donnees = await data();
  lotB = lotDuMagasin(donnees, 'LOT-B', 'DEPOT');
  assert.ok(lotB);
  assert.equal(donnees.products.find(p => p.id === product.id).cmp, '9533.333333'); // (100×8800 + 50×11000) / 150
});

test('transfert : le dépôt sort, la pharmacie entre, les deux stocks sont séparés', async () => {
  const transfert = await call('/api/transfers', 'POST', {
    requestKey: uuid(), fromLocation: 'DEPOT', toLocation: 'PHARMACY',
    reason: 'Réassort du comptoir', note: 'Besoin du week-end',
    lines: [{ lotId: lotA.id, quantity: 40 }, { lotId: lotB.id, quantity: 30 }]
  }, sessionDepot);
  assert.equal(transfert.status, 201, JSON.stringify(transfert.body));
  assert.match(transfert.body.reference, /^TRF-\d{4}-\d{6}$/);
  assert.equal(transfert.body.costTotal, '682000.000000');   // 40×8800 + 30×11000

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity, 60);
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'DEPOT').quantity, 20);
  lotAPharmacie = lotDuMagasin(donnees, 'LOT-A', 'PHARMACY');
  lotBPharmacie = lotDuMagasin(donnees, 'LOT-B', 'PHARMACY');
  assert.equal(lotAPharmacie.quantity, 40, 'le lot jumeau est créé au comptoir');
  assert.equal(lotBPharmacie.quantity, 30);
  assert.equal(lotAPharmacie.number, 'LOT-A', 'même numéro de lot : la traçabilité suit');
  assert.equal(lotAPharmacie.expiresOn, lotA.expiresOn, 'même péremption');
  assert.equal(lotAPharmacie.unitCost, '8800.000000', 'même coût de revient');
  assert.notEqual(lotAPharmacie.id, lotA.id, 'les deux magasins ont des lots distincts');

  const mouvements = donnees.movements.filter(m => m.documentType === 'TRANSFER');
  assert.ok(mouvements.some(m => m.kind === 'TRANSFER_OUT' && m.location === 'DEPOT' && m.quantity === -40));
  assert.ok(mouvements.some(m => m.kind === 'TRANSFER_IN' && m.location === 'PHARMACY' && m.quantity === 40));
  assert.equal(donnees.stats.stockValue !== undefined, true);
});

test('transfert : idempotence, magasin identique refusé, quantité excessive refusée, motif obligatoire', async () => {
  const cle = uuid();
  const payload = {
    requestKey: cle, reason: 'Demande du pharmacien',
    lines: [{ lotId: lotA.id, quantity: 5 }]
  };
  const premier = await call('/api/transfers', 'POST', payload);
  const deuxieme = await call('/api/transfers', 'POST', payload);
  assert.equal(premier.status, 201);
  assert.equal(deuxieme.status, 201);
  assert.equal(premier.body.id, deuxieme.body.id, 'le rejeu ne transfère pas deux fois');
  assert.equal(lotDuMagasin(await data(), 'LOT-A', 'DEPOT').quantity, 55);

  assert.equal((await call('/api/transfers', 'POST', {
    requestKey: uuid(), fromLocation: 'DEPOT', toLocation: 'DEPOT', reason: 'Test', lines: [{ lotId: lotA.id, quantity: 1 }]
  })).status, 422, 'même magasin de départ et d’arrivée');

  assert.equal((await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Test quantité', lines: [{ lotId: lotA.id, quantity: 99999 }]
  })).status, 422, 'quantité supérieure au stock du dépôt');

  assert.equal((await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'ok', lines: [{ lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422, 'un lot de la pharmacie ne peut pas être transféré depuis le dépôt');
});

test('vente : FEFO sur le stock de la PHARMACIE, marge, référence VTE', async () => {
  const devis = await call('/api/sales/quote', 'POST', { note: '', lines: [{ productId: product.id, quantity: 3 }] });
  assert.equal(devis.status, 200);
  assert.equal(devis.body.lines[0].lot, 'LOT-B', 'FEFO : le lot du comptoir qui expire le plus tôt');
  // 2.7.8 : le prix appliqué au comptoir est CELUI DU CATALOGUE, calculé sur le
  // CMP (9 533,333333 × 1,2 = 11 440) — et non le prix du lot sorti (11 000 × 1,2).
  // Le même médicament se vend donc au même prix toute la journée, quel que soit
  // le lot que FEFO a sorti.
  assert.equal(devis.body.lines[0].unitPrice, '11440.000000');
  assert.equal(devis.body.lines[0].unitCost, '11000.000000', 'le coût du lot sorti reste celui du lot');
  assert.equal(devis.body.total, '34320.000000');

  const vente = await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: '34320.000000', customerName: 'Client test', note: '',
    lines: [{ productId: product.id, quantity: 3 }]
  }, sessionPharmacie);
  assert.equal(vente.status, 201);
  assert.match(vente.body.reference, /^VTE-\d{4}-\d{6}$/);
  assert.equal(vente.body.margin, '1320.000000');   // 3 × (11 440 − 11 000)

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'PHARMACY').quantity, 27);
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'DEPOT').quantity, 20, 'la vente ne touche pas la réserve');
  assert.equal(donnees.locations.PHARMACY.stats.salesToday, '34320.000000');
  assert.equal(donnees.locations.DEPOT.stats.salesToday, '0.000000', 'le dépôt ne vend pas');
  assert.equal(donnees.locations.DEPOT.stats.stockValue !== undefined, true);
});

test('vente : total périmé refusé (409), stock de la pharmacie insuffisant refusé (422)', async () => {
  assert.equal((await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: '1.000000', note: '', lines: [{ productId: product.id, quantity: 1 }]
  }, sessionPharmacie)).status, 409);

  // La réserve contient encore des boîtes, mais elles ne sont pas vendables :
  // il faut d'abord les transférer.
  const trop = await call('/api/sales', 'POST', {
    requestKey: uuid(), note: '', lines: [{ productId: product.id, quantity: 100 }]
  }, sessionPharmacie);
  assert.equal(trop.status, 422);
  // Le message doit dire COMBIEN d'unités sont vendables (et non seulement refuser) :
  // c'est ce qui permet au caissier de corriger sans deviner. 2.7.12 : le nombre
  // est annoncé DANS L'UNITÉ demandée (boîte / plaquette / vongany).
  assert.match(trop.body.error, /\d+ boîte\(s\) vendable\(s\), \d+ demandée\(s\)/,
    'le refus annonce la quantité vendable dans l’unité demandée');
  assert.match(trop.body.error, /dépôt/, 'le refus rappelle que le dépôt doit être transféré');

  assert.equal((await call('/api/sales', 'POST', {
    requestKey: uuid(), note: '', lines: [{ productId: product.id, quantity: 1.5 }]
  }, sessionPharmacie)).status, 422);

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity, lotA.quantity - 40 - 5,
    'aucun déstockage du dépôt par une vente refusée');
});

test('vente : le panier de l’écran (productId + quantity) est accepté, « quantite » refusé avec un message clair', async () => {
  // Le devis ne touche pas au stock : les tests suivants gardent leurs quantités.
  const panier = { note: '', lines: [{ productId: product.id, quantity: 2 }] };
  const devis = await call('/api/sales/quote', 'POST', panier, sessionPharmacie);
  assert.equal(devis.status, 200, JSON.stringify(devis.body));
  assert.ok(Number(devis.body.total) > 0);
  assert.equal(devis.body.lines[0].quantity, 2);

  // Ancien nom de champ (bug corrigé en 2.7.2) : refus lisible, jamais le
  // message technique anglais « Unrecognized key(s) in object: 'quantite' ».
  const faute = await call('/api/sales/quote', 'POST',
    { note: '', lines: [{ productId: product.id, quantite: 2 }] }, sessionPharmacie);
  assert.equal(faute.status, 422);
  assert.match(faute.body.error, /quantity/, 'le message doit indiquer le nom de champ attendu');
  assert.match(faute.body.error, /quantité/, 'le message doit parler français');
  assert.doesNotMatch(faute.body.error, /Unrecognized key/, 'plus de message zod brut');
  assert.ok(faute.body.details.some(detail => /lignes 1/.test(detail)), 'le détail doit situer la ligne fautive');
});

test('vente : la même clé de requête ne double pas le déstockage (idempotence)', async () => {
  const cle = uuid();
  const payload = { requestKey: cle, note: '', lines: [{ productId: product.id, quantity: 1 }] };
  const premier = await call('/api/sales', 'POST', payload, sessionPharmacie);
  const encore = await call('/api/sales', 'POST', payload, sessionPharmacie);
  assert.equal(premier.status, 201);
  assert.equal(encore.status, 201);
  assert.equal(premier.body.id, encore.body.id);
  assert.equal(lotDuMagasin(await data(), 'LOT-B', 'PHARMACY').quantity, 26);
});

test('lots bloqués puis débloqués : exclus de la vente, toujours comptés', async () => {
  assert.equal((await call(`/api/lots/${lotBPharmacie.id}/status`, 'PUT', { status: 'BLOCKED', reason: 'Contrôle qualité en cours' })).status, 200);
  const devis = await call('/api/sales/quote', 'POST', { note: '', lines: [{ productId: product.id, quantity: 5 }] });
  assert.equal(devis.body.lines[0].lot, 'LOT-A', 'le lot bloqué ne doit pas être proposé au comptoir');
  assert.equal((await call(`/api/lots/${lotBPharmacie.id}/status`, 'PUT', { status: 'AVAILABLE', reason: 'Contrôle conforme' })).status, 200);
});

test('pertes : déclarées magasin par magasin, jamais au coût de vente', async () => {
  const avantPertes = await data();
  const stockAvantComptoir = lotDuMagasin(avantPertes, 'LOT-A', 'PHARMACY').quantity;
  const stockAvantReserve = lotDuMagasin(avantPertes, 'LOT-A', 'DEPOT').quantity;
  // Perte au comptoir sur le lot jumeau du comptoir.
  const pertePharmacie = await call('/api/losses', 'POST', {
    requestKey: uuid(), location: 'PHARMACY', reason: 'Casse', note: 'Trois flacons cassés au comptoir',
    lines: [{ lotId: lotAPharmacie.id, quantity: 3 }]
  });
  assert.equal(pertePharmacie.status, 201);
  assert.equal(pertePharmacie.body.location, 'PHARMACY');
  assert.equal(pertePharmacie.body.costTotal, '26400.000000');   // 3 × 8 800 Ar

  // Le même lot ne peut pas être sorti depuis l'autre magasin.
  assert.equal((await call('/api/losses', 'POST', {
    requestKey: uuid(), location: 'DEPOT', reason: 'Casse', note: 'Mauvais magasin',
    lines: [{ lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422);

  // Perte dans la réserve, déclarée par le dépôt.
  const perteDepot = await call('/api/losses', 'POST', {
    requestKey: uuid(), location: 'DEPOT', reason: 'Détérioration', note: 'Carton écrasé dans la réserve',
    lines: [{ lotId: lotA.id, quantity: 2 }]
  }, sessionDepot);
  assert.equal(perteDepot.status, 201);
  assert.equal(perteDepot.body.costTotal, '17600.000000');

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'PHARMACY').quantity, stockAvantComptoir - 3,
    'la perte sort bien du lot du comptoir');
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity, stockAvantReserve - 2,
    'la perte de la réserve sort du lot du dépôt');
  assert.equal(donnees.locations.PHARMACY.stats.lossesToday, '26400.000000');
  assert.equal(donnees.locations.DEPOT.stats.lossesToday, '17600.000000');
  assert.equal(donnees.locations.DEPOT.stats.stockValue !== undefined, true);
});

test('pertes : motif inventé refusé, remarque obligatoire, lot en double refusé', async () => {
  const basePerte = { location: 'PHARMACY', reason: 'Casse' };
  assert.equal((await call('/api/losses', 'POST', {
    requestKey: uuid(), ...basePerte, reason: 'Motif inventé', note: 'Essai', lines: [{ lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422);
  assert.equal((await call('/api/losses', 'POST', {
    requestKey: uuid(), ...basePerte, note: '', lines: [{ lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422);
  assert.equal((await call('/api/losses', 'POST', {
    requestKey: uuid(), ...basePerte, note: 'Test double ligne',
    lines: [{ lotId: lotAPharmacie.id, quantity: 1 }, { lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422);
  assert.equal((await call('/api/losses', 'POST', {
    requestKey: uuid(), reason: 'Casse', note: 'Sans magasin', lines: [{ lotId: lotAPharmacie.id, quantity: 1 }]
  })).status, 422, 'le magasin est obligatoire');
});

test('annulation d’un transfert : les quantités reviennent au dépôt', async () => {
  const donnees = await data();
  const avantReserve = lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity;
  const avantComptoir = lotDuMagasin(donnees, 'LOT-A', 'PHARMACY').quantity;
  const transfert = (await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Produit très demandé', lines: [{ lotId: lotDuMagasin(donnees, 'LOT-A', 'DEPOT').id, quantity: 10 }]
  })).body;
  assert.equal(lotDuMagasin(await data(), 'LOT-A', 'DEPOT').quantity, avantReserve - 10);

  const annulation = await call(`/api/documents/TRANSFER/${transfert.id}/cancel`, 'POST',
    { reason: 'Erreur de saisie : le comptoir n’avait pas besoin de ce lot' });
  assert.equal(annulation.status, 200);
  assert.equal(annulation.body.status, 'CANCELLED');

  const apres = await data();
  assert.equal(lotDuMagasin(apres, 'LOT-A', 'DEPOT').quantity, avantReserve, 'le stock revient dans la réserve');
  assert.equal(lotDuMagasin(apres, 'LOT-A', 'PHARMACY').quantity, avantComptoir, 'le comptoir est ramené à son état précédent');
  assert.ok(apres.movements.some(m => m.kind === 'CANCEL' && m.documentId === transfert.id));
  assert.equal((await call(`/api/documents/TRANSFER/${transfert.id}/cancel`, 'POST', { reason: 'Deuxième tentative' })).status, 422);
});

test('document : détail du transfert, bordereau imprimable', async () => {
  const donnees = await data();
  const transfert = donnees.documents.filter(d => d.kind === 'TRANSFER').sort((a, b) => a.id - b.id)[0];
  const detail = (await call(`/api/documents/TRANSFER/${transfert.id}`)).body;
  assert.ok(detail.lines.length >= 1);
  assert.equal(detail.fromLocation, 'DEPOT');
  assert.equal(detail.toLocation, 'PHARMACY');
  assert.ok(detail.movements.some(m => m.location === 'DEPOT') && detail.movements.some(m => m.location === 'PHARMACY'));

  const imprimable = await fetch(`${base}/api/documents/TRANSFER/${transfert.id}/print`, { headers: { Cookie: cookie } });
  assert.equal(imprimable.status, 200);
  const html = await imprimable.text();
  assert.ok(html.includes('Bordereau de transfert'));
  assert.ok(html.includes('Dépôt'));

  // Réception : le bon de réception mentionne le dépôt.
  const reception = donnees.documents.filter(d => d.kind === 'RECEIPT').sort((a, b) => a.id - b.id)[0];
  const bonReception = await (await fetch(`${base}/api/documents/RECEIPT/${reception.id}/print`, { headers: { Cookie: cookie } })).text();
  assert.ok(bonReception.includes('Bon de réception'));
  assert.ok(bonReception.includes('Coût de revient'));
});

test('inventaire : un par magasin, écart justifié, ajustement au bon endroit', async () => {
  const inventairePharmacie = (await call('/api/inventories', 'POST', { location: 'PHARMACY', scope: 'Comptoir', note: 'Comptage du mois' })).body;
  assert.match(inventairePharmacie.reference, /^INV-\d{4}-\d{6}$/);
  assert.equal(inventairePharmacie.location, 'PHARMACY');

  // Un inventaire de la pharmacie peut être ouvert en même temps que celui du dépôt…
  const inventaireDepot = (await call('/api/inventories', 'POST', { location: 'DEPOT', scope: 'Réserve', note: '' }, sessionDepot)).body;
  assert.equal(inventaireDepot.location, 'DEPOT');
  // …mais pas deux pour le même magasin.
  assert.equal((await call('/api/inventories', 'POST', { location: 'PHARMACY', scope: 'Doublon', note: '' })).status, 422);

  const detail = (await call(`/api/inventories/${inventairePharmacie.id}`)).body;
  assert.ok(detail.lines.length > 0 && detail.lines.every(l => Number(l.theoretical) >= 0),
    'seuls les lots du magasin compté sont listés');
  const indexCible = detail.lines.findIndex(line => Number(line.theoretical) >= 2);
  assert.ok(indexCible >= 0, 'un lot du comptoir doit avoir au moins 2 unités à compter');
  const lines = detail.lines.map(line => ({ id: line.id, physical: Number(line.theoretical), reason: '' }));
  lines[indexCible].physical = Number(detail.lines[indexCible].theoretical) - 2;
  assert.equal(lines[indexCible].physical, detail.lines[indexCible].theoretical - 2, 'écart de 2 unités préparé');
  assert.equal((await call(`/api/inventories/${inventairePharmacie.id}/validate`, 'POST', { requestKey: uuid(), note: '', lines })).status, 422,
    'un écart sans justification doit être refusé');
  lines[indexCible].reason = 'Deux unités manquantes constatées au comptage';
  const valide = await call(`/api/inventories/${inventairePharmacie.id}/validate`, 'POST', { requestKey: uuid(), note: '', lines });
  assert.equal(valide.status, 200);
  assert.equal(valide.body.gaps, 1);

  const donnees = await data();
  assert.equal(donnees.inventories.find(i => i.id === inventairePharmacie.id).status, 'VALIDATED');
  assert.ok(donnees.movements.some(m => m.documentType === 'ADJUSTMENT' && m.quantity === -2 && m.location === 'PHARMACY'));

  // L'inventaire de la réserve suit son propre chemin.
  assert.equal((await call(`/api/inventories/${inventaireDepot.id}/abandon`, 'POST', { reason: 'Comptage interrompu' }, sessionDepot)).status, 200);
  assert.equal((await data()).inventories.find(i => i.id === inventaireDepot.id).status, 'ABANDONED');
});

test('paramètres : plage de marge contrôlée, valorisation figée après mouvement', async () => {
  const settings = (await data()).settings;
  assert.equal((await call('/api/settings', 'PUT', { ...settings, minMargin: 5, maxMargin: 40 })).status, 200);
  assert.equal((await call('/api/settings', 'PUT', { ...settings, minMargin: 30, maxMargin: 10 })).status, 422);
  assert.equal((await call('/api/settings', 'PUT', { ...settings, valuation: 'CMP' })).status, 409);
  assert.equal((await call('/api/settings', 'PUT', { ...settings, marginMode: 'INCONNU' })).status, 422);
  assert.equal((await call('/api/settings', 'PUT', { ...settings, allowExpiredSale: false })).status, 200);

  // 2.7.47 — les frais d'achat sont un RÉGLAGE admin (Paramètres → « Frais
  // d'achat ») : la PROCHAINE réception applique le nouveau taux, les lots
  // déjà reçus ne bougent pas (vu au-dessus : CU = PA × 1,10 aux taux 10 %).
  // Médicament dédié : le CMP du produit de test principal n'est pas touché.
  const produitFrais = (await call('/api/products', 'POST', {
    name: 'Frais Réglage 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  const avecFrais5 = (await call('/api/settings', 'PUT', { ...settings, feesRate: 5 })).body;
  assert.equal(Number(avecFrais5.feesRate), 5, 'le taux des frais d’achat est enregistré côté serveur');
  const recuFrais5 = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, note: 'Taux frais à 5 %', lines: [{
      productId: produitFrais.id, number: 'FRAIS-5', quantity: 10, purchasePrice: '1000',
      receivedOn: day(0), expiresOn: day(200), manufacturedOn: null
    }]
  });
  assert.equal(recuFrais5.status, 201, 'réception acceptée au taux 5 %');
  const lotFrais5 = (await data()).lots.find(l => l.number === 'FRAIS-5');
  assert.equal(lotFrais5.unitCost, '1050.000000', 'CU = PA × (1 + 5/100) : le réglage est bien appliqué');
  // Retour au taux par défaut pour la suite de la suite de tests.
  await call('/api/settings', 'PUT', { ...settings, feesRate: 10 });

  // 2.7.48 — la marge est un champ UNIQUE « Taux de marge (%) » (fin de la
  // plage min/max dans l'interface) : le taux s'applique à TOUS les
  // médicaments et le prix de vente de chacun est recalculé aussitôt.
  // CMP actuel du produit test : (100×8800 + 50×11000) / 150 = 9 533,333333.
  assert.equal((await call('/api/settings', 'PUT', { ...settings, minMargin: 15, maxMargin: 15 })).status, 200);
  const avec15 = (await data()).products.find(p => p.id === product.id);
  assert.equal(Number(avec15.marginRate), 15, 'le taux unique est appliqué à tous les médicaments');
  assert.equal(avec15.sellingPrice, '10964.000000', '2.7.49 : ceil(CMP 9 533,333333 × 1,15) = 10 964 (entier supérieur)');
  await call('/api/settings', 'PUT', { ...settings, minMargin: 20, maxMargin: 20 });
  assert.equal((await data()).products.find(p => p.id === product.id).sellingPrice, '11440.000000',
    'retour à 20 % : PV = CMP 9 533,333333 × 1,20');
  // La plage redevient large : les tests suivants exercent toujours le
  // contrôle RG22 (taux de marge hors plage refusé à la création/modification).
  await call('/api/settings', 'PUT', { ...settings, minMargin: 5, maxMargin: 40 });
});

// ============================================================================
// 2.7.49 — FABRIQUANT PAR LOT + ARRONDIS À L'ENTIER SUPÉRIEUR.
// ① « Fabriquant » (texte) se saisit À LA RÉCEPTION, lot par lot — à la place
//   du champ date « Fabriqué le » — et il suit le lot partout : ligne de
//   réception, lot du dépôt, lot jumeau de la pharmacie (transfert), /api/data.
// ② Coût unitaire = ceil(PA × (1 + taux frais)) ; Prix de vente = ceil(CMP ×
//   (1 + marge)) : la comptabilité de l'officine raisonne en Ariary entier.
// ============================================================================
test('2.7.49 — fabricant saisi à la réception, suivi du lot ; coûts et prix entiers (ceil)', async () => {
  // Produit dédié (isole le CMP du produit principal).
  const produitFab = (await call('/api/products', 'POST', {
    name: 'Fabricant Test 200 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;

  // ① Fabricant sur la ligne de réception (lot FAB-A).
  const recFab = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, note: 'Fabricant suivi', lines: [{
      productId: produitFab.id, number: 'FAB-A', quantity: 10, purchasePrice: '2000',
      receivedOn: day(0), expiresOn: day(200), manufacturer: 'Sanofi France'
    }]
  });
  assert.equal(recFab.status, 201, 'la réception accepte le champ fabricant');
  const lotFabA = (await data()).lots.find(l => l.number === 'FAB-A');
  assert.equal(lotFabA.manufacturer, 'Sanofi France', 'le fabricant est rangé sur le lot');
  const docRecu = (await data()).documents.find(d => d.id === recFab.body.id);
  assert.equal(docRecu.lines[0].manufacturer, 'Sanofi France', 'la liste / détail des réceptions expose le fabricant');

  // Suivi au transfert : le lot jumeau de la pharmacie garde le même fabricant.
  const transFab = await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Réassort du comptoir', note: 'Fabricant suit le lot',
    lines: [{ lotId: lotFabA.id, quantity: 4 }]
  }, sessionDepot);
  assert.equal(transFab.status, 201, JSON.stringify(transFab.body));
  const jumeauFab = (await data()).lots.find(l => l.number === 'FAB-A' && l.location === 'PHARMACY');
  assert.equal(jumeauFab.manufacturer, 'Sanofi France', 'le lot jumeau (pharmacie) garde le fabricant');

  // ② Entier supérieur : PA 999 × 1,10 = 1 098,90 → CU plafonné à 1 099 (lot FAB-B).
  const recPlafond = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, note: 'Arrondi supérieur', lines: [{
      productId: produitFab.id, number: 'FAB-B', quantity: 5, purchasePrice: '999',
      receivedOn: day(0), expiresOn: day(200), manufacturer: 'Cipla'
    }]
  });
  assert.equal(recPlafond.status, 201);
  const lotFabB = (await data()).lots.find(l => l.number === 'FAB-B');
  assert.equal(lotFabB.unitCost, '1099.000000', 'CU = ceil(999 × 1,10) = 1 099 (entier supérieur)');
  // CMP = (10×2000?… non : CU du lot A) → (10 × 2 200 + 5 × 1 099) / 15 :
  //   lot A : CU = ceil(2 000 × 1,10) = 2 200 ; lot B : 1 099.
  //   CMP = (10×2200 + 5×1099) / 15 = 27 495 / 15 = 1 833.
  const ficheFab = (await data()).products.find(p => p.id === produitFab.id);
  assert.equal(ficheFab.cmp, '1833.000000', 'CMP = (10×2 200 + 5×1 099) / 15');
  // PV = ceil(1 833 × 1,20) = 2 200 (exact). Il faut une marge qui fractionne :
  await call(`/api/products/${produitFab.id}/margin`, 'PUT', { marginRate: 15, reason: 'Contrôle arrondi supérieur' });
  const fichePlafond = (await data()).products.find(p => p.id === produitFab.id);
  assert.equal(fichePlafond.sellingPrice, '2108.000000', 'PV = ceil(1 833 × 1,15) = ceil(2 107,95) = 2 108');
  await call(`/api/products/${produitFab.id}/margin`, 'PUT', { marginRate: 20, reason: 'Retour au taux de référence' });
});

test('traçabilité des prix : historique consultable après modification du taux (RG23, RG24)', async () => {
  const update = await call(`/api/products/${product.id}/margin`, 'PUT', { marginRate: 25, reason: 'Ajustement validé par le pharmacien' });
  assert.equal(update.status, 200);
  assert.equal(update.body.rate, 25);
  const history = await call(`/api/products/${product.id}/prices`);
  assert.equal(history.status, 200);
  assert.ok(history.body.length >= 1);
  assert.ok(history.body[0].cost !== undefined && history.body[0].rate !== undefined && history.body[0].price !== undefined);
  assert.equal((await call(`/api/products/${product.id}/margin`, 'PUT', { marginRate: 60 })).status, 422);
  await call(`/api/products/${product.id}/margin`, 'PUT', { marginRate: 20, reason: 'Retour au taux de référence' });
});

test('rapports : les 12 rapports répondent (dont les deux fiches et les transferts), export CSV', async () => {
  const types = ['fiche', 'fiche_depot', 'stock', 'movements', 'transfers', 'sales', 'receipts',
    'losses', 'expirations', 'inventories', 'prices', 'suppliers'];
  for (const type of types) {
    const response = await call(`/api/reports?type=${type}&from=${day(-30)}&to=${day(1)}`);
    assert.equal(response.status, 200, `rapport ${type}`);
    assert.ok(Array.isArray(response.body.rows), `rapport ${type} : lignes attendues`);
  }
  assert.ok((await call(`/api/reports?type=transfers&from=${day(-30)}&to=${day(1)}`)).body.rows.length >= 1,
    'les transferts sont listés dans leur rapport');
  assert.equal((await call(`/api/reports?type=returns&from=${day(-30)}&to=${day(1)}`)).status, 422,
    'le rapport « retours fournisseur » n’existe plus');

  const csv = await fetch(`${base}/api/reports?type=sales&from=${day(-30)}&to=${day(1)}&format=csv`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const octets = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...octets.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 attendu pour Excel');
  const text = new TextDecoder().decode(octets.subarray(3));
  assert.ok(text.includes('VTE-'), 'les ventes apparaissent dans l’export');
  assert.equal((await call(`/api/reports?type=inconnu&from=${day(-1)}&to=${day(1)}`)).status, 422);
});

test('fiche de stock : une fiche par magasin, report automatique du stock initial', async () => {
  const moisPharmacie = await call(`/api/reports?type=fiche&from=${day(-30)}&to=${day(1)}`);
  assert.equal(moisPharmacie.status, 200);
  assert.equal(moisPharmacie.body.location, 'PHARMACY');
  const ligne = moisPharmacie.body.rows.find(item => item['Entrées'] > 0);
  assert.ok(ligne, 'au moins un médicament entré en pharmacie par transfert');
  assert.equal(ligne['Stock initial'] + ligne['Entrées'] - ligne['Sorties'], ligne['Stock final'], 'cohérence du calcul');
  assert.ok(moisPharmacie.body.totals.final >= 1);

  // 2.7.17 — les colonnes de DÉTAIL par prise sont SERVIES en plus du registre
  // (l'écran ne les montre qu'au clic sur « Détail boîte / plaquette ») ; la
  // recomposition boîte + plaquette/10 doit retomber sur l'unité de gestion.
  const PLAQUETTES_PAR_BOITE = 10;
  const gestion = item => ({
    sorties: item['Sorties boîte'] + item['Sorties plaquette'] / PLAQUETTES_PAR_BOITE,
    final: item['Stock final boîte'] + item['Stock final plaquette'] / PLAQUETTES_PAR_BOITE
  });
  for (const colonne of ['Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette']) {
    assert.ok(Object.keys(ligne).includes(colonne), `le serveur fournit « ${colonne} » (affichage à la demande)`);
  }
  assert.ok(Math.abs(gestion(ligne).sorties - Number(ligne['Sorties'])) < 0.001, 'détail = sorties');
  assert.ok(Math.abs(gestion(ligne).final - Number(ligne['Stock final'])) < 0.001, 'détail = stock final');

  const moisDepot = await call(`/api/reports?type=fiche_depot&from=${day(-30)}&to=${day(1)}`);
  assert.equal(moisDepot.body.location, 'DEPOT');
  const ligneDepot = moisDepot.body.rows.find(item => item['Code'] === 'TEST-001');
  assert.equal(ligneDepot['Stock initial'] + ligneDepot['Entrées'] - ligneDepot['Sorties'], ligneDepot['Stock final']);
  assert.ok(ligneDepot['Entrées'] > 0, 'les réceptions sont les entrées du dépôt');
  assert.ok(ligneDepot['Sorties'] > 0, 'les transferts sont les sorties du dépôt');
  assert.notEqual(ligneDepot['Stock final'], ligne['Stock final'], 'les deux magasins ont des stocks différents');

  // Colonnes attendues par le dépôt dans son écran « Stock » (onglet Fiche de stock) :
  // catégorie, unité, stock initial, entrées, sorties, stock final, coût unitaire.
  for (const colonne of ['Catégorie', 'Unité', 'Stock initial', 'Entrées', 'Sorties', 'Stock final', 'Coût unitaire (Ar)']) {
    assert.ok(Object.keys(ligneDepot).includes(colonne), `la fiche du dépôt doit contenir « ${colonne} »`);
  }
  assert.ok(moisDepot.body.rows.every(item => item['Catégorie'] !== undefined), 'la catégorie est renseignée');

  // Le dépôt peut lire sa propre fiche (il n’a plus de menu Rapports, mais l’onglet
  // « Fiche de stock » de l’écran Stock s’appuie sur ce rapport) — et seulement la sienne.
  const ficheDepotLue = await call(`/api/reports?type=fiche_depot&from=${day(-30)}&to=${day(1)}`, 'GET', undefined, sessionDepot);
  assert.equal(ficheDepotLue.status, 200, 'le dépôt lit sa fiche de stock');
  assert.equal(ficheDepotLue.body.location, 'DEPOT');

  // Filtre magasin des rapports : il était refusé (422) alors que l’écran le propose.
  for (const magasin of ['DEPOT', 'PHARMACY', 'ALL']) {
    const filtre = await call(`/api/reports?type=stock&from=${day(-30)}&to=${day(1)}&location=${magasin}`);
    assert.equal(filtre.status, 200, `filtre magasin ${magasin}`);
    assert.ok(filtre.body.rows.length > 0);
  }

  // Période suivante : le stock initial reprend exactement le stock final précédent.
  const apres = await call(`/api/reports?type=fiche&from=${day(1)}&to=${day(2)}`);
  const meme = apres.body.rows.find(item => item['Code'] === ligne['Code']);
  assert.equal(meme['Stock initial'], ligne['Stock final'], 'report automatique du stock initial');
  assert.equal(meme['Entrées'], 0);
  assert.equal(meme['Sorties'], 0);
});

test('tableau de bord : calendrier des ventes du mois (2.7.17)', async () => {
  // Plusieurs ventes ont été validées aujourd'hui par les tests précédents.
  const mois = day(0).slice(0, 7);
  const calendrier = await call(`/api/data/sales-calendar?month=${mois}`);
  assert.equal(calendrier.status, 200, 'le calendrier répond');
  assert.equal(calendrier.body.month, mois);
  assert.ok(Array.isArray(calendrier.body.days), 'agrégat jour par jour');
  const aujourd = calendrier.body.days.find(jour => jour.date === day(0));
  assert.ok(aujourd, 'aujourd’hui apparaît au calendrier');
  assert.ok(aujourd.count >= 2, 'au moins les ventes des tests sont comptées');
  assert.ok(Number(aujourd.total) > 0, 'vola miditra du jour positif');
  assert.ok(Number(aujourd.margin) >= 0, 'marge du jour présente');

  // Format de mois strict : rien d'autre n'est accepté.
  const mauvais = await call('/api/data/sales-calendar?month=septembre');
  assert.equal(mauvais.status, 422, 'mois mal formé refusé');

  // Le détail du jour cliqué s'appuie sur le rapport « sales » existant.
  const detail = await call(`/api/reports?type=sales&from=${day(0)}&to=${day(0)}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.body.rows.length > 0, 'les lignes de vente du jour sont lisibles');

  // 2.7.18 — l'histogramme du tableau de bord : total encaissé par mois.
  const histogramme = await call('/api/data/sales-monthly');
  assert.equal(histogramme.status, 200, 'l’agrégat mensuel répond');
  assert.ok(Array.isArray(histogramme.body.months), 'liste mois par mois');
  const ceMois = histogramme.body.months.find(mois => mois.month === day(0).slice(0, 7));
  assert.ok(ceMois, 'le mois courant est présent');
  assert.ok(ceMois.count >= 2, 'les ventes du mois sont comptées');
  assert.ok(Number(ceMois.total) > 0, 'total encaissé du mois positif');
  assert.ok(Number(ceMois.margin) >= 0, 'marge mensuelle présente');
  // Jamais plus de 12 mois (fenêtre glissante).
  assert.ok(histogramme.body.months.length <= 12, 'au plus 12 mois glissants');
});

test('dépôt : calendrier des stock et flux mensuels entrées/sorties (2.7.20)', async () => {
  // Les tests précédents ont validé des réceptions ET des transferts aujourd'hui.
  const mois = day(0).slice(0, 7);
  const calendrier = await call(`/api/data/stock-calendar?month=${mois}`);
  assert.equal(calendrier.status, 200, 'le calendrier des stock répond');
  assert.equal(calendrier.body.month, mois);
  assert.ok(Array.isArray(calendrier.body.days), 'agrégat jour par jour');
  const aujourd = calendrier.body.days.find(jour => jour.date === day(0));
  assert.ok(aujourd, 'aujourd’hui apparaît au calendrier des stock');
  assert.ok(aujourd.receipts >= 1, 'au moins une réception validée aujourd’hui');
  assert.ok(Number(aujourd.receiptsValue) > 0, 'valeur du stock entré (prix d’achat) positive');
  assert.ok(aujourd.transfers >= 1, 'au moins un transfert validé aujourd’hui');
  assert.ok(Number(aujourd.transfersValue) > 0, 'valeur sortie vers la pharmacie positive');

  // Format de mois strict, comme le calendrier des ventes.
  const mauvais = await call('/api/data/stock-calendar?month=hier');
  assert.equal(mauvais.status, 422, 'mois mal formé refusé');

  // Le détail d'une date s'appuie sur les rapports « receipts » et « transfers ».
  const entreesJour = await call(`/api/reports?type=receipts&from=${day(0)}&to=${day(0)}`);
  assert.equal(entreesJour.status, 200);
  assert.ok(entreesJour.body.rows.length > 0, 'lignes de réception du jour lisibles');
  const sortiesJour = await call(`/api/reports?type=transfers&from=${day(0)}&to=${day(0)}`);
  assert.equal(sortiesJour.status, 200);
  assert.ok(sortiesJour.body.rows.length > 0, 'lignes de transfert du jour lisibles');

  // ── Flux mensuels du dépôt : entrées vs sorties (boîtes), 12 mois glissants. ─
  const flux = await call('/api/data/stock-flow-monthly');
  assert.equal(flux.status, 200, 'l’agrégat flux mensuel répond');
  assert.ok(Array.isArray(flux.body.months), 'liste mois par mois');
  assert.ok(flux.body.months.length <= 12, 'au plus 12 mois glissants');
  const ceMois = flux.body.months.find(ligne => ligne.month === mois);
  assert.ok(ceMois, 'le mois courant est présent');
  assert.ok(Number(ceMois.in) > 0, 'quantité entrée (réceptions) du mois positive');
  assert.ok(Number(ceMois.out) > 0, 'quantité sortie (transferts) du mois positive');
});

test('rapport imprimable, intégrité des données et recherche', async () => {
  const imprimable = await fetch(`${base}/api/reports/print?type=fiche_depot&from=${day(-30)}&to=${day(1)}`, { headers: { Cookie: cookie } });
  assert.equal(imprimable.status, 200);
  assert.ok((await imprimable.text()).includes('DÉPÔT'));

  const integrity = (await call('/api/audit/integrity')).body;
  assert.equal(integrity.ok, true, 'stock des lots = somme des mouvements, dans chaque magasin');
  assert.deepEqual(integrity.anomalies, []);

  const search = (await call('/api/search?q=amoxi')).body;
  assert.ok(search.products.some(p => p.code === 'TEST-001'));
  assert.equal((await call('/api/search?q=a')).status, 422);
});

test('utilisateurs : trois rôles proposés, création d’un compte dépôt, dernier administrateur protégé', async () => {
  const roles = (await call('/api/users/roles')).body;
  assert.deepEqual(roles.map(r => r.code).sort(), ['ADMIN', 'DEPOT', 'PHARMACIST']);
  const depotRole = roles.find(r => r.code === 'DEPOT');
  assert.ok(depotRole.permissions.includes('transfer') && depotRole.permissions.includes('receipt'));
  assert.ok(!depotRole.permissions.includes('sale'), 'le dépôt ne vend pas');

  const created = await call('/api/users', 'POST', {
    name: 'Dépôt Bis', login: 'depot-bis', roleId: depotRole.id, active: true,
    phone: '', note: '', password: 'MotDePasse-Depot-2026'
  });
  assert.equal(created.status, 201);
  assert.ok(!JSON.stringify(created.body).includes('MotDePasse-Depot-2026'));

  const stored = await User.findOne({ where: { login: 'depot-bis' } });
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
  const session = await call('/api/auth/login', 'POST', { login: 'depot-bis', password: 'MotDePasse-Depot-2026' });
  assert.equal(session.status, 200);

  const adminRow = await User.findOne({ where: { login: 'admin-test' } });
  const adminRole = roles.find(r => r.code === 'ADMIN');
  assert.equal((await call(`/api/users/${adminRow.id}`, 'PUT', {
    name: 'Admin Test', login: 'admin-test', roleId: depotRole.id, active: true, phone: '', note: ''
  })).status, 422, 'le dernier administrateur ne peut pas être rétrogradé');
  assert.equal((await call(`/api/users/${adminRow.id}`, 'PUT', {
    name: 'Admin Test', login: 'admin-test', roleId: adminRole.id, active: false, phone: '', note: ''
  })).status, 422, 'le dernier administrateur ne peut pas être désactivé');
});

test('affichage du prix 2.7.9 : prix visible aussi au dépôt, identique à l’admin, jamais « 0 Ar »', async () => {
  const donneesDepot = (await call('/api/data', 'GET', undefined, sessionDepot)).body;
  const donneesAdmin = await data();
  const prixAdmin = new Map(donneesAdmin.products.map(p => [p.id, p.sellingPrice]));
  const avecPrix = donneesAdmin.products.filter(p => Number(p.sellingPrice) > 0);
  assert.ok(avecPrix.length > 0, 'des prix calculés existent bien côté serveur');
  for (const produit of donneesDepot.products) {
    assert.equal(produit.sellingPrice, prixAdmin.get(produit.id),
      'le dépôt voit le même prix de vente que les autres profils (2.7.9 : plus de masquage)');
    assert.ok(produit.cmp !== undefined, 'le CMP reste visible (utile aux réceptions)');
  }
});

test('profil dépôt : réserve seulement — ni ventes ni chiffre d’affaires ; prix de vente lisible (2.7.9)', async () => {
  // Droits d'écriture : le dépôt réceptionne et transfère.
  const reception = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: 'Livraison du jour',
    lines: [{
      productId: product.id, number: 'LOT-C', quantity: 20, purchasePrice: '9000',
      receivedOn: day(0), expiresOn: day(200), manufacturedOn: null
    }]
  }, sessionDepot);
  assert.equal(reception.status, 201, JSON.stringify(reception.body));

  // Interdits : vendre, gérer les comptes, écrire dans le catalogue.
  // Le numéro du bon est automatique et la date d'expiration est obligatoire.
  const sansExpiration = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: 'Sans date',
    lines: [{ productId: product.id, number: 'LOT-SANS-DATE', quantity: 5, purchasePrice: '9000', receivedOn: day(0), expiresOn: null, manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(sansExpiration.status, 422, 'un lot sans date d’expiration est refusé');
  const avecFacture = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', invoiceRef: 'FAC-001', note: 'Facture saisie',
    lines: [{ productId: product.id, number: 'LOT-AVEC-FACTURE', quantity: 5, purchasePrice: '9000', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(avecFacture.status, 422, 'le numéro de facture n’est plus accepté');

  assert.equal((await call('/api/sales/quote', 'POST', { lines: [{ productId: product.id, quantity: 1 }] }, sessionDepot)).status, 403);
  assert.equal((await call('/api/users', 'GET', undefined, sessionDepot)).status, 403);
  // Le dépôt peut compléter le catalogue (une livraison peut contenir un produit
  // encore inconnu) mais reste sans accès aux comptes ni aux ventes.

  // Vue de données : uniquement le dépôt, sans chiffre d'affaires ni marge ;
  // le prix de vente, lui, est lisible depuis la 2.7.9 (étiquettes, réassort).
  const donneesDepot = (await call('/api/data', 'GET', undefined, sessionDepot)).body;
  assert.ok(donneesDepot.lots.length > 0);
  assert.ok(donneesDepot.lots.every(l => l.location === 'DEPOT'), 'le dépôt ne voit que ses propres lots');
  assert.ok(donneesDepot.products.every(p => p.sellingPrice !== null && p.sellingPrice !== undefined),
    'le dépôt voit le prix de vente comme les autres profils (2.7.9 : plus de masquage)');
  assert.ok(donneesDepot.documents.every(d => d.kind !== 'SALE'), 'les ventes ne sont pas visibles depuis la réserve');
  assert.equal(donneesDepot.stats.salesToday, '0.000000');
  assert.ok(donneesDepot.stats.stockValue !== undefined, 'le dépôt connaît la valeur de son stock');

  // 2.7.28 — le dépôt REÇOIT désormais les alertes « bientôt épuisé / rupture »
  // de la PHARMACIE (pour réassortir à temps), mais RIEN d'autre du comptoir :
  // ni péremptions, ni surstock, ni lots bloqués de la pharmacie.
  const alertesPharmacieChezDepot = donneesDepot.alerts.filter(a => a.location === 'PHARMACY');
  assert.ok(alertesPharmacieChezDepot.every(a => ['RUPTURE', 'RUPTURE_VENDABLE', 'STOCK_FAIBLE'].includes(a.type)),
    'seules les alertes de stock (faible/rupture) du comptoir arrivent au dépôt');
  // Le tableau de bord du dépôt ne reçoit aucun bloc « pharmacie » (stats cachées).
  assert.ok(donneesDepot.locations.DEPOT && !donneesDepot.locations.PHARMACY,
    'la vue dépôt ne contient que le magasin dépôt');
});

test('recherche de lots : chaque magasin retrouve les siens, la pharmacie les deux', async () => {
  const depotLots = (await call('/api/lots?location=DEPOT', 'GET', undefined, sessionPharmacie)).body;
  const pharmacieLots = (await call('/api/lots?location=PHARMACY', 'GET', undefined, sessionPharmacie)).body;
  assert.ok(depotLots.length > 0 && pharmacieLots.length > 0);
  assert.ok(depotLots.every(l => l.location === 'DEPOT'));
  assert.ok(pharmacieLots.every(l => l.location === 'PHARMACY'));
  assert.ok(depotLots.some(l => l.number === 'LOT-C'), 'le lot reçu par le dépôt y figure');

  // Le dépôt, lui, ne voit que le dépôt même s'il demande l'autre magasin.
  const depotVuParDepot = (await call('/api/lots?location=PHARMACY', 'GET', undefined, sessionDepot)).body;
  assert.ok(depotVuParDepot.every(l => l.location === 'DEPOT'));
});

test('alertes « bientôt épuisé » routées par profil (2.7.28) : comptoir → dépôt + pharmacie, réserve → dépôt + admin', async () => {
  // Scénario : un médicament avec seuil minimum 10 ; le DÉPÔT en reçoit 20,
  // puis 16 partent à la pharmacie → réserve 4 (≤ 10 : FAIBLE AU DÉPÔT) et
  // comptoir 16 (OK) ; ensuite le comptoir en vend 12 → comptoir 4 (≤ 10 :
  // FAIBLE À LA PHARMACIE). Les alertes doivent alors aller chacune à qui elle
  // concerne, SANS être diluées dans le stock de l'autre magasin.
  const creation = await call('/api/products', 'POST', {
    name: 'Alerte Test 250 mg', presentation: 'Boîte de 10', categoryId: category.id,
    unit: 'boîte', minStock: 10, maxStock: null, note: '', active: true, marginRate: 20
  });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));
  const alerte = creation.body;
  assert.ok(alerte.id);

  // Réception au dépôt (quantité 20 > 10 : rien d'anormal pour l'instant).
  await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: 'Stock alerte',
    lines: [{ productId: alerte.id, number: 'LOT-ALERTE', quantity: 20, purchasePrice: '5000', receivedOn: day(0), expiresOn: day(400), manufacturedOn: null }]
  }, sessionDepot);

  let donneesAdmin = await data();
  const lotAlerteDepot = lotDuMagasin(donneesAdmin, 'LOT-ALERTE', 'DEPOT');
  assert.equal(lotAlerteDepot.quantity, 20);

  // 16 unités passent au comptoir : la réserve tombe à 4 ≤ seuil 10.
  await call('/api/transfers', 'POST', {
    requestKey: uuid(), fromLocation: 'DEPOT', toLocation: 'PHARMACY',
    reason: 'Réassort comptoir', note: '', lines: [{ lotId: lotAlerteDepot.id, quantity: 16 }]
  }, sessionDepot);

  // Le comptoir en vend 12 : stock 16 − 12 = 4 ≤ seuil 10 → FAIBLE À LA PHARMACIE.
  const lotAlertePharmacie = lotDuMagasin(await data(), 'LOT-ALERTE', 'PHARMACY');
  const vente = await call('/api/sales', 'POST', {
    requestKey: uuid(),
    lines: [{ productId: alerte.id, quantity: 12 }]
  }, sessionPharmacie);
  assert.equal(vente.status, 201, JSON.stringify(vente.body));

  // ── ADMIN : les DEUX magasins sont signalés, chacun avec son lieu. ────────
  donneesAdmin = await data();
  const signaleesAdmin = nom => donneesAdmin.alerts.filter(x => x.name === nom && x.type === 'STOCK_FAIBLE');
  assert.ok(signaleesAdmin(alerte.name).some(x => x.location === 'DEPOT'),
    'admin alerté du stock faible de la réserve');
  assert.ok(signaleesAdmin(alerte.name).some(x => x.location === 'PHARMACY'),
    'admin alerté du stock faible du comptoir');

  // ── PHARMACIE : l'alerte du comptoir LUI arrive, sans la masquer. ─────────
  const donneesPharmacie = (await call('/api/data', 'GET', undefined, sessionPharmacie)).body;
  const alerteChezPharmacie = donneesPharmacie.alerts.find(x => x.name === alerte.name && x.type === 'STOCK_FAIBLE');
  assert.ok(alerteChezPharmacie, 'le pharmacien est alerté que SON stock approche de l’épuisement');
  assert.equal(alerteChezPharmacie.location, 'PHARMACY', 'l’alerte concerne bien le comptoir');
  assert.ok(!donneesPharmacie.alerts.some(x => x.location === 'DEPOT' && x.name === alerte.name),
    'le pharmacien ne reçoit pas l’alerte de la réserve');

  // ── DÉPÔT : il reçoit SA réserve ET le « bientôt épuisé » du comptoir. ────
  const donneesDepot = (await call('/api/data', 'GET', undefined, sessionDepot)).body;
  assert.ok(donneesDepot.alerts.some(x => x.name === alerte.name && x.type === 'STOCK_FAIBLE' && x.location === 'DEPOT'),
    'le dépôt est alerté de SA propre réserve trop basse');
  assert.ok(donneesDepot.alerts.some(x => x.name === alerte.name && x.type === 'STOCK_FAIBLE' && x.location === 'PHARMACY'),
    '2.7.28 : le dépôt est AUSSI alerté du comptoir presque épuisé — réassort à temps');
});

test('2.7.31 — unité de gestion choisie à la réception ; listes portent leur contenu', async () => {
  // L'« Unité de gestion » quitte la fiche : elle se choisit à la réception
  // (boîte/flacon/pièce/plaquette) et le serveur la REPORTE sur le médicament.
  const reception = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: product.id, number: 'LOT-UNITE', quantity: 12, purchasePrice: '1000',
      receivedOn: day(0), expiresOn: day(200), manufacturedOn: null, unit: 'flacon' }]
  });
  assert.equal(reception.status, 201, JSON.stringify(reception.body));
  const donnees = await data();
  assert.equal(donnees.products.find(p => p.id === product.id).unit, 'flacon',
    'l’unité choisie à la réception est reportée sur la fiche du médicament');

  // Les listes Réceptions/Transferts emportent leur contenu (médicament,
  // quantité, coût unitaire) directement dans /api/data — pas de requête par bon.
  const recu = donnees.documents.find(d => d.kind === 'RECEIPT'
    && (d.lines || []).some(l => l.productId === product.id && l.quantity === 12));
  assert.ok(recu, 'la réception porte ses lignes synthétiques');
  assert.equal(recu.lines[0].unitCost, '1100.000000', 'coût unitaire par ligne (PA × 1,10)');
  const transfert = donnees.documents.find(d => d.kind === 'TRANSFER' && d.lines?.length);
  assert.ok(transfert, 'le transfert porte ses lignes synthétiques');
  assert.ok(transfert.lines[0].productId > 0 && transfert.lines[0].quantity > 0);
});

test('2.7.29 — suppression d’un compte : gardes, effet réel, historique protégé', async () => {
  // Un compte tout neuf, jamais utilisé : la suppression passe.
  const roles = (await call('/api/users/roles')).body;
  const roleDepot = roles.find(r => r.code === 'DEPOT');
  const creation = await call('/api/users', 'POST', {
    name: 'Compte À Supprimer', login: 'a.supprimer', roleId: roleDepot.id,
    active: true, phone: '', note: '', password: 'TmpSuppr1!'
  });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));

  const suppression = await call(`/api/users/${creation.body.id}`, 'DELETE');
  assert.equal(suppression.status, 200, JSON.stringify(suppression.body));
  assert.equal(suppression.body.deleted, true);

  // Le compte n'existe plus : ni dans la liste, ni pour ouvrir une session.
  const liste = (await call('/api/users')).body;
  assert.ok(!liste.some(u => u.login === 'a.supprimer'), 'le compte n’apparaît plus dans la liste');
  assert.equal((await call('/api/auth/login', 'POST', { login: 'a.supprimer', password: 'TmpSuppr1!' })).status, 401,
    'connexion désormais impossible');

  // Verrou 1 : un compte ne peut pas se supprimer LUI-MÊME.
  const moi = (await call('/api/auth/me')).body;
  const autoRefus = await call(`/api/users/${moi.user.id}`, 'DELETE');
  assert.equal(autoRefus.status, 422, 'auto-suppression refusée');
  assert.match(autoRefus.body.error, /propre compte/);

  // Verrou 2 : compte ayant TRACÉ des opérations (le dépôt de test a reçu et
  // transféré) → suppression refusée, désactivation proposée à la place.
  const sessionDepotUser = (await call('/api/auth/login', 'POST', { login: 'depot-test', password: 'MotDePasse-Test-2026' })).body;
  const refuseHistorique = await call(`/api/users/${sessionDepotUser.user.id}`, 'DELETE');
  assert.equal(refuseHistorique.status, 409, 'un compte avec historique n’est pas supprimable');
  assert.match(refuseHistorique.body.error, /Désactivez-le à la place/, 'la phrase guide vers la désactivation');
  // L'utilisateur ciblé vit toujours, ses sessions ne sont pas touchées inutilement.
  assert.ok((await call('/api/users')).body.some(u => u.login === 'depot-test'));
});

test('journal d’audit : actions tracées, aucun secret enregistré', async () => {
  const audit = (await call('/api/audit?page=1')).body;
  assert.equal(audit.rows.length > 0, true);
  const text = JSON.stringify(audit);
  assert.ok(!/passwordHash|MotDePasse-Test-2026|tokenHash/.test(text));
  const actions = audit.rows.map(row => row.action);
  for (const expected of ['LOGIN', 'VALIDATE', 'CANCEL', 'UPDATE']) {
    assert.ok(actions.includes(expected), `action ${expected} attendue dans le journal`);
  }
  const entites = audit.rows.map(row => row.entity);
  assert.ok(entites.includes('TRANSFER'), 'les transferts sont tracés dans le journal d’audit');
});

test('catalogue 2.7.5 : code interne et code-barres attribués automatiquement', async () => {
  // Le formulaire n'envoie plus ni code, ni code-barres, ni champs descriptifs :
  // le serveur complète tout seul.
  const creation = await call('/api/products', 'POST', {
    name: 'Produit Automatique 250 mg', presentation: 'Boîte de 12', categoryId: category.id,
    unit: 'boîte', minStock: 5, maxStock: 150, note: '', active: true, marginRate: 20
  });
  assert.equal(creation.status, 201);
  assert.match(creation.body.code, /^MED-\d{3,}$/, 'le code interne suit la série MED-xxx');
  assert.match(String(creation.body.barcode), /^\d{13}$/, 'le code-barres est un EAN-13 de 13 chiffres');
  assert.equal(creation.body.ingredient, '', 'les champs descriptifs retirés gardent leur valeur par défaut');
  assert.equal(creation.body.storage, '');

  // Clé de contrôle EAN-13 : le code-barres est réellement scannable.
  const base12 = String(creation.body.barcode).slice(0, 12);
  let somme = 0;
  for (let i = 0; i < 12; i += 1) somme += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  assert.equal(Number(String(creation.body.barcode)[12]), (10 - (somme % 10)) % 10, 'la clé EAN-13 est correcte');

  // Modification : le code et le code-barres ne changent pas.
  const modif = await call(`/api/products/${creation.body.id}`, 'PUT', {
    name: 'Produit Automatique 250 mg (modifié)', presentation: 'Boîte de 12', categoryId: category.id,
    unit: 'boîte', minStock: 8, maxStock: 200, note: '', active: true, marginRate: 22
  });
  assert.equal(modif.status, 200);
  assert.equal(modif.body.code, creation.body.code, 'le code interne reste stable');
  assert.equal(modif.body.barcode, creation.body.barcode, 'le code-barres reste stable');

  // Un écran qui renvoie l'objet complet (id, createdAt, cmp, sellingPrice…) n'est
  // plus refusé : ces champs techniques sont ignorés, jamais écrits.
  const avecExtras = await call(`/api/products/${creation.body.id}`, 'PUT', {
    id: creation.body.id, name: 'Produit Automatique (renommé)', createdAt: new Date().toISOString(),
    cmp: '999999.000000', sellingPrice: '1.000000', version: 42,
    presentation: '', categoryId: null, unit: 'boîte', minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  });
  assert.equal(avecExtras.status, 200);
  assert.equal(avecExtras.body.name, 'Produit Automatique (renommé)');
  assert.notEqual(avecExtras.body.sellingPrice, '1.000000', 'le prix de vente ne vient jamais du navigateur (RG05)');
  assert.notEqual(avecExtras.body.cmp, '999999.000000', 'le CMP ne vient jamais du navigateur');
  assert.equal(avecExtras.body.code, creation.body.code, 'le code interne reste intact');

  // Un produit suivant reçoit le numéro d'après.
  const suivant = await call('/api/products', 'POST', {
    name: 'Produit Automatique 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  });
  assert.equal(suivant.status, 201);
  assert.notEqual(suivant.body.code, creation.body.code, 'deux produits ne partagent jamais le même code');
  assert.notEqual(suivant.body.barcode, creation.body.barcode, 'deux produits ne partagent jamais le même code-barres');
});

test('catalogue 2.7.5 : désactiver puis réactiver un médicament (bouton du catalogue)', async () => {
  const produit = (await call('/api/products', 'POST', {
    name: 'Médicament à désactiver', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 3, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  // Payload identique à celui de l'écran Catalogue (bouton « désactiver »).
  const fiche = {
    name: produit.name, presentation: produit.presentation || '', categoryId: null, unit: produit.unit,
    minStock: produit.minStock, maxStock: null, note: '', active: false, marginRate: Number(produit.marginRate)
  };
  const desactive = await call(`/api/products/${produit.id}`, 'PUT', fiche);
  assert.equal(desactive.status, 200);
  assert.equal(desactive.body.active, false);
  const reactive = await call(`/api/products/${produit.id}`, 'PUT', { ...fiche, active: true });
  assert.equal(reactive.status, 200);
  assert.equal(reactive.body.active, true);
});

test('fournisseurs 2.7.5 : suppression possible seulement s’il n’a jamais livré', async () => {
  // 1) Fournisseur neuf, jamais utilisé : la corbeille fonctionne.
  const neuf = await call('/api/suppliers', 'POST', {
    name: 'Fournisseur jetable', contact: '', phone: '', email: '', address: '', nif: '', note: '', active: true
  });
  assert.equal(neuf.status, 201);
  const suppression = await call(`/api/suppliers/${neuf.body.id}`, 'DELETE');
  assert.equal(suppression.status, 200);
  assert.equal(suppression.body.ok, true);
  const restants = (await call('/api/data')).body.suppliers.map(f => f.id);
  assert.ok(!restants.includes(neuf.body.id), 'le fournisseur a bien disparu de la liste');

  // 2) Fournisseur qui a déjà livré (celui des réceptions du scénario) : refus expliqué.
  const refuse = await call(`/api/suppliers/${supplier.id}`, 'DELETE');
  assert.equal(refuse.status, 422);
  assert.match(refuse.body.error, /Suppression impossible/, 'le refus est expliqué');
  assert.match(refuse.body.error, /Fournisseur actif/, 'la solution de remplacement est indiquée');

  // 3) Désactiver puis réactiver ce fournisseur : c'est la solution proposée, elle passe.
  const fiche = { name: supplier.name, contact: '', phone: '0340000000', email: '', address: 'Antananarivo', nif: '', note: '', active: false };
  const desactive = await call(`/api/suppliers/${supplier.id}`, 'PUT', fiche);
  assert.equal(desactive.status, 200);
  assert.equal(desactive.body.active, false);
  assert.equal((await call(`/api/suppliers/${supplier.id}`, 'PUT', { ...fiche, active: true })).status, 200);

  // 4) Création SANS « Raison sociale » : le serveur nomme le fournisseur.
  const sansNom = await call('/api/suppliers', 'POST', {
    contact: 'Rasoa (grossiste)', phone: '034 11 222 33', email: '', address: '', nif: '', note: '', active: true
  });
  assert.equal(sansNom.status, 201);
  assert.equal(sansNom.body.name, 'Rasoa (grossiste)', 'le nom reprend la personne à contacter');
  const anonyme = await call('/api/suppliers', 'POST', {
    contact: '', phone: '', email: '', address: '', nif: '', note: '', active: true
  });
  assert.equal(anonyme.status, 201);
  assert.match(anonyme.body.name, /^Fournisseur \d+$/, 'sans aucune indication, un numéro est attribué');
  // Le crayon (Modifier) permet de renommer : le nom saisi est bien pris en compte.
  const renomme = await call(`/api/suppliers/${sansNom.body.id}`, 'PUT', {
    name: 'Grossiste Rasoa SARL', contact: 'Rasoa', phone: '034 11 222 33', email: '', address: '', nif: '', note: '', active: true
  });
  assert.equal(renomme.status, 200);
  assert.equal(renomme.body.name, 'Grossiste Rasoa SARL');
  // Un nom vidé ne casse rien : l'ancien nom est conservé.
  const vide = await call(`/api/suppliers/${sansNom.body.id}`, 'PUT', {
    name: '   ', contact: 'Rasoa', phone: '', email: '', address: '', nif: '', note: '', active: true
  });
  assert.equal(vide.body.name, 'Grossiste Rasoa SARL', 'un nom vide conserve le nom en place');

  // 5) Seuls les fournisseurs se suppriment : les autres référentiels n'ont pas de route.
  assert.equal((await call(`/api/categories/${category.id}`, 'DELETE')).status, 404);
  assert.equal((await call(`/api/products/${product.id}`, 'DELETE')).status, 404);
});

// ---------------------------------------------------------------------------
// 2.7.8 — réceptions multiples du même médicament, CMP et prix de vente
// ---------------------------------------------------------------------------

test('2.7.8 : recevoir le même médicament au même numéro de lot à un autre prix crée un lot distinct', async () => {
  const produit = (await call('/api/products', 'POST', {
    name: 'Réception Multiple 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  const livrer = (numero, quantite, prix, expected = 201) => call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
    lines: [{
      productId: produit.id, number: numero, quantity: quantite, purchasePrice: prix,
      receivedOn: day(0), expiresOn: day(300), manufacturedOn: null
    }]
  }).then(reponse => {
    assert.equal(reponse.status, expected);
    return reponse.body;
  });

  // 1re livraison : 100 boîtes à 1 000 Ar → CU 1 100 (frais automatiques 10 %, 2.7.47), CMP 1 100, prix 1 320.
  const premiere = await livrer(`${produit.code}-2026`, 100, '1000');
  assert.deepEqual(premiere.ajustements, [], 'première livraison : aucun ajustement');
  let fiche = (await data()).products.find(p => p.id === produit.id);
  assert.equal(fiche.cmp, '1100.000000');
  assert.equal(fiche.sellingPrice, '1320.000000');

  // 2e livraison : MÊME numéro de lot (celui proposé par l'écran), prix du jour.
  // Elle doit passer : un lot distinct est créé, jamais un refus.
  const deuxieme = await livrer(`${produit.code}-2026`, 80, '2000');
  assert.equal(deuxieme.ajustements.length, 1, 'l’ajustement est annoncé à l’écran');
  assert.equal(deuxieme.ajustements[0].numeroUtilise, `${produit.code}-2026·2`);

  const donnees = await data();
  const lots = donnees.lots.filter(l => l.productId === produit.id).sort((a, b) => a.id - b.id);
  assert.equal(lots.length, 2);
  assert.deepEqual(lots.map(l => l.number), [`${produit.code}-2026`, `${produit.code}-2026·2`]);
  assert.deepEqual(lots.map(l => Number(l.quantity)), [100, 80]);

  // CMP = moyenne des 180 unités, et prix recalculé sur cette moyenne.
  fiche = donnees.products.find(p => p.id === produit.id);
  assert.equal(fiche.cmp, '1588.888889');            // (100×1100 + 80×2200) / 180
  assert.equal(fiche.sellingPrice, '1907.000000');   // 2.7.49 : ceil(1 588,888889 × 1,2) = 1 907

  // 3e livraison : même numéro ET même prix que la première → le lot est complété
  // (quantités additionnées) sans écraser le coût de revient.
  await livrer(`${produit.code}-2026`, 20, '1000');
  const apres = await data();
  const premierLot = apres.lots.find(l => l.number === `${produit.code}-2026`);
  assert.equal(Number(premierLot.receivedQuantity), 120);
  assert.equal(Number(premierLot.quantity), 120);
  assert.equal(premierLot.unitCost, '1100.000000', 'compléter un lot ne divise pas son coût');
  assert.equal(apres.products.find(p => p.id === produit.id).cmp, '1540.000000'); // (120×1100 + 80×2200) / 200
});

test('2.7.8 : un transfert ne modifie pas le CMP ni le prix de vente', async () => {
  const produit = (await call('/api/products', 'POST', {
    name: 'CMP Et Transfert 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  for (const [numero, quantite, prix] of [['LOT-A', 60, '1000'], ['LOT-B', 40, '2000']]) {
    await call('/api/receipts', 'POST', {
      requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
      lines: [{ productId: produit.id, number: numero, quantity: quantite, purchasePrice: prix, receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
    });
  }
  const avant = (await data()).products.find(p => p.id === produit.id);
  assert.equal(avant.cmp, '1540.000000');            // (60×1100 + 40×2200) / 100
  assert.equal(avant.sellingPrice, '1848.000000');

  const lotDepot = (await data()).lots.find(l => l.productId === produit.id && l.number === 'LOT-A');
  await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Réassort', note: '', lines: [{ lotId: lotDepot.id, quantity: 25 }]
  });

  const apres = await data();
  const fiche = apres.products.find(p => p.id === produit.id);
  assert.equal(fiche.cmp, '1540.000000', 'un transfert n’est pas une entrée fournisseur : le CMP ne bouge pas');
  assert.equal(fiche.sellingPrice, '1848.000000');
  const enPharmacie = apres.lots.find(l => l.productId === produit.id && l.location === 'PHARMACY');
  assert.equal(Number(enPharmacie.quantity), 25);
  assert.equal(Number(enPharmacie.receivedQuantity), 0, 'le lot du comptoir n’a rien reçu d’un fournisseur');
});

test('2.7.8 : le réglage « prix de vente calculé sur » s’applique immédiatement', async () => {
  const produit = (await call('/api/products', 'POST', {
    name: 'Base De Prix 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  for (const [numero, quantite, prix] of [['LOT-1', 10, '1000'], ['LOT-2', 10, '3000']]) {
    await call('/api/receipts', 'POST', {
      requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
      lines: [{ productId: produit.id, number: numero, quantity: quantite, purchasePrice: prix, receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
    });
  }
  const reglages = (await data()).settings;
  const prixDe = async () => (await data()).products.find(p => p.id === produit.id).sellingPrice;

  assert.equal(await prixDe(), '2640.000000', 'CMP 2 200 × 1,2 par défaut');
  await call('/api/settings', 'PUT', { ...reglages, pricingBasis: 'LOT' });
  assert.equal(await prixDe(), '3960.000000', 'mode « dernier lot » : 3 300 × 1,2 (appliqué tout de suite)');
  await call('/api/settings', 'PUT', { ...reglages, pricingBasis: 'CMP' });
  assert.equal(await prixDe(), '2640.000000', 'retour au CMP');
});

test('2.7.33 — fiche de stock produit (solde cumulé), dashboard mensuel, ticket A5 ×2', async () => {
  // Chaîne complète sur UN médicament dédié : 2 réceptions au dépôt (60 + 40),
  // 1 transfert de 25 vers le comptoir, 1 vente de 3 boîtes.
  const produit = (await call('/api/products', 'POST', {
    name: 'Fiche Produit Coquilette 250 g', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  for (const [numero, quantite, prix] of [['FP-A', 60, '1000'], ['FP-B', 40, '1000']]) {
    await call('/api/receipts', 'POST', {
      requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
      lines: [{ productId: produit.id, number: numero, quantity: quantite, purchasePrice: prix, receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
    });
  }
  let donnees = await data();
  const lotDepot = donnees.lots.find(l => l.productId === produit.id && l.location === 'DEPOT' && l.number === 'FP-A');
  await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Réassort', note: '', lines: [{ lotId: lotDepot.id, quantity: 25 }]
  });

  // Vente de 3 boîtes au comptoir (pharmacien, comme au réel).
  const devis = await call('/api/sales/quote', 'POST', { note: '', lines: [{ productId: produit.id, quantity: 3 }] });
  const vente = await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: devis.body.total, customerName: '', note: '',
    lines: [{ productId: produit.id, quantity: 3 }]
  }, sessionPharmacie);
  assert.equal(vente.status, 201);

  // TEBOKA ⑪ — fiche de stock DU produit, magasin par magasin, solde cumulé.
  const depuis = day(-30); const jusqu = day(1);
  const ficheDepot = await call(`/api/reports?type=fiche_produit&productId=${produit.id}&from=${depuis}&to=${jusqu}&location=DEPOT`);
  assert.equal(ficheDepot.status, 200, 'fiche produit du dépôt accessible');
  assert.ok(ficheDepot.body.rows.length >= 3, '2 réceptions + 1 transfert = 3 mouvements au dépôt');
  const lignesDepot = ficheDepot.body.rows;
  assert.equal(Number(lignesDepot[0]['Entrées']), 60, 'chronologique : la 1ʳᵉ réception d’abord');
  assert.equal(Number(lignesDepot[0]['Solde']), 60, 'le solde part du stock antérieur (0)');
  assert.equal(Number(lignesDepot[lignesDepot.length - 1]['Solde']), 75, '60 + 40 − 25 restent au dépôt');
  const fichePharmacie = await call(`/api/reports?type=fiche_produit&productId=${produit.id}&from=${depuis}&to=${jusqu}&location=PHARMACY`);
  assert.equal(fichePharmacie.status, 200);
  const lignesPharmacie = fichePharmacie.body.rows;
  assert.equal(Number(lignesPharmacie[lignesPharmacie.length - 1]['Solde']), 22, '25 − 3 restent au comptoir');
  const sansProduit = await call(`/api/reports?type=fiche_produit&from=${depuis}&to=${jusqu}`);
  assert.equal(sansProduit.status, 422, 'une fiche individuelle exige productId');

  // TEBOKA ⑮ — le tableau de bord mensuel accompagne /api/data.
  donnees = await data();
  assert.ok(donnees.month, 'les chiffres du mois sont joints aux données du poste');
  assert.equal(donnees.month.month, day(0).slice(0, 7), 'le mois courant à l’heure de la pharmacie');
  assert.ok(donnees.month.salesMonthCount >= 1, 'la vente du jour compte dans le mois');
  assert.ok(Number(donnees.month.salesMonth) >= Number(devis.body.total), 'le chiffre du mois couvre la vente');

  // TEBOKA ⑬ — le ticket : A5 portrait, deux exemplaires, sans Lot/Expiration.
  const impression = await fetch(`${base}/api/documents/SALE/${vente.body.id}/print`, { headers: { Cookie: cookie } });
  const texte = await impression.text();
  assert.ok(texte.includes('size: A5 portrait'), 'format A5 portrait');
  assert.ok(texte.includes('Exemplaire client') && texte.includes('Copie pharmacie — à conserver'),
    'deux exemplaires sur la feuille (client + copie pharmacie)');
  assert.ok(!texte.includes('<th>Lot</th>') && !texte.includes('Expiration'),
    'les colonnes Lot / Expiration ne sont plus sur le ticket');
  assert.ok(!texte.includes('FP-A') && !texte.includes('FP-B'), 'aucun numéro de lot sur le ticket');
});

test('2.7.34 — correction de réception (dépôt propose → admin tranche), inventaire : rappel mensuel', async () => {
  // ── Réception de départ, faite par le DÉPÔT : lot COR-A, 100 boîtes à 500 Ar.
  const produit = (await call('/api/products', 'POST', {
    name: 'Correction Quinine 300 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  const reception = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 100, purchasePrice: '500', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(reception.status, 201);
  assert.equal(reception.body.costTotal, '55000.000000');   // 100 × 550 (PA 500 × 1,10)

  // Motif trop court : refusé dès le formulaire (422 du validateur).
  const motifCourt = await call(`/api/receipts/${reception.body.id}/corrections`, 'POST', {
    reason: 'no', supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 90, purchasePrice: '550', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(motifCourt.status, 422, 'un motif sérieux est exigé');

  // ── Le dépôt PROPOSE sa correction (quantité 90, prix 550, méme lot, mêmes dates).
  const proposition = await call(`/api/receipts/${reception.body.id}/corrections`, 'POST', {
    reason: 'Bon de livraison rectifié par le fournisseur : 90 boîtes à 550 Ar.',
    supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 90, purchasePrice: '550', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(proposition.status, 201);
  assert.equal(proposition.body.status, 'PENDING');
  assert.match(proposition.body.reference, /^COR-\d{4}-\d{6}$/);

  // Rien n'a changé tant que l'administrateur n'a pas tranché.
  let donnees = await data();
  assert.equal(donnees.lots.find(l => l.number === 'COR-A').quantity, 100, 'la réception est INCHANGÉE avant décision');

  // Une seule demande en attente par réception.
  const doublon = await call(`/api/receipts/${reception.body.id}/corrections`, 'POST', {
    reason: 'Tentative pendant la première', supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 80, purchasePrice: '600', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(doublon.status, 422, 'une seule correction en attente par réception');

  // La décision n'appartient pas au dépôt (permission « settings »).
  const trancherParDepot = await call(`/api/receipt-corrections/${proposition.body.id}/validate`, 'POST', { note: '' }, sessionDepot);
  assert.equal(trancherParDepot.status, 403, 'seul l’administrateur tranche');

  // Refus SANS explication : rejeté, la demande reste en attente.
  const refusSansMotif = await call(`/api/receipt-corrections/${proposition.body.id}/refuse`, 'POST', { note: 'ok' });
  assert.equal(refusSansMotif.status, 422, 'un refus s’explique au dépôt');

  // L'administrateur REFUSE motivé : réception toujours inchangée, nouvelle demande possible.
  const refus = await call(`/api/receipt-corrections/${proposition.body.id}/refuse`, 'POST', { note: 'Les quantités du bon original sont justes : refusé.' });
  assert.equal(refus.status, 200);
  assert.equal(refus.body.status, 'REFUSED');
  donnees = await data();
  assert.equal(donnees.lots.find(l => l.number === 'COR-A').quantity, 100, 'refus = réception conservée telle quelle');

  // Proposée à nouveau, validée cette fois.
  const proposition2 = await call(`/api/receipts/${reception.body.id}/corrections`, 'POST', {
    reason: 'Le fournisseur confirme écrit : 90 boîtes à 550 Ar.', supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 90, purchasePrice: '550', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(proposition2.status, 201, 'une correction refusée peut être re-proposée');
  const decision = await call(`/api/receipt-corrections/${proposition2.body.id}/validate`, 'POST', { note: 'Vérifié sur le bon.' });
  assert.equal(decision.status, 200);
  assert.equal(decision.body.status, 'VALIDATED');

  // Nouvelle réalité : quantité, prix, coût total, mouvements, CMP recalculés —
  // et l'ancienne version reste TRACÉE (RG19 : jamais de suppression).
  donnees = await data();
  const lotsCorA = donnees.lots.filter(l => l.number.startsWith('COR-A'));
  const lotCorrige = lotsCorA.find(l => Number(l.quantity) === 90);
  assert.ok(lotCorrige, 'un lot COR-A porte maintenant les 90 boîtes corrigées');
  assert.equal(lotCorrige.unitCost, '605.000000', 'le lot corrigé porte le nouveau prix (550 × 1,10)');
  assert.equal(Number(lotCorrige.receivedQuantity), 90);
  assert.ok(lotsCorA.some(l => Number(l.quantity) === 0),
    'l’ancienne version du lot reste à zéro dans l’historique (comme après une annulation)');
  const receiptDoc = donnees.documents.find(docu => docu.kind === 'RECEIPT' && docu.id === reception.body.id);
  assert.equal(receiptDoc.costTotal, '54450.000000', 'coût total recalculé (90 × 605) — absent de toute écriture manuelle');
  const mouvements = donnees.movements.filter(m => m.documentType === 'RECEIPT' && m.documentId === reception.body.id);
  const solde = mouvements.reduce((total, m) => total + Number(m.quantity), 0);
  assert.equal(solde, 90, 'solde des entrées de la réception = 90 (+100 initial, −100 correction tracée, +90 corrigé)');
  assert.ok(mouvements.some(m => Number(m.quantity) === -100), 'contre-mouvement de correction tracé (RG19)');
  assert.equal(donnees.products.find(p => p.id === produit.id).cmp, '605.000000',
    'CMP recalculé sur le lot corrigé');

  // ── Garde-fou : une fois un lot entamé (transfert), la correction est refusée.
  await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Réassort', note: '', lines: [{ lotId: lotCorrige.id, quantity: 10 }]
  });
  const tropTard = await call(`/api/receipts/${reception.body.id}/corrections`, 'POST', {
    reason: 'Encore un ajustement', supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'COR-A', quantity: 85, purchasePrice: '550', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(tropTard.status, 422, 'correction refusée : un lot de la réception a déjà bougé');
  assert.match(tropTard.body.error, /déjà bougé|annulation tracée/);

  // ── Teboka ⑦ : le rappel mensuel d’inventaire reflète fidèlement la réalité
  //    (présent tant qu’aucun inventaire DÉPÔT n’a été validé ce mois-ci).
  const moisCourant = donnees.date.slice(0, 7);
  const depotInventaireCeMois = donnees.inventories.filter(inv => inv.location === 'DEPOT'
    && inv.status === 'VALIDATED' && inv.validatedAt
    && new Date(new Date(inv.validatedAt).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 7) === moisCourant);
  donnees = await data();
  const rappels = donnees.alerts.filter(alerte => alerte.type === 'INVENTAIRE_MENSUEL');
  assert.equal(rappels.length, depotInventaireCeMois.length ? 0 : 1,
    'le rappel mensuel (dépôt + admin) disparaît dès l’inventaire validé du mois');
});

test('2.7.35 — hôpital : carnet (patient + prescripteur), ordonnance sans montants, TDR et activité', async () => {
  // ── Référentiels : patients et personnel soignant, ouverts au comptoir.
  const patient = await call('/api/patients', 'POST', {
    name: 'Rasoamanana Laza', service: 'Maternité B', note: 'Lit 12'
  }, sessionPharmacie);
  assert.equal(patient.status, 201, 'le pharmacien enregistre le patient du carnet');
  assert.equal(patient.body.active, true);

  const doublonPatient = await call('/api/patients', 'POST', {
    name: 'Rasoamanana Laza', service: 'Maternité B', note: ''
  }, sessionPharmacie);
  assert.equal(doublonPatient.status, 409, 'même patient + même service = doublon refusé');

  const staff = await call('/api/staff', 'POST', {
    name: 'Dr Rasoa Kanto', role: 'DOCTOR', dutyStartOn: day(0), dutyEndOn: day(6), phone: '034 12 345'
  }, sessionPharmacie);
  assert.equal(staff.status, 201);
  assert.equal(staff.body.dutyStartOn, day(0), 'date de DÉBUT de garde enregistrée');
  assert.equal(staff.body.dutyEndOn, day(6), 'date de FIN de garde enregistrée');

  const doublonStaff = await call('/api/staff', 'POST', {
    name: 'Dr Rasoa Kanto', role: 'MIDWIFE', dutyStartOn: day(0), dutyEndOn: day(0), phone: ''
  }, sessionPharmacie);
  assert.equal(doublonStaff.status, 409, 'un nom de prescripteur est unique');

  // 2.7.38 — les dates de garde sont OBLIGATOIRES, et la fin ≥ le début.
  const sansDates = await call('/api/staff', 'POST', {
    name: 'Nurse Beta', role: 'MIDWIFE', phone: ''
  }, sessionPharmacie);
  assert.equal(sansDates.status, 422, 'sans dates de garde, la fiche est refusée');
  const finAvantDebut = await call('/api/staff', 'POST', {
    name: 'Nurse Beta', role: 'MIDWIFE', dutyStartOn: day(5), dutyEndOn: day(2), phone: ''
  }, sessionPharmacie);
  assert.equal(finAvantDebut.status, 422, 'la fin de garde ne peut pas précéder le début');

  // Le DÉPÔT ne touche pas aux carnets de la caisse.
  assert.equal((await call('/api/patients', 'POST', { name: 'Test Depot', service: '', note: '' }, sessionDepot)).status, 403,
    'le dépôt n’écrit pas dans le référentiel des patients');

  // ── Stock : 30 boîtes au dépôt, 20 transférées au comptoir (FEFO identique à la vente tsotra).
  const produit = (await call('/api/products', 'POST', {
    name: 'Hôpital Test Amoxicilline 500 mg', presentation: '', categoryId: null, unit: 'boîte',
    minStock: 5, maxStock: null, note: '', active: true, marginRate: 20
  })).body;
  const reception = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '0', note: '',
    lines: [{ productId: produit.id, number: 'HOP-A', quantity: 30, purchasePrice: '500', receivedOn: day(0), expiresOn: day(200), manufacturedOn: null }]
  }, sessionDepot);
  assert.equal(reception.status, 201);
  const lotDepot = lotDuMagasin(await data(), 'HOP-A', 'DEPOT');
  const transfert = await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Réassort comptoir hôpital',
    lines: [{ lotId: lotDepot.id, quantity: 20 }]
  }, sessionDepot);
  assert.equal(transfert.status, 201);

  // ── Vente TSOTRA de référence (inchangée) : pas de patient, pas de prescripteur.
  const tsotra = await call('/api/sales', 'POST', {
    requestKey: uuid(), customerName: 'Client passage', note: '',
    lines: [{ productId: produit.id, quantity: 1 }]
  }, sessionPharmacie);
  assert.equal(tsotra.status, 201);
  assert.equal(tsotra.body.patientId, null, 'la vente tsotra ne porte aucun carnet');

  // Pas d'ordonnance pour une vente tsotra : le serveur renvoie au ticket.
  const ordoTsotra = await fetch(`${base}/api/sales/${tsotra.body.id}/ordonnance`, { headers: { Cookie: cookie } });
  assert.equal(ordoTsotra.status, 422, 'pas de carnet → ordonnance refusée, ticket à la place');

  // ── Vente sur CARNET : patient + prescripteur, stock FEFO du comptoir comme d'habitude.
  const carnet = await call('/api/sales', 'POST', {
    requestKey: uuid(), customerName: '', note: 'Carnet du 3e étage',
    patientId: patient.body.id, medicalStaffId: staff.body.id,
    lines: [{ productId: produit.id, quantity: 2 }]
  }, sessionPharmacie);
  assert.equal(carnet.status, 201, JSON.stringify(carnet.body));
  assert.equal(carnet.body.patientId, patient.body.id, 'le patient du carnet est enregistré sur la vente');
  assert.equal(carnet.body.medicalStaffId, staff.body.id, 'le prescripteur est enregistré sur la vente');
  assert.equal(carnet.body.customerName, 'Rasoamanana Laza', 'sans nom saisi, le client devient le patient hospitalisé');
  const donneesApres = await data();
  assert.equal(lotDuMagasin(donneesApres, 'HOP-A', 'PHARMACY').quantity, 17,
    'sortie de stock du comptoir : 20 − 1 (tsotra) − 2 (carnet)');

  // Vente phantom : patient inconnu ou clôturé → 422.
  const patientInconnu = await call('/api/sales', 'POST', {
    requestKey: uuid(), customerName: '', note: '', patientId: 999999, medicalStaffId: null,
    lines: [{ productId: produit.id, quantity: 1 }]
  }, sessionPharmacie);
  assert.equal(patientInconnu.status, 422, 'le patient doit exister');

  // ── L'ORDONNANCE : patient, prescripteur, médicaments, SANS montants.
  const ordo = await fetch(`${base}/api/sales/${carnet.body.id}/ordonnance`, { headers: { Cookie: cookie } });
  assert.equal(ordo.status, 200);
  const page = await ordo.text();
  assert.ok(page.includes('Ordonnance'), 'le document s’intitule Ordonnance');
  assert.ok(page.includes('Rasoamanana Laza'), 'le patient figure sur l’ordonnance');
  assert.ok(page.includes('Maternité B'), 'le service figure sur l’ordonnance');
  assert.ok(page.includes('Rasoa Kanto'), 'le prescripteur figure sur l’ordonnance');
  assert.ok(page.includes('Médecin'), 'le rôle du prescripteur est précisé');
  assert.ok(page.includes('Amoxicilline'), 'les médicaments du carnet figurent');
  assert.ok(page.includes('2 boîtes'), 'quantité dans l’unité du carnet');
  assert.ok(page.includes('Exemplaire du patient') && page.includes('Copie pharmacie'),
    'deux exemplaires (patient + pharmacie)');
  assert.ok(page.includes('size: A5 portrait'), 'format A5 portrait');
  assert.ok(!page.includes('Prix unitaire') && !page.includes('Montant') && !page.includes('Total à payer'),
    'AUCUN montant sur l’ordonnance');

  // Le TICKET de cette même vente reste disponible (interne) et montre le patient.
  const ticketCarnet = await fetch(`${base}/api/documents/SALE/${carnet.body.id}/print`, { headers: { Cookie: cookie } });
  assert.equal(ticketCarnet.status, 200, 'le ticket interne reste imprimable');
  assert.ok((await ticketCarnet.text()).includes('Rasoamanana Laza'), 'ticket : client = patient du carnet');

  // ── ACTIVITÉ du prescripteur : patients préinscrits + médicaments.
  const activite = await call(`/api/staff/${staff.body.id}/activite`);
  assert.equal(activite.status, 200);
  assert.ok(activite.body.ventes.some(v => v.patient === 'Rasoamanana Laza'
    && v.lignes.some(l => l.product.includes('Amoxicilline'))),
    'la vue docteur montre ses patients et les médicaments de chaque carnet');

  // ── Sortie du patient : vente refusée ; réactivation : vente acceptée à nouveau.
  await call(`/api/patients/${patient.body.id}`, 'PUT', { active: false }, sessionPharmacie);
  const patientSorti = await call('/api/sales', 'POST', {
    requestKey: uuid(), customerName: '', note: '', patientId: patient.body.id, medicalStaffId: null,
    lines: [{ productId: produit.id, quantity: 1 }]
  }, sessionPharmacie);
  assert.equal(patientSorti.status, 422, 'un patient sorti du service ne peut plus être facturé');
  const reactif = await call(`/api/patients/${patient.body.id}`, 'PUT', { active: true }, sessionPharmacie);
  assert.equal(reactif.body.active, true, 'la réactivation reste possible (historique conservé)');
});



test('2.7.36 — séjours + ordonnance unique du patient, TDR par dates, employé enregistreur', async () => {
  // ── Le patient connu (créé au test 2.7.35) garde son créateur + son admission.
  let listePatients = (await call('/api/patients')).body;
  const connu = listePatients.find(p => p.name === 'Rasoamanana Laza');
  assert.ok(connu, 'le patient créé en 2.7.35 est toujours là');
  assert.equal(connu.createdByName, 'Pharmacien Test', 'la liste montre l’employé qui l’a enregistré');
  assert.equal(connu.admittedOn, day(0), 'date d’admission = jour de l’enregistrement (par défaut)');

  // Nouveau patient avec admission déclarée il y a 3 jours.
  const patient2 = await call('/api/patients', 'POST', {
    name: 'Be Tsiry', service: 'Chirurgie A', note: '', admittedOn: day(-3)
  }, sessionPharmacie);
  assert.equal(patient2.status, 201);
  assert.equal(patient2.body.admittedOn, day(-3), 'l’admission déclarée à la saisie est respectée');

  // ── GARDE PAR PÉRIODE SUR LA FICHE (2.7.38) : modification des dates.
  const staff = (await call('/api/staff')).body.find(m => m.name === 'Dr Rasoa Kanto');
  assert.equal(staff.dutyStartOn, day(0), 'la liste des employés montre le début de garde');
  assert.equal(staff.dutyEndOn, day(6), 'la liste des employés montre la fin de garde');
  const majOk = await call(`/api/staff/${staff.id}`, 'PUT', {
    dutyStartOn: day(10), dutyEndOn: day(17)
  }, sessionPharmacie);
  assert.equal(majOk.status, 200, 'prolongation de la garde : nouvelles dates acceptées');
  const majFauss = await call(`/api/staff/${staff.id}`, 'PUT', {
    dutyEndOn: day(5)
  }, sessionPharmacie);
  assert.equal(majFauss.status, 422, 'fin AVANT le début : refusée même en modification partielle');
  // Les anciennes adresses des « Périodes de garde » multiples n'existent plus.
  assert.equal((await call(`/api/staff/${staff.id}/gardes`, 'POST', { startOn: day(0), endOn: day(1), note: '' }, sessionPharmacie)).status, 404,
    'l’adresse des périodes multiples a disparu (2.7.38)');

  // ── CONTINUITÉ du séjour : le même patient rachète (demain il achètera
  //    autant) — une SEULE ordonnance récapitule tout.
  const produit = (await data()).products.find(p => p.name === 'Hôpital Test Amoxicilline 500 mg');
  const rachat = await call('/api/sales', 'POST', {
    requestKey: uuid(), customerName: '', note: 'Lendemain, même patient',
    patientId: connu.id, medicalStaffId: staff.id,
    lines: [{ productId: produit.id, quantity: 1 }]
  }, sessionPharmacie);
  assert.equal(rachat.status, 201, 'le même patient rachète le jour suivant (2 ventes sur le séjour)');

  // ── Liste des séjours (onglet « Clients hôpital » de l’historique).
  const listeSejours = (await call('/api/patients/sejours')).body;
  const ligne = listeSejours.find(s => s.patient === 'Rasoamanana Laza');
  assert.ok(ligne, 'le patient figure parmi les clients hôpital');
  assert.equal(ligne.service, 'Maternité B', 'le service du patient remonte');
  assert.equal(ligne.saleCount, 2, 'deux carnets sous un même patient (continuité)');
  assert.ok(ligne.prescribers.some(p => p.name === 'Dr Rasoa Kanto'), 'le docteur auquel il rend visite est visible');
  // Le dépôt ne voit pas cette liste (permission « sale »).
  assert.equal((await call('/api/patients/sejours', 'GET', undefined, sessionDepot)).status, 403,
    'le dépôt ne peut pas lire les séjours');

  // ── Détail du séjour : achats DANS L’ORDRE + médicaments CUMULÉS.
  const detailSejour = (await call(`/api/patients/${ligne.patientId}/sejour`)).body;
  assert.equal(detailSejour.ventes.length, 2, 'achats du séjour listés');
  assert.ok(new Date(detailSejour.ventes[0].date) <= new Date(detailSejour.ventes[1].date),
    'les achats sont chronologiques (le séjour se lit du début à la fin)');
  const amoxiTotal = detailSejour.medecines.find(m => m.product.includes('Amoxicilline'));
  assert.equal(amoxiTotal.saleQuantity, 3, '2 boîtes + 1 boîte = 3 boîtes cumulées sur le séjour');
  assert.equal(detailSejour.patient.createdByName, 'Pharmacien Test', 'employé enregistreur dans le détail');

  // ── UNE SEULE ORDONNANCE de séjour (cumul, admission, prescripteurs —
  //    et SANS MONTANTS, comme l’ordonnance par carnet).
  const ordoSejour = await fetch(`${base}/api/patients/${ligne.patientId}/ordonnance`, { headers: { Cookie: cookie } });
  assert.equal(ordoSejour.status, 200);
  const pageSejour = await ordoSejour.text();
  assert.ok(pageSejour.includes('Ordonnance de séjour'), 'le document s’intitule ordonnance de séjour');
  assert.ok(pageSejour.includes('Rasoamanana Laza'), 'le patient y figure');
  assert.ok(pageSejour.includes('Admis à l’hôpital le'), 'la date d’admission est marquée');
  assert.ok(pageSejour.includes('Rasoa Kanto'), 'le prescripteur vu est marqué');
  assert.ok(pageSejour.includes('3 boîtes'), 'quantité CUMULÉE de tout le séjour');
  assert.ok(pageSejour.includes('Exemplaire du patient') && pageSejour.includes('Copie pharmacie'),
    'deux exemplaires comme toujours');
  // 2.7.37 — la demande est modifiée : l'ordonnance de séjour DOIT montrer
  // quantité, prix unitaire et montant (et accepter une fenêtre du/au).
  assert.ok(pageSejour.includes('Prix unitaire') && pageSejour.includes('Montant')
    && pageSejour.includes('Total de l’ordonnance de séjour'),
    'l’ordonnance de séjour porte quantités, prix unitaires, montants et total');
  // Fenêtre « entre deux dates » : les deux carnets sont du même jour, une
  // fenêtre « aujourd’hui → aujourd’hui+1 » les garde tous et s'imprime telle.
  const demain = day(1);
  const fenetreSejour = await fetch(`${base}/api/patients/${ligne.patientId}/ordonnance?du=${day(0)}&au=${demain}`,
    { headers: { Cookie: cookie } });
  assert.equal(fenetreSejour.status, 200, 'la fenêtre du/au est acceptée');
  const fenetreHTML = await fenetreSejour.text();
  assert.ok(fenetreHTML.includes('Période :'), 'la fenêtre choisie est imprimée');

  // Un patient SANS achat n’a pas d’ordonnance à imprimer.
  const ordoVide = await fetch(`${base}/api/patients/${patient2.body.id}/ordonnance`, { headers: { Cookie: cookie } });
  assert.equal(ordoVide.status, 422, 'patient sans carnet : refuse proprement');
});

test('santé du service, contrôle d’arrêt', async () => {
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  // Sans session : 401 (aucune énumération des routes). Avec session : 404 explicite.
  assert.equal((await fetch(`${base}/api/route-inconnue`)).status, 401);
  assert.equal((await call('/api/route-inconnue')).status, 404);

  await new Promise(resolve => server.close(resolve));
  await close();
});



void Product;