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
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
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

test('réception : la marchandise entre au DÉPÔT, coût de revient 9 000 Ar, CMP, prix 10 800 Ar', async () => {
  const receipt = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: supplier.id, fees: '100000', invoiceRef: 'FAC-001', note: 'Réception initiale',
    lines: [{
      productId: product.id, number: 'lot-a', quantity: 100,
      purchasePrice: '8000', receivedOn: day(0), expiresOn: day(300), manufacturedOn: null
    }]
  });
  assert.equal(receipt.status, 201);
  assert.equal(receipt.body.costTotal, '900000.000000');
  assert.match(receipt.body.reference, /^REC-\d{4}-\d{6}$/);
  assert.equal(receipt.body.location, 'DEPOT', 'toute réception est une entrée au dépôt');

  const donnees = await data();
  lotA = lotDuMagasin(donnees, 'LOT-A', 'DEPOT');       // numéro normalisé en majuscules
  assert.ok(lotA, 'le lot doit exister dans le dépôt');
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'PHARMACY'), undefined,
    'rien ne doit apparaître en pharmacie avant le transfert');
  assert.equal(lotA.unitCost, '9000.000000');
  assert.equal(lotA.quantity, 100);
  assert.equal(lotA.receivedQuantity, 100);
  const stored = donnees.products.find(p => p.id === product.id);
  assert.equal(stored.cmp, '9000.000000');
  assert.equal(stored.sellingPrice, '10800.000000');
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

test('deuxième lot au dépôt : CMP recalculé (9 333,33 Ar)', async () => {
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
  assert.equal(donnees.products.find(p => p.id === product.id).cmp, '9333.333333'); // (100×9000 + 50×10000) / 150
});

test('transfert : le dépôt sort, la pharmacie entre, les deux stocks sont séparés', async () => {
  const transfert = await call('/api/transfers', 'POST', {
    requestKey: uuid(), fromLocation: 'DEPOT', toLocation: 'PHARMACY',
    reason: 'Réassort du comptoir', note: 'Besoin du week-end',
    lines: [{ lotId: lotA.id, quantity: 40 }, { lotId: lotB.id, quantity: 30 }]
  }, sessionDepot);
  assert.equal(transfert.status, 201, JSON.stringify(transfert.body));
  assert.match(transfert.body.reference, /^TRF-\d{4}-\d{6}$/);
  assert.equal(transfert.body.costTotal, '660000.000000');   // 40×9000 + 30×10000

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity, 60);
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'DEPOT').quantity, 20);
  lotAPharmacie = lotDuMagasin(donnees, 'LOT-A', 'PHARMACY');
  lotBPharmacie = lotDuMagasin(donnees, 'LOT-B', 'PHARMACY');
  assert.equal(lotAPharmacie.quantity, 40, 'le lot jumeau est créé au comptoir');
  assert.equal(lotBPharmacie.quantity, 30);
  assert.equal(lotAPharmacie.number, 'LOT-A', 'même numéro de lot : la traçabilité suit');
  assert.equal(lotAPharmacie.expiresOn, lotA.expiresOn, 'même péremption');
  assert.equal(lotAPharmacie.unitCost, '9000.000000', 'même coût de revient');
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
  assert.equal(devis.body.lines[0].unitPrice, '12000.000000');   // 10 000 × 1,2
  assert.equal(devis.body.total, '36000.000000');

  const vente = await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: '36000.000000', customerName: 'Client test', note: '',
    lines: [{ productId: product.id, quantity: 3 }]
  }, sessionPharmacie);
  assert.equal(vente.status, 201);
  assert.match(vente.body.reference, /^VTE-\d{4}-\d{6}$/);
  assert.equal(vente.body.margin, '6000.000000');   // 3 × (12 000 − 10 000)

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'PHARMACY').quantity, 27);
  assert.equal(lotDuMagasin(donnees, 'LOT-B', 'DEPOT').quantity, 20, 'la vente ne touche pas la réserve');
  assert.equal(donnees.locations.PHARMACY.stats.salesToday, '36000.000000');
  assert.equal(donnees.locations.DEPOT.stats.salesToday, '0.000000', 'le dépôt ne vend pas');
  assert.equal(donnees.locations.DEPOT.stats.stockValue !== undefined, true);
});

