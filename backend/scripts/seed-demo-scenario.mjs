#!/usr/bin/env node
// ============================================================================
//  Scénario de démonstration complet — NOUVELLE ORGANISATION EN DEUX MAGASINS
//
//  Usage : npm run demo:scenario
//
//  À lancer APRÈS : npm run db:migrate, npm run admin:create,
//                   npm run demo:seed (catalogue) et npm run demo:users (comptes).
//
//  Ce que le script joue, dans l'ordre réel du métier :
//    1. RÉCEPTION au DÉPÔT : les 3 médicaments entrent dans la réserve
//       (frais de transport répartis → coût de revient, CMP, prix de vente).
//    2. TRANSFERT dépôt → pharmacie : seulement ce dont le comptoir a besoin
//       (le reste demeure dans la réserve), avec création des lots jumeaux.
//    3. VENTES au comptoir : les sorties de la pharmacie, c'est-à-dire les ventes.
//    4. PERTE (casse) déclarée DANS LA PHARMACIE sur un lot transféré.
//    5. PERTE AU DÉPÔT : un flacon cassé dans la réserve, pour montrer que le
//       dépôt a lui aussi ses entrées, ses sorties et son historique.
//
//  Les documents sont créés par le profil qui en a le droit dans la vraie vie :
//  le gestionnaire du dépôt pour les réceptions et les transferts, le pharmacien
//  pour les ventes et les pertes du comptoir.
//
//  Aucune donnée réelle n'est touchée : le script refuse de tourner si des
//  réceptions existent déjà, et exige ALLOW_DEMO=true.
// ============================================================================
import { randomUUID } from 'node:crypto';
import { config } from '../src/config/index.js';
import { sequelize, close } from '../src/config/database.js';
import { User, Role, Product, Supplier, Lot, Receipt, Setting, Movement } from '../src/models/index.js';
import { createReceipt } from '../src/services/receipt.service.js';
import { createTransfer } from '../src/services/transfer.service.js';
import { createSale } from '../src/services/sale.service.js';
import { createLoss } from '../src/services/loss.service.js';
import { addDays, today } from '../src/utils/dates.js';

// Catalogue attendu (créé par « npm run demo:seed »).
const LIVRAISON = [
  { code: 'MED-001', quantity: 100, purchasePrice: '8000', lot: 'LOT-MED-001-A', expiresIn: 365 },
  { code: 'MED-002', quantity: 100, purchasePrice: '12000', lot: 'LOT-MED-002-A', expiresIn: 270 },
  { code: 'MED-003', quantity: 100, purchasePrice: '6000', lot: 'LOT-MED-003-A', expiresIn: 45 }
];
const FRAIS_TRANSPORT = '100000';

// Ce que le pharmacien demande au dépôt : une partie seulement de chaque lot.
const TRANSFERT = [
  { code: 'MED-001', quantity: 40 },
  { code: 'MED-002', quantity: 30 },
  { code: 'MED-003', quantity: 20 }
];
const MOTIF_TRANSFERT = 'Réassort du comptoir';

const VENTES = [
  { client: 'Client comptoir (démonstration)', lignes: [['MED-001', 3], ['MED-002', 2]] },
  { client: 'Client comptoir (démonstration)', lignes: [['MED-003', 4]] }
];
const PERTE_PHARMACIE = { code: 'MED-002', quantity: 1, reason: 'Casse', note: 'Flacon cassé au comptoir (démonstration)' };
const PERTE_DEPOT = { code: 'MED-001', quantity: 2, reason: 'Casse', note: 'Carton écrasé dans la réserve (démonstration)' };

const euros = valeur => Number(valeur).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ligne = (titre, valeur) => console.log(`  ${titre.padEnd(28)} ${valeur}`);

/** Retrouve l'utilisateur d'un rôle donné, sinon retombe sur l'administrateur. */
async function operateur(roleCode, admin) {
  const role = await Role.findOne({ where: { code: roleCode } });
  if (role) {
    const utilisateur = await User.findOne({ where: { roleId: role.id, active: true } });
    if (utilisateur) return utilisateur;
  }
  return admin;
}

