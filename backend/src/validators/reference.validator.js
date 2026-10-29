// Validations des référentiels : médicaments, catégories, fournisseurs.
import { z } from 'zod';
import { identifier, shortText, text, amount, percent, bool, optionalText } from './common.validator.js';

// Champs techniques que les écrans renvoient sans le vouloir (ils viennent de
// la réponse de l'API). Ils sont acceptés puis IGNORÉS à l'enregistrement : cela
// évite des refus « champ inconnu : id, createdAt » incompréhensibles au comptoir.
const techniques = {
  id: z.number().int().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  // Valeurs calculées par le logiciel : si un écran les renvoie par mégarde
  // (copie de la réponse de l'API), elles ne provoquent plus de refus ; le
  // contrôleur les retire avant l'écriture (RG05 : jamais de prix venu du poste).
  cmp: z.union([z.string(), z.number(), z.null()]).optional(),
  sellingPrice: z.union([z.string(), z.number(), z.null()]).optional(),
  version: z.number().int().optional()
};

export const categorySchema = z.object({
  ...techniques,
  name: shortText,
  description: text.default(''),
  active: bool.default(true)
}).strict();

export const supplierSchema = z.object({
  ...techniques,
  // Le nom (« raison sociale ») n'est plus demandé au comptoir : le serveur le
  // fabrique s'il est absent (voir reference.controller.js → nomFournisseurAuto).
  // Il reste accepté — et modifiable — depuis la fiche « Modifier ».
  name: z.string().trim().max(255).optional(),
  contact: optionalText,
  phone: optionalText,
  email: z.union([z.string().trim().email('Adresse e-mail invalide'), z.literal('')]).default(''),
  address: text.default(''),
  nif: optionalText,
  note: text.default(''),
  active: bool.default(true)
}).strict();

export const productSchema = z.object({
  ...techniques,
  // Code interne (MED-001, MED-002…) et code-barres : le serveur les attribue
  // automatiquement (services/codes.service.js). L'interface ne les saisit plus ;
  // ils restent acceptés si un import de fichier les fournit.
  code: z.string().trim().min(1, 'Code requis').max(80).optional(),
  name: shortText,
  // Fiche courte : principe actif, dosage, forme, laboratoire et conservation ne
  // sont plus demandés à la création (les fiches existantes les gardent).
  ingredient: optionalText.optional(),
  dosage: optionalText.optional(),
  form: optionalText.optional(),
  presentation: optionalText.optional(),
  barcode: z.union([z.string().trim().min(4, 'Code-barres trop court').max(255), z.literal(''), z.null()])
    .transform(v => (v ? v : null)).optional(),
  categoryId: identifier.nullish().transform(v => v ?? null),
  manufacturer: optionalText.optional(),
  // 2.7.90 — unité VIDE à la création au Catalogue : l'écran Stock l'affiche
  // vide (demande du dépôt) et la PREMIÈRE réception la fixe automatiquement
  // (celle saisie à la réception). '' est légale — la colonne est NOT NULL,
  // ce que la chaîne vide respecte ; 40 = taille de la colonne products.unit.
  unit: z.string().trim().max(40).default(''),
  minStock: z.number().int().min(0).max(1000000).default(0),
  maxStock: z.number().int().min(0).max(1000000).nullish().transform(v => v ?? null),
  storage: text.optional(),
  note: text.optional(),
  active: bool.default(true),
  marginRate: percent.default(20),
  // 2.7.12 — conditionnement pour la vente au détail (boîte / plaquette /
  // vongany) : « matetika » boîte 1 = plaquettes 10, plaquette 1 = vongany 10.
  // 0 plaquette dans une boîte = ce médicament ne se vend qu'à la boîte entière.
  // Les PRIX des sous-unités sont INDÉPENDANTS du prix de la boîte
  // (« tsy hitovy ny vidiny ») ; à 0, le serveur calcule au prorata à la vente.
  blistersPerBox: z.number().int().min(0).max(1000000).default(10),
  unitsPerBlister: z.number().int().min(0).max(1000000).default(10),
  pricePerBlister: z.coerce.number().min(0).max(1e12).default(0),
  pricePerUnit: z.coerce.number().min(0).max(1e12).default(0)
}).strict().refine(v => v.maxStock === null || v.maxStock >= v.minStock,
  'Le seuil maximum doit être supérieur ou égal au seuil minimum');