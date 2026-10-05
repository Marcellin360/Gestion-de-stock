#!/usr/bin/env node
// ============================================================================
// Remise à zéro de la base — pour refaire des essais depuis le début.
//
// TROIS FAÇONS, de la plus rapide à la plus complète :
//
//   npm run db:etat            → n'efface rien : affiche ce qui reste en base
//
//   npm run db:vider           → ~1 seconde. Efface TOUTES les données métier
//                                (médicaments, stock, documents, ventes,
//                                transferts, fournisseurs, catégories, journal
//                                d'audit) en gardant les COMPTES et les
//                                paramètres : on se reconnecte tout de suite.
//                                Les numéros repartent de MED-001, REC-2026-000001…
//
//   npm run db:reinitialiser   → ~10 secondes. Supprime le schéma et rejoue
//                                toutes les migrations : base neuve, paramètres
//                                aux valeurs par défaut, plus aucun compte.
//
// Options (ligne de commande) :
//   --vider                 vider les données, garder comptes + paramètres
//   --sauvegarde-seule      (ou --sauvegarde sans --vider/--complet) : sauvegarde
//                           seulement, la base n'est pas modifiée
//   --avec-comptes          vider AUSSI les comptes (avec --vider)
//   --complet               schéma supprimé puis recréé (migrations rejouées)
//   --demo                  ajouter les données fictives (nécessite ALLOW_DEMO=true)
//   --sauvegarde            faire un pg_dump avant d'effacer (backend/sauvegardes/)
//   --oui                   ne pas demander de confirmation (obligatoire si le
//                           terminal n'est pas interactif)
//   --force                 autoriser même si NODE_ENV=production
//
// Exemples :
//   node backend/scripts/reinitialiser-base.mjs --vider --oui
//   node backend/scripts/reinitialiser-base.mjs --vider --avec-comptes --demo --oui
//   node backend/scripts/reinitialiser-base.mjs --complet --demo --oui --sauvegarde
// ============================================================================
import { createInterface } from 'node:readline/promises';
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequelize, close } from '../src/config/database.js';
import { config } from '../src/config/index.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const BACKEND = dirname(ICI);
const DEPOT_GARDES = 'sauvegardes';

// Tables JAMAIS vidées par « --vider » : ce sont les référentiels recréés par les
// migrations (rôles, paramètres, formes galéniques, unités) et le registre des
// migrations lui-même — le vider ferait rejouer les migrations sur un schéma existant.
const TABLES_CONSERVEES = ['roles', 'settings', 'product_forms', 'units_of_measure', 'schema_migrations'];

// Tables conservées seulement si l'on garde les comptes (comportement par défaut).
const TABLES_COMPTES = ['users', 'sessions'];

const argv = process.argv.slice(2);
const drapeau = (...noms) => noms.some(nom => argv.includes(`--${nom}`));
const modeVider = drapeau('vider');
const modeComplet = drapeau('complet');
const avecComptes = drapeau('avec-comptes', 'avec-comptes-utilisateurs');
const modeDemo = drapeau('demo');
const sauvegarde = drapeau('sauvegarde', 'sauvegarde-avant');
const oui = drapeau('oui', 'yes', 'y') || String(process.env.RESET_YES || '') === 'true';
const force = drapeau('force');
const modeSauvegarde = drapeau('sauvegarde-seule') || (sauvegarde && !modeVider && !modeComplet);
const modeEtat = drapeau('etat', 'état') || (!modeVider && !modeComplet && !modeSauvegarde);

const fr = valeur => Number(valeur).toLocaleString('fr-FR');
const duree = ms => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const urlSansMotDePasse = url => String(url).replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');

/** Liste des tables réellement présentes en base (une migration future sera couverte). */
async function tables() {
  const [lignes] = await sequelize.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename"
  );
  return lignes.map(l => l.tablename);
}

async function compter(table) {
  const [lignes] = await sequelize.query(`SELECT count(*)::int AS total FROM "${table}"`);
  return Number(lignes[0]?.total || 0);
}

