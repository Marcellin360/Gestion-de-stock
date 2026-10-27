import { z } from 'zod';
import { identifier, quantity, amount, text, requestKey } from './common.validator.js';

// 2.7.12 — vente au détail : chaque ligne porte l'unité choisie à la caisse.
//   BOX     = boîte entière (unité de gestion du stock) ;
//   BLISTER = plaquette (boîte 1 = plaquettes N, réglé dans la fiche médicament) ;
//   UNIT    = vongany, la plus petite pièce (plaquette 1 = vongany M).
// « quantity » = le nombre tapé par le vendeur DANS L'UNITÉ CHOISIE
// (ex. 3 plaquettes → le serveur convertit en équivalent-boîte pour le stock).
export const SALE_UNITS = ['BOX', 'BLISTER', 'UNIT'];

const lines = z.array(z.object({
  productId: identifier,
  quantity,
  saleUnit: z.enum(SALE_UNITS, { message: 'Unité de vente inconnue : choisir boîte, plaquette ou vongany' })
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