// ============================================================================
// Transactions : toutes les opérations sensibles sont atomiques.
// Un verrou consultatif global sérialise les écritures de stock de l'officine
// (une seule pharmacie par base) : deux postes ne peuvent pas valider en même
// temps un mouvement calculé sur la même quantité.
// ============================================================================
import { Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';

const WRITE_LOCK_KEY = 57283911;

export function write(handler) {
  return sequelize.transaction(async transaction => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:key)', { replacements: { key: WRITE_LOCK_KEY }, transaction });
    return handler(transaction);
  });
}

export function read(handler) {
  return sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
    handler
  );
}
