// Nettoyage minimal des chaînes saisies par les utilisateurs.
export const trim = value => (typeof value === 'string' ? value.trim() : value);
export const blankToNull = value => (typeof value === 'string' && value.trim() === '' ? null : value);
/** Normalise un numéro de lot : majuscules, espaces harmonisés (comparaison fiable). */
export const normalizeLotNumber = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
export const slug = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
