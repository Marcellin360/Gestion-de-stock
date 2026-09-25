// Routes publiques d'authentification (limitées en débit).
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validateBody } from '../middlewares/validate.js';
import { loginSchema, passwordChangeSchema } from '../validators/auth.validator.js';
import { requireAuth } from '../middlewares/authenticate.js';
import { loginLimiter } from '../middlewares/rateLimit.js';
import * as controller from '../controllers/auth.controller.js';

export default function authRoutes() {
  const router = Router();
  router.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(controller.postLogin));
  router.get('/me', requireAuth, asyncHandler(controller.getMe));
  router.post('/logout', requireAuth, asyncHandler(controller.postLogout));
  router.post('/password', requireAuth, validateBody(passwordChangeSchema), asyncHandler(controller.postPassword));
  return router;
}
