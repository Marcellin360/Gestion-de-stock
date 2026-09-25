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
