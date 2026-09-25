// Rapports et journal d'audit.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateQuery } from '../middlewares/validate.js';
import { isDate } from '../validators/common.validator.js';
import * as reports from '../controllers/reports.controller.js';
import * as audit from '../controllers/audit.controller.js';
import { REPORT_TYPES } from '../services/report.service.js';

const reportQuery = z.object({
  type: z.enum(REPORT_TYPES),
  from: isDate,
  to: isDate,
  supplierId: z.coerce.number().int().positive().optional(),
  // Filtre magasin proposé par l'écran Rapports pour certains états (stock,
  // mouvements, pertes, expirations, inventaires). Sans cette ligne, la requête
  // était refusée : « champ inconnu location ».
  location: z.enum(['DEPOT', 'PHARMACY', 'ALL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  format: z.enum(['json', 'csv']).default('json')
}).strict();

export default function reportRoutes() {
  const router = Router();
  router.get('/reports', requirePermission('reports'), validateQuery(reportQuery), asyncHandler(reports.list));
  router.get('/reports/print', requirePermission('reports'), validateQuery(reportQuery), asyncHandler(reports.printable));
  router.get('/audit', requirePermission('audit'), asyncHandler(audit.logs));
  router.get('/audit/integrity', requirePermission('audit'), asyncHandler(audit.integrity));
  return router;
}