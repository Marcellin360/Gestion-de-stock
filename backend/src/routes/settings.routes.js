// Paramètres de l'officine : lecture pour tous, écriture réservée (permission « settings »).
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { settingsSchema } from '../validators/settings.validator.js';
import * as controller from '../controllers/settings.controller.js';

export default function settingsRoutes() {
  const router = Router();
  router.get('/settings', asyncHandler(controller.get));
  router.put('/settings', requirePermission('settings'), validateBody(settingsSchema), asyncHandler(controller.put));
  return router;
}
