import { z } from 'zod';
import { text } from './common.validator.js';

// 2.7.35/2.7.36/2.7.38 — hôpital : référentiels PERSONNEL (médecins/sages-
// femmes) et PATIENTS hospitalisés (avec date d'admission). 2.7.38 : la
// GARDE est une PÉRIODE DE DATES OBLIGATOIRE dans la fiche employé — le
// « jour de semaine (TDR) » et les « Périodes de garde » ont disparu.

/** Date au format « AAAA-MM-JJ » (celle tapée dans un champ date). */
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/** Cohérence obligatoire : la fin de garde ne peut pas précéder le début. */
const messageDates = 'La fin de garde est AVANT le début : vérifiez les deux dates.';

export const staffSchema = z.object({
  name: z.string().trim().min(2, 'Nom obligatoire (2 caractères)').max(120),
  role: z.enum(['DOCTOR', 'MIDWIFE'], { message: 'Rôle : médecin (DOCTOR) ou sage-femme (MIDWIFE)' }),
  // 2.7.38 — garde OBLIGATOIRE : date de début + date de fin de la période.
  dutyStartOn: jour,
  dutyEndOn: jour,
  phone: z.string().trim().max(40).default('')
}).strict().refine(v => v.dutyEndOn >= v.dutyStartOn, { message: messageDates, path: ['dutyEndOn'] });

export const staffPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['DOCTOR', 'MIDWIFE']).optional(),
  dutyStartOn: jour.optional(),
  dutyEndOn: jour.optional(),
  phone: z.string().trim().max(40).optional(),
  active: z.boolean().optional()
}).strict().refine(v => !(v.dutyStartOn && v.dutyEndOn) || v.dutyEndOn >= v.dutyStartOn,
  { message: messageDates, path: ['dutyEndOn'] });

export const patientSchema = z.object({
  name: z.string().trim().min(2, 'Nom du patient obligatoire (2 caractères)').max(180),
  service: z.string().trim().max(120).default(''),
  note: text.default(''),
  // 2.7.79 — motif de l'hospitalisation (ex. « Fièvre »), facultatif.
  motif: z.string().trim().max(255).default(''),
  // 2.7.36 — date d'admission à l'hôpital ; vide = jour de l'enregistrement.
  admittedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ').optional().or(z.literal('')).default('')
}).strict();

export const patientPatchSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  service: z.string().trim().max(120).optional(),
  note: text.optional(),
  motif: z.string().trim().max(255).optional(),   // 2.7.79
  admittedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  active: z.boolean().optional()
}).strict();