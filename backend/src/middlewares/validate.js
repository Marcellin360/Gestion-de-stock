// Validation stricte des entrées (zod) : aucune donnée non contrôlée n'atteint les services.
import { z } from 'zod';

export const validateBody = schema => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};

export const validateQuery = schema => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) return next(result.error);
  req.query = result.data;
  next();
};