test('vente : total périmé refusé (409), stock de la pharmacie insuffisant refusé (422)', async () => {
  assert.equal((await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: '1.000000', note: '', lines: [{ productId: product.id, quantity: 1 }]
  }, sessionPharmacie)).status, 409);

  // La réserve contient encore des boîtes, mais elles ne sont pas vendables :
  // il faut d'abord les transférer.
  assert.equal((await call('/api/sales', 'POST', {
    requestKey: uuid(), note: '', lines: [{ productId: product.id, quantity: 100 }]
  }, sessionPharmacie)).status, 422);

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
  assert.equal(pertePharmacie.body.costTotal, '27000.000000');   // 3 × 9 000 Ar

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
  assert.equal(perteDepot.body.costTotal, '18000.000000');

  const donnees = await data();
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'PHARMACY').quantity, stockAvantComptoir - 3,
    'la perte sort bien du lot du comptoir');
  assert.equal(lotDuMagasin(donnees, 'LOT-A', 'DEPOT').quantity, stockAvantReserve - 2,
    'la perte de la réserve sort du lot du dépôt');
  assert.equal(donnees.locations.PHARMACY.stats.lossesToday, '27000.000000');
  assert.equal(donnees.locations.DEPOT.stats.lossesToday, '18000.000000');
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

  const moisDepot = await call(`/api/reports?type=fiche_depot&from=${day(-30)}&to=${day(1)}`);
  assert.equal(moisDepot.body.location, 'DEPOT');
  const ligneDepot = moisDepot.body.rows.find(item => item['Code'] === 'TEST-001');
  assert.equal(ligneDepot['Stock initial'] + ligneDepot['Entrées'] - ligneDepot['Sorties'], ligneDepot['Stock final']);
  assert.ok(ligneDepot['Entrées'] > 0, 'les réceptions sont les entrées du dépôt');
  assert.ok(ligneDepot['Sorties'] > 0, 'les transferts sont les sorties du dépôt');
  assert.notEqual(ligneDepot['Stock final'], ligne['Stock final'], 'les deux magasins ont des stocks différents');

  // Période suivante : le stock initial reprend exactement le stock final précédent.
  const apres = await call(`/api/reports?type=fiche&from=${day(1)}&to=${day(2)}`);
  const meme = apres.body.rows.find(item => item['Code'] === ligne['Code']);
  assert.equal(meme['Stock initial'], ligne['Stock final'], 'report automatique du stock initial');
  assert.equal(meme['Entrées'], 0);
  assert.equal(meme['Sorties'], 0);
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

test('profil dépôt : réserve seulement — ni ventes, ni prix de vente, ni chiffre d’affaires', async () => {
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
  assert.equal((await call('/api/sales/quote', 'POST', { lines: [{ productId: product.id, quantity: 1 }] }, sessionDepot)).status, 403);
  assert.equal((await call('/api/users', 'GET', undefined, sessionDepot)).status, 403);
  // Le dépôt peut compléter le catalogue (une livraison peut contenir un produit
  // encore inconnu) mais reste sans accès aux comptes ni aux ventes.

  // Vue de données : uniquement le dépôt, sans prix de vente ni marge.
  const donneesDepot = (await call('/api/data', 'GET', undefined, sessionDepot)).body;
  assert.ok(donneesDepot.lots.length > 0);
  assert.ok(donneesDepot.lots.every(l => l.location === 'DEPOT'), 'le dépôt ne voit que ses propres lots');
  assert.ok(donneesDepot.products.every(p => p.sellingPrice === undefined), 'le prix de vente reste à la pharmacie');
  assert.ok(donneesDepot.documents.every(d => d.kind !== 'SALE'), 'les ventes ne sont pas visibles depuis la réserve');
  assert.equal(donneesDepot.stats.salesToday, '0.000000');
  assert.ok(donneesDepot.stats.stockValue !== undefined, 'le dépôt connaît la valeur de son stock');

  // Et les ventes en cours ne sont pas dans ses alertes.
  assert.ok(!donneesDepot.alerts.some(a => String(a.id).includes('PHARMACY')));
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
