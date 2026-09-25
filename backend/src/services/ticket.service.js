// ============================================================================
// Documents imprimables (bons, tickets, feuilles, rapports) : l'impression et
// l'enregistrement en PDF passent par le navigateur, sans dépendance lourde.
// ============================================================================
import { Receipt, ReceiptLine, Transfer, TransferLine, Sale, SaleLine, Loss, LossLine, Inventory, InventoryLine, Product, Lot, User, Supplier, Adjustment } from '../models/index.js';
import { ensure } from '../utils/errors.js';
import { getSettings } from './settings.service.js';
import { receiptNote } from '../templates/receiptNote.js';
import { saleTicket } from '../templates/saleTicket.js';
import { lossSheet } from '../templates/lossSheet.js';
import { transferNote } from '../templates/transferNote.js';
import { inventorySheet } from '../templates/inventorySheet.js';
import { reportTable } from '../templates/reportTable.js';
import { buildReport, reportSummary, REPORT_LABELS } from './report.service.js';

async function context(ids, transaction) {
  const [pharmacy, products, lots, user, supplier] = await Promise.all([
    getSettings(transaction).then(s => s.toJSON()),
    Product.findAll({ transaction }),
    Lot.findAll({ transaction }),
    ids.userId ? User.findByPk(ids.userId, { transaction }) : null,
    ids.supplierId ? Supplier.findByPk(ids.supplierId, { transaction }) : null
  ]);
  return { pharmacy, products, lots, user, supplier };
}

export async function documentHtml(kind, id, transaction) {
  const map = {
    RECEIPT: async () => {
      const receipt = await Receipt.findByPk(id, { transaction });
      ensure(receipt, 'Réception introuvable.', 404);
      const lines = await ReceiptLine.findAll({ where: { receiptId: id }, order: [['id', 'ASC']], transaction });
      return receiptNote({
        receipt: receipt.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: receipt.userId, supplierId: receipt.supplierId }, transaction))
      });
    },
    SALE: async () => {
      const sale = await Sale.findByPk(id, { transaction });
      ensure(sale, 'Vente introuvable.', 404);
      const lines = await SaleLine.findAll({ where: { saleId: id }, order: [['id', 'ASC']], transaction });
      return saleTicket({
        sale: sale.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: sale.userId }, transaction))
      });
    },
    LOSS: async () => {
      const loss = await Loss.findByPk(id, { transaction });
      ensure(loss, 'Perte introuvable.', 404);
      const lines = await LossLine.findAll({ where: { lossId: id }, order: [['id', 'ASC']], transaction });
      return lossSheet({
        loss: loss.toJSON(), lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: loss.userId }, transaction))
      });
    },
    // Bordereau de transfert dépôt → pharmacie : c'est le papier qui accompagne
    // physiquement les cartons de la réserve vers le comptoir.
    TRANSFER: async () => {
      const transfer = await Transfer.findByPk(id, { transaction });
      ensure(transfer, 'Transfert introuvable.', 404);
      const lines = await TransferLine.findAll({ where: { transferId: id }, order: [['id', 'ASC']], transaction });
      const lots = await Lot.findAll({ transaction });
      return transferNote({
        transfer: transfer.toJSON(),
        lines: lines.map(l => ({
          ...l.toJSON(),
          lotNumber: lots.find(x => x.id === l.fromLotId)?.number || '—',
          expiresOn: lots.find(x => x.id === l.fromLotId)?.expiresOn || null
        })),
        ...(await context({ userId: transfer.userId }, transaction))
      });
    },
    ADJUSTMENT: async () => {
      const adjustment = await Adjustment.findByPk(id, { transaction });
      ensure(adjustment, 'Ajustement introuvable.', 404);
      const inventory = adjustment.inventoryId ? await Inventory.findByPk(adjustment.inventoryId, { transaction }) : null;
      const lines = inventory ? await InventoryLine.findAll({ where: { inventoryId: inventory.id }, order: [['id', 'ASC']], transaction }) : [];
      return inventorySheet({
        inventory: (inventory || { reference: adjustment.reference, createdAt: adjustment.createdAt, scope: '', toJSON() { return this; } }),
        lines: lines.map(l => l.toJSON()),
        ...(await context({ userId: adjustment.userId }, transaction))
      });
    }
  };
  const render = map[kind];
  ensure(render, 'Type de document inconnu.', 404);
  return render();
}

export async function inventoryHtml(id, transaction) {
  const inventory = await Inventory.findByPk(id, { transaction });
  ensure(inventory, 'Inventaire introuvable.', 404);
  const lines = await InventoryLine.findAll({ where: { inventoryId: id }, order: [['id', 'ASC']], transaction });
  return inventorySheet({
    inventory: inventory.toJSON(), lines: lines.map(l => l.toJSON()),
    ...(await context({ userId: inventory.userId }, transaction))
  });
}

export async function reportHtml({ type, from, to, supplierId, location = null }, user, transaction) {
  const report = await buildReport({ type, from, to, supplierId, location, page: 1, limit: 5000 }, transaction);
  const summary = await reportSummary({ from, to }, transaction);
  return reportTable({
    title: REPORT_LABELS[type] || 'Rapport',
    subtitle: `Du ${from} au ${to}`,
    pharmacy: (await getSettings(transaction)).toJSON(),
    rows: report.rows,
    summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, String(v)])),
    user
  });
}