async function etat() {
  const liste = await tables();
  const ordre = ['products', 'lots', 'receipts', 'receipt_lines', 'transfers', 'transfer_lines',
    'sales', 'sale_lines', 'losses', 'loss_lines', 'adjustments', 'adjustment_lines',
    'movements', 'inventories', 'inventory_lines', 'price_history', 'documents', 'audit_logs',
    'suppliers', 'categories', 'users', 'sessions', 'roles', 'settings', 'product_forms',
    'units_of_measure', 'schema_migrations'];
  const rangees = ordre.filter(t => liste.includes(t)).concat(liste.filter(t => !ordre.includes(t)));
  console.log(`Base : ${urlSansMotDePasse(config.databaseUrl)}`);
  console.log('');
  console.log('Table                     | Lignes');
  console.log('--------------------------+---------');
  let total = 0;
  for (const table of rangees) {
    const lignes = await compter(table);
    if (!TABLES_CONSERVEES.includes(table)) total += lignes;
    console.log(`${table.padEnd(25)} | ${fr(lignes).padStart(8)}`);
  }
  console.log('--------------------------+---------');
  console.log(`Données métier (hors référentiels) : ${fr(total)} ligne(s)`);
  const [parametres] = await sequelize.query(
    'SELECT pharmacy_name, currency, valuation, margin_mode, min_margin, max_margin FROM settings WHERE id = 1'
  );
  if (parametres[0]) {
    console.log('');
    console.log(`Paramètres : ${parametres[0].pharmacy_name} · ${parametres[0].currency}`
      + ` · valorisation ${parametres[0].valuation} · marge ${parametres[0].margin_mode}`
      + ` · plage ${parametres[0].min_margin}–${parametres[0].max_margin} %`);
  }
  const comptes = await sequelize.query(
    'SELECT u.login, r.code AS role FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.login'
  );
  if (comptes[0].length) {
    console.log(`Comptes    : ${comptes[0].map(c => `${c.login} (${c.role})`).join(', ')}`);
  } else {
    console.log('Comptes    : aucun');
  }
  console.log('');
  console.log('Pour vider   : npm run db:vider');
  console.log('Pour refaire : npm run db:reinitialiser');
}

