// Erreurs métier normalisées : un message clair, un code HTTP, rien de technique exposé.
export class BusinessError extends Error {
  constructor(message, status = 422, details) {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
    this.details = details;
  }
}

/** Vérifie une condition métier ; lève une BusinessError explicite sinon. */
export function ensure(condition, message, status = 422) {
  if (!condition) throw new BusinessError(message, status);
  return condition;
}

export const notFound = (what = 'Élément') => new BusinessError(`${what} introuvable.`, 404);
export const forbidden = (message = 'Droit insuffisant.') => new BusinessError(message, 403);
export const conflict = (message, status = 409) => new BusinessError(message, status);
