// Utilisateurs et rôles (permission « users »).
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { userCreateSchema, userUpdateSchema } from '../validators/user.validator.js';
import * as controller from '../controllers/users.controller.js';

export default function userRoutes() {
  const router = Router();
  const guard = requirePermission('users');
  // La permission est posée route par route : un routeur monté à la racine ne
  // doit jamais filtrer les chemins qui ne lui appartiennent pas.
  router.get('/', guard, asyncHandler(controller.list));
  router.get('/roles', guard, asyncHandler(controller.roles));
  router.post('/', guard, validateBody(userCreateSchema), asyncHandler(controller.create));
  router.put('/:id', guard, validateBody(userUpdateSchema), asyncHandler(controller.update));
  // 2.7.29 — bouton « Supprimer » de l'administration (garde-fous côté service).
  router.delete('/:id', guard, asyncHandler(controller.destroy));
  return router;
}