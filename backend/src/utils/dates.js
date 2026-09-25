// ============================================================================
// Dates et heures : la pharmacie travaille à l'heure de Madagascar (UTC+3).
// ============================================================================
import { config } from '../config/index.js';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
});

/** Date du jour (AAAA-MM-JJ) au fuseau de la pharmacie. */
export function today() {
  return dateFormatter.format(new Date());
}

/** Convertit une date (Date ou texte) en date locale de la pharmacie : AAAA-MM-JJ. */
export function localDate(value) {
  return dateFormatter.format(new Date(value));
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Bornes UTC d'une journée locale (utilisées par les rapports par période). */
export function dayRange(from, to) {
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86400000);
  return { start, end };
}

export function monthStart(reference = today()) {
  return `${reference.slice(0, 7)}-01`;
}

export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);
}
