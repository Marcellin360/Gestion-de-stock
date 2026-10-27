// ============================================================================
// Point d'assemblage de l'API : routes publiques, puis authentification,
// puis modules protégés par permission. Chaque écriture est limitée en débit.
// ============================================================================
import { VERSION_APPLI } from '../utils/version.js';
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
import hopitalRoutes from './hopital.routes.js';
import reportRoutes from './reports.routes.js';
import settingsRoutes from './settings.routes.js';
import { getData, getSalesCalendar, getSalesMonthly, getStockCalendar, getStockFlowMonthly } from '../controllers/dashboard.controller.js';
import { connect } from '../config/database.js';

export function apiRoutes() {
  const router = Router();

  router.use(originGuard, noStore);

  // 2.7.62 — EMPREINTE du serveur réel : chaque réponse de l'API porte la
  // version du code de PharmaStock. Le garde-fou « pas de PDF » s'en sert
  // pour PROUVER si c'est bien NOTRE backend qui a répondu — un 204 vide
  // sans cette empreinte est, par définition, l'œuvre d'un intermédiaire
  // (antivirus web-shield, proxy, extension du navigateur…), pas de nous.
  router.use((req, res, next) => {
    res.set('X-PharmaStock-Code', VERSION_APPLI);
    next();
  });

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
  // 2.7.35 — hôpital : patients, personnel (TDR) et activité des prescripteurs.
  router.use(hopitalRoutes());
  router.use(reportRoutes());
  router.use(settingsRoutes());

    router.get('/version', (req, res) => {
    res.json({ versionAppli: VERSION_APPLI, marqueurs: ['pdf-documents', 'patients-discharged_on'] });
  });

  return router;
}