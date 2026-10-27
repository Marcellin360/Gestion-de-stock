// ============================================================================
// Gestion des comptes et des rôles (§9.1, RG18).
// Règles clés : un administrateur actif subsiste toujours, un compte n'est
// jamais supprimé mais désactivé, toute action est journalisée.
// ============================================================================
import bcrypt from 'bcryptjs';
import { User, Role, Sale, Receipt, Transfer, Loss } from '../models/index.js';
import { config } from '../config/index.js';
import { ensure } from '../utils/errors.js';
import { log, publicSnapshot } from './audit.service.js';
import { describeUser, revokeSessions } from './auth.service.js';
import { BusinessError } from '../utils/errors.js';

export async function listUsers(transaction) {
  const users = await User.findAll({
    include: [{ model: Role, as: 'role' }],
    order: [['name', 'ASC']],
    transaction
  });
  return users.map(user => ({
    ...describeUser(user),
    active: user.active,
    phone: user.phone,
    note: user.note,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  }));
}

export async function listRoles(transaction) {
  const roles = await Role.findAll({ order: [['id', 'ASC']], transaction });
  return roles.map(role => ({
    id: role.id, code: role.code, name: role.name,
    permissions: role.permissions
  }));
}

export async function createUser(values, user, transaction) {
  const role = await Role.findByPk(values.roleId, { transaction });
  ensure(role, 'Rôle introuvable.', 404);
  ensure(await User.count({ where: { login: values.login }, transaction }) === 0, 'Cet identifiant est déjà utilisé.', 409);
  const created = await User.create({
    name: values.name, login: values.login, roleId: role.id,
    passwordHash: await bcrypt.hash(values.password, config.bcryptRounds),
    active: values.active, phone: values.phone || '', note: values.note || '',
    createdAt: new Date(), updatedAt: new Date()
  }, { transaction });
  await log({
    userId: user.id, action: 'CREATE', entity: 'USER', entityId: created.id,
    after: { ...publicSnapshot(values), password: '[masqué]', role: role.code }
  }, transaction);
  return { ...describeUser({ ...created.toJSON(), role: role.toJSON() }), active: created.active };
}

export async function updateUser(id, values, actor, transaction) {
  // Verrou de ligne d'abord (FOR UPDATE), chargement du rôle ensuite : PostgreSQL
  // n'autorise pas FOR UPDATE sur le côté nullable d'une jointure externe.
  const target = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(target, 'Utilisateur introuvable.', 404);
  const currentRole = await Role.findByPk(target.roleId, { transaction });
  const role = await Role.findByPk(values.roleId, { transaction });
  ensure(role, 'Rôle introuvable.', 404);
  const before = { ...describeUser({ ...target.toJSON(), role: currentRole?.toJSON() }), active: target.active };

  const losesAdmin = currentRole?.code === 'ADMIN' && target.active && (role.code !== 'ADMIN' || !values.active);
  if (losesAdmin) {
    const admins = await User.count({ where: { roleId: target.roleId, active: true }, transaction });
    ensure(admins > 1, 'Impossible : il doit rester au moins un administrateur actif.');
  }
  ensure(!(target.id === actor.id && !values.active), 'Vous ne pouvez pas désactiver votre propre compte.');

  const changes = {
    name: values.name, login: values.login, roleId: role.id,
    active: values.active, phone: values.phone || '', note: values.note || '', updatedAt: new Date()
  };
  if (values.password) changes.passwordHash = await bcrypt.hash(values.password, config.bcryptRounds);
  await target.update(changes, { transaction });

  // Un changement de mot de passe ou une désactivation ferme immédiatement les sessions ouvertes.
  if (values.password || !values.active) await revokeSessions(target.id, transaction);

  await log({
    userId: actor.id, action: 'UPDATE', entity: 'USER', entityId: target.id,
    before, after: { ...publicSnapshot(values), password: values.password ? '[modifié]' : undefined }
  }, transaction);
  return { ...describeUser({ ...target.toJSON(), role: role.toJSON() }), active: target.active };
}

// ============================================================================
// 2.7.29 — SUPPRESSION d'un compte (administrateur uniquement, bouton dédié).
// Garde-fous (la liste historique interdit à tout compte d'être vide) :
//   • un compte ne peut pas se supprimer LUI-MÊME ;
//   • il doit toujours rester au moins un administrateur actif — le dernier
//     administrateur actif est donc insupprimable (même règle que pour la
//     désactivation) ;
//   • un compte qui a TRACÉ des opérations (ventes, réceptions, transferts,
//     audit…) reste protégé par la base (clés étrangères ON DELETE RESTRICT) :
//     la suppression est alors refusée avec une phrase claire qui propose la
//     désactivation à la place — le journal immuable n'est jamais cassé.
//   • ses sessions ouvertes sont fermées AVANT la suppression.
// L'action entière est journalisée (qui, quand, quel compte).
// ============================================================================
export async function deleteUser(id, actor, transaction) {
  const target = await User.findByPk(id, { transaction });
  ensure(target, 'Utilisateur introuvable.', 404);
  ensure(target.id !== actor.id, 'Vous ne pouvez pas supprimer votre propre compte.');

  const role = await Role.findByPk(target.roleId, { transaction });
  if (role?.code === 'ADMIN' && target.active) {
    const admins = await User.count({ where: { roleId: target.roleId, active: true }, transaction });
    ensure(admins > 1, 'Impossible : il doit rester au moins un administrateur actif.');
  }

  // Barrière explicite : un compte qui a TRACÉ des opérations (ventes,
  // réceptions, transferts, pertes, ajustements…) est protégé par la base
  // (clés étrangères restrictives) — on le dit AVANT de supprimer, avec une
  // phrase claire qui propose la désactivation à la place.
  const operations = await Promise.all([
    Sale.count({ where: { userId: target.id }, transaction }),
    Receipt.count({ where: { userId: target.id }, transaction }),
    Transfer.count({ where: { userId: target.id }, transaction }),
    Loss.count({ where: { userId: target.id }, transaction })
  ]);
  ensure(operations.every(n => n === 0),
    `« ${target.name} » a des opérations enregistrées : il ne peut pas être supprimé. Désactivez-le à la place (crayon → État).`,
    409);

  const before = { ...describeUser({ ...target.toJSON(), role: role?.toJSON() }), active: target.active };
  await revokeSessions(target.id, transaction);
  try {
    await target.destroy({ transaction });
    await log({
      userId: actor.id, action: 'DELETE', entity: 'USER', entityId: target.id,
      before, ip: null
    }, transaction);
    return { deleted: true, name: target.name };
  } catch (cause) {
    // Dernier filet (autres tables restrictives : inventaires, ajustements…) :
    // jamais d'erreur technique 500, toujours la même consigne humaine.
    const contrainte = cause?.name === 'SequelizeForeignKeyConstraintError'
      || cause?.original?.code === '23503' || cause?.parent?.code === '23503'
      || cause?.code === '23503';
    if (contrainte) {
      throw new BusinessError(
        `« ${target.name} » a des opérations enregistrées : il ne peut pas être supprimé. Désactivez-le à la place (crayon → État).`,
        409
      );
    }
    throw cause;
  }
}