// Validations des référentiels : médicaments, catégories, fournisseurs.
import { z } from 'zod';
import { identifier, shortText, text, amount, percent, bool, optionalText } from './common.validator.js';

export const categorySchema = z.object({
  name: shortText,
  description: text.default(''),
  active: bool.default(true)
}).strict();

export const supplierSchema = z.object({
  name: shortText,
  contact: optionalText,
  phone: optionalText,
  email: z.union([z.string().trim().email('Adresse e-mail invalide'), z.literal('')]).default(''),
  address: text.default(''),
  nif: optionalText,
  note: text.default(''),
  active: bool.default(true)
}).strict();

export const productSchema = z.object({
  code: z.string().trim().min(1, 'Code requis').max(80),
  name: shortText,
  ingredient: optionalText,
  dosage: optionalText,
  form: optionalText,
  presentation: optionalText,
  barcode: z.union([z.string().trim().min(4, 'Code-barres trop court').max(255), z.literal(''), z.null()])
    .transform(v => (v ? v : null)).default(null),
  categoryId: identifier.nullish().transform(v => v ?? null),
  manufacturer: optionalText,
  unit: shortText.default('boîte'),
  minStock: z.number().int().min(0).max(1000000).default(0),
  maxStock: z.number().int().min(0).max(1000000).nullish().transform(v => v ?? null),
  storage: text.default(''),
  note: text.default(''),
  active: bool.default(true),
  marginRate: percent.default(20)
}).strict().refine(v => v.maxStock === null || v.maxStock >= v.minStock,
  'Le seuil maximum doit être supérieur ou égal au seuil minimum');
