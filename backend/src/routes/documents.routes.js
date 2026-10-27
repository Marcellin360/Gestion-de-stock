// Documents : historique, détail, annulation tracée, impression PDF.
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import * as controller from '../controllers/document.controller.js';
import { inventoryHtml, ordonnanceHtml, ordonnanceTicketPdf } from '../services/ticket.service.js';
import { read } from '../utils/transaction.js';

export default function documentRoutes() {
  const router = Router();
  router.get('/documents', asyncHandler(controller.list));
  router.get('/documents/:kind/:id', asyncHandler(controller.detail));
  router.post('/documents/:kind/:id/cancel', requirePermission('cancel'),
    validateBody(z.object({ reason: z.string().trim().min(3, 'Motif obligatoire').max(255) }).strict()),
    asyncHandler(controller.cancel));
  router.get('/documents/:kind/:id/print', asyncHandler(controller.printable));
  router.get('/inventories/:id/print', requirePermission('inventory'), asyncHandler(async (req, res) => {
    const html = await read(transaction => inventoryHtml(Number(req.params.id), transaction));
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  }));
  // 2.7.35 — hôpital : l'ordonnance d'une vente sur carnet (patient +
  // prescripteur + médicaments, SANS montants ; le ticket comptoir reste inchangé).
    router.get('/sales/:id/ordonnance', requirePermission('sale'), asyncHandler(async (req, res) => {
    // 2.7.56 — `?fmt=pdf` : ordonnance téléchargée en PDF (même contenu).
    if (req.query.fmt === 'pdf') {
      const { buffer, filename } = await read(transaction => ordonnanceTicketPdf(Number(req.params.id), transaction));
      return res
        .set('Content-Type', 'application/pdf')
        .set('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    }
    const html = await read(transaction => ordonnanceHtml(Number(req.params.id), transaction));
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  }));
  return router;
}