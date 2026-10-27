// Opérations de stock : réceptions (dépôt), transferts (dépôt → pharmacie),
// ventes (pharmacie), pertes, lots et inventaires.
// Il n'y a ni commande ni retour fournisseur : la marchandise entre au dépôt,
// la pharmacie est servie par transfert.
import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requirePermission } from '../middlewares/authenticate.js';
import { validateBody } from '../middlewares/validate.js';
import { transferSchema, transferCorrectionSchema } from '../validators/transfer.validator.js';
import { receiptSchema, correctionSchema, validateNoteSchema, refuseNoteSchema } from '../validators/receipt.validator.js';
import { saleSchema, saleQuoteSchema } from '../validators/sale.validator.js';
import { lossSchema } from '../validators/removal.validator.js';
import { inventoryOpenSchema, inventoryValidateSchema, inventoryAbandonSchema, lotStatusSchema } from '../validators/inventory.validator.js';
import * as transfers from '../controllers/transfer.controller.js';
import * as receipts from '../controllers/receipt.controller.js';
import * as corrections from '../controllers/correction.controller.js';
import * as correctionsTransfert from '../controllers/transferCorrection.controller.js';
import * as sales from '../controllers/sale.controller.js';
import * as losses from '../controllers/loss.controller.js';
import * as lots from '../controllers/lot.controller.js';
import * as inventories from '../controllers/inventory.controller.js';

export default function stockRoutes() {
  const router = Router();

  // Réceptions fournisseur : la marchandise entre TOUJOURS au dépôt.
  router.post('/receipts', requirePermission('receipt'), validateBody(receiptSchema), asyncHandler(receipts.create));

  // 2.7.34 — teboka ③ CORRECTION D'UNE RÉCEPTION (workflow) : le dépôt PROPOSE
  // la modification (motif + valeurs corrigées) ; seul un ADMINISTRATEUR
  // (permission « settings ») valide l'application ou refuse en expliquant.
  router.post('/receipts/:id/corrections', requirePermission('receipt'),
    validateBody(correctionSchema), asyncHandler(corrections.proposer));
  router.get('/receipt-corrections', requirePermission('receipt'),
    asyncHandler(corrections.list));
  router.get('/receipt-corrections/:id', requirePermission('receipt'),
    asyncHandler(corrections.detail));
  router.post('/receipt-corrections/:id/validate', requirePermission('settings'),
    validateBody(validateNoteSchema), asyncHandler(corrections.valider));
  router.post('/receipt-corrections/:id/refuse', requirePermission('settings'),
    validateBody(refuseNoteSchema), asyncHandler(corrections.refuser));

  // Transferts dépôt → pharmacie.
  router.get('/transfers', requirePermission('transfer'), asyncHandler(transfers.list));
  router.post('/transfers', requirePermission('transfer'), validateBody(transferSchema), asyncHandler(transfers.create));
  router.get('/transfers/lots', requirePermission('transfer'), asyncHandler(transfers.lots));

  // 2.7.79 — CORRECTION D'UN TRANSFERT (workflow) : le dépôt PROPOSE la
  // modification (motif + quantités corrigées) ; seul un ADMINISTRATEUR
  // (permission « settings ») valide l'application ou refuse en expliquant.
  // AVANT /transfers/:id : chemins exacts « transfer-corrections… » d'abord,
  // sinon Express servirait « corrections » comme un id de transfert.
  router.post('/transfers/:id/corrections', requirePermission('transfer'),
    validateBody(transferCorrectionSchema), asyncHandler(correctionsTransfert.proposer));
  router.get('/transfer-corrections', requirePermission('transfer'),
    asyncHandler(correctionsTransfert.list));
  router.get('/transfer-corrections/:id', requirePermission('transfer'),
    asyncHandler(correctionsTransfert.detail));
  router.post('/transfer-corrections/:id/validate', requirePermission('settings'),
    validateBody(validateNoteSchema), asyncHandler(correctionsTransfert.valider));
  router.post('/transfer-corrections/:id/refuse', requirePermission('settings'),
    validateBody(refuseNoteSchema), asyncHandler(correctionsTransfert.refuser));

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