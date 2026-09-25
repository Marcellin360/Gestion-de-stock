// Authentification par session (cookie HttpOnly) + jeton CSRF (défense n°2).
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { Session, User, Role } from '../models/index.js';
import { config } from '../config/index.js';
import { asyncHandler } from './asyncHandler.js';
import { ensure } from '../utils/errors.js';

const hash = token => crypto.createHash('sha256').update(token).digest('hex');

/** Charge l'utilisateur connecté, contrôle la session et le jeton CSRF. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[config.cookieName];
  ensure(token, 'Connexion requise.', 401);
  const session = await Session.findOne({
    where: { tokenHash: hash(token), expiresAt: { [Op.gt]: new Date() } }
  });
  ensure(session, 'Session expirée. Reconnectez-vous.', 401);
  const user = await User.findByPk(session.userId, { include: [{ model: Role, as: 'role' }] });
  ensure(user && user.active, 'Compte désactivé. Contactez l’administrateur.', 401);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    ensure(req.get('X-CSRF-Token') && req.get('X-CSRF-Token') === session.csrf,
      'Jeton de sécurité invalide. Rechargez la page.', 403);
  }
  req.user = user;
  req.session = session;
  req.role = user.role;
  req.permissions = Array.isArray(user.role?.permissions) ? user.role.permissions : [];
  next();
});

/** Contrôle d'accès par permission (RG18) : jamais uniquement dans l'interface. */
export const requirePermission = permission => (req, res, next) => {
  try {
    ensure(req.permissions.includes(permission), 'Droit insuffisant pour cette action.', 403);
    next();
  } catch (error) { next(error); }
};

export const sessionHash = hash;
