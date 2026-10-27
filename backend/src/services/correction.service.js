// ============================================================================
// 2.7.34 — teboka ③ : CORRECTION D'UNE RÉCEPTION (workflow dépôt → admin).
//
// Une réception VALIDÉE mais erronée ne se modifie pas de force : le dépôt
// dépose une DEMANDE (motif + nouvelles valeurs, mêmes règles qu'une
// réception) ; seul un ADMINISTRATEUR l'applique ou la refuse.
//
// Garde-fou absolu, vérifié DEUX FOIS (à la demande ET à la validation) :
// aucun lot de la réception ne doit avoir bougé depuis (transfert, vente,
// perte, inventaire, complétage par une autre réception ni blocage). Sinon la
// correction est refusée : le chemin devient l'annulation tracée du document
// (RG19), qui refuse déjà de casser le stock aval.
//
// À la validation, dans la MÊME transaction : l'ancienne version est
// DÉFAITE SANS SUPPRESSION (contre-mouvements tracés CANCEL, quantités
// reçues et frais rabattus — RG19 : le journal des mouvements est
// immuable), puis RECRÉÉE avec les valeurs corrigées (dates re-contrôlées,
// frais répartis, unité reportée, CMP/prix recalculés pour les produits
// anciens comme nouveaux). Rien ne diverge : les stocks restent
// exactement la somme des mouvements, et l'ancienne version reste lisible
// dans l'historique du document.
// ============================================================================
import { Op } from 'sequelize';
import { Receipt, ReceiptLine, ReceiptCorrection, Lot, Product, Supplier, Movement, User } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { reference as makeReference } from '../utils/ids.js';
import { normalizeLotNumber } from '../utils/sanitize.js';
import { STATUS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements } from './stock.service.js';
import { recomputeProductCosting } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { validateDates, resoudreLot, appliquerFraisAchat, totalFraisAchat } from './receipt.service.js';
import { log, publicSnapshot } from './audit.service.js';

export const CORRECTION_STATUS = ['PENDING', 'VALIDATED', 'REFUSED'];

/**
 * Garde « réception encore intacte » : lignes chargées + zéro mouvement
 * étranger à la réception sur ses lots. Renvoie lignes et lots pour réutilisation.
 */
async function assertReceptionIntacte(receipt, transaction) {
  ensure(receipt, 'Réception introuvable.', 404);
  ensure(receipt.status === STATUS.VALIDATED,
    'Seule une réception validée se corrige (une réception annulée ne bouge plus).');
  const lignes = await ReceiptLine.findAll({ where: { receiptId: receipt.id }, transaction });
  ensure(lignes.length > 0, 'Réception sans ligne : rien à corriger.');
  const lotIds = [...new Set(lignes.map(ligne => ligne.lotId))];
  const lots = await Lot.findAll({ where: { id: lotIds }, transaction });
  ensure(lots.length === lotIds.length, 'Données incohérentes : un lot de la réception manque.');
  const lotBloque = lots.find(lot => lot.status !== STATUS.AVAILABLE);
  ensure(!lotBloque, `Le lot ${lotBloque?.number} est bloqué : débloquez-le avant de corriger la réception.`);
  const mouvementsEtrangers = await Movement.count({
    where: {
      lotId: lotIds,
      [Op.or]: [
        { documentType: { [Op.ne]: 'RECEIPT' } },
        { documentType: 'RECEIPT', documentId: { [Op.ne]: receipt.id } }
      ]
    },
    transaction
  });
  ensure(mouvementsEtrangers === 0,
    'Cette réception ne peut plus être corrigée : un de ses lots a déjà bougé '
    + '(transfert, vente, perte, inventaire ou complétage par une autre réception). '
    + 'Le chemin restant est l’annulation tracée du document par un administrateur.');
  return { lignes, lots };
}

