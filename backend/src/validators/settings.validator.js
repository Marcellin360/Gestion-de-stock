import { z } from 'zod';
import { shortText, text, optionalText, percent } from './common.validator.js';

export const settingsSchema = z.object({
  // `id` et `updatedAt` sont renvoyés par GET /api/data : l'écran Paramètres les
  // renvoie tels quels, ils sont ignorés au moment de l'enregistrement.
  id: z.number().int().optional(),
  updatedAt: z.string().optional(),
  pharmacyName: shortText,
  address: text.default(''),
  phone: optionalText,
  managerName: optionalText,
  currency: z.literal('Ar'),
  valuation: z.enum(['LOT', 'CMP'], { errorMap: () => ({ message: 'Valorisation : LOT ou CMP' }) }),
  marginMode: z.enum(['COST', 'SALE'], { errorMap: () => ({ message: 'Mode de marge : COST (sur coût) ou SALE (sur prix de vente)' }) }),
  minMargin: percent,
  maxMargin: percent,
  expiryDays: z.number().int().min(1).max(730),
  allowExpiredSale: z.boolean().default(false)
}).strict().refine(v => v.minMargin <= v.maxMargin, 'La plage de marge est incohérente (minimum > maximum)');
