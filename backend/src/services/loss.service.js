// ============================================================================
// Pertes, casse, expiration, don (§9.11, RG06, RG07).
// Une perte est une sortie de stock SANS chiffre d'affaires ; elle est toujours
// motivée et valorisée au coût retenu (CMP ou coût réel du lot).
// ============================================================================
import { Loss, LossLine, Lot, Product } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { reference as makeReference } from '../utils/ids.js';
import { LOSS_REASONS, STATUS, LOCATIONS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements } from './stock.service.js';
import { retainedCost } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log } from './audit.service.js';

export async function createLoss(payload, user, transaction) {
  const existing = await Loss.findOne({ where: { requestKey: payload.requestKey }, transaction });
  if (existing) {
    ensure(existing.userId === user.id, 'Clé de requête déjà utilisée par un autre utilisateur.', 409);
    return existing;
  }
  ensure(LOSS_REASONS.includes(payload.reason), 'Motif de perte invalide.');
  const location = payload.location || 'PHARMACY';
  ensure(LOCATIONS.includes(location), 'Magasin inconnu : choisir « Dépôt » ou « Pharmacie ».');
  ensure(String(payload.note || '').trim().length >= 3,
    'Une remarque justificative est obligatoire pour toute sortie non commerciale (RG07).');

  const settings = await getSettings(transaction);
  const loss = await Loss.create({
    reference: `TMP-${payload.requestKey}`,
    userId: user.id,
    location,
    reason: payload.reason,
    note: payload.note.trim(),
    costTotal: '0.000000',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  const movementLines = [];
  let costTotal = D(0);

  for (const row of payload.lines) {
    const lot = await Lot.findByPk(row.lotId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(lot, 'Lot introuvable.', 404);
    ensure(lot.location === location,
      `Le lot ${lot.number} se trouve dans « ${LOCATION_LABELS[lot.location]} » : choisir ce magasin pour déclarer la perte.`);
    const product = await Product.findByPk(lot.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(product, 'Médicament introuvable.', 404);
    ensure(Number(lot.quantity) >= Number(row.quantity),
      `Quantité supérieure au stock du lot ${lot.number} (disponible : ${lot.quantity}).`);

    const cost = retainedCost(product, lot, settings.valuation);
    await LossLine.create({
      lossId: loss.id, productId: product.id, lotId: lot.id,
      quantity: row.quantity, unitCost: cost
    }, { transaction });
    movementLines.push({ productId: product.id, lotId: lot.id, quantity: -Number(row.quantity), unitCost: cost });
    costTotal = costTotal.add(D(cost).mul(row.quantity));
  }

  await applyMovements({
    documentType: 'LOSS', documentId: loss.id, userId: user.id, kind: 'LOSS',
    reason: `${payload.reason}${payload.note ? ` — ${payload.note.trim()}` : ''} (${LOCATION_LABELS[location]})`,
    lines: movementLines.map(line => ({ ...line, location }))
  }, transaction);

  await loss.update({ reference: makeReference('LOSS', loss.id), costTotal: money(costTotal) }, { transaction });
  await log({
    userId: user.id, action: 'VALIDATE', entity: 'LOSS', entityId: loss.id,
    after: { reference: loss.reference, reason: payload.reason, costTotal: money(costTotal), lines: movementLines.length }
  }, transaction);

  return loss;
}

/** Tableau de synthèse des pertes par motif (rapports). */
export const LOSS_REASONS_LIST = LOSS_REASONS;
