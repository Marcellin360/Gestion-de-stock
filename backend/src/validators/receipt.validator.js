import { z } from 'zod';
import { identifier, quantity, amount, text, isDate, optionalDate, requestKey } from './common.validator.js';

// Version 2.7.1 — le numéro du bon de réception est attribué par le serveur
// (REC-AAAA-NNNNNN) : il n'y a plus de « numéro de facture » à transmettre.
// La date d'expiration de chaque lot est OBLIGATOIRE : c'est elle qui déclenche
// l'alerte de péremption et qui pilote la sortie FEFO.
//
// Date d'expiration : obligatoire, avec un message compréhensible pour l'utilisateur.
const dateExpirationObligatoire = z.string({
  required_error: 'Date d’expiration obligatoire.',
  invalid_type_error: 'Date d’expiration obligatoire (format AAAA-MM-JJ).'
}).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’expiration attendue au format AAAA-MM-JJ.');

// Ligne de réception, partagée par la création et la correction (2.7.34).
const ligneReception = z.object({
  productId: identifier,
  number: z.string().trim().min(1, 'Numéro de lot requis').max(100),
  quantity,
  purchasePrice: amount,
  receivedOn: isDate,
  expiresOn: dateExpirationObligatoire,
  manufacturedOn: optionalDate,           // 2.7.49 — legacy : remplacé dans le formulaire par « Fabriquant »
  manufacturer: text.optional(),          // 2.7.49 — fabricant saisi À LA RÉCEPTION, lot par lot
  // 2.7.31 — l'unité de gestion se choisit à la réception (elle est reportée
  // sur la fiche du médicament) : boîte, flacon, pièce, plaquette…
  unit: text.optional()
}).strict();

const pasDeDoublonDeLot = v => new Set(v.lines.map(l => `${l.productId}|${l.number.trim().toUpperCase()}`)).size === v.lines.length;

export const receiptSchema = z.object({
  requestKey,
  supplierId: identifier,
  // 2.7.47 — champ LEGACY, accepté mais IGNORÉ : les frais sont désormais
  // automatiques (Paramètres → « Frais d'achat », feesRate % du PA) ; le coût
  // unitaire d'un lot se calcule CU = PA × (1 + taux/100), sans saisie manuelle.
  fees: amount.default('0'),
  note: text.default(''),
  lines: z.array(ligneReception).min(1, 'Ajouter au moins un lot').max(100)
}).strict().refine(pasDeDoublonDeLot,
  'Un même numéro de lot apparaît deux fois pour le même médicament');

// ============================================================================
// 2.7.34 — teboka ③ : DEMANDE DE CORRECTION d'une réception (dépôt propose →
// administrateur tranche). Mêmes lignes qu'une réception, plus le motif.
// ============================================================================
export const correctionSchema = z.object({
  reason: z.string().trim()
    .min(3, 'Le motif de la correction est obligatoire (3 caractères minimum).')
    .max(255, 'Motif trop long (255 caractères maximum).'),
  supplierId: identifier,
  // 2.7.47 — legacy, ignoré (frais automatiques feesRate % du PA).
  fees: amount.default('0'),
  note: text.default(''),
  lines: z.array(ligneReception).min(1, 'Ajouter au moins un lot').max(100)
}).strict().refine(pasDeDoublonDeLot,
  'Un même numéro de lot apparaît deux fois pour le même médicament');

// Décision de l'administrateur : validation (note facultative) / refus (note expliquée).
export const validateNoteSchema = z.object({
  note: text.max(500).default('')
}).strict();

export const refuseNoteSchema = z.object({
  note: z.string().trim().min(3, 'Expliquez le refus au dépôt (3 caractères minimum).').max(500)
}).strict();