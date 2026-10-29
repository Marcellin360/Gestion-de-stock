import { z } from 'zod';
import { identifier, quantity, amount, text, requestKey } from './common.validator.js';

// 2.7.12 — vente au détail : chaque ligne porte l'unité choisie à la caisse.
//   BOX     = unité de gestion entière (boîte, flacon, rouleau…) ;
//   BLISTER = plaquette ; UNIT = vongany (comprimé).
// 2.7.84 — l'unité n'est plus LIMITÉE à ces trois codes : toute unité de la
// chaîne de conditionnement du médicament est vendable (« ml », « cm »,
// « plaquette », « comprimé »…). C'est le SERVEUR qui vérifie que l'unité
// existe pour CE produit (utils/conditionnement.js) — ici on contrôle juste
// la forme du texte.
export const SALE_UNITS = ['BOX', 'BLISTER', 'UNIT'];   // codes historiques, toujours acceptés

const lines = z.array(z.object({
  productId: identifier,
  quantity,
  saleUnit: z.string().trim().min(1, 'Unité de vente requise.').max(40, 'Unité de vente trop longue')
    .default('BOX')
}).strict()).min(1, 'Ajouter au moins un médicament').max(100)
  // Une même paire médicament + unité n'apparaît qu'une fois (le client peut
  // prendre 1 boîte ET 2 plaquettes du même médicament : ce sont 2 lignes).
  .refine(list => new Set(list.map(l => `${l.productId}|${l.saleUnit}`)).size === list.length,
    'Regrouper les quantités du même médicament et de la même unité sur une seule ligne');

export const saleQuoteSchema = z.object({
  requestKey: requestKey.optional(),
  note: text.default(''),
  lines
}).strict();

export const saleSchema = z.object({
  requestKey,
  expectedTotal: amount.optional(),
  customerName: z.string().trim().max(150).default(''),
  // 2.7.79 — « Servi par » SAISI à la caisse (la personne qui sert change
  // d'une vente à l'autre) ; stationné dans la note sous un marqueur, sans
  // colonne nouvelle (utils/serviPar.js).
  servedBy: z.string().trim().max(120).default(''),
  // 2.7.35 — hôpital : vente sur carnet (patient hospitalisé + prescripteur).
  // Les deux restent FACULTATIFS : le comptoir courant n'en a pas besoin.
  patientId: identifier.nullable().default(null),
  medicalStaffId: identifier.nullable().default(null),
  note: text.default(''),
  lines
}).strict();