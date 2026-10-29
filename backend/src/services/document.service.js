// ============================================================================
// Registre des documents porteurs de mouvements : réception (dépôt), transfert
// (dépôt → pharmacie), vente, perte/don et ajustement d'inventaire.
// Gère aussi l'annulation tracée (RG19) : rien n'est jamais supprimé.
// ============================================================================
import {
  Receipt, ReceiptLine, Transfer, TransferLine, Sale, SaleLine, Loss, LossLine,
  Adjustment, AdjustmentLine, Movement, MovementSuperseded, Lot, Product
} from '../models/index.js';
import { money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { STATUS, DOCUMENT_LABELS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements, movementsOf, ensureReversalPossible } from './stock.service.js';
import { recomputeProductCosting } from './pricing.service.js';
import { log, publicSnapshot } from './audit.service.js';

/** Un document = un enregistrement d'en-tête + ses lignes + ses mouvements. */
export const DOCUMENTS = {
  RECEIPT: { model: Receipt, lineModel: ReceiptLine, foreignKey: 'receiptId', label: 'Réception', lineFields: ['productId', 'lotId', 'quantity', 'purchasePrice', 'allocatedFees', 'unitCost'] },
  TRANSFER: { model: Transfer, lineModel: TransferLine, foreignKey: 'transferId', label: 'Transfert', lineFields: ['productId', 'fromLotId', 'toLotId', 'quantity', 'unitCost'] },
  SALE: { model: Sale, lineModel: SaleLine, foreignKey: 'saleId', label: 'Vente', lineFields: ['productId', 'lotId', 'quantity', 'saleUnit', 'saleQuantity', 'unitFactor', 'unitPrice', 'unitCost', 'marginRate', 'margin'] },
  LOSS: { model: Loss, lineModel: LossLine, foreignKey: 'lossId', label: 'Perte / don', lineFields: ['productId', 'lotId', 'quantity', 'unitCost'] },
  ADJUSTMENT: { model: Adjustment, lineModel: AdjustmentLine, foreignKey: 'adjustmentId', label: 'Ajustement d’inventaire', lineFields: ['productId', 'lotId', 'quantity', 'unitCost', 'gapReason'] }
};

export function documentRegistry(kind) {
  const entry = DOCUMENTS[kind];
  ensure(entry, 'Type de document inconnu.', 404);
  return entry;
}

export async function findDocument(kind, id, transaction, lock = false) {
  const { model } = documentRegistry(kind);
  const document = await model.findByPk(id, { transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  ensure(document, 'Document introuvable.', 404);
  return document;
}

export async function documentLines(kind, id, transaction) {
  const { lineModel, foreignKey } = documentRegistry(kind);
  return lineModel.findAll({ where: { [foreignKey]: id }, order: [['id', 'ASC']], transaction });
}

// 2.7.79 — « Servi par » saisi à la caisse : la note d'une vente peut porter
// le marqueur ⟦Servi par : X⟧ en tête (utils/serviPar.js). On le SÉPARE pour
// l'affichage : la remarque rendue est nettoyée, le nom voyage à part.
import { decortiquerNote } from '../utils/serviPar.js';

const shape = (document, kind) => {
  const servi = kind === 'SALE' ? decortiquerNote(document.note) : { servedBy: '', note: null };
  return {
  kind,
  reference: document.reference,
  id: document.id,
  date: document.createdAt,
  userId: document.userId,
  location: document.location ?? (kind === 'RECEIPT' ? 'DEPOT' : kind === 'SALE' ? 'PHARMACY' : null),
  fromLocation: document.fromLocation ?? null,
  toLocation: document.toLocation ?? null,
  supplierId: document.supplierId ?? null,
  status: document.status,
  reason: document.reason ?? '',
  note: kind === 'SALE' ? servi.note : (document.note ?? ''),
  // 2.7.79 — nom « Servi par » saisi à la caisse ('' = le compte connecté).
  servedBy: servi.servedBy,
  customerName: document.customerName ?? '',
  // 2.7.35 — hôpital : le carnet éventuel (null = client tsotra du comptoir).
  patientId: document.patientId ?? null,
  medicalStaffId: document.medicalStaffId ?? null,
  invoiceRef: document.invoiceRef ?? '',
  inventoryId: document.inventoryId ?? null,
  total: document.total ?? '0.000000',
  costTotal: document.costTotal ?? '0.000000',
  margin: document.margin ?? '0.000000',
  fees: document.fees ?? '0.000000',
  cancelledAt: document.cancelledAt ?? null,
  cancelReason: document.cancelReason ?? null
  };
};

/** Libellé lisible du magasin d'un document (utilisé par les écrans). */
export const documentLocation = document =>
  document.location ? LOCATION_LABELS[document.location] : null;

/** Liste fusionnée des documents récents (tableau de bord, historiques, recherche). */
export async function listRecent(limit = 300, transaction) {
  const results = await Promise.all(Object.keys(DOCUMENTS).map(async kind => {
    const { model } = DOCUMENTS[kind];
    const rows = await model.findAll({ order: [['id', 'DESC']], limit, transaction });
    return rows.map(row => shape(row.toJSON(), kind));
  }));
  const documents = results.flat()
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
    .slice(0, limit);

  // 2.7.31 — les listes « Réceptions » et « Transferts » affichent directement
  // le contenu (médicaments, quantités, coût unitaire) : chaque document
  // RECEIPT / TRANSFER emporte ses lignes synthétiques, chargées en deux
  // requêtes groupées (pas de requête par ligne à l'écran).
  const joindre = async (kindDocuments, lineModel, foreignKey) => {
    if (!kindDocuments.length) return;
    const lignes = await lineModel.findAll({
      where: { [foreignKey]: kindDocuments.map(doc => doc.id) }, transaction
    });
    const parDocument = new Map();
    for (const ligne of lignes) {
      const cle = ligne[foreignKey];
      if (!parDocument.has(cle)) parDocument.set(cle, []);
      // 2.7.49 — « manufacturer » existe sur les lignes de RÉCEPTION (lot par
      // lot) ; il est vide/ignoré sur les lignes de transfert.
      parDocument.get(cle).push({
        productId: ligne.productId, quantity: ligne.quantity, unitCost: ligne.unitCost,
        manufacturer: ligne.manufacturer || ''
      });
    }
    for (const doc of kindDocuments) doc.lines = parDocument.get(doc.id) || [];
  };
  await joindre(documents.filter(doc => doc.kind === 'RECEIPT'), ReceiptLine, 'receiptId');
  await joindre(documents.filter(doc => doc.kind === 'TRANSFER'), TransferLine, 'transferId');
  // 2.7.37 — l'historique « clients tsotra » affiche, par vente, le(s)
  // médicament(s) vendu(s) avec quantité et prix unitaire (sans marge) : les
  // lignes de SALE sont embarquées de la façon (nom résolu côté écran).
  const ventes = documents.filter(doc => doc.kind === 'SALE');
  if (ventes.length) {
    const lignes = await SaleLine.findAll({ where: { saleId: ventes.map(doc => doc.id) }, transaction });
    const parVente = new Map();
    for (const ligne of lignes) {
      if (!parVente.has(ligne.saleId)) parVente.set(ligne.saleId, []);
      parVente.get(ligne.saleId).push({
        productId: ligne.productId, saleUnit: ligne.saleUnit || 'BOX',
        saleQuantity: ligne.saleQuantity != null ? ligne.saleQuantity : null,
        quantity: ligne.quantity, unitPrice: ligne.unitPrice
      });
    }
    for (const doc of ventes) doc.lines = parVente.get(doc.id) || [];
  }
  return documents;
}

export async function documentDetail(kind, id, transaction) {
  const document = await findDocument(kind, id, transaction);
  const lines = await documentLines(kind, id, transaction);
  const movements = await movementsOf(kind, id, transaction);
  return { ...shape(document.toJSON(), kind), lines: lines.map(line => line.toJSON()), movements: movements.map(m => m.toJSON()) };
}

/**
 * Annulation tracée (RG19) : jamais de suppression.
 *  1. refus si le stock n'est plus disponible sur le lot d'origine ;
 *  2. création des mouvements inverses (kind = CANCEL) ;
 *  3. correction des données dérivées (lots reçus, coûts recalculés) ;
 *  4. statut « CANCELLED » + motif + journal d'audit.
 */
export async function cancelDocument(kind, id, reason, user, transaction) {
  documentRegistry(kind);
  const settings = await (await import('./settings.service.js')).getSettings(transaction);
  const document = await findDocument(kind, id, transaction, true);
  ensure(document.status === STATUS.VALIDATED, 'Document déjà annulé ou non validé.');
  ensure(typeof reason === 'string' && reason.trim().length >= 3, 'Motif d’annulation obligatoire (3 caractères minimum).');

  const movements = await movementsOf(kind, id, transaction);
  ensure(movements.length > 0, 'Aucun mouvement à annuler pour ce document.');
  await ensureReversalPossible(movements, transaction);

  const before = publicSnapshot(document.toJSON());
  const productIds = [...new Set(movements.map(m => m.productId))];

  // 1. Mouvements inverses, dans l'ordre inverse de création.
  await applyMovements({
    documentType: kind,
    documentId: document.id,
    userId: user.id,
    kind: 'CANCEL',
    reason: `Annulation ${document.reference} : ${reason.trim()}`,
    lines: movements.slice().reverse().map(movement => ({
      productId: movement.productId,
      lotId: movement.lotId,
      location: movement.location,
      quantity: -Number(movement.quantity),
      unitCost: movement.unitCost
    }))
  }, transaction);

  // 2.7.91/2.7.92 — REGISTRE NET (« safidy A ») : un document ANNULÉ
  // disparaît des colonnes Entrées/Sorties/Stock final des fiches de stock —
  // son écriture d'origine ET ses contre-mouvements CANCEL (créés juste
  // au-dessus) sont marqués « superseded ». ⚠ 2.7.92 : la marque N'EST PAS
  // un UPDATE (le trigger « movements_immutable », RG19, l'interdit) — on
  // INSÈRE dans la table séparée « movement_superseded » (INSERT only ;
  // ignoreDuplicates → rejouable). Aucune ligne supprimée ni modifiée : le
  // journal « Mouvements » et l'audit conservent l'histoire complète.
  const mvtSupplantes = await Movement.findAll({
    where: { documentType: kind, documentId: id }, attributes: ['id'], transaction
  });
  await MovementSuperseded.bulkCreate(
    mvtSupplantes.map(mvt => ({ movementId: mvt.id })),
    { transaction, ignoreDuplicates: true }
  );

  // 2. Conséquences propres au type de document.
  if (kind === 'RECEIPT') {
    const lines = await documentLines(kind, id, transaction);
    for (const line of lines) {
      const lot = await Lot.findByPk(line.lotId, { transaction, lock: transaction.LOCK.UPDATE });
      if (lot) {
        await lot.update({
          receivedQuantity: Math.max(0, Number(lot.receivedQuantity) - Number(line.quantity))
        }, { transaction });
      }
    }
    // 3. Le CMP et le prix de vente sont recalculés après retrait de la réception.
    for (const productId of productIds) {
      await recomputeProductCosting(productId, settings, {
        userId: user.id, origin: 'ANNULATION', reason: `Annulation de la réception ${document.reference}`
      }, transaction);
    }
  }

  if (kind === 'TRANSFER') {
    // Un transfert annulé ne doit pas laisser de lot « fantôme » vide dans la
    // pharmacie : les quantités reviennent au dépôt par les mouvements inverses.
    const lines = await documentLines(kind, id, transaction);
    for (const line of lines) {
      if (!line.toLotId) continue;
      const cible = await Lot.findByPk(line.toLotId, { transaction, lock: transaction.LOCK.UPDATE });
      if (cible) {
        await cible.update({
          receivedQuantity: Math.max(0, Number(cible.receivedQuantity) - Number(line.quantity))
        }, { transaction });
      }
    }
  }

  if (kind === 'ADJUSTMENT' && document.inventoryId) {
    await (await import('../models/index.js')).Inventory.update(
      { status: STATUS.CANCELLED },
      { where: { id: document.inventoryId }, transaction }
    );
  }

  await document.update({
    status: STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: user.id, cancelReason: reason.trim()
  }, { transaction });

  await log({
    userId: user.id, action: 'CANCEL', entity: kind, entityId: document.id,
    before, after: publicSnapshot(document.toJSON())
  }, transaction);

  return document;
}

export { Movement, Product, Lot };
export const documentLabel = kind => DOCUMENT_LABELS[kind] || kind;