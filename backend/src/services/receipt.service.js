// ============================================================================
// Réceptions fournisseur (§9.4, RG03, RG12) : la marchandise livrée entre
// TOUJOURS au DÉPÔT (jamais directement au comptoir). Frais répartis, création
// ou mise à jour des lots, recalcul du coût de revient, du CMP et du prix de
// vente. Le passage vers la pharmacie se fait ensuite par un TRANSFERT.
// ============================================================================
import { Receipt, ReceiptLine, Lot, Product, Supplier } from '../models/index.js';
import { D, money, distributeFees } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { normalizeLotNumber } from '../utils/sanitize.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, VALUATION, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements } from './stock.service.js';
import { recomputeProductCosting } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log, publicSnapshot } from './audit.service.js';

/** Vérifications de cohérence des dates d'un lot (RG02, §16). */
function validateDates(line) {
  // Date d'expiration obligatoire (2.7.1) : c'est elle qui alimente l'alerte de
  // péremption et l'ordre de sortie FEFO. Un lot sans date n'entre plus.
  ensure(line.expiresOn, `Lot ${line.number} : la date d'expiration est obligatoire.`);
  ensure(line.receivedOn <= today(), 'La date de réception ne peut pas être future.');
  ensure(line.expiresOn >= today(),
    `Le lot ${line.number} est déjà expiré : un produit périmé ne peut pas être réceptionné (RG09).`);
  ensure(!line.manufacturedOn || !line.expiresOn || line.manufacturedOn <= line.expiresOn,
    `Lot ${line.number} : la date de fabrication doit précéder la date d'expiration.`);
  ensure(!line.manufacturedOn || line.manufacturedOn <= line.receivedOn,
    `Lot ${line.number} : la date de fabrication est postérieure à la réception.`);
}

/**
 * Enregistre une réception.
 * L'idempotence vient de requestKey : un double clic ou un réseau instable
 * ne peut pas créer deux réceptions ni doubler le stock.
 */
