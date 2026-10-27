// Schémas du transfert dépôt → pharmacie.
import { z } from 'zod';
import { identifier, quantity, requestKey } from './common.validator.js';

export const transferSchema = z.object({
  requestKey,                       // idempotence : un double clic ne transfère pas deux fois
  fromLocation: z.enum(['DEPOT', 'PHARMACY']).default('DEPOT'),
  toLocation: z.enum(['DEPOT', 'PHARMACY']).default('PHARMACY'),
  requestedBy: identifier.optional().nullable(),
  reason: z.string().trim().min(3, 'Motif obligatoire (3 caractères minimum)').max(120),
  note: z.string().trim().max(255).default(''),
  lines: z.array(z.object({ lotId: identifier, quantity }).strict())
    .min(1, 'Au moins une ligne est nécessaire.')
    .max(60, '60 lignes au maximum par transfert.')
}).strict().refine(v => v.fromLocation !== v.toLocation,
  { message: 'Le magasin de départ et d’arrivée doivent être différents.', path: ['toLocation'] });

// ============================================================================
// 2.7.79 — DEMANDE DE CORRECTION d'un transfert (dépôt propose → administrateur
// tranche, comme les réceptions au teboka ③). La correction répare une erreur
// de saisie : seules les QUANTITÉS des lots d'origine changent (un médicament
// oublié se transfère par un NOUVEAU transfert), plus le motif et la remarque.
// ============================================================================
export const transferCorrectionSchema = z.object({
  reason: z.string().trim()
    .min(3, 'Le motif de la correction est obligatoire (3 caractères minimum).')
    .max(500, 'Motif trop long (500 caractères maximum).'),
  transferReason: z.string().trim()
    .min(3, 'Motif du transfert obligatoire (3 caractères minimum)').max(120),
  note: z.string().trim().max(255).default(''),
  lines: z.array(z.object({ lotId: identifier, quantity }).strict())
    .min(1, 'Au moins une ligne est nécessaire.')
    .max(60, '60 lignes au maximum par transfert.')
}).strict();