// ============================================================================
// Authentification : connexion, déconnexion, session courante.
// Mots de passe hachés (bcrypt), session en cookie HttpOnly + jeton CSRF.
// ============================================================================
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { User, Role, Session } from '../models/index.js';
import { config } from '../config/index.js';
import { ensure } from '../utils/errors.js';
import { sessionHash } from '../middlewares/authenticate.js';
import { log } from './audit.service.js';

/** Description de l'utilisateur transmise au frontend (jamais de secret). */
export const describeUser = user => ({
  id: user.id,
  name: user.name,
  login: user.login,
  roleCode: user.role?.code,
  roleName: user.role?.name,
  permissions: Array.isArray(user.role?.permissions) ? user.role.permissions : []
});

// Comparaison systématique avec un hachage factice : évite de révéler si un identifiant existe.
const DUMMY_HASH = '$2b$12$bmRKsuUF9CEELQau2sSEteYqSFJZZZr9EzGlwpCIcgxu86oIDw7ne';

export async function login({ login, password }, meta = {}, transaction) {
  const user = await User.findOne({
    where: { login: String(login).trim() },
    include: [{ model: Role, as: 'role' }],
    transaction
  });
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  ensure(user && valid, 'Identifiants invalides.', 401);
  ensure(user.active, 'Compte désactivé. Contactez l’administrateur.', 401);

  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  await Session.destroy({ where: { expiresAt: { [Op.lt]: new Date() } }, transaction }); // purge des sessions mortes
  await Session.create({
    tokenHash: sessionHash(token), userId: user.id, csrf,
    expiresAt: new Date(Date.now() + config.sessionHours * 3600000),
    createdAt: new Date(), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 255) ?? null
  }, { transaction });
  await user.update({ lastLoginAt: new Date() }, { transaction });
  await log({ userId: user.id, action: 'LOGIN', entity: 'USER', entityId: user.id, ip: meta.ip ?? null }, transaction);

  return { token, csrf, user: describeUser(user) };
}

export async function logout(session, user, transaction) {
  await session.destroy({ transaction });
  await log({ userId: user.id, action: 'LOGOUT', entity: 'USER', entityId: user.id }, transaction);
}

/** Change son propre mot de passe : les autres sessions sont fermées. */
export async function changeOwnPassword(user, values, transaction) {
  ensure(await bcrypt.compare(values.current, user.passwordHash), 'Mot de passe actuel incorrect.', 422);
  ensure(values.password !== values.current, 'Le nouveau mot de passe doit être différent de l’ancien.');
  await user.update({ passwordHash: await bcrypt.hash(values.password, config.bcryptRounds) }, { transaction });
  await Session.destroy({ where: { userId: user.id }, transaction });
  await log({ userId: user.id, action: 'PASSWORD', entity: 'USER', entityId: user.id }, transaction);
}

export const revokeSessions = (userId, transaction) =>
  Session.destroy({ where: { userId }, transaction });
