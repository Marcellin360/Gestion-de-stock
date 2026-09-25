// ============================================================================
// Ventes (§9.10, RG05, RG08) : proposition des lots en FEFO, calcul du prix côté
// serveur, décrément du stock uniquement après validation, marge brute conservée.
// ============================================================================
import { Sale, SaleLine, Product } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, LOT_PICKING } from '../config/constants.js';
import { lockProductLots, pickLots, applyMovements } from './stock.service.js';
import { salePrice, retainedCost } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log } from './audit.service.js';

/**
 * Proposition de vente (aucun impact sur le stock) : lots FEFO, quantités et prix.
 * Sert d'écran de vérification avant validation et limite les erreurs de caisse.
 */
export async function quoteSale(payload, transaction) {
  const settings = await getSettings(transaction);
  const lines = [];
  let total = D(0);
  for (const row of payload.lines) {
    const product = await Product.findByPk(row.productId, { transaction });
    ensure(product && product.active, 'Médicament absent ou inactif.');
    // La vente se fait toujours au comptoir : seuls les lots de la PHARMACIE sont proposés.
    const lots = await lockProductLots(product.id, transaction, 'PHARMACY');
    const picked = pickLots(lots, row.quantity, {
      date: today(), method: LOT_PICKING.FEFO, allowExpired: settings.allowExpiredSale
    });
    ensure(picked.missing === 0,
      `Stock vendable insuffisant dans la pharmacie pour « ${product.name} » : `
      + 'seuls les lots non expirés et non bloqués du comptoir sont proposés. Transférer depuis le dépôt si besoin.');
    for (const { lot, quantity } of picked.picked) {
      const cost = retainedCost(product, lot, settings.valuation);
      const unitPrice = salePrice(cost, product.marginRate, settings.marginMode, settings.minMargin, settings.maxMargin);
      lines.push({
        productId: product.id, product: product.name, code: product.code, unit: product.unit,
        lotId: lot.id, lot: lot.number, expiresOn: lot.expiresOn,
        quantity, unitPrice, unitCost: cost, marginRate: product.marginRate,
        margin: money(D(unitPrice).sub(cost).mul(quantity))
      });
      total = total.add(D(unitPrice).mul(quantity));
    }
  }
  const costTotal = lines.reduce((acc, line) => acc.add(D(line.unitCost).mul(line.quantity)), D(0));
  return {
    lines,
    total: money(total),
    costTotal: money(costTotal),
    margin: money(total.sub(costTotal)),
    valuation: settings.valuation,
    marginMode: settings.marginMode
  };
}

/**
 * Valide une vente : reprend la logique FEFO, écrit la vente, ses lignes et les
 * mouvements de sortie. La répartition par lot est recalculée ici : le navigateur
 * ne décide jamais des lots sortis ni des prix appliqués.
 */
export async function createSale(payload, user, transaction) {
  const existing = await Sale.findOne({ where: { requestKey: payload.requestKey }, transaction });
  if (existing) {
    ensure(existing.userId === user.id, 'Clé de requête déjà utilisée par un autre utilisateur.', 409);
    // Rejeu réseau : on renvoie la vente déjà enregistrée, sans nouveau mouvement de stock.
    return { sale: existing, lines: [] };
  }
  const settings = await getSettings(transaction);
  const prepared = await quoteSale({ ...payload }, transaction);
  ensure(payload.expectedTotal === undefined || D(payload.expectedTotal).eq(prepared.total),
    'Le prix ou la disponibilité a changé depuis la vérification. Refaire la vérification avant de valider.', 409);

  const sale = await Sale.create({
    reference: `TMP-${payload.requestKey}`,
    userId: user.id,
    location: 'PHARMACY',
    customerName: payload.customerName || '',
    total: prepared.total,
    costTotal: prepared.costTotal,
    margin: prepared.margin,
    note: payload.note || '',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  for (const line of prepared.lines) {
    await SaleLine.create({
      saleId: sale.id, productId: line.productId, lotId: line.lotId, quantity: line.quantity,
      unitPrice: line.unitPrice, unitCost: line.unitCost, marginRate: line.marginRate, margin: line.margin
    }, { transaction });
  }

  // Sortie de stock : uniquement après validation (RG04, RG05).
  await applyMovements({
    documentType: 'SALE', documentId: sale.id, userId: user.id, kind: 'SALE',
    reason: payload.customerName ? `Vente — ${payload.customerName}` : 'Vente comptoir',
    lines: prepared.lines.map(line => ({
      productId: line.productId, lotId: line.lotId, location: 'PHARMACY',
      quantity: -line.quantity, unitCost: line.unitCost
    }))
  }, transaction);

  await sale.update({ reference: makeReference('SALE', sale.id) }, { transaction });
  await log({
    userId: user.id, action: 'VALIDATE', entity: 'SALE', entityId: sale.id,
    after: { reference: sale.reference, total: prepared.total, margin: prepared.margin, lines: prepared.lines.length }
  }, transaction);

  return { sale, lines: prepared.lines };
}
