#!/usr/bin/env node
// ============================================================================
// Diagnostic de l'installation (important : ne modifie AUCUNE donnée).
// Vérifie, dans l'ordre : la connexion, les tables attendues, les colonnes
// utiles à la connexion, la possibilité d'ÉCRIRE (session, journal), et
// l'état du compte administrateur. Chaque problème est affiché avec le
// message exact de PostgreSQL, pour savoir quoi corriger.
//
//   npm run diagnose
// ============================================================================
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/index.js';
import { sequelize, close } from '../src/config/database.js';

const T = [];
const titre = texte => console.log(`\n=== ${texte} ===`);
const ok = texte => console.log(`  [ok]    ${texte}`);
const alerte = texte => console.log(`  [note]  ${texte}`);
const echec = texte => console.log(`  [PROBLEME] ${texte}`);

async function main() {
  titre('1. Version du projet extrait');
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const paquet = JSON.parse(fs.readFileSync(racine + 'package.json', 'utf8'));
  console.log(`  racine : ${racine}`);
  console.log(`  version : ${paquet.version}`);
  const reperes = [
    ['frontend/src/pages/StockPage.jsx', 'écran Stock à onglets (v2.1)'],
    ['frontend/src/pages/CataloguePage.jsx', 'écran Catalogue à onglets (v2.1)'],
    ['backend/scripts/seed-demo-users.mjs', 'comptes d’essai (v2.1)'],
    ['backend/scripts/reset-password.mjs', 'réinitialisation de mot de passe (v2.1)']
  ];
  for (const [chemin, quoi] of reperes) {
    const present = fs.existsSync(racine + chemin);
    (present ? ok : alerte)(`${quoi} : ${present ? 'présent' : 'ABSENT — extraction ancienne'}`);
  }

  titre('2. Connexion à PostgreSQL');
  const url = String(config.databaseUrl);
  const sansSecret = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
  console.log(`  DATABASE_URL : ${sansSecret}`);
  try {
    await sequelize.authenticate();
    const [[info]] = await sequelize.query('SELECT current_user AS utilisateur, current_database() AS base, version() AS version');
    ok(`connecté en tant que « ${info.utilisateur} » sur la base « ${info.base} »`);
    console.log(`  serveur : ${String(info.version).split(',')[0]}`);
  } catch (erreur) {
    echec(`connexion impossible : ${erreur.message}`);
    console.log('  → vérifier le service PostgreSQL (Services Windows), le mot de passe de DATABASE_URL, le port 5432.');
    return;
  }

  try {
    // SHOW renvoie selon les cas un objet ou un tableau : on accepte les deux formes.
    const brut = await sequelize.query('SHOW default_transaction_read_only');
    const ligne = Array.isArray(brut[0]) ? brut[0][0] : brut[0];
    const lectureSeule = String(ligne?.default_transaction_read_only ?? ligne?.default_transaction_read_only ?? 'off');
    ok(`base en lecture seule ? ${lectureSeule} (doit être « off »)`);
    if (lectureSeule === 'on') {
      echec('la base est en LECTURE SEULE : les écritures (connexion, ventes) échouent. Disque plein ou base en récupération.');
    }
    const taille = await sequelize.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS taille');
    const info = Array.isArray(taille[0]) ? taille[0][0] : taille[0];
    if (info?.taille) console.log(`  taille de la base : ${info.taille}`);
  } catch (erreur) {
    alerte(`vérification de l’état impossible : ${erreur.message}`);
  }

  titre('3. Tables et colonnes attendues');
  const attendu = {
    roles: ['id', 'code', 'name', 'permissions'],
    users: ['id', 'name', 'login', 'password_hash', 'role_id', 'active', 'last_login_at'],
    sessions: ['id', 'token_hash', 'user_id', 'csrf', 'expires_at', 'created_at', 'ip', 'user_agent'],
    audit_logs: ['id', 'user_id', 'action', 'entity', 'entity_id', 'before', 'after', 'ip', 'created_at'],
    settings: ['id', 'pharmacy_name', 'currency'],
    products: ['id', 'code', 'name', 'cmp', 'selling_price', 'margin_rate', 'version'],
    lots: ['id', 'number', 'quantity', 'unit_cost', 'expires_on', 'status'],
    schema_migrations: ['name', 'applied_at']
  };
  const [colonnes] = await sequelize.query(
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()'
  );
  const parTable = new Map();
  for (const ligne of colonnes) {
    if (!parTable.has(ligne.table_name)) parTable.set(ligne.table_name, new Set());
    parTable.get(ligne.table_name).add(ligne.column_name);
  }
  let manques = 0;
  for (const [table, champs] of Object.entries(attendu)) {
    if (!parTable.has(table)) { echec(`table « ${table} » ABSENTE`); manques += 1; continue; }
    const absentes = champs.filter(champ => !parTable.get(table).has(champ));
    if (absentes.length) { echec(`table « ${table} » sans les colonnes : ${absentes.join(', ')}`); manques += 1; }
    else ok(`table « ${table} » complète`);
  }
  if (manques) {
    console.log('  → la base a été créée par une version antérieure du projet. Solution : recréer la base');
    console.log('    (npm run setup ; ou dans psql : DROP DATABASE pharmacie_stock; CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING \'UTF8\';)');
    console.log('    puis : npm run db:migrate, npm run admin:create, npm run demo:seed.');
  }

  try {
    const [lignes] = await sequelize.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    ok(`migrations enregistrées : ${lignes.map(l => l.name).join(', ') || 'aucune'}`);
  } catch (erreur) {
    echec(`lecture de schema_migrations impossible : ${erreur.message}`);
  }

  titre('4. Écriture (sessions, journal, dernière connexion) — annulée à la fin');
  const transaction = await sequelize.transaction();
  try {
    const [roles] = await sequelize.query("SELECT id, code, name FROM roles ORDER BY id", { transaction });
    ok(`rôles présents : ${roles.map(r => r.code).join(', ')}`);

    const [comptes] = await sequelize.query(
      "SELECT u.id, u.login, u.active, u.last_login_at, r.code AS role, length(u.password_hash) AS taille_hash FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.id",
      { transaction }
    );
    if (!comptes.length) {
      echec('AUCUN compte utilisateur : exécuter « npm run admin:create » (avec ADMIN_PASSWORD dans backend/.env).');
    } else {
      for (const compte of comptes) {
        const etat = compte.active ? 'actif' : 'désactivé';
        const role = compte.role || 'ROLE MANQUANT';
        const alerte2 = !compte.role ? ' ← le rôle référencé n’existe pas (comptes hérités d’une base antérieure)' : '';
        console.log(`  compte « ${compte.login} » : ${etat}, rôle ${role}, hash ${compte.taille_hash ?? 0} caractères${alerte2}`);
      }
      // Contrôle de la forme des empreintes : un hachage abîmé ferait échouer la connexion.
      const [hashes] = await sequelize.query('SELECT login, password_hash FROM users', { transaction });
      const abimes = hashes.filter(ligne => !/^\$2[aby]\$\d{2}\$/.test(String(ligne.password_hash || '')));
      if (abimes.length) echec(`empreinte de mot de passe illisible pour : ${abimes.map(l => l.login).join(', ')} (réinitialiser : npm run reset:password)`);
      else ok('toutes les empreintes de mot de passe sont lisibles (bcrypt)');
      const admin = comptes.find(c => c.role === 'ADMIN');
      if (!admin) echec('aucun compte avec le rôle ADMIN : personne ne peut gérer les comptes/paramètres.');
      const motDePasse = process.env.TEST_PASSWORD;
      if (admin && motDePasse) {
        const [secret] = await sequelize.query('SELECT password_hash FROM users WHERE id = $1', { bind: [admin.id], transaction });
        const valide = await bcrypt.compare(motDePasse, secret[0].password_hash).catch(() => false);
        (valide ? ok : echec)(`TEST_PASSWORD ${valide ? 'correspond' : 'NE correspond PAS'} au compte « ${admin.login} »`);
      }
    }

    await sequelize.query(
      "INSERT INTO sessions (token_hash, user_id, csrf, expires_at, ip, user_agent) VALUES (repeat('d', 64), (SELECT id FROM users ORDER BY id LIMIT 1), repeat('e', 64), now() + interval '5 minutes', '127.0.0.1', 'diagnostic')",
      { transaction }
    );
    ok('écriture d’une session : possible');

    await sequelize.query(
      "INSERT INTO audit_logs (user_id, action, entity, entity_id, after, ip) VALUES ((SELECT id FROM users ORDER BY id LIMIT 1), 'DIAGNOSTIC', 'USER', 1, '{\"diagnostic\": true}', '127.0.0.1')",
      { transaction }
    );
    ok('écriture du journal d’audit : possible');

    await sequelize.query('UPDATE users SET last_login_at = now() WHERE id = (SELECT id FROM users ORDER BY id LIMIT 1)', { transaction });
    ok('mise à jour de la dernière connexion : possible');
  } catch (erreur) {
    echec(`une écriture a échoué : ${erreur.name} — ${erreur.message}`);
    if (erreur.sql) console.log(`  requête : ${String(erreur.sql).slice(0, 300)}`);
  } finally {
    await transaction.rollback();
    ok('vérification terminée sans rien enregistrer (transaction annulée)');
  }

  titre('5. Ce qu’il faut retenir');
  console.log('  - 401 sur /api/auth/me : NORMAL quand on n’est pas connecté.');
  console.log('  - 500 sur /api/auth/login : cause exacte affichée dans le terminal [API] et ci-dessus.');
  console.log('  - Si tout est [ok] ici, le problème est côté serveur : relancer « npm run dev » et');
  console.log('    copier les lignes du terminal [API] qui commencent par une date.');
  T.push('diagnostic terminé');
}

main()
  .catch(erreur => { echec(`diagnostic interrompu : ${erreur.message}`); process.exitCode = 1; })
  .finally(() => close().catch(() => {}));
