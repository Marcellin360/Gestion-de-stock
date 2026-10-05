// ============================================================================
// Point d'assemblage de l'API : routes publiques, puis authentification,
// puis modules protégés par permission. Chaque écriture est limitée en débit.
// ============================================================================
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth } from '../middlewares/authenticate.js';
import { originGuard } from '../middlewares/originGuard.js';
import { noStore } from '../middlewares/noStore.js';
import { writeLimiter } from '../middlewares/rateLimit.js';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import referenceRoutes from './reference.routes.js';
import stockRoutes from './stock.routes.js';
import documentRoutes from './documents.routes.js';
import reportRoutes from './reports.routes.js';
import settingsRoutes from './settings.routes.js';
import { getData, getSalesCalendar, getSalesMonthly, getStockCalendar, getStockFlowMonthly } from '../controllers/dashboard.controller.js';
import { connect } from '../config/database.js';

export function apiRoutes() {
  const router = Router();

  router.use(originGuard, noStore);

  // --- Public ---
  router.get('/health', asyncHandler(async (req, res) => {
    await connect();
    res.json({ status: 'ok', service: 'pharmastock', time: new Date().toISOString() });
  }));
  router.use('/auth', authRoutes());

  // --- À partir d'ici : session obligatoire ---
  router.use(requireAuth);
  router.use(writeLimiter);
  router.get('/data', asyncHandler(getData));
  // 2.7.17 — calendrier des ventes, lu par la page « Calendrier des ventes » (2.7.18).
  router.get('/data/sales-calendar', asyncHandler(getSalesCalendar));
  // 2.7.18 — histogramme des ventes mensuelles du tableau de bord pharmacie.
  router.get('/data/sales-monthly', asyncHandler(getSalesMonthly));
  // 2.7.20 — dépôt : calendrier des stock (J/J) et flux entrées/sorties (mois).
  router.get('/data/stock-calendar', asyncHandler(getStockCalendar));
  router.get('/data/stock-flow-monthly', asyncHandler(getStockFlowMonthly));
  router.use('/users', userRoutes());
  router.use(referenceRoutes());
  router.use(stockRoutes());
  router.use(documentRoutes());
  router.use(reportRoutes());
  router.use(settingsRoutes());

  return router;
}