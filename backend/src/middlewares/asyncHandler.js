// Enveloppe les contrôleurs asynchrones : toute exception part vers le gestionnaire d'erreurs.
export const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