async function main() {
  if (process.env.ALLOW_DEMO !== 'true' || config.production) {
    throw new Error('Démonstration refusée : ALLOW_DEMO=true et NODE_ENV différent de « production » sont exigés.');
  }

  const produits = await Product.findAll();
  if (produits.length === 0) throw new Error('Catalogue vide : exécuter d’abord « npm run demo:seed ».');
  const parCode = new Map(produits.map(p => [p.code, p]));
  for (const attendu of [...LIVRAISON, PERTE_PHARMACIE, PERTE_DEPOT]) {
    if (!parCode.get(attendu.code)) {
      throw new Error(`Médicament ${attendu.code} absent : exécuter « npm run demo:seed » sur une base vide.`);
    }
  }
  if (await Receipt.count() > 0) {
    throw new Error('Des réceptions existent déjà : ce scénario s’ajoute à un stock existant. '
      + 'Pour recommencer proprement : recréez la base (npm run setup, db:migrate, admin:create, '
      + 'demo:seed, demo:users, demo:scenario).');
  }

  const fournisseur = await Supplier.findOne({ where: { active: true }, order: [['id', 'ASC']] });
  if (!fournisseur) throw new Error('Aucun fournisseur actif : exécuter « npm run demo:seed ».');
  const admin = await User.findOne({ order: [['id', 'ASC']] });
  if (!admin) throw new Error('Aucun utilisateur : exécuter « npm run admin:create ».');

  const gestionnaire = await operateur('DEPOT', admin);
  const pharmacien = await operateur('PHARMACIST', admin);

  console.log(`\n=== Scénario de démonstration (dépôt + pharmacie) — ${today()} ===`);
  console.log(`Fournisseur : ${fournisseur.name}`);
  console.log(`Opérateurs  : ${gestionnaire.login} (dépôt : réceptions et transferts), `
    + `${pharmacien.login} (pharmacie : ventes et pertes)\n`);

  // ------------------------------------------------- 1. réception AU DÉPÔT
  const reception = await sequelize.transaction(transaction => createReceipt({
    requestKey: randomUUID(),
    supplierId: fournisseur.id,
    fees: FRAIS_TRANSPORT,
    invoiceRef: 'FA-DEMO-2026',
    note: 'Livraison de démonstration — entrée au dépôt (frais de transport inclus)',
    lines: LIVRAISON.map(l => ({
      productId: parCode.get(l.code).id,
      number: l.lot, quantity: l.quantity,
      purchasePrice: l.purchasePrice, receivedOn: addDays(today(), -5), expiresOn: addDays(today(), l.expiresIn)
    }))
  }, gestionnaire, transaction));
  ligne('1. Réception (dépôt)', `${reception.reference} — frais ${euros(FRAIS_TRANSPORT)} Ar`);

  // ------------------------------------- 2. transfert DÉPÔT → PHARMACIE
  // On transfère une PARTIE : le dépôt garde le reste pour les prochains besoins.
  const lotsDepot = await Lot.findAll({ where: { location: 'DEPOT' }, order: [['id', 'ASC']] });
  const transfert = await sequelize.transaction(transaction => createTransfer({
    requestKey: randomUUID(),
    fromLocation: 'DEPOT',
    toLocation: 'PHARMACY',
    reason: MOTIF_TRANSFERT,
    note: 'Transfert de démonstration : le comptoir est réassorti, la réserve garde le solde',
    lines: TRANSFERT.map(l => ({
      lotId: lotsDepot.find(lot => lot.productId === parCode.get(l.code).id).id,
      quantity: l.quantity
    }))
  }, gestionnaire, transaction));
  ligne('2. Transfert dépôt → officine', `${transfert.reference} — ${TRANSFERT.length} lignes`);

  // ------------------------------------------------------ 3. ventes au comptoir
  const ventes = [];
  for (const [index, vente] of VENTES.entries()) {
    const resultat = await sequelize.transaction(transaction => createSale({
      requestKey: randomUUID(),
      customerName: vente.client,
      lines: vente.lignes.map(([code, quantity]) => ({ productId: parCode.get(code).id, quantity }))
    }, pharmacien, transaction));
    ventes.push(resultat.sale);
    ligne(`3. Vente ${index + 1} (pharmacie)`, `${resultat.sale.reference} — total ${euros(resultat.sale.total)} Ar `
      + `(marge ${euros(resultat.sale.margin)} Ar)`);
  }

  // --------------------------------------- 4. perte déclarée dans la pharmacie
  const lotPertePharmacie = await Lot.findOne({
    where: { productId: parCode.get(PERTE_PHARMACIE.code).id, location: 'PHARMACY' }, order: [['id', 'ASC']]
  });
  const perteOfficine = await sequelize.transaction(transaction => createLoss({
    requestKey: randomUUID(),
    location: 'PHARMACY',
    reason: PERTE_PHARMACIE.reason,
    note: PERTE_PHARMACIE.note,
    lines: [{ lotId: lotPertePharmacie.id, quantity: PERTE_PHARMACIE.quantity }]
  }, pharmacien, transaction));
  ligne('4. Perte (pharmacie)', `${perteOfficine.reference} — ${PERTE_PHARMACIE.quantity} × ${PERTE_PHARMACIE.code} `
    + `sur ${lotPertePharmacie.number}`);

  // ------------------------------------------- 5. perte déclarée au dépôt
  const lotPerteDepot = await Lot.findOne({
    where: { productId: parCode.get(PERTE_DEPOT.code).id, location: 'DEPOT' }, order: [['id', 'ASC']]
  });
  const perteDepot = await sequelize.transaction(transaction => createLoss({
    requestKey: randomUUID(),
    location: 'DEPOT',
    reason: PERTE_DEPOT.reason,
    note: PERTE_DEPOT.note,
    lines: [{ lotId: lotPerteDepot.id, quantity: PERTE_DEPOT.quantity }]
  }, gestionnaire, transaction));
  ligne('5. Perte (dépôt)', `${perteDepot.reference} — ${PERTE_DEPOT.quantity} × ${PERTE_DEPOT.code} sur ${lotPerteDepot.number}`);

  // --------------------------------------------------------- état final du stock
  const produitsFinaux = await Product.findAll({ order: [['code', 'ASC']] });
  const lots = await Lot.findAll({ order: [['number', 'ASC']] });
  const soldes = (productId, magasin) => lots
    .filter(l => l.productId === productId && l.location === magasin)
    .reduce((total, l) => total + Number(l.quantity), 0);

  console.log('\n=== Stock après le scénario — les deux magasins séparément ===');
  console.log('  CODE     MÉDICAMENT                    DÉPÔT   PHARMACIE   TOTAL   CMP (Ar)      PRIX DE VENTE (Ar)');
  let totalDepot = 0; let totalPharmacie = 0;
  for (const produit of produitsFinaux) {
    const depot = soldes(produit.id, 'DEPOT');
    const pharmacie = soldes(produit.id, 'PHARMACY');
    totalDepot += depot; totalPharmacie += pharmacie;
    console.log(`  ${produit.code.padEnd(8)} ${produit.name.padEnd(28)} ${String(depot).padStart(5)}   `
      + `${String(pharmacie).padStart(10)}   ${String(depot + pharmacie).padStart(5)}   `
      + `${euros(produit.cmp).padStart(9)}   ${euros(produit.sellingPrice).padStart(17)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(37)} ${String(totalDepot).padStart(5)}   ${String(totalPharmacie).padStart(10)}   `
    + `${String(totalDepot + totalPharmacie).padStart(5)}`);

  const lotsDetailles = lots.map(l => `${l.location === 'DEPOT' ? 'DEP' : 'PHA'} ${l.number}: ${l.quantity}`);
  console.log(`\n  Lots : ${lotsDetailles.join(' | ')}`);

  const parametres = await Setting.findByPk(1);
  const mouvements = await Movement.count();
  console.log('\n=== Ce que la démonstration permet de montrer tout de suite ===');
  ligne('Paramètres', `marge ${parametres.marginMode === 'COST' ? 'sur coût' : 'sur prix'} `
    + `${parametres.minMargin}–${parametres.maxMargin} %, valorisation ${parametres.valuation}, `
    + `alerte péremption ${parametres.expiryDays} jours`);
  ligne('Mouvements enregistrés', `${mouvements} (immuables : ni modification ni suppression)`);
  ligne('Fiche pharmacie', 'Rapports → « Fiche de stock — PHARMACIE » (entrées = transferts, sorties = ventes)');
  ligne('Fiche dépôt', 'Rapports → « Fiche de stock — DÉPÔT » (entrées = réceptions, sorties = transferts)');
  ligne('Historique de vente', 'Écran « Historique de vente » : les sorties de la pharmacie, avec marges');
  ligne('Historique du dépôt', 'Écran « Transferts dépôt → pharmacie » + « Documents » + « Mouvements » '
    + ': réceptions, transferts et pertes de la réserve');
  ligne('Alertes attendues', 'LOT-MED-003-A expire dans 45 jours → alerte « expiration proche » dans les deux magasins');
  console.log('\nVentes : ' + ventes.map(v => `${v.reference} (${euros(v.total)} Ar)`).join(', '));
  console.log('Dates fictives : réception il y a 5 jours, transfert, ventes et pertes du jour.');
  console.log('Après la démonstration : écran Utilisateurs → désactiver les comptes de démonstration,');
  console.log('puis recréer une base propre avant l’usage réel.\n');
}

main()
  .then(() => close())
  .catch(async error => {
    console.error('Échec :', error.message);
    await close().catch(() => {});
    process.exit(1);
  });
