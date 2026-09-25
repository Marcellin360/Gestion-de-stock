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

export const receiptSchema = z.object({
  requestKey,
  supplierId: identifier,
  fees: amount.default('0'),
  note: text.default(''),
  lines: z.array(z.object({
    productId: identifier,
    number: z.string().trim().min(1, 'Numéro de lot requis').max(100),
    quantity,
    purchasePrice: amount,
    receivedOn: isDate,
    expiresOn: dateExpirationObligatoire,
    manufacturedOn: optionalDate
  }).strict()).min(1, 'Ajouter au moins un lot').max(100)
}).strict().refine(v => new Set(v.lines.map(l => `${l.productId}|${l.number.trim().toUpperCase()}`)).size === v.lines.length,
  'Un même numéro de lot apparaît deux fois pour le même médicament');