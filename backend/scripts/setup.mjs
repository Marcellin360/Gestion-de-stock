#!/usr/bin/env node
// ============================================================================
//  Installation guidée — création du rôle PostgreSQL, de la base de données
//  et du fichier backend/.env, en une seule commande.
//
//  Usage (depuis la racine du projet) :
//    npm run setup              installation guidée : rôle + base + backend/.env
//    npm run setup -- --full    idem, puis migrations et création de l'administrateur
//    npm run db:create          crée seulement le rôle et la base (sans toucher à .env)
//
//  Chaque réglage se donne par option de ligne de commande OU par variable
//  d'environnement (pratique sous Windows, car npm intercepte certains --drapeaux) :
//
//    Option                       Variable d'environnement   Défaut
//    --db-name <nom>              SETUP_DB_NAME              pharmacie_stock
//    --role <nom>                 SETUP_ROLE                 pharmastock
//    --db-host <hôte>             SETUP_DB_HOST              127.0.0.1
//    --db-port <port>             SETUP_DB_PORT              5432
//    --superuser <nom>            SETUP_SUPERUSER            postgres
//    --super-password <mdp>       SETUP_SUPER_PASSWORD       (demandé, masqué)
//    --role-password <mdp>        SETUP_ROLE_PASSWORD        (généré, 20 caractères)
//    --admin-password <mdp>       SETUP_ADMIN_PASSWORD       (demandé ou généré)
//    --db-only                    —                          créer la base sans .env
//    --full                       —                          enchaîner migrate + admin:create
//    --demo                       SETUP_DEMO=true            autoriser les données fictives (ALLOW_DEMO=true)
//    --sans-questions             SETUP_YES=true             aucune question, tout par défaut
// ============================================================================
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
// Le paquet « pg » vient de node_modules : si « npm install » n’a pas encore été lancé,
// on l’explique clairement au lieu d’afficher une erreur technique.
let pg;
try {
  pg = (await import('pg')).default;
} catch {
  console.error('\nLes dépendances du projet ne sont pas installées.');
  console.error('Lancez d’abord, depuis la racine du projet :  npm install');
  console.error('puis relancez :  npm run setup\n');
  process.exit(1);
}

const { Client } = pg;
const ici = dirname(fileURLToPath(import.meta.url));
const racineBackend = dirname(ici);
const fichierEnv = `${racineBackend}/.env`;
const fichierExemple = `${racineBackend}/.env.example`;

const DEFAUT = {
  dbName: 'pharmacie_stock',
  role: 'pharmastock',
  host: '127.0.0.1',
  port: '5432',
  superuser: 'postgres'
};

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
// Certains drapeaux (--yes, --password, --force…) sont interceptés par npm lui-même :
// chaque réglage est donc disponible aussi en variable d'environnement.
const premier = (...noms) => {
  for (const nom of noms) {
    const i = argv.indexOf(`--${nom}`);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  }
  return null;
};
const variable = (...noms) => {
  for (const nom of noms) if (process.env[nom]) return process.env[nom];
  return null;
};
const option = (...noms) => premier(...noms) || variable(...noms.map(n => `SETUP_${n.toUpperCase().replace(/-/g, '_')}`));
const drapeau = (...noms) => noms.some(nom => argv.includes(`--${nom}`));

const dbOnly = drapeau('db-only');
const full = drapeau('full') || String(process.env.SETUP_FULL || '') === 'true';
const modeDemo = drapeau('demo') || String(process.env.SETUP_DEMO || '') === 'true';
const nonInteractif = drapeau('sans-questions', 'yes', 'y') || String(process.env.SETUP_YES || '') === 'true' || !process.stdin.isTTY;

// ------------------------------------------------------- saisie au clavier
const c = { v: '\u001b[32m', j: '\u001b[33m', r: '\u001b[31m', g: '\u001b[1m', f: '\u001b[0m' };

