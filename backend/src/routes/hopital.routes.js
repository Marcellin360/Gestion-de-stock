// 2.7.35 + 2.7.36 + 2.7.38 — Hôpital / carnet prescripteur : patients
// hospitalisés, personnel soignant (garde = période de dates OBLIGATOIRE sur
// la fiche), séjours des patients et activité d'un prescripteur.
// Ouverts au comptoir (PHARMACIEN) et à l'ADMIN (permission 'sale') ; le dépôt
// n'y accède pas.
import { Router } from 'express';
import { validateBody } from '../middlewares/validate.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import * as controller from '../controllers/hospital.controller.js';
import { patientSchema, patientPatchSchema, staffSchema, staffPatchSchema } from '../validators/hospital.validator.js';

export default function hopitalRoutes() {
  const router = Router();
  router.get('/patients', requirePermission('sale'), asyncHandler(controller.patientsList));
  router.post('/patients', requirePermission('sale'), validateBody(patientSchema), asyncHandler(controller.patientCreate));
  // 2.7.36 — AVANT /patients/:id : chemins exacts dédiés au séjour (Express
  // servirait sinon « sejours » comme un id).
  router.get('/patients/sejours', requirePermission('sale'), asyncHandler(controller.sejoursList));
  router.get('/patients/:id/sejour', requirePermission('sale'), asyncHandler(controller.sejourShow));
  router.get('/patients/:id/ordonnance', requirePermission('sale'), asyncHandler(controller.sejourOrdonnance));
  router.put('/patients/:id', requirePermission('sale'), validateBody(patientPatchSchema), asyncHandler(controller.patientPatch));
  router.get('/staff', requirePermission('sale'), asyncHandler(controller.staffList));
  router.post('/staff', requirePermission('sale'), validateBody(staffSchema), asyncHandler(controller.staffCreate));
  router.put('/staff/:id', requirePermission('sale'), validateBody(staffPatchSchema), asyncHandler(controller.staffPatch));
  router.get('/staff/:id/activite', requirePermission('sale'), asyncHandler(controller.staffActivity));
  return router;
}