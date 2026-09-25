// ============================================================================
// Journal d'audit (RG14, §9.18) : qui a fait quoi, quand, avec quelles valeurs.
// La table audit_logs est immuable (trigger PostgreSQL : ni UPDATE ni DELETE).
// ============================================================================
import { AuditLog, User } from '../models/index.js';

export async function log({ userId, action, entity, entityId = null, before = null, after = null, ip = null }, transaction) {
  return AuditLog.create({ userId, action, entity, entityId, before, after, ip, createdAt: new Date() }, { transaction });
}

/** Retire toute donnée sensible avant écriture dans le journal. */
export function publicSnapshot(data) {
  if (!data || typeof data !== 'object') return data ?? null;
  const clone = { ...data };
  for (const key of ['password', 'passwordHash', 'csrf', 'tokenHash']) delete clone[key];
  return clone;
}

export async function list({ page = 1, limit = 100 } = {}, transaction) {
  const result = await AuditLog.findAndCountAll({
    include: [{ model: User, as: 'author', attributes: ['id', 'name', 'login'] }],
    order: [['id', 'DESC']], limit, offset: (page - 1) * limit, transaction
  });
  return { rows: result.rows, count: result.count, page, limit };
}