/** Sauvegarde pg_dump (facultative) — on refuse de continuer si elle échoue. */
function faireSauvegarde() {
  const dossier = `${BACKEND}/${DEPOT_GARDES}`;
  mkdirSync(dossier, { recursive: true });
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fichier = `${dossier}/avant-remise-a-zero-${horodatage}.dump`;
  console.log(`Sauvegarde en cours : ${fichier}`);
  const resultat = spawnSync('pg_dump', [`--dbname=${config.databaseUrl}`, '--format=custom', '--file', fichier],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (resultat.error && resultat.error.code === 'ENOENT') {
    throw new Error('pg_dump introuvable : installer les outils PostgreSQL (pg_dump) ou relancer sans --sauvegarde.');
  }
  if (resultat.status !== 0) throw new Error('La sauvegarde a échoué : rien n’a été effacé.');
  console.log('Sauvegarde terminée.');
  console.log('Restauration si besoin : pg_restore --clean --if-exists --dbname=<URL> ' + fichier);
  console.log('');
}

async function confirmer(question, mot) {
  if (oui) return true;
  if (!process.stdin.isTTY) {
    throw new Error(`Terminal non interactif : relancer avec --oui (ou RESET_YES=true) après avoir vérifié la base.`);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const reponse = await rl.question(`${question}\nTapez ${mot} puis Entrée (autre chose = annulation) : `);
  rl.close();
  if (String(reponse).trim().toUpperCase() !== mot) {
    console.log('Annulé : rien n’a été modifié.');
    return false;
  }
  return true;
}

/** Enchaîne une commande de maintenance (migrations, comptes, données fictives). */
function lancer(script, environnement = {}) {
  console.log(`→ ${script}`);
  const resultat = spawnSync(process.execPath, [script], {
    cwd: BACKEND, stdio: 'inherit',
    env: { ...process.env, ...environnement }
  });
  if (resultat.status !== 0) throw new Error(`${script} a échoué (code ${resultat.status}).`);
}

async function creerComptes() {
  const motDePasse = process.env.ADMIN_PASSWORD || '';
  if (motDePasse.length >= 4) {
    lancer('scripts/create-admin.mjs', { ADMIN_PASSWORD: motDePasse });
  } else {
    console.log('Aucun compte administrateur créé : ADMIN_PASSWORD (4 caractères minimum) n’est pas défini.');
    console.log('À faire ensuite : ADMIN_PASSWORD="votre-mot-de-passe" npm run admin:create');
  }
  if (modeDemo) lancer('scripts/seed-demo-users.mjs', { ALLOW_DEMO: 'true' });
}

async function viderBase() {
  const liste = await tables();
  const aVider = liste.filter(table => !TABLES_CONSERVEES.includes(table)
    && !(avecComptes ? false : TABLES_COMPTES.includes(table)));
  if (aVider.length === 0) {
    console.log('Rien à vider.');
    return aVider;
  }
  // TRUNCATE … CASCADE est instantané (aucune ligne relue) et remet les compteurs à zéro :
  // les prochains documents repartent de REC-2026-000001, TRF-2026-000001…
  // Les déclencheurs d'immuabilité des mouvements/audit/journaux ne concernent que
  // DELETE et UPDATE sur les lignes : ils ne bloquent pas un TRUNCATE.
  await sequelize.query(`TRUNCATE TABLE ${aVider.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  return aVider;
}

async function main() {
  const debut = Date.now();
  if (!force && config.production) {
    throw new Error('NODE_ENV=production : remise à zéro refusée (ajouter --force si c’est vraiment voulu).');
  }
  if (modeSauvegarde) {
    faireSauvegarde();
    console.log('La base n’a pas été modifiée.');
    await close();
    return;
  }
  if (!modeVider && !modeComplet) {
    await etat();
    await close();
    return;
  }

  console.log(`Base : ${urlSansMotDePasse(config.databaseUrl)}`);
  console.log('');
  if (sauvegarde) faireSauvegarde();

  if (modeComplet) {
    const valide = await confirmer(
      'ATTENTION : le schéma sera SUPPRIMÉ puis recréé.\n'
      + 'Les comptes ET les paramètres (nom de la pharmacie, marge, valorisation) reviennent par défaut.',
      'REINITIALISER');
    if (!valide) { await close(); return; }
    const t0 = Date.now();
    await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE');
    await sequelize.query('CREATE SCHEMA public');
    console.log(`Schéma recréé en ${duree(Date.now() - t0)}.`);
    lancer('scripts/migrate.mjs');
    await creerComptes();
    if (modeDemo) lancer('scripts/seed-demo.mjs', { ALLOW_DEMO: 'true' });
  } else {
    const cibles = avecComptes
      ? 'médicaments, stock, documents, ventes, transferts, fournisseurs, catégories, journal d’audit ET les comptes'
      : 'médicaments, stock, documents, ventes, transferts, fournisseurs, catégories, journal d’audit';
    const valide = await confirmer(
      `ATTENTION : toutes les données seront effacées (${cibles}).\n`
      + (avecComptes ? '' : 'Les comptes et les paramètres sont CONSERVÉS.\n'),
      'VIDER');
    if (!valide) { await close(); return; }
    const t0 = Date.now();
    const aVider = await viderBase();
    console.log(`Vidé : ${aVider.length} table(s) en ${duree(Date.now() - t0)}.`);
    if (avecComptes) await creerComptes();
    if (modeDemo) lancer('scripts/seed-demo.mjs', { ALLOW_DEMO: 'true' });
  }

  console.log('');
  await etat();
  console.log(`Terminé en ${duree(Date.now() - debut)} — base prête pour un essai depuis le début.`);
}

main()
  .then(close)
  .catch(async error => {
    console.error('');
    console.error('Échec :', error.message);
    await close();
    process.exitCode = 1;
  });