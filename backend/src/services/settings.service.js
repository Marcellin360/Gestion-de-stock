// ============================================================================
// Paramètres de la pharmacie (RG13, RG21, RG22) : un seul enregistrement (id = 1).
// ============================================================================
import { Setting, Movement } from '../models/index.js';
import { ensure } from '../utils/errors.js';
import { log, publicSnapshot } from './audit.service.js';

export async function getSettings(transaction) {
  const row = await Setting.findByPk(1, { transaction });
  ensure(row, 'Paramètres absents. Exécuter « npm run db:migrate » puis « npm run admin:create ».', 500);
  return row;
}

export const settingsValues = async transaction => (await getSettings(transaction)).toJSON();

/**
 * Mise à jour des paramètres.
 * La méthode de valorisation est figée dès le premier mouvement : la changer
 * après coup fausserait l'historique des coûts (§9.7) et exige une migration comptable.
 */
export async function updateSettings(values, user, transaction) {
  const current = await getSettings(transaction);
  delete values.id;          // champs techniques renvoyés par l'API, jamais écrits
  delete values.updatedAt;
  const before = current.toJSON();
  if (values.valuation !== current.valuation) {
    const movements = await Movement.count({ transaction });
    ensure(movements === 0,
      'Méthode de valorisation figée après le premier mouvement : une migration comptable est nécessaire.', 409);
  }
  await current.update({ ...values, updatedAt: new Date() }, { transaction });
  await log({
    userId: user.id, action: 'UPDATE', entity: 'SETTINGS', entityId: 1,
    before: publicSnapshot(before), after: publicSnapshot(values)
  }, transaction);
  return current;
}
