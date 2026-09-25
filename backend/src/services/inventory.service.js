// ============================================================================
// Inventaire physique (§9.13, RG15, RG16, RG17).
// Principe : photographie du stock théorique à l'ouverture, saisie du comptage,
// justification obligatoire de chaque écart, puis ajustement tracé.
// ============================================================================
import { Inventory, InventoryLine, Adjustment, AdjustmentLine, Lot, Product } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, LOCATIONS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements } from './stock.service.js';
import { retainedCost } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log, publicSnapshot } from './audit.service.js';

/** Ouvre un inventaire : un seul inventaire en cours à la fois. */
export async function openInventory(payload, user, transaction) {
  const location = payload.location || 'PHARMACY';
  ensure(LOCATIONS.includes(location), 'Magasin inconnu : choisir « Dépôt » ou « Pharmacie ».');
  const open = await Inventory.findOne({ where: { status: STATUS.DRAFT, location }, transaction });
  ensure(!open, `Un inventaire est déjà en cours dans « ${LOCATION_LABELS[location]} » (${open?.reference}). `
    + 'Le valider ou l’abandonner avant d’en ouvrir un autre.');

  const inventory = await Inventory.create({
    reference: 'TMP',
    userId: user.id,
    location,
    scope: payload.scope || '',
    note: payload.note || '',
    status: STATUS.DRAFT,
    linesCount: 0,
    createdAt: new Date()
  }, { transaction });

  // Seuls les lots du magasin concerné sont comptés (le dépôt et la pharmacie
  // se comptent séparément, avec leurs propres fiches de stock).
  const lots = await Lot.findAll({ where: { location }, order: [['id', 'ASC']], transaction });
  const products = await Product.findAll({ transaction });
  const byId = new Map(products.map(p => [p.id, p]));
  for (const lot of lots) {
    await InventoryLine.create({
      inventoryId: inventory.id,
      productId: lot.productId,
      lotId: lot.id,
      theoretical: Number(lot.quantity),
      physical: null,
      reason: '',
      productVersion: byId.get(lot.productId)?.version ?? 0
    }, { transaction });
  }
  await inventory.update({
    reference: makeReference('INVENTORY', inventory.id),
    linesCount: lots.length
  }, { transaction });

  await log({
    userId: user.id, action: 'OPEN', entity: 'INVENTORY', entityId: inventory.id,
    after: { reference: inventory.reference, lots: lots.length, scope: inventory.scope, location }
  }, transaction);
  return inventory;
}

export async function inventoryDetail(id, transaction) {
  const inventory = await Inventory.findByPk(id, { transaction });
  ensure(inventory, 'Inventaire introuvable.', 404);
  const lines = await InventoryLine.findAll({ where: { inventoryId: id }, order: [['id', 'ASC']], transaction });
  return { ...inventory.toJSON(), lines: lines.map(line => line.toJSON()) };
}

/**
 * Valide l'inventaire : contrôle que rien n'a bougé depuis l'ouverture
 * (versions produit et nombre de lots), crée l'ajustement et ses mouvements.
 */