/* Les lignes proposées sont préparées comme pour une création : numéros
 normalisés, frais AUTOMATIQUES (2.7.47 — feesRate % du PA, Paramètres, jamais
 de champ manuel), dates contrôlées — la demande refusée reste lisible telle
 quelle, la demande validée s'applique telle quelle. */
function preparerLignes(payload, settings) {
  const lines = appliquerFraisAchat(
    payload.lines.map(line => ({ ...line, number: normalizeLotNumber(line.number) })),
    settings.feesRate
  );
  lines.forEach(validateDates);
  return lines;
}

/** La forme publique d'une demande (avec les noms, jamais seulement les ids). */
function formePublique(correction, receiptsParId, usersParId) {
  const r = correction.toJSON ? correction.toJSON() : correction;
  return {
    ...r,
    receiptReference: receiptsParId.get(r.receiptId)?.reference || `REC-${r.receiptId}`,
    proposedByName: usersParId.get(r.proposedBy)?.name || `#${r.proposedBy}`,
    decidedByName: r.decidedBy ? (usersParId.get(r.decidedBy)?.name || `#${r.decidedBy}`) : ''
  };
}

/** Liste les demandes de correction (les plus récentes d'abord). */
export async function listerCorrections({ status = null }, transaction) {
  ensure(!status || CORRECTION_STATUS.includes(status), 'État de correction inconnu.');
  const rows = await ReceiptCorrection.findAll({
    where: status ? { status } : {},
    order: [['id', 'DESC']],
    limit: 100,
    transaction
  });
  const receiptIds = [...new Set(rows.map(r => r.receiptId))];
  const userIds = [...new Set(rows.flatMap(r => [r.proposedBy, r.decidedBy].filter(Boolean)))];
  const [receipts, users] = await Promise.all([
    Receipt.findAll({ where: { id: receiptIds }, transaction }),
    User.findAll({ where: { id: userIds }, transaction })
  ]);
  const receiptsParId = new Map(receipts.map(r => [r.id, r.toJSON()]));
  const usersParId = new Map(users.map(u => [u.id, u.toJSON()]));
  return rows.map(row => formePublique(row, receiptsParId, usersParId));
}

/** Le détail d'une demande (comparaison à l'écran). */
export async function detailCorrection(id, transaction) {
  const correction = await ReceiptCorrection.findByPk(id, { transaction });
  ensure(correction, 'Demande de correction introuvable.', 404);
  const receipt = await Receipt.findByPk(correction.receiptId, { transaction });
  const lignesActuelles = await ReceiptLine.findAll({
    where: { receiptId: correction.receiptId }, order: [['id', 'ASC']], transaction
  });
  const users = await User.findAll({
    where: { id: [correction.proposedBy, correction.decidedBy].filter(Boolean) }, transaction
  });
  return {
    ...formePublique(correction,
      new Map(receipt ? [[receipt.id, receipt.toJSON()]] : []),
      new Map(users.map(u => [u.id, u.toJSON()]))),
    actuelles: lignesActuelles.map(l => l.toJSON()),
    receipt: receipt ? publicSnapshot(receipt.toJSON()) : null
  };
}

/**
 * Le dépôt (ou l'admin) PROPOSE une correction : réception intacte + aucun
 * autre dossier en attente. La réception ne change PAS à cette étape.
 */
