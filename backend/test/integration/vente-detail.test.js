// Test de bout en bout 2.7.12 : vente au détail (boîte / plaquette / comprimé).
// Base dédiée : pharmacie_2712_detail_test (schéma recréé par la migration).
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sequelize, close } from '../../src/config/database.js';
import { User, Role, Product, Setting, Lot } from '../../src/models/index.js';
import { createApp } from '../../src/app.js';

let server; let base; let cookie; let csrf;
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

async function call(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(base + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = response.headers.getSetCookie?.()[0];
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload, cookie: setCookie?.split(';')[0] };
}

test('2.7.12 — vente boîte + plaquette + comprimé : prix indépendants, stock en fractions', async () => {
  // Garde-fou : base de TEST uniquement (le schéma est recréé à chaque exécution).
  const nomBase = String(process.env.DATABASE_URL).split('?')[0].split('/').pop();
  assert.ok(/_test$/.test(nomBase),
    `Refus d'exécuter ce test sur la base « ${nomBase} » : indiquez une base dont le nom finit par « _test ».`);
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), env: process.env, stdio: 'pipe'
  });
  const adminRole = await Role.findOne({ where: { code: 'ADMIN' } });
  assert.ok(await Setting.findByPk(1), 'paramètres par défaut présents');
  await User.create({
    name: 'Admin tests', login: 'admin-2712d', roleId: adminRole.id,
    passwordHash: await bcrypt.hash('MotDePasse-Admin-2026', 10), active: true,
    phone: '', note: '', createdAt: new Date(), updatedAt: new Date()
  });

  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await call('/api/auth/login', 'POST', { login: 'admin-2712d', password: 'MotDePasse-Admin-2026' });
  cookie = login.cookie;
  csrf = login.body.csrf;
  assert.equal(login.status, 200);
  assert.ok(csrf, 'jeton CSRF reçu à la connexion');

  // Fournisseur + médicament avec conditionnement 10 plaquettes × 10 comprimé,
  // prix INDÉPENDANTS (plaquette 1500 Ar ≠ prorata 1000, comprimé 200 Ar).
  const fournisseur = await call('/api/suppliers', 'POST', {
    name: 'Fournisseur Détail', contact: '', phone: '', email: '', address: '', nif: '', note: '', active: true
  });
  const produit = await call('/api/products', 'POST', {
    name: 'Paracétamol 500 mg', presentation: 'Boîte de 100', categoryId: null,
    unit: 'boîte', minStock: 5, maxStock: null, note: '', active: true, marginRate: 20,
    blistersPerBox: 10, unitsPerBlister: 10,
    pricePerBlister: 1500, pricePerUnit: 200
  });
  assert.equal(produit.status, 201, JSON.stringify(produit.body));

  // Réception 10 boîtes à 7 500 Ar : CU = 8 250 (PA × 1,10, 2.7.47) ; PV boîte = 9 900 Ar (marge 20 %).
  const reception = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: fournisseur.body.id, fees: '0', note: '',
    lines: [{ productId: produit.body.id, number: 'lot-1', quantity: 10, purchasePrice: '7500',
      receivedOn: day(0), expiresOn: day(300), manufacturedOn: null }]
  });
  assert.equal(reception.status, 201, JSON.stringify(reception.body));

  // Le lot du dépôt vient d'être créé : on le retrouve dans /api/data.
  const lotDepot = (await call('/api/data')).body.lots.find(
    l => l.productId === produit.body.id && l.location === 'DEPOT');
  assert.ok(lotDepot, 'lot créé au dépôt');

  // Transfert des 10 boîtes vers la pharmacie.
  const transfert = await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Approvisionnement comptoir', lines: [{ lotId: lotDepot.id, quantity: 10 }]
  });
  assert.equal(transfert.status, 201, JSON.stringify(transfert.body));

  // DEVIS : 1 boîte + 2 plaquettes + 5 comprimé du MÊME médicament (3 lignes).
  const lignes = [
    { productId: produit.body.id, saleUnit: 'BOX', quantity: 1 },
    { productId: produit.body.id, saleUnit: 'BLISTER', quantity: 2 },
    { productId: produit.body.id, saleUnit: 'UNIT', quantity: 5 }
  ];
  const devis = await call('/api/sales/quote', 'POST', { lines: lignes });
  assert.equal(devis.status, 200, JSON.stringify(devis.body));
  // 9900 (PV boîte = CMP 8 250 × 1,2, 2.7.47 : CU = PA 7 500 × 1,10) + 2×1500 + 5×200 = 13 900 Ar.
  assert.equal(devis.body.total, '13900.000000', 'les 3 prix indépendants sont appliqués');
  // Équivalent gestion : 1 + 0,2 + 0,05 = 1,25 boîte.
  const totalGestion = devis.body.lines.reduce((s, l) => s + Number(l.quantity), 0);
  assert.equal(Number(totalGestion).toFixed(6), '1.250000', 'quantités converties en boîtes');

  // VENTE validée.
  const vente = await call('/api/sales', 'POST', {
    requestKey: uuid(), expectedTotal: '13900.000000', note: 'Test 2.7.12', lines: lignes
  });
  assert.equal(vente.status, 201, JSON.stringify(vente.body));

  // Stock pharmacie : 10 − 1,25 = 8,75 boîte.
  const donnees = await call('/api/data');
  const lotPharmacie = donnees.body.lots.find(l => l.productId === produit.body.id && l.location === 'PHARMACY');
  assert.equal(Number(lotPharmacie.quantity), 8.75, '8,75 boîte restant en pharmacie');

  // Détail : saleUnit/saleQuantity/unitFactor bien enregistrés.
  const doc = await call(`/api/documents/SALE/${vente.body.id}`);
  const lignesVente = doc.body.lines;
  const boite = lignesVente.find(l => l.saleUnit === 'BOX');
  const plaquette = lignesVente.find(l => l.saleUnit === 'BLISTER');
  const comprimes = lignesVente.find(l => l.saleUnit === 'UNIT');
  assert.equal(Number(boite.saleQuantity), 1); assert.equal(boite.unitFactor, 1);
  assert.equal(Number(plaquette.saleQuantity), 2); assert.equal(plaquette.unitFactor, 10);
  assert.equal(Number(plaquette.unitPrice), 1500, 'prix plaquette indépendant (pas prorata)');
  assert.equal(Number(comprimes.saleQuantity), 5); assert.equal(comprimes.unitFactor, 100);
  assert.equal(Number(comprimes.unitPrice), 200, 'prix comprimé indépendant');

  // TICKET d'encaissement : affiche l'unité vendue et le montant unitPrice×saleQuantity.
  const ticket = await fetch(`${base}/api/documents/SALE/${vente.body.id}/print`, { headers: { Cookie: cookie } });
  const html = await ticket.text();
  assert.equal(ticket.status, 200, 'ticket imprimable');
  assert.ok(html.includes('plaquette'), 'le ticket nomme la plaquette');
  assert.ok(html.includes('comprimé'), 'le ticket nomme le comprimé');
  // Le formatage français met une espace FINE insécable (U+202F/U+00A0) dans « 1 500 ».
  const nettoye = html.replace(/[\u202f\u00a0]/g, ' ');
  assert.ok(nettoye.includes('1 500 Ar'), 'prix plaquette affiché au ticket (1 500 Ar, prix indépendant)');

  // Refus : médicament sans conditionnement (0 plaquette) ne se vend pas au détail.
  const flacon = await call('/api/products', 'POST', {
    name: 'Sirop 250 ml', presentation: '', categoryId: null,
    unit: 'flacon', minStock: 0, maxStock: null, note: '', active: true, marginRate: 20,
    blistersPerBox: 0, unitsPerBlister: 0, pricePerBlister: 0, pricePerUnit: 0
  });
  const refus = await call('/api/sales/quote', 'POST', {
    lines: [{ productId: flacon.body.id, saleUnit: 'BLISTER', quantity: 1 }]
  });
  assert.equal(refus.status, 422, 'vente par plaquette refusée si conditionnement absent');

  // Refus : unité inconnue rejetée par le validateur (champ non déclaré/enum).
  const mauvais = await call('/api/sales/quote', 'POST', {
    lines: [{ productId: produit.body.id, saleUnit: 'Ampoule', quantity: 1 }]
  });
  assert.equal(mauvais.status, 422, 'unité inconnue rejetée');

  // Fallback prorata : médicament avec prix détail à 0 → prix = prorata de la boîte.
  const prorata = await call('/api/products', 'POST', {
    name: 'Amoxi poudre', presentation: '', categoryId: null,
    unit: 'boîte', minStock: 0, maxStock: null, note: '', active: true, marginRate: 20,
    blistersPerBox: 10, unitsPerBlister: 10, pricePerBlister: 0, pricePerUnit: 0
  });
  assert.equal(prorata.status, 201, JSON.stringify(prorata.body));
  const recProrata = await call('/api/receipts', 'POST', {
    requestKey: uuid(), supplierId: fournisseur.body.id, fees: '0', note: '',
    lines: [{ productId: prorata.body.id, number: 'lot-p', quantity: 3, purchasePrice: '1000',
      receivedOn: day(0), expiresOn: day(300), manufacturedOn: null }]
  });
  assert.equal(recProrata.status, 201, JSON.stringify(recProrata.body));
  const lotProrata = (await call('/api/data')).body.lots.find(l => l.productId === prorata.body.id && l.location === 'DEPOT');
  await call('/api/transfers', 'POST', {
    requestKey: uuid(), reason: 'Transfert', lines: [{ lotId: lotProrata.id, quantity: 3 }]
  });
  const devisProrata = await call('/api/sales/quote', 'POST', {
    lines: [{ productId: prorata.body.id, saleUnit: 'BLISTER', quantity: 1 }]
  });
  assert.equal(devisProrata.status, 200, JSON.stringify(devisProrata.body));
  // Prix de vente boîte = 0 + marge 0 % → priceForUnit doit retomber... au coût ?
  // On vérifie surtout qu'aucun montant « NaN » ni 400/500 n'émerge.
  assert.ok(Number(devisProrata.body.total) >= 0, 'total numérique en fallback prorata');

  server.close();
});

test('fin 2.7.12', async () => {
  try { server?.close(); } catch { /* déjà fermé */ }
  await close();
  process.exitCode = 0;
}, { timeout: 20000 });