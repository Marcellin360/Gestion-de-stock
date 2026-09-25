// Sorties non commerciales : pertes, casse, expirations et dons (§9.11, RG06, RG07).
// Le magasin est obligatoire : on déclare une perte soit au dépôt, soit en pharmacie.
import { z } from 'zod';
import { identifier, quantity, requestKey, lossReason } from './common.validator.js';

const lines = z.array(z.object({
  lotId: identifier,
  quantity
}).strict()).min(1, 'Ajouter au moins un lot').max(100)
  .refine(list => new Set(list.map(l => l.lotId)).size === list.length, 'Un lot ne peut apparaître qu’une seule fois');

export const lossSchema = z.object({
  requestKey,
  location: z.enum(['DEPOT', 'PHARMACY'], { message: 'Choisir le magasin concerné (Dépôt ou Pharmacie)' }),
  reason: lossReason,
  note: z.string().trim().min(3, 'Remarque justificative obligatoire (3 caractères minimum)').max(2000),
  lines
}).strict();
