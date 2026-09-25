// Défense CSRF n°1 : refuser une requête modifiante provenant d'une autre origine.
import { config } from '../config/index.js';

export function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // requêtes serveur à serveur (curl, tests) : le jeton CSRF reste exigé
  let sameHost = false;
  try { sameHost = new URL(origin).host === req.get('host'); } catch { sameHost = false; }
  const allowed = [config.origin, ...config.extraOrigins];
  if (sameHost || allowed.includes(origin)) return next();
  return res.status(403).json({ error: 'Origine non autorisée. Vérifier APP_ORIGIN dans backend/.env.' });
}
