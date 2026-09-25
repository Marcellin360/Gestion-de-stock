// Référentiels : produits, catégories, fournisseurs, prix et recherche.
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { categorySchema, supplierSchema, productSchema } from '../validators/reference.validator.js';
import { z } from 'zod';
import * as controller from '../controllers/reference.controller.js';

export default function referenceRoutes() {
  const router = Router();

  // Catalogue : accessible à tous les utilisateurs connectés (recherche en vente).
  router.get('/search', asyncHandler(controller.search));

  for (const resource of ['categories', 'suppliers', 'products']) {
    const schema = { categories: categorySchema, suppliers: supplierSchema, products: productSchema }[resource];
    router.post(`/${resource}`, requirePermission('reference'), validateBody(schema), (req, res, next) => {
      req.params.resource = resource; controller.create(req, res).catch(next);
    });
    router.put(`/${resource}/:id`, requirePermission('reference'), validateBody(schema), (req, res, next) => {
      req.params.resource = resource; controller.update(req, res).catch(next);
    });
  }

  // Prix de vente et taux de marge : réservés aux profils autorisés (RG24).
  router.put('/products/:id/margin', requirePermission('prices'), validateBody(z.object({
    marginRate: z.number().min(0).max(99.99),
    reason: z.string().trim().max(255).optional()
  }).strict()), asyncHandler(controller.updateMargin));
  router.get('/products/:id/prices', requirePermission('reports'), asyncHandler(controller.history));

  return router;
}
