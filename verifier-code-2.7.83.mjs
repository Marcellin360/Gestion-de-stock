#!/usr/bin/env node
// ============================================================================
// Vérificateur de copie-collage — fanitsiana 2.7.83 « retouches DÉPÔT » :
//   ① NOUVELLE RÉCEPTION : la liste déroulante « Unité de gestion » est
//     ENRICHIE — Boîte, Plaquette, Flacon, Comprimé, Ampoule, Rouleau, Carton,
//     ml, cm. « pièce » sort de la liste ; les lignes DÉJÀ enregistrées avec
//     une ancienne unité gardent leur valeur (le repli du formulaire les
//     réaffiche).
//   ② HISTORIQUE DE TRANSFERT : le bouton « Détail » passe en VERT plein.
//     Le bouton « Modifier » (proposition de correction, 2.7.79) conserve le
//     BLEU plein.
// Prérequis : 2.7.82 appliquée. AUCUNE migration.
//
// Emploi (depuis la racine du projet) :
//     node verifier-code-2.7.83.mjs
// ============================================================================
import { readFileSync, existsSync } from 'node:fs';

const CONTROLES = [
  // ── ① Unités de gestion enrichies dans « Nouvelle réception ». ──────────
  ['frontend/src/forms/ReceiptForm.jsx', [
    // 2.7.83 — les NEUF choix, « pièce » retirée.
    "const UNITES_GESTION = ['boîte', 'plaquette', 'flacon', 'comprimé', 'ampoule', 'rouleau', 'carton', 'ml', 'cm'];",
    '2.7.83 — ENRICHIE sur demande du dépôt : Boîte, Plaquette, Flacon',
    'UNITES_GESTION.map(u =>',               // la liste reste câblée
    '!UNITES_GESTION.includes(ligne.unit)',  // repli pour anciennes valeurs
  ]],
  // ── ② « Détail » de l'historique de transfert : VERT. ───────────────────
  ['frontend/src/pages/TransfersPage.jsx', [
    '2.7.83 — DEMANDE DÉPÔT : « Détail » en VERT plein',
    'style={COULEUR_IMPRIMER} icon={Eye}',
    '>Détail</Btn>',
    'style={COULEUR_DETAIL} icon={SquarePen}',  // « Modifier » reste BLEU
    "import { COULEUR_DETAIL, COULEUR_IMPRIMER } from '../components/SaleHistoryModal.jsx'",
  ]],
  ['backend/src/utils/version.js', ["'2.7.83'"]],
];

// Non-régressions fortes des versions antérieures.
const INVARIANTS = [
  ['frontend/src/forms/ReceiptForm.jsx', [
    'label="Unité de gestion"',
    'title={`${product.name} — stock actuel au dépôt :',  // 2.7.31 : infobulle stock
  ]],
  ['frontend/src/pages/TransfersPage.jsx', [
    'Historique de transfert',             // 2.7.72 : deux cartes conservées
    "{ label: 'Quantité transférée', center: true }",  // 2.7.79/2.7.80
    "{ label: 'Stock Final', num: true }",
    'transfert(s) sur la période',
    'correction en attente',               // 2.7.79 : workflow correction
  ]],
  ['frontend/src/components/SaleHistoryModal.jsx', [
    "export const COULEUR_IMPRIMER = { background: '#15803d'",  // ton VERT
    "export const COULEUR_DETAIL = { background: '#1d4ed8'",    // ton BLEU
  ]],
];

let echecs = 0;
let total = 0;
const dire = (ok, message) => {
  total += 1;
  if (ok) console.log(`  ✓ ${message}`);
  else { echecs += 1; console.log(`  ✗ ${message}`); }
};

console.log('contrôles 2.7.83 dépôt (unités réception + Détail transfert vert)…\n');
for (const [chemin, signes] of CONTROLES) {
  if (!existsSync(chemin)) { dire(false, `${chemin} : FICHIER INTROUVABLE`); continue; }
  const texte = readFileSync(chemin, 'utf8');
  console.log(chemin);
  for (const signe of signes) dire(texte.includes(signe), `contient « ${signe.slice(0, 80)} »`);
}
console.log('\ninvariants (non-régressions)…');
for (const [chemin, signes] of INVARIANTS) {
  if (!existsSync(chemin)) { dire(false, `${chemin} : FICHIER INTROUVABLE`); continue; }
  const texte = readFileSync(chemin, 'utf8');
  console.log(chemin);
  for (const signe of signes) dire(texte.includes(signe), `contient « ${signe.slice(0, 80)} »`);
}

console.log(`\n${total - echecs}/${total} contrôles réussis.`);
if (echecs === 0) {
  console.log('🎉 code 2.7.83 COMPLET. Puis : cd backend && npm test (nouveau test 2.7.83) et npm run build côté frontend.');
} else {
  console.log('⚠ ' + echecs + ' contrôle(s) en échec — recoller le(s) fichier(s) signalé(s).');
  process.exitCode = 1;
}