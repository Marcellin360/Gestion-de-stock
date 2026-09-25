// ============================================================================
// Connexion PostgreSQL via Sequelize (ORM). Une seule instance partagée.
// Les colonnes SQL sont en snake_case : l'option `underscored` fait la traduction.
// ============================================================================
import { Sequelize } from 'sequelize';
import { config } from './index.js';

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: config.test ? false : (message, timing) => {
    if (process.env.SQL_TRACE === 'true') console.log(`[sql ${timing}ms] ${message}`);
  },
  define: { underscored: true, timestamps: false, freezeTableName: false },
  pool: { max: 10, min: 0, acquire: 20000, idle: 10000 },
  dialectOptions: {
    application_name: 'pharmastock',
    // Aucune requête ni attente de verrou ne peut bloquer l'officine indéfiniment.
    options: `-c lock_timeout=${process.env.DB_LOCK_TIMEOUT || 10000} -c statement_timeout=${process.env.DB_STATEMENT_TIMEOUT || 60000}`,
    ...(config.databaseSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {})
  }
});

export async function connect() {
  await sequelize.authenticate();
}

export async function close() {
  await sequelize.close();
}

/** Exécute une fonction dans une transaction, avec annulation automatique en cas d'erreur. */
export function transaction(handler, isolationLevel) {
  return sequelize.transaction({ isolationLevel }, handler);
}
