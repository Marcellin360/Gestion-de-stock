// Briques de validation réutilisées par tous les modules.
import { z } from 'zod';
import { isValidDate } from '../utils/dates.js';
import { LOSS_REASONS } from '../config/constants.js';

export const identifier = z.number().int().positive().max(2147483647);
export const quantity = z.number().int().positive().max(1000000);
export const positiveQuantity = z.number().int().min(0).max(1000000);
// 2.7.12 — quantité DÉCIMALE autorisée (inventaire après ventes au détail :
// on peut compter 8,3 boîtes quand 3 plaquettes ont été vendues sur 10).
export const positiveDecimalQuantity = z.number().min(0, 'Quantité négative interdite').max(1000000);
export const signedQuantity = z.number().int().min(-1000000).max(1000000).refine(v => v !== 0, 'Quantité nulle interdite.');
export const amount = z.union([
  z.string().regex(/^\d{1,14}(\.\d{1,6})?$/, 'Montant attendu (nombre positif, 6 décimales maximum)'),
  z.number().finite().nonnegative().max(1e12)
]).transform(String);
// Les champs numériques d'un formulaire arrivent souvent en texte : on convertit
// avant contrôle pour éviter les refus incompréhensibles côté utilisateur.
export const percent = z.coerce.number().finite().min(0).max(99.99);
export const text = z.string().trim().max(2000);
export const longText = z.string().trim().max(5000);
export const shortText = z.string().trim().min(1).max(255);
export const optionalText = z.string().trim().max(255).nullish().transform(v => v ?? '');
export const isDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine(isValidDate, 'Date inexistante');
export const optionalDate = isDate.nullish().transform(v => v ?? null);
export const requestKey = z.string().uuid('Clé de requête invalide');
export const lossReason = z.enum(LOSS_REASONS);
export const bool = z.boolean();

/** Vérifie qu'une liste ne contient pas deux fois la même clé. */
export function uniqueLines(key) {
  return lines => new Set(lines.map(line => line[key])).size === lines.length;
}