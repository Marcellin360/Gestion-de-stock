import { z } from 'zod';
import { identifier, positiveQuantity, text, requestKey, longText } from './common.validator.js';

export const inventoryOpenSchema = z.object({
  location: z.enum(['DEPOT', 'PHARMACY'], { message: 'Choisir le magasin à compter (Dépôt ou Pharmacie)' }),
  scope: z.string().trim().max(200).default(''),
  note: text.default('')
}).strict();

export const inventoryValidateSchema = z.object({
  requestKey,
  note: text.default(''),
  lines: z.array(z.object({
    id: identifier,
    physical: positiveQuantity,
    reason: longText.default('')
  }).strict()).min(1).max(20000)
}).strict();

export const inventoryAbandonSchema = z.object({
  reason: z.string().trim().min(3, 'Motif obligatoire').max(255)
}).strict();

export const lotStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'BLOCKED']),
  reason: z.string().trim().min(3, 'Justification obligatoire').max(255)
}).strict();