export async function createReceipt(payload, user, transaction) {
  const existing = await Receipt.findOne({ where: { requestKey: payload.requestKey }, transaction });
  if (existing) {
    ensure(existing.userId === user.id, 'Clé de requête déjà utilisée par un autre utilisateur.', 409);
    return existing;
  }
  const settings = await getSettings(transaction);
  const supplier = await Supplier.findByPk(payload.supplierId, { transaction });
  ensure(supplier && supplier.active, 'Fournisseur absent ou inactif.');
  // Toute réception alimente le dépôt : la pharmacie est réapprovisionnée par transfert.
  const location = 'DEPOT';

  // Répartition des frais directement attribuables (transport, service, manutention).
  const lines = distributeFees(payload.lines.map(line => ({ ...line, number: normalizeLotNumber(line.number) })), payload.fees);
  lines.forEach(validateDates);
  ensure(new Set(lines.map(l => `${l.productId}|${l.number}`)).size === lines.length,
    'Le même numéro de lot apparaît deux fois pour le même médicament dans cette réception.');

  const receipt = await Receipt.create({
    reference: `TMP-${payload.requestKey}`,
    location,
    supplierId: payload.supplierId,
    userId: user.id,
    fees: money(payload.fees || 0),
    costTotal: '0.000000',
    note: payload.note || '',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  const movementLines = [];
  const touchedProducts = new Set();
  let costTotal = D(0);

  for (const line of lines) {
    const product = await Product.findByPk(line.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(product, `Médicament introuvable (ligne ${line.number}).`, 404);
    ensure(product.active, `Médicament « ${product.name} » inactif : réception refusée.`);

    // Un lot identique (même médicament, même fournisseur, même numéro, même magasin)
    // est complété, mais uniquement si dates et coûts concordent : sinon la réception
    // est refusée (un numéro de lot mal recopié doit se voir tout de suite).
    let lot = await Lot.findOne({
      where: { productId: product.id, supplierId: payload.supplierId, number: line.number, location },
      transaction, lock: transaction.LOCK.UPDATE
    });
    if (lot) {
      ensure(lot.status === STATUS.AVAILABLE, `Lot ${line.number} bloqué : lever le blocage avant de le compléter.`);
      ensure(lot.expiresOn === line.expiresOn && lot.manufacturedOn === line.manufacturedOn,
        `Lot ${line.number} déjà enregistré avec d'autres dates. Vérifier le numéro de lot ou créer le lot avec une référence distincte.`);
      ensure(D(lot.purchasePrice).eq(line.purchasePrice),
        `Lot ${line.number} déjà enregistré à un autre prix d'achat (${lot.purchasePrice}). Traiter séparément.`);
      await lot.update({
        receivedQuantity: Number(lot.receivedQuantity) + Number(line.quantity),
        allocatedFees: money(D(lot.allocatedFees).add(line.allocatedFees)),
        unitCost: money(D(lot.purchasePrice).add(D(lot.allocatedFees).add(line.allocatedFees)).div(Number(lot.receivedQuantity) + Number(line.quantity)))
      }, { transaction });
    } else {
      lot = await Lot.create({
        productId: product.id, supplierId: payload.supplierId, number: line.number, location,
        receivedOn: line.receivedOn, manufacturedOn: line.manufacturedOn, expiresOn: line.expiresOn,
        quantity: 0, receivedQuantity: line.quantity,
        purchasePrice: money(line.purchasePrice), allocatedFees: line.allocatedFees,
        unitCost: line.unitCost, status: STATUS.AVAILABLE
      }, { transaction });
    }

    await ReceiptLine.create({
      receiptId: receipt.id, productId: product.id, lotId: lot.id,
      number: line.number, quantity: line.quantity, purchasePrice: money(line.purchasePrice),
      allocatedFees: line.allocatedFees, unitCost: line.unitCost,
      receivedOn: line.receivedOn, expiresOn: line.expiresOn, manufacturedOn: line.manufacturedOn
    }, { transaction });

    movementLines.push({ productId: product.id, lotId: lot.id, quantity: Number(line.quantity), unitCost: line.unitCost });
    costTotal = costTotal.add(D(line.unitCost).mul(line.quantity));
    touchedProducts.add(product.id);
  }

  // Entrées de stock + version produit (protection contre les saisies concurrentes).
  await applyMovements({
    documentType: 'RECEIPT', documentId: receipt.id, userId: user.id, kind: 'RECEIPT',
    reason: `Réception ${receipt.reference} — ${supplier ? supplier.name : ''} (entrée au ${LOCATION_LABELS.DEPOT})`,
    lines: movementLines.map(line => ({ ...line, location }))
  }, transaction);

  // Coût de revient, CMP et prix de vente recalculés côté serveur (RG12, RG13, RG21).
  for (const productId of touchedProducts) {
    await recomputeProductCosting(productId, settings, {
      userId: user.id, origin: 'RECEPTION', reason: `Réception ${receipt.reference}`
    }, transaction);
  }

  await receipt.update({ reference: makeReference('RECEIPT', receipt.id), costTotal: money(costTotal) }, { transaction });

  await log({
    userId: user.id, action: 'VALIDATE', entity: 'RECEIPT', entityId: receipt.id,
    after: { reference: receipt.reference, supplierId: payload.supplierId, location, costTotal: money(costTotal), lines: lines.length }
  }, transaction);

  return receipt;
}

/** Prix de vente indicatif appliqué (information affichée après réception). */
export async function receiptSummary(receiptId, transaction) {
  const lines = await ReceiptLine.findAll({ where: { receiptId }, transaction });
  return lines.map(line => publicSnapshot(line.toJSON()));
}

export const valuationHint = valuation => (valuation === VALUATION.CMP
  ? 'Coût retenu : CMP du médicament'
  : 'Coût retenu : coût de revient réel du lot');