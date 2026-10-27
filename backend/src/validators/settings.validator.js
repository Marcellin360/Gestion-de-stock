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
  // Base du prix de vente : CMP (moyenne des réceptions) ou coût du dernier lot.
  // Optionnelle : une ancienne version de l'interface peut ne pas l'envoyer.
  pricingBasis: z.enum(['CMP', 'LOT'], { errorMap: () => ({ message: 'Prix de vente : CMP ou LOT' }) }).optional(),
  // 2.7.47 — mode de marge UNIQUE sur coût (PV = coût × (1 + taux)) : le choix
  // « sur prix de vente » n'existe plus dans l'interface. La valeur 'SALE'
  // ancienne reste acceptée pour compatibilité mais n'est plus proposée.
  marginMode: z.enum(['COST', 'SALE'], { errorMap: () => ({ message: 'Mode de marge : COST (sur coût) ou SALE (sur prix de vente)' }) }),
  minMargin: percent,
  maxMargin: percent,
  // 2.7.47 — frais d'achat automatiques, en % du PA (10 % par défaut) :
  // coût unitaire d'un lot = PA × (1 + feesRate/100). Optionnelle : une
  // ancienne version de l'interface peut ne pas l'envoyer.
  feesRate: percent.optional(),
  expiryDays: z.number().int().min(1).max(730),
  allowExpiredSale: z.boolean().default(false)
}).strict().refine(v => v.minMargin <= v.maxMargin, 'La plage de marge est incohérente (minimum > maximum)');