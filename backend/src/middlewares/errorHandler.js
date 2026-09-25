// Gestion centralisée des erreurs : messages utiles, aucun détail technique exposé.
import { ZodError } from 'zod';
import { BusinessError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { traduireIssues } from './zodMessages.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route inconnue.' });
}

export function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (error instanceof ZodError) {
    // Message français, avec le champ obligatoire manquant et, si un nom de champ
    // est mal orthographié (« quantite » au lieu de « quantity »), le nom attendu.
    const { resume, details } = traduireIssues(error.issues);
    return res.status(422).json({
      error: `Données invalides — ${resume} ${details.join(' · ')}`,
      details,
      fields: error.issues.map(issue => issue.path.join('.'))
    });
  }
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'Valeur déjà utilisée : code, code-barres, identifiant, référence ou numéro de lot en doublon.' });
  }
  if (error?.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({ error: 'Référence inexistante ou encore utilisée par une autre donnée.' });
  }
  if (error?.name === 'SequelizeValidationError') {
    const details = (error.errors || []).map(item => `${item.path || item.validatorKey || 'champ'} : ${item.message}`);
    return res.status(422).json({
      error: 'Valeur refusée par la base : quantité, date ou plage invalide.',
      ...(config.production ? {} : { details })
    });
  }
  if (error?.name === 'SequelizeDatabaseError' && /immuable|suppression interdite|RG19/.test(error.message)) {
    return res.status(409).json({ error: 'Journal immuable : une opération validée s’annule avec traçabilité, elle ne se supprime pas.' });
  }
  const status = error instanceof BusinessError ? error.status : (error.status || 500);
  if (status >= 500) console.error(`[${new Date().toISOString()}]`, req.method, req.originalUrl, error.message, config.production ? '' : error.stack);
  return res.status(500).json({
    error: status >= 500
      ? 'Erreur interne. Aucune validation partielle : l’opération a été annulée. Consulter le journal du serveur.'
      : error.message
  });
}