function demander(texte, defaut = '') {
  return new Promise(resolve => {
    const invite = defaut ? `${texte} [${defaut}] : ` : `${texte} : `;
    process.stdout.write(invite);
    let donnees = '';
    const stdin = process.stdin;
    const fin = () => { stdin.removeListener('data', ecouter); if (stdin.isRaw) stdin.setRawMode(false); stdin.pause(); };
    const ecouter = morceau => {
      for (const ch of morceau.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { fin(); process.stdout.write('\n'); return resolve(donnees.trim() || defaut); }
        if (ch === '\u0003') { fin(); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { donnees = donnees.slice(0, -1); continue; }
        if (ch >= ' ') donnees += ch;
      }
    };
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', ecouter);
  });
}

function demanderMasque(texte) {
  return new Promise(resolve => {
    process.stdout.write(`${texte} : `);
    let donnees = '';
    const stdin = process.stdin;
    const fin = () => { stdin.removeListener('data', ecouter); if (stdin.isRaw) stdin.setRawMode(false); stdin.pause(); };
    const ecouter = morceau => {
      for (const ch of morceau.toString('utf8')) {
        if (ch === '\r' || ch === '\n') { fin(); process.stdout.write('\n'); return resolve(donnees); }
        if (ch === '\u0003') { fin(); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { donnees = donnees.slice(0, -1); continue; }
        if (ch >= ' ') { donnees += ch; process.stdout.write('*'); }
      }
    };
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', ecouter);
  });
}

const demanderCle = async (texte, defaut) => (nonInteractif ? defaut : demander(texte, defaut));
const demanderMotDePasse = async (texte, defaut = '') => {
  if (nonInteractif) return defaut;
  const saisi = await demanderMasque(texte);
  return saisi || defaut;
};

const motDePasseAleatoire = (longueur = 20) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let sortie = '';
  for (const octet of randomBytes(longueur)) sortie += alphabet[octet % alphabet.length];
  return sortie;
};

const existe = async chemin => access(chemin).then(() => true, () => false);
const encoder = valeur => encodeURIComponent(valeur);
const citer = valeur => `"${String(valeur).replace(/"/g, '""')}"`;

function lireEnv(contenu) {
  const valeurs = {};
  for (const ligne of contenu.split(/\r?\n/)) {
    const trouve = /^([A-Z0-9_]+)=(.*)$/.exec(ligne.trim());
    if (trouve) valeurs[trouve[1]] = trouve[2];
  }
  return valeurs;
}

// ------------------------------------------------------------ messages clés
function expliquer(erreur) {
  const code = erreur.code || '';
  const message = String(erreur.message || erreur);
  if (code === 'ECONNREFUSED') {
    return 'Le serveur PostgreSQL ne répond pas. Sur Windows : touche Windows → « Services » → '
      + 'service « postgresql-x64-17 » → Démarrer. (Invite de commandes administrateur : net start postgresql-x64-17)';
  }
  if (code === '28P01' || /password authentication failed/i.test(message)) {
    return 'Mot de passe refusé. C’est le mot de passe du SUPERUTILISATEUR PostgreSQL (le « postgres » choisi '
      + 'à l’installation de PostgreSQL), pas celui du rôle applicatif.';
  }
  if (code === '3D000') {
    return 'La base « postgres » n’existe pas sur ce serveur : vérifiez l’hôte et le port (par défaut 127.0.0.1:5432).';
  }
  if (code === '42501') {
    return 'Le compte utilisé n’a pas le droit de créer un rôle ou une base : il faut le superutilisateur « postgres ».';
  }
  return message;
}

async function connecter(configuration, quoi) {
  const client = new Client(configuration);
  try {
    await client.connect();
    return client;
  } catch (erreur) {
    console.error(`\n${c.r} Échec de la connexion ${quoi}.${c.f}`);
    console.error(` → ${expliquer(erreur)}\n`);
    process.exit(1);
  }
}

// ================================================================ programme
console.log(`\n${c.g}=== PharmaStock — installation guidée de la base de données ===${c.f}\n`);

// Valeurs de départ : le fichier .env existant sert de référence si présent.
let nomBase = option('db-name', 'database') || DEFAUT.dbName;
let nomRole = option('role') || DEFAUT.role;
let hote = option('db-host', 'host') || DEFAUT.host;
let port = option('db-port', 'port') || DEFAUT.port;
let motDePasseRole = option('role-password') || '';
let envExistant = '';
let motDePasseAdministrateur = option('admin-password', 'admin-pass') || '';

const envPresent = await existe(fichierEnv);
if (envPresent) {
  envExistant = await readFile(fichierEnv, 'utf8');
  const valeurs = lireEnv(envExistant);
  const url = valeurs.DATABASE_URL || '';
  const trouve = /^postgres(?:ql)?:\/\/([^:]+):([^@]*)@([^:/]+):(\d+)\/(.+)$/.exec(url);
  if (trouve) {
    if (!option('role')) nomRole = decodeURIComponent(trouve[1]);
    if (!motDePasseRole) motDePasseRole = decodeURIComponent(trouve[2] === 'CHANGE_ME' ? '' : trouve[2]);
    if (!option('db-host', 'host')) hote = trouve[3];
    if (!option('db-port', 'port')) port = trouve[4];
    if (!option('db-name')) nomBase = decodeURIComponent(trouve[5]);
  }
  if (!motDePasseAdministrateur && valeurs.ADMIN_PASSWORD) motDePasseAdministrateur = valeurs.ADMIN_PASSWORD;
  console.log(`Fichier backend/.env détecté : base « ${nomBase} », rôle « ${nomRole} », serveur ${hote}:${port}.`);
} else {
  console.log('Aucun fichier backend/.env : il sera créé à la fin (rien à copier à la main).');
}

if (!nonInteractif) {
  console.log('\nAppuyez sur Entrée pour accepter les valeurs proposées.\n');
  nomBase = await demanderCle('Nom de la base de données', nomBase);
  nomRole = await demanderCle('Nom du rôle PostgreSQL de l’application', nomRole);
  hote = await demanderCle('Hôte PostgreSQL', hote);
  port = await demanderCle('Port PostgreSQL', port);
}

if (!motDePasseRole) {
  motDePasseRole = motDePasseAleatoire();
  console.log(`Mot de passe du rôle « ${nomRole} » : généré automatiquement (${motDePasseRole.length} caractères).`);
}

// ------------------------------------------- rôle + base (superutilisateur)
const superuser = option('superuser') || (nonInteractif ? DEFAUT.superuser : await demanderCle('Superutilisateur PostgreSQL', DEFAUT.superuser));
const motDePasseSuper = option('super-password', 'password') || process.env.PGPASSWORD
  || await demanderMotDePasse(`Mot de passe du superutilisateur « ${superuser} » (masqué)`);

const maintenance = {
  host: hote, port: Number(port), user: superuser, database: 'postgres',
  password: motDePasseSuper || undefined, ssl: false, connectionTimeoutMillis: 8000
};

console.log(`\nConnexion à ${hote}:${port} en tant que « ${superuser} »…`);
const admin = await connecter(maintenance, 'au serveur PostgreSQL');

try {
  const roleExiste = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [nomRole]);
  if (roleExiste.rowCount === 0) {
    await admin.query(`CREATE ROLE ${citer(nomRole)} LOGIN PASSWORD '${motDePasseRole.replace(/'/g, "''")}'`);
    console.log(`${c.v} ✔${c.f} Rôle « ${nomRole} » créé.`);
  } else {
    await admin.query(`ALTER ROLE ${citer(nomRole)} LOGIN PASSWORD '${motDePasseRole.replace(/'/g, "''")}'`);
    console.log(`${c.v} ✔${c.f} Rôle « ${nomRole} » déjà présent : mot de passe mis à jour.`);
  }

  const baseExiste = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nomBase]);
  if (baseExiste.rowCount === 0) {
    // TEMPLATE template0 + ENCODING 'UTF8' : indispensable sur un PostgreSQL
    // installé en Windows français, dont l'encodage par défaut peut être WIN1252.
    await admin.query(`CREATE DATABASE ${citer(nomBase)} WITH OWNER ${citer(nomRole)} ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`${c.v} ✔${c.f} Base « ${nomBase} » créée (encodage UTF8, propriétaire « ${nomRole} »).`);
  } else {
    console.log(`${c.j} ℹ${c.f} Base « ${nomBase} » déjà présente : elle est conservée.`);
  }
  await admin.query(`GRANT ALL PRIVILEGES ON DATABASE ${citer(nomBase)} TO ${citer(nomRole)}`);
} catch (erreur) {
  console.error(`\n${c.r} La création du rôle ou de la base a échoué.${c.f}`);
  console.error(` → ${expliquer(erreur)}\n`);
  process.exit(1);
} finally {
  await admin.end().catch(() => {});
}

// -------------------------------------------------- contrôle avec le rôle
const application = {
  host: hote, port: Number(port), user: nomRole, database: nomBase,
  password: motDePasseRole, ssl: false, connectionTimeoutMillis: 8000
};
const client = await connecter(application, `à la base « ${nomBase} » avec le rôle « ${nomRole} »`);
try {
  const resultat = await client.query('SELECT current_database() AS base, current_user AS role, current_setting($1) AS encodage', ['server_encoding']);
  const ligne = resultat.rows[0];
  if (ligne.encodage !== 'UTF8') {
    console.error(`\n${c.r} Encodage « ${ligne.encodage} » au lieu de UTF8 : supprimez la base et relancez « npm run setup ».${c.f}\n`);
    process.exit(1);
  }
  console.log(`${c.v} ✔${c.f} Connexion vérifiée : base « ${ligne.base} », rôle « ${ligne.role} », encodage ${ligne.encodage}.`);
} finally {
  await client.end().catch(() => {});
}

// -------------------------------------------------------------- .env
const adresse = `postgres://${encoder(nomRole)}:${encoder(motDePasseRole)}@${hote}:${port}/${encoder(nomBase)}`;

if (dbOnly) {
  console.log('\nMode « db:create » : backend/.env n’a pas été modifié. Valeur attendue dans .env :');
  console.log(`  DATABASE_URL=${adresse}\n`);
} else {
  if (!motDePasseAdministrateur) {
    const genere = motDePasseAleatoire(16);
    motDePasseAdministrateur = nonInteractif
      ? genere
      : await demanderMotDePasse('Mot de passe du premier administrateur (Entrée = généré automatiquement, 12 caractères minimum)', genere);
  }
  if (motDePasseAdministrateur.length < 12) {
    console.error(`\n${c.r} Le mot de passe administrateur doit contenir au moins 12 caractères.${c.f}\n`);
    process.exit(1);
  }

  const remplacer = (texte, cle, valeur) => {
    const motif = new RegExp(`^${cle}=.*$`, 'm');
    return motif.test(texte) ? texte.replace(motif, `${cle}=${valeur}`) : `${texte.replace(/\s*$/, '')}\n${cle}=${valeur}\n`;
  };

  let contenu = envExistant || await readFile(fichierExemple, 'utf8');
  contenu = remplacer(contenu, 'DATABASE_URL', adresse);
  contenu = remplacer(contenu, 'ADMIN_PASSWORD', motDePasseAdministrateur);
  if (modeDemo) contenu = remplacer(contenu, 'ALLOW_DEMO', 'true');
  contenu = contenu.replace(/\r\n/g, '\n');
  await writeFile(fichierEnv, contenu, 'utf8');
  console.log(`${c.v} ✔${c.f} Fichier backend/.env ${envExistant ? 'mis à jour' : 'créé'} (DATABASE_URL et ADMIN_PASSWORD remplis).`);
}

// ------------------------------------------------------------ suite
if (full) {
  console.log('\nEnchaînement automatique : migrations puis création de l’administrateur…\n');
  const lancer = (script, variables) => new Promise((resolve, rejeter) => {
    const enfant = spawn('npm', ['run', script], {
      cwd: racineBackend, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_URL: adresse, ADMIN_PASSWORD: motDePasseAdministrateur }
    });
    enfant.on('exit', code => (code === 0 ? resolve() : rejeter(new Error(`${script} : code ${code}`))));
  });
  try {
    await lancer('db:migrate');
    await lancer('admin:create');
    console.log(`\n${c.v} ✔${c.f} Base prête et administrateur créé.`);
  } catch (erreur) {
    console.error(`\n${c.r} L’étape automatique a échoué : ${erreur.message}${c.f}`);
    console.error('Relancez-la à la main : npm run db:migrate puis npm run admin:create.\n');
    process.exit(1);
  }
}

console.log(`\n${c.g}=== Base prête ===${c.f}`);
console.log(`  Base          : ${nomBase}   (rôle ${nomRole} @ ${hote}:${port}, encodage UTF8)`);
console.log(`  Configuration : backend/.env`);
if (!dbOnly) console.log(`  Administrateur: login « admin », mot de passe à conserver : ${c.j}${motDePasseAdministrateur}${c.f}`);
if (!full) {
  console.log('\nÉtapes suivantes, dans cet ordre :');
  console.log('  1) npm run db:migrate      (crée les tables)');
  console.log('  2) npm run admin:create    (crée le premier administrateur)');
  console.log('  3) npm run dev             (démarre l’application : http://localhost:5173)');
  if (envPresent === false) console.log('\nAprès la première connexion, effacez la ligne ADMIN_PASSWORD de backend/.env.');
}
if (modeDemo) {
  console.log('\nDonnées fictives autorisées (ALLOW_DEMO=true) : pour une démonstration complète, lancer');
  console.log('  npm run demo:seed       (catalogue fictif)');
  console.log('  npm run demo:users      (comptes d’essai pharmacien / gestionnaire / vendeur)');
  console.log('  npm run demo:scenario   (une journée d’officine : commande, réception, ventes, perte, retour)');
  console.log('  → guide complet : docs/13-FANAOVANA-DEMONSTRATION.md');
  console.log('Avant l’usage réel : ALLOW_DEMO=false dans backend/.env et désactiver les comptes d’essai.');
} else if (!dbOnly) {
  console.log('\nPour faire une démonstration avec des données fictives : relancer « npm run setup -- --demo »');
  console.log('(ou mettre ALLOW_DEMO=true dans backend/.env), puis demo:seed, demo:users, demo:scenario.');
}
console.log('');