import { z } from 'zod';
import { identifier, quantity, amount, text, requestKey } from './common.validator.js';

const lines = z.array(z.object({
  productId: identifier,
  quantity
}).strict()).min(1, 'Ajouter au moins un médicament').max(100)
  .refine(list => new Set(list.map(l => l.productId)).size === list.length,
    'Regrouper les quantités du même médicament sur une seule ligne');

export const saleQuoteSchema = z.object({
  requestKey: requestKey.optional(),
  note: text.default(''),
  lines
}).strict();

export const saleSchema = z.object({
  requestKey,
  expectedTotal: amount.optional(),
  customerName: z.string().trim().max(150).default(''),
  note: text.default(''),
  lines
}).strict();
