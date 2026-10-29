#!/usr/bin/env node
// ============================================================================
// DIAGNOSTIC + RÉPARATION 2.7.84 — « Réception / transfert : le stock ne bouge
// plus ».
//
// Fait trois choses, dans l'ordre :
//   ① VÉRIFIE la base : colonnes products.packaging / products.purchase_unit —
//     si la migration 015 n'a pas été appliquée, TOUTES les écritures de
//     produits (réceptions ET transferts) échouent avant de toucher le stock.
//   ② APPLIQUE automatiquement les migrations manquantes (réparation).
//   ③ TEST RÉEL de bout en bout : une réception avec conversion de
//     conditionnement + un transfert DÉPÔT → PHARMACIE sont joués dans une
//     transaction ANNULÉE à la fin (rien n'est écrit dans la base), et chaque
//     quantité est vérifiée.
//
// Usage (depuis le dossier racine, là où se trouve le dossier backend) :
//     node diagnostiquer-2.7.84.mjs
// ============================================================================
import { spawnSync } from 'node:child_process';
// pathToFileURL : obligatoire sous Windows — import() refuse les chemins « E:\… »
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ici = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(ici, 'backend');
const urlDe = mora => pathToFileURL(path.join(backend, mora)).href;

process.chdir(backend);
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const ok = message => console.log(`  ✅ ${message}`);
const ko = message => console.log(`  ❌ ${message}`);
const titre = message => console.log(`\n════════ ${message} ════════`);

titre('① CONNEXION À LA BASE (backend/.env)');
let sequelize, models;
try {
  const mod = await import(urlDe('src/config/database.js'));
  sequelize = mod.sequelize;
  await sequelize.authenticate();
  const [rows] = await sequelize.query('SELECT current_database() AS db');
  ok(`Connecté à « ${rows[0].db} » — ${process.env.DATABASE_URL ? 'via DATABASE_URL' : 'via backend/.env'}`);
  models = (await import(urlDe('src/models/index.js'))).default;
} catch (cause) {
  ko(`Connexion impossible : ${cause.message}`);
  console.log('\n➜ Vérifie que PostgreSQL tourne et que backend/.env contient la bonne DATABASE_URL.');
  process.exit(1);
}

titre('② MIGRATION 015 SUR LA BASE');
const [colonnes] = await sequelize.query(`
  SELECT column_name FROM information_schema.columns
   WHERE table_name = 'products' AND column_name IN ('packaging', 'purchase_unit')`);