export async function proposerCorrection(receiptId, payload, user, transaction) {
  const receipt = await Receipt.findByPk(receiptId, { transaction, lock: transaction.LOCK.UPDATE });
  await assertReceptionIntacte(receipt, transaction);
  const dejaEnAttente = await ReceiptCorrection.findOne({
    where: { receiptId, status: 'PENDING' }, transaction
  });
  ensure(!dejaEnAttente, `Une correction est déjà en attente pour cette réception (${dejaEnAttente?.reference || ''}) : attendez la décision de l’administrateur.`);
  const supplier = await Supplier.findByPk(payload.supplierId, { transaction });
  ensure(supplier && supplier.active, 'Fournisseur absent ou inactif.');
  const settings = await getSettings(transaction);
  const lines = preparerLignes(payload, settings);

  const correction = await ReceiptCorrection.create({
    reference: 'TMP',
    receiptId,
    proposedBy: user.id,
    payload: {
      supplierId: payload.supplierId,
      // Frais enregistrés = total AUTOMATIQUE (feesRate % du PA, 2.7.47) ;
      // le champ manuel historique n'entre plus dans le coût.
      fees: totalFraisAchat(lines),
      note: payload.note || '',
      lines
    },
    reason: payload.reason.trim(),
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date()
  }, { transaction });
  await correction.update({ reference: makeReference('CORRECTION', correction.id) }, { transaction });

  await log({
    userId: user.id, action: 'PROPOSE', entity: 'RECEIPT_CORRECTION', entityId: correction.id,
    after: { reference: correction.reference, receiptId, reason: payload.reason.trim(), lignes: lines.length }
  }, transaction);
  return correction;
}

/**
 * L'administrateur TRANCHE : validation (correction appliquée) ou refus motivé.
 */