export async function validateInventory(id, payload, user, transaction) {
  const inventory = await Inventory.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(inventory, 'Inventaire introuvable.', 404);
  ensure(inventory.status === STATUS.DRAFT, 'Inventaire déjà validé, abandonné ou annulé.');

  const lines = await InventoryLine.findAll({ where: { inventoryId: id }, order: [['id', 'ASC']], transaction });
  ensure(lines.length > 0, 'Aucun lot à inventorier.');
  // Le contrôle porte sur les lots DU MAGASIN compté : un transfert vers l'autre
  // magasin ne doit pas invalider l'inventaire en cours.
  const lotCount = await Lot.count({ where: { location: inventory.location }, transaction });
  ensure(lotCount === lines.length,
    'De nouveaux lots ont été créés dans ce magasin depuis l’ouverture de l’inventaire. L’abandonner et le recommencer.', 409);
  ensure(payload.lines.length === lines.length, `Saisir tous les lots de l’inventaire (${lines.length} attendus).`);
  ensure(new Set(payload.lines.map(l => l.id)).size === lines.length, 'Lignes d’inventaire en double.');

  const settings = await getSettings(transaction);
  const adjustment = await Adjustment.create({
    reference: 'TMP',
    inventoryId: inventory.id,
    userId: user.id,
    reason: `Ajustement d’inventaire ${inventory.reference} (${LOCATION_LABELS[inventory.location]})`,
    note: payload.note || inventory.note || '',
    costTotal: '0.000000',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  // Contrôle global avant le premier mouvement : aucun relevé ne doit être périmé.
  const products = new Map();
  for (const line of lines) {
    const product = await Product.findByPk(line.productId, { transaction });
    ensure(product, 'Médicament introuvable.', 404);
    products.set(product.id, product);
    ensure(product.version === line.productVersion,
      `Stock de « ${product.name} » modifié depuis l’ouverture de l’inventaire. L’abandonner et le recommencer.`, 409);
  }

  const movementLines = [];
  let costTotal = D(0);

  for (const line of lines) {
    const entry = payload.lines.find(l => l.id === line.id);
    ensure(entry, 'Ligne d’inventaire manquante.');
    const gap = Number(entry.physical) - Number(line.theoretical);
    ensure(gap === 0 || String(entry.reason || '').trim().length >= 3,
      'Chaque écart d’inventaire doit être justifié (motif et remarque, 3 caractères minimum) — RG17.');

    await line.update({
      physical: entry.physical, reason: entry.reason || '', countedAt: new Date()
    }, { transaction });

    if (gap !== 0) {
      const lot = await Lot.findByPk(line.lotId, { transaction, lock: transaction.LOCK.UPDATE });
      const product = products.get(line.productId);
      const cost = retainedCost(product, lot, settings.valuation);
      await AdjustmentLine.create({
        adjustmentId: adjustment.id, productId: line.productId, lotId: line.lotId,
        quantity: gap, unitCost: cost, gapReason: entry.reason || ''
      }, { transaction });
      movementLines.push({ productId: line.productId, lotId: line.lotId, location: inventory.location,
        quantity: gap, unitCost: cost, reason: entry.reason || '' });
      costTotal = costTotal.add(D(cost).mul(gap));
    }
  }

  if (movementLines.length) {
    await applyMovements({
      documentType: 'ADJUSTMENT', documentId: adjustment.id, userId: user.id, kind: 'ADJUSTMENT',
      reason: `Inventaire ${inventory.reference}`, lines: movementLines
    }, transaction);
  }

  await adjustment.update({
    reference: makeReference('ADJUSTMENT', adjustment.id), costTotal: money(costTotal)
  }, { transaction });
  await inventory.update({
    status: STATUS.VALIDATED, validatedAt: new Date(), validatedBy: user.id, adjustmentId: adjustment.id
  }, { transaction });

  await log({
    userId: user.id, action: 'VALIDATE', entity: 'INVENTORY', entityId: inventory.id,
    after: {
      reference: inventory.reference, lots: lines.length,
      ecarts: movementLines.length, valeurEcart: money(costTotal), adjustment: adjustment.reference
    }
  }, transaction);

  return { inventory, adjustment, gaps: movementLines.length, value: money(costTotal) };
}

export async function abandonInventory(id, reason, user, transaction) {
  const inventory = await Inventory.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(inventory, 'Inventaire introuvable.', 404);
  ensure(inventory.status === STATUS.DRAFT, 'Seul un inventaire en cours peut être abandonné.');
  const before = publicSnapshot(inventory.toJSON());
  await inventory.update({ status: STATUS.ABANDONED }, { transaction });
  await log({
    userId: user.id, action: 'ABANDON', entity: 'INVENTORY', entityId: inventory.id,
    before, after: { ...publicSnapshot(inventory.toJSON()), reason }
  }, transaction);
  return inventory;
}

/** Blocage / déblocage d'un lot (quarantaine, retrait, contrôle qualité). */
export async function setLotStatus(lotId, values, user, transaction) {
  const lot = await Lot.findByPk(lotId, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(lot, 'Lot introuvable.', 404);
  const before = publicSnapshot(lot.toJSON());
  await lot.update({
    status: values.status,
    blockReason: values.status === STATUS.BLOCKED ? values.reason.trim() : null
  }, { transaction });
  await log({
    userId: user.id, action: 'LOT_STATUS', entity: 'LOT', entityId: lot.id,
    before, after: { ...publicSnapshot(lot.toJSON()), reason: values.reason }
  }, transaction);
  return lot;
}

/** Liste des inventaires avec écart total (rapports et écran Inventaires). */
export async function listInventories(transaction) {
  const inventories = await Inventory.findAll({ order: [['id', 'DESC']], limit: 200, transaction });
  return inventories.map(inventory => inventory.toJSON());
}
