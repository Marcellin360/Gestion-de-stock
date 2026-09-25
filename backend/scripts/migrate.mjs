#!/usr/bin/env node
// ============================================================================
// Migration de base : applique les fichiers SQL de backend/sql dans l'ordre.
// Usage : npm run db:migrate   |   npm run db:status
// Chaque script SQL est exécuté dans une transaction et enregistré dans
// schema_migrations : une migration partielle est donc impossible.
// ============================================================================
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sequelize, close } from '../src/config/database.js';

const sqlDir = fileURLToPath(new URL('../sql/', import.meta.url));
const statusOnly = process.argv.includes('--status');

async function ensureRegistry(transaction) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`, { transaction });

  // pg_catalog plutôt qu information_schema : les vues information_schema n exposent
  // que les tables sur lesquelles le rôle possède un privilège, ce qui masquerait
  // justement le cas à détecter.
  const [colonnes] = await sequelize.query(
    `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'schema_migrations' AND n.nspname = current_schema()
        AND a.attnum > 0 AND NOT a.attisdropped`, { transaction }
  );
  if (!colonnes.map(l => l.column_name).includes('name')) {
    throw new Error(
      'Base créée par une version ANTERIEURE du projet (registre de migrations sans colonne name). '
      + 'Son schema n est pas celui attendu : recreez la base. '
      + 'Recreez-la : « npm run setup » (ou, dans psql : DROP DATABASE pharmacie_stock; '
      + 'CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING UTF8;), '
      + 'puis : npm run db:migrate, npm run admin:create, npm run demo:seed.'
    );
  }
}

async function verifierSchema(transaction) {
  const attendu = {
    roles: ['code', 'permissions'],
    users: ['login', 'password_hash', 'role_id', 'active', 'last_login_at'],
    sessions: ['token_hash', 'csrf', 'expires_at', 'user_agent'],
    settings: ['pharmacy_name', 'currency', 'valuation'],
    products: ['code', 'cmp', 'selling_price', 'margin_rate'],
    lots: ['number', 'quantity', 'unit_cost', 'expires_on'],
    movements: ['document_type', 'document_id', 'quantity'],
    audit_logs: ['action', 'entity', 'after'],
    schema_migrations: ['version', 'name']
  };
  const [colonnes] = await sequelize.query(
    `SELECT c.relname AS table_name, a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped`,
    { transaction }
  );
  const parTable = new Map();
  for (const ligne of colonnes) {
    if (!parTable.has(ligne.table_name)) parTable.set(ligne.table_name, new Set());
    parTable.get(ligne.table_name).add(ligne.column_name);
  }
  const manques = [];
  for (const [table, champs] of Object.entries(attendu)) {
    if (!parTable.has(table)) { manques.push('table ' + table + ' absente'); continue; }
    const absentes = champs.filter(champ => !parTable.get(table).has(champ));
    if (absentes.length) manques.push('table ' + table + ' : colonnes ' + absentes.join(', '));
  }
  if (manques.length) {
    throw new Error(
      'Le schema de la base ne correspond pas a cette version du logiciel : ' + manques.join(' | ')
      + '. Base probablement heritee d une version anterieure ou migration incomplete. '
      + 'Recreez la base : « npm run setup » (ou, dans psql : DROP DATABASE pharmacie_stock; '
      + 'CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING UTF8;), puis npm run db:migrate.'
    );
  }
}

async function main() {
  const files = (await readdir(sqlDir)).filter(file => /^\d{3}_.+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error(`Aucun fichier de migration dans ${sqlDir}`);

  await sequelize.transaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(57300201)', { transaction });
    await ensureRegistry(transaction);

    const [applied] = await sequelize.query('SELECT version FROM schema_migrations', { transaction });
    const done = new Set(applied.map(row => row.version));

    if (statusOnly) {
      console.log('État de la base :');
      for (const file of files) {
        const version = Number(file.slice(0, 3));
        console.log(`  ${done.has(version) ? '[appliquée]' : '[à appliquer]'} ${file}`);
      }
      await verifierSchema(transaction);
      console.log('Schéma conforme : tables et colonnes attendues présentes.');
      return;
    }

    let count = 0;
    for (const file of files) {
      const version = Number(file.slice(0, 3));
      if (done.has(version)) continue;
      const sql = await readFile(new URL(`../sql/${file}`, import.meta.url), 'utf8');
      console.log(`Migration ${file}…`);
      await sequelize.query(sql, { transaction });
      await sequelize.query('INSERT INTO schema_migrations (version, name) VALUES (:version, :name)',
        { replacements: { version, name: file }, transaction });
      count += 1;
    }
    await verifierSchema(transaction);
    console.log(count ? `${count} migration(s) appliquée(s).` : 'Base déjà à jour.');
    console.log('Schéma vérifié : tables et colonnes attendues présentes.');
  });
}

main()
  .then(() => close())
  .catch(async error => {
    console.error('Échec de la migration :', error.message);
    await close().catch(() => {});
    process.exit(1);
  });
