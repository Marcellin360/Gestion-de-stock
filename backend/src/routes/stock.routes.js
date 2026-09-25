// Opérations de stock : réceptions (dépôt), transferts (dépôt → pharmacie),
// ventes (pharmacie), pertes, lots et inventaires.
// Il n'y a ni commande ni retour fournisseur : la marchandise entre au dépôt,
// la pharmacie est servie par transfert.
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { transferSchema } from '../validators/transfer.validator.js';
import { receiptSchema } from '../validators/receipt.validator.js';
import { saleSchema, saleQuoteSchema } from '../validators/sale.validator.js';
import { lossSchema } from '../validators/removal.validator.js';
import { inventoryOpenSchema, inventoryValidateSchema, inventoryAbandonSchema, lotStatusSchema } from '../validators/inventory.validator.js';
import * as transfers from '../controllers/transfer.controller.js';
import * as receipts from '../controllers/receipt.controller.js';
import * as sales from '../controllers/sale.controller.js';
import * as losses from '../controllers/loss.controller.js';
import * as lots from '../controllers/lot.controller.js';
import * as inventories from '../controllers/inventory.controller.js';

export default function stockRoutes() {
  const router = Router();

  // Réceptions fournisseur : la marchandise entre TOUJOURS au dépôt.
  router.post('/receipts', requirePermission('receipt'), validateBody(receiptSchema), asyncHandler(receipts.create));

  // Transferts dépôt → pharmacie.
  router.get('/transfers', requirePermission('transfer'), asyncHandler(transfers.list));
  router.post('/transfers', requirePermission('transfer'), validateBody(transferSchema), asyncHandler(transfers.create));
  router.get('/transfers/lots', requirePermission('transfer'), asyncHandler(transfers.lots));
  router.get('/transfers/:id', requirePermission('transfer'), asyncHandler(transfers.detail));

  // Ventes (pharmacie uniquement).
  router.post('/sales/quote', requirePermission('sale'), validateBody(saleQuoteSchema), asyncHandler(sales.quote));
  router.post('/sales', requirePermission('sale'), validateBody(saleSchema), asyncHandler(sales.create));

  // Pertes et dons.
  router.post('/losses', requirePermission('loss'), validateBody(lossSchema), asyncHandler(losses.create));

  // Lots
  router.get('/lots', asyncHandler(lots.list));
  router.get('/lots/:id/movements', asyncHandler(lots.movements));
  router.put('/lots/:id/status', requirePermission('inventory'), validateBody(lotStatusSchema), asyncHandler(lots.setStatus));

  // Inventaires (un par magasin)
  router.get('/inventories', requirePermission('inventory'), asyncHandler(inventories.list));
  router.post('/inventories', requirePermission('inventory'), validateBody(inventoryOpenSchema), asyncHandler(inventories.open));
  router.get('/inventories/:id', requirePermission('inventory'), asyncHandler(inventories.detail));
  router.post('/inventories/:id/validate', requirePermission('inventory'), validateBody(inventoryValidateSchema), asyncHandler(inventories.validate));
  router.post('/inventories/:id/abandon', requirePermission('inventory'), validateBody(inventoryAbandonSchema), asyncHandler(inventories.abandon));

  return router;
}
