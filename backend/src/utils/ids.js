// Identifiants internes et références documentaires (lisibles pour l'utilisateur).
import crypto from 'node:crypto';

export const uuid = () => crypto.randomUUID();

const PREFIXES = {
  RECEIPT: 'REC', TRANSFER: 'TRF', SALE: 'VTE', LOSS: 'PRT', ADJUSTMENT: 'AJU', INVENTORY: 'INV'
};

/**
 * Référence documentaire définitive : préfixe + année + numéro interne.
 * Exemple : REC-2026-000042. Basée sur l'identifiant technique, donc unique.
 */
export function reference(kind, id, year = new Date().getFullYear()) {
  return `${PREFIXES[kind] || 'DOC'}-${year}-${String(id).padStart(6, '0')}`;
}