const manquantes = ['packaging', 'purchase_unit'].filter(c => !colonnes.some(r => r.column_name === c));
let migres = true;
if (manquantes.length) {
  ko(`Colonnes manquantes : ${manquantes.join(', ')} — la migration 015 n’a JAMAIS été appliquée à cette base.`);
  console.log('  ➜ C’EST LA CAUSE : le nouveau code lit/écrit ces colonnes, donc chaque réception et');
  console.log('     chaque transfert plante avant de toucher le stock (le message d’erreur apparaît');
  console.log('     dans le terminal noir du serveur). Réparation automatique en cours…');
  const lancer = spawnSync(process.execPath, [path.join(backend, 'scripts/migrate.mjs')],
    { stdio: 'inherit', env: process.env });
  migres = lancer.status === 0;
  if (migres) ok('Migrations appliquées.');
} else {
  ok('Colonnes packaging + purchase_unit présentes (migration 015 appliquée).');
}
if (migres) {
  const [verif] = await sequelize.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = 'products' AND column_name IN ('packaging', 'purchase_unit')`);
  if (verif.length === 2) ok('Schéma confirmé après migration.');
  else { ko('La migration n’a pas corrigé le schéma — copie-moi le message ci-dessus.'); process.exit(2); }
}

titre('③ TEST RÉEL — réception + conversion + transfert (sans rien écrire)');
const { Product, Supplier, User, Role, Lot, Movement } = models;
const { createReceipt } = await import(urlDe('src/services/receipt.service.js'));
const { createTransfer } = await import(urlDe('src/services/transfer.service.js'));
const { randomUUID } = await import('node:crypto');

const MARQUE = 'ZZ-DIAG-84';
const role = await Role.findOne({ where: {} });
const user = (await User.findOrCreate({
  where: { login: MARQUE },
  defaults: { name: 'Diagnostic 84', login: MARQUE, passwordHash: '-', phone: '', note: '', roleId: role.id, active: false }
}))[0];
const supplier = (await Supplier.findOrCreate({
  where: { name: MARQUE }, defaults: { name: MARQUE, active: true }
}))[0];

let echec = null;
await sequelize.transaction(async transaction => {
  try {
    const produit = await Product.create({
      code: MARQUE, name: 'Diagnostic', presentation: 'Boîte de test', unit: 'boîte',
      marginRate: 30, sellingPrice: 0, cmp: 0, active: true
    }, { transaction });

    // Réception simple : 10 boîtes à 1 000 Ar.
    await createReceipt({
      requestKey: randomUUID(), supplierId: supplier.id, note: '',
      lines: [{
        productId: produit.id, number: 'DIAG-A', quantity: 10, purchasePrice: 1000,
        receivedOn: '2026-01-01', expiresOn: '2028-01-01', manufacturer: 'Diag'
      }]
    }, user, transaction);
    let lots = await Lot.findAll({ where: { productId: produit.id }, transaction });
    const q1 = Number(lots.find(l => l.number === 'DIAG-A')?.quantity ?? 0);
    if (q1 !== 10) throw new Error(`Réception simple : stock = ${q1}, attendu 10.`);
    ok('Réception simple : +10 boîtes au dépôt.');

    // Réception avec conversion : 2 cartons = 40 boîtes (1 carton = 20 boîtes).
    await createReceipt({
      requestKey: randomUUID(), supplierId: supplier.id, note: '',
      lines: [{
        productId: produit.id, number: 'DIAG-B', quantity: 2, purchasePrice: 20000,
        purchaseUnit: 'carton', conversions: [{ from: 'carton', to: 'boîte', count: 20 }],
        receivedOn: '2026-01-01', expiresOn: '2028-01-01', manufacturer: 'Diag'
      }]
    }, user, transaction);
    lots = await Lot.findAll({ where: { productId: produit.id }, transaction });
    const q2 = Number(lots.find(l => l.number === 'DIAG-B')?.quantity ?? 0);
    if (q2 !== 40) throw new Error(`Réception convertie : stock = ${q2}, attendu 40 (2 cartons × 20).`);
    ok('Conversion de conditionnement : 2 cartons → +40 boîtes au dépôt.');
    const mouvementsRec = await Movement.count({ where: { documentType: 'RECEIPT' }, transaction });
    ok(`${mouvementsRec} mouvement(s) de réception écrits au journal.`);

    // Transfert DÉPÔT → PHARMACIE : 6 boîtes.
    const lotA = lots.find(l => l.number === 'DIAG-A' && l.location === 'DEPOT');
    await createTransfer({
      requestKey: randomUUID(), fromLocation: 'DEPOT', toLocation: 'PHARMACY',
      reason: 'Test diagnostic', lines: [{ lotId: lotA.id, quantity: 6 }]
    }, user, transaction);
    lots = await Lot.findAll({ where: { productId: produit.id }, transaction });
    const depot = Number(lots.find(l => l.number === 'DIAG-A' && l.location === 'DEPOT').quantity);
    const pharma = Number(lots.find(l => l.number === 'DIAG-A' && l.location === 'PHARMACY')?.quantity ?? 0);
    if (depot !== 4 || pharma !== 6) {
      throw new Error(`Transfert : dépôt = ${depot} (attendu 4), pharmacie = ${pharma} (attendu 6).`);
    }
    ok('Transfert : dépôt 10 → 4, pharmacie 0 → 6.');

    throw new Error('__ROLLBACK__');   // annule TOUT ce test : la base reste propre
  } catch (cause) {
    if (cause.message === '__ROLLBACK__') throw cause;
    echec = cause;
    throw cause;
  }
}).catch(cause => { if (cause.message !== '__ROLLBACK__' && !echec) echec = cause; });

// Nettoyage du compte et du fournisseur de test (créés HORS transaction).
await User.destroy({ where: { login: MARQUE } });
await Supplier.destroy({ where: { name: MARQUE } });

titre('④ RÉSUMÉ');
if (echec) {
  ko(`Le serveur N’ARRIVE PAS à écrire le stock : ${echec.message}`);
  console.log('\n➜ Envoie-moi ce message d’erreur : il dit exactement quel fichier corriger.');
  process.exit(2);
}
ok('Le code du projet écrit CORRECTEMENT le stock, de bout en bout.');
console.log(`
Si ton application « n’augmente pas le stock », vérifie alors dans l’ordre :
  a) Le serveur tourne-t-il avec CE code ? Redémarre-le (ferme la fenêtre noire,
     relance le .bat) — un serveur lancé avant le collage garde l’ancien code.
  b) Le navigateur : Ctrl + F5 (recharge sans cache) après le nouveau build
     (cd frontend && npm run build).
  c) La base utilisée par l’application est-elle la MÊME que celle testée ici ?
     Ce script lit backend/.env : si le serveur a été démarré avec une autre
     DATABASE_URL, la migration a été faite sur une base et l’appli en lit une autre.
  d) Ouvre la fenêtre noire du serveur pendant une réception : si une erreur
     rouge s’y affiche, copie-la-moi — c’est le vrai coupable.`);
await sequelize.close();
process.exit(0);