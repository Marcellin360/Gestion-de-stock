// Authentification : connexion, session courante, déconnexion, mot de passe.
import { config } from '../config/index.js';
import { write } from '../utils/transaction.js';
import { login, logout, changeOwnPassword, describeUser } from '../services/auth.service.js';

const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };

export async function postLogin(req, res) {
  const meta = { ip: req.ip, userAgent: req.get('user-agent') };
  const result = await write(transaction => login(req.body, meta, transaction));
  res.cookie(config.cookieName, result.token, { ...cookieOptions, maxAge: config.sessionHours * 3600000 });
  res.json({ user: result.user, csrf: result.csrf, sessionHours: config.sessionHours });
}

export async function getMe(req, res) {
  res.json({ user: describeUser(req.user), csrf: req.session.csrf, sessionHours: config.sessionHours });
}

export async function postLogout(req, res) {
  await write(transaction => logout(req.session, req.user, transaction));
  res.clearCookie(config.cookieName, cookieOptions).json({ ok: true });
}

export async function postPassword(req, res) {
  await write(transaction => changeOwnPassword(req.user, req.body, transaction));
  res.clearCookie(config.cookieName, cookieOptions).json({ ok: true, message: 'Mot de passe modifié. Reconnectez-vous.' });
}