export async function deciderCorrection(id, { decision, note }, user, transaction) {
  const correction = await ReceiptCorrection.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(correction, 'Demande de correction introuvable.', 404);
  ensure(correction.status === 'PENDING', 'Cette demande a déjà reçu une décision.');

  // ── REFUS : motivé, tracé, rien ne change d'autre. ──────────────────────
  if (decision === 'REFUSE') {
    ensure((note || '').trim().length >= 3, 'Expliquez le refus au dépôt (3 caractères minimum).');
    await correction.update({
      status: 'REFUSED', decidedBy: user.id, decidedAt: new Date(),
      decisionNote: note.trim(), updatedAt: new Date()
    }, { transaction });
    await log({
      userId: user.id, action: 'REFUSE', entity: 'RECEIPT_CORRECTION', entityId: id,
      after: { reference: correction.reference, decisionNote: note.trim() }
    }, transaction);
    return { correction, appliques: false };
  }

  // ── VALIDATION : ré-application des gardes, puis échange transactionnel. ──
  const receipt = await Receipt.findByPk(correction.receiptId, { transaction, lock: transaction.LOCK.UPDATE });
  const { lignes: anciennesLignes, lots: anciensLots } = await assertReceptionIntacte(receipt, transaction);
  const settings = await getSettings(transaction);
  const payload = correction.payload;
  const supplier = await Supplier.findByPk(payload.supplierId, { transaction });
  ensure(supplier && supplier.active, 'Fournisseur absent ou inactif.');
  payload.lines.forEach(validateDates); // re-contrôle à la date de décision
  const before = {
    receipt: publicSnapshot(receipt.toJSON()),
    lines: anciennesLignes.map(l => publicSnapshot(l.toJSON ? l.toJSON() : l))
  };
  const anciensProduits = new Set(anciennesLignes.map(l => l.productId));

  // 1) « Défaire » SANS SUPPRIMER L'HISTOIRE : le journal des mouvements est
  //    immuable (RG19). Comme pour l'annulation d'un document, on écrit les
  //    CONTRE-MOUVEMENTS de l'ancienne version (kind CANCEL), on rabat la
  //    quantité reçue des anciens lots, et seules les LIGNES détaillées (qui
  //    ne sont pas des mouvements) sont réécrites. Les anciens lots restent à
  //    zéro dans l'historique, exactement comme après une annulation.
  const mouvementsRecus = await Movement.findAll({
    where: { documentType: 'RECEIPT', documentId: receipt.id }, transaction
  });
  const anciensLotsParId = new Map(anciensLots.map(lot => [lot.id, lot]));
  await applyMovements({
    documentType: 'RECEIPT', documentId: receipt.id, userId: user.id, kind: 'CANCEL',
    reason: `Correction ${correction.reference} : version précédente de la réception ${receipt.reference} remplacée`,
    lines: mouvementsRecus.slice().reverse().map(mvt => ({
      productId: mvt.productId, lotId: mvt.lotId, location: mvt.location,
      quantity: -Number(mvt.quantity), unitCost: mvt.unitCost
    }))
  }, transaction);
  await ReceiptLine.destroy({ where: { receiptId: receipt.id }, transaction });
  for (const ligne of anciennesLignes) {
    const lot = anciensLotsParId.get(ligne.lotId);
    if (lot) {
      const reste = Math.max(0, Number(lot.receivedQuantity) - Number(ligne.quantity));
      await lot.update({
        receivedQuantity: reste,
        // Lot entièrement vidé par la correction : ses frais répartis
        // repartent aussi, sinon ils se doubleraient si le lot est réutilisé.
        allocatedFees: reste === 0 ? 0 : lot.allocatedFees
      }, { transaction });
    }
  }

  // 2) Refaire : règles de création identiques (dates, unité reportée, frais,
  //    complétage d'un lot existant le cas échéant — resoudreLot réutilise le
  //    MÊME lot si seule la quantité change ; un prix ou des dates différents
  //    créent un lot distinct numéroté, comme pour toute réception).
  const ajustements = [];
  const movementLines = [];
  const nouveauxProduits = new Set();
  let costTotal = D(0);
  for (const line of payload.lines) {
    const product = await Product.findByPk(line.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(product, `Médicament introuvable (ligne ${line.number}).`, 404);
    ensure(product.active, `Médicament « ${product.name} » inactif : correction impossible.`);
    if (line.unit && line.unit !== product.unit) {
      await product.update({ unit: line.unit }, { transaction });
    }
    const lot = await resoudreLot({
      produit: product, supplierId: payload.supplierId, location: receipt.location,
      ligne: line, transaction, ajustements
    });
    await ReceiptLine.create({
      receiptId: receipt.id, productId: product.id, lotId: lot.id,
      number: lot.number, quantity: line.quantity, purchasePrice: money(line.purchasePrice),
      allocatedFees: line.allocatedFees, unitCost: line.unitCost,
      receivedOn: line.receivedOn, expiresOn: line.expiresOn, manufacturedOn: line.manufacturedOn || null,
      manufacturer: String(line.manufacturer || '').trim()     // 2.7.49
    }, { transaction });
    movementLines.push({
      productId: product.id, lotId: lot.id, quantity: Number(line.quantity),
      unitCost: line.unitCost, location: receipt.location
    });
    costTotal = costTotal.add(D(line.unitCost).mul(line.quantity));
    nouveauxProduits.add(product.id);
  }

  await applyMovements({
    documentType: 'RECEIPT', documentId: receipt.id, userId: user.id, kind: 'RECEIPT',
    reason: `Réception ${receipt.reference} corrigée (${correction.reference}) — entrée au ${LOCATION_LABELS[receipt.location] || 'dépôt'}`,
    lines: movementLines
  }, transaction);

  // 3) En-tête + coûts recalculés — y compris pour les ANCIENS produits,
  //    dont les lots ont disparu (le CMP retombe sur leurs lots restants).
  await receipt.update({
    supplierId: payload.supplierId, fees: payload.fees, note: payload.note,
    costTotal: money(costTotal)
  }, { transaction });
  for (const productId of new Set([...anciensProduits, ...nouveauxProduits])) {
    await recomputeProductCosting(productId, settings, {
      userId: user.id, origin: 'CORRECTION',
      reason: `Correction ${correction.reference} de la réception ${receipt.reference}`
    }, transaction);
  }

  await correction.update({
    status: 'VALIDATED', decidedBy: user.id, decidedAt: new Date(),
    decisionNote: (note || '').trim(), updatedAt: new Date()
  }, { transaction });
  await log({
    userId: user.id, action: 'VALIDATE', entity: 'RECEIPT_CORRECTION', entityId: id,
    before, after: {
      reference: correction.reference,
      receipt: publicSnapshot(receipt.toJSON()),
      ajustements: ajustements.map(a => a.message)
    }
  }, transaction);
  return { correction, appliques: true, ajustements };
}