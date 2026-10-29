// ============================================================================
// 2.7.79 — CORRECTION D'UN TRANSFERT (workflow dépôt → admin), demande de
// l'officine : bouton « Modifier » sur l'historique des transferts pour
// réparer une erreur de saisie (« diso fanoratra »), mais la modification
// N'EST APPLIQUÉE QU'APRÈS VALIDATION par un administrateur.
//
// Architecture IDENTIQUE aux corrections de réception (2.7.34, teboka ③) :
//   • le dépôt dépose une DEMANDE (motif de la correction + motif du
//     transfert corrigé + remarque + NOUVELLES QUANTITÉS des lignes, mêmes
//     lots d'origine — pour ajouter un médicament on fait un NOUVEAU
//     transfert) ;
//   • seul un ADMINISTRATEUR valide (application immédiate, stock remis au
//     millimètre) ou refuse (rien ne change, le refus est expliqué) ;
//   • GARDE-FOU ABSOLU, vérifié à la demande ET à la validation : aucun lot
//     du transfert (lot source au dépôt ET lot jumeau en pharmacie) ne doit
//     avoir bougé depuis (vente, perte, inventaire, autre transfert). Sinon
//     la correction est refusée : le chemin devient l'annulation tracée du
//     document (RG19).
//
// À la validation, dans la MÊME transaction : l'ancienne version est
// DÉFAITE SANS SUPPRESSION (contre-mouvements tracés CANCEL — le journal
// des mouvements est immuable), puis REFAITE avec les quantités corrigées
// (mêmes lots, mêmes coûts de revient : un transfert ne change jamais le
// prix, il déplace la marchandise). La référence du transfert ne change pas.
// ============================================================================
import { Op } from 'sequelize';
import { Transfer, TransferLine, TransferCorrection, Lot, Product, Movement, MovementSuperseded, User } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements, lockLot } from './stock.service.js';
import { log, publicSnapshot } from './audit.service.js';

export const CORRECTION_STATUS = ['PENDING', 'VALIDATED', 'REFUSED'];

/**
 * Garde « transfert encore intact » : lignes chargées + zéro mouvement
 * étranger au transfert sur ses lots (source au dépôt comme jumeau en
 * pharmacie) DEPUIS le transfert. 2.7.80 — BUG CORRIGÉ : la réception
 * d'ORIGINE du lot (mouvement 'RECEIPT', créée avant le transfert) ne
 * doit PAS compter ; seuls les mouvements postérieurs au transfert
 * (vente, perte, inventaire, autre transfert, annulation) bloquent une
 * correction. Renvoie lignes et lots pour réutilisation.
 */
async function assertTransfertIntact(transfer, transaction) {
  ensure(transfer, 'Transfert introuvable.', 404);
  ensure(transfer.status === STATUS.VALIDATED,
    'Seul un transfert validé se corrige (un transfert annulé ne bouge plus).');
  const lignes = await TransferLine.findAll({
    where: { transferId: transfer.id }, order: [['id', 'ASC']], transaction
  });
  ensure(lignes.length > 0, 'Transfert sans ligne : rien à corriger.');
  const lotIds = [...new Set([
    ...lignes.map(ligne => ligne.fromLotId),
    ...lignes.map(ligne => ligne.toLotId).filter(Boolean)
  ])];
  const lots = await Lot.findAll({ where: { id: lotIds }, transaction });
  ensure(lots.length === lotIds.length, 'Données incohérentes : un lot du transfert manque.');
  // 2.7.81 — la garde devient DIAGNOSTIQUE : au lieu d'un simple comptage du
  // type « un de ses lots a déjà bougé », on LISTE les mouvements qui bloquent
  // (type, date, numéro de lot) afin que l'utilisateur comprenne tout de suite
  // ce qui s'est passé APRÈS le transfert (vente au comptoir, perte, ajustement
  // d'inventaire, autre transfert depuis le même lot du dépôt, annulation…).
  const mouvementsEtrangers = await Movement.findAll({
    where: {
      lotId: lotIds,
      // 2.7.80 — seuls les mouvements POSTÉRIEURS au transfert le bloquent
      // (la réception d'origine du lot, antérieure, n'est pas un obstacle).
      createdAt: { [Op.gt]: transfer.createdAt },
      [Op.or]: [
        { documentType: { [Op.ne]: 'TRANSFER' } },
        { documentType: 'TRANSFER', documentId: { [Op.ne]: transfer.id } }
      ]
    },
    order: [['id', 'DESC']],
    limit: 3,
    transaction
  });
  if (mouvementsEtrangers.length > 0) {
    const KIND_LIBELLE = {
      SALE: 'vente', LOSS: 'perte', ADJUSTMENT: 'inventaire',
      TRANSFER_OUT: 'autre transfert', TRANSFER_IN: 'autre transfert',
      CANCEL: 'annulation', RECEIPT: 'réception'
    };
    const numerosLots = new Map(lots.map(lot => [lot.id, lot.number]));
    const detail = mouvementsEtrangers.map(mvt =>
      `${KIND_LIBELLE[mvt.kind] || mvt.kind} du ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`
      + ` (lot ${numerosLots.get(mvt.lotId) || `n°${mvt.lotId}`})`
    ).join(', ');
    ensure(false,
      `Ce transfert ne peut plus être corrigé : un de ses lots a déjà bougé APRÈS le transfert — ${detail}. `
      + 'Le chemin restant est l’annulation tracée du document par un administrateur.');
  }
  return { lignes, lots };
}

/** La forme publique d'une demande (avec les noms, jamais seulement les ids). */
function formePublique(correction, transfertsParId, usersParId) {
  const r = correction.toJSON ? correction.toJSON() : correction;
  return {
    ...r,
    transferReference: transfertsParId.get(r.transferId)?.reference || `TRF-${r.transferId}`,
    proposedByName: usersParId.get(r.proposedBy)?.name || `#${r.proposedBy}`,
    decidedByName: r.decidedBy ? (usersParId.get(r.decidedBy)?.name || `#${r.decidedBy}`) : ''
  };
}

/** Liste les demandes de correction (les plus récentes d'abord). */
export async function listerCorrectionsTransfert({ status = null }, transaction) {
  ensure(!status || CORRECTION_STATUS.includes(status), 'État de correction inconnu.');
  const rows = await TransferCorrection.findAll({
    where: status ? { status } : {},
    order: [['id', 'DESC']],
    limit: 100,
    transaction
  });
  const transferIds = [...new Set(rows.map(r => r.transferId))];
  const userIds = [...new Set(rows.flatMap(r => [r.proposedBy, r.decidedBy].filter(Boolean)))];
  const [transferts, users] = await Promise.all([
    Transfer.findAll({ where: { id: transferIds }, transaction }),
    User.findAll({ where: { id: userIds }, transaction })
  ]);
  const transfertsParId = new Map(transferts.map(t => [t.id, t.toJSON()]));
  const usersParId = new Map(users.map(u => [u.id, u.toJSON()]));
  return rows.map(row => formePublique(row, transfertsParId, usersParId));
}

/**
 * Le détail d'une demande (comparaison à l'écran) : contenu ACTUEL du
 * transfert et version PROPOSÉE, les deux résolus en noms (médicament + lot).
 */
export async function detailCorrectionTransfert(id, transaction) {
  const correction = await TransferCorrection.findByPk(id, { transaction });
  ensure(correction, 'Demande de correction introuvable.', 404);
  const transfer = await Transfer.findByPk(correction.transferId, { transaction });
  const lignesActuelles = await TransferLine.findAll({
    where: { transferId: correction.transferId }, order: [['id', 'ASC']], transaction
  });
  const [users, produits, lots] = await Promise.all([
    User.findAll({ where: { id: [correction.proposedBy, correction.decidedBy].filter(Boolean) }, transaction }),
    Product.findAll({ transaction }),
    Lot.findAll({ transaction })
  ]);
  const produitParId = new Map(produits.map(p => [p.id, p]));
  const lotParId = new Map(lots.map(l => [l.id, l]));
  const resoudre = (fromLotId, quantity) => {
    const lot = lotParId.get(Number(fromLotId));
    const produit = lot ? produitParId.get(lot.productId) : null;
    return {
      lotId: Number(fromLotId),
      product: produit?.name || '—',
      lot: lot?.number || '—',
      quantity: Number(quantity)
    };
  };
  return {
    ...formePublique(correction,
      new Map(transfer ? [[transfer.id, transfer.toJSON()]] : []),
      new Map(users.map(u => [u.id, u.toJSON()]))),
    actuelles: lignesActuelles.map(ligne => resoudre(ligne.fromLotId, ligne.quantity)),
    proposees: (correction.payload?.lines || []).map(ligne => resoudre(ligne.lotId, ligne.quantity)),
    motifCorrige: correction.payload?.transferReason || '',
    remarqueCorrigee: correction.payload?.note || '',
    transfer: transfer ? publicSnapshot(transfer.toJSON()) : null
  };
}

/**
 * Le dépôt (ou l'admin) PROPOSE une correction : transfert intact + aucun
 * autre dossier en attente. Le transfert ne change PAS à cette étape.
 * Seules les QUANTITÉS des lignes d'origine sont corrigées (mêmes lots
 * dépôt) : un médicament supplémentaire se transfère par un NOUVEAU
 * transfert — la correction répare une erreur de saisie, pas un oubli.
 */
export async function proposerCorrectionTransfert(transferId, payload, user, transaction) {
  const transfer = await Transfer.findByPk(transferId, { transaction, lock: transaction.LOCK.UPDATE });
  const { lignes } = await assertTransfertIntact(transfer, transaction);
  const dejaEnAttente = await TransferCorrection.findOne({
    where: { transferId, status: 'PENDING' }, transaction
  });
  ensure(!dejaEnAttente,
    `Une correction est déjà en attente pour ce transfert (${dejaEnAttente?.reference || ''}) : attendez la décision de l’administrateur.`);

  const lotsOriginaux = new Set(lignes.map(ligne => ligne.fromLotId));
  const vus = new Set();
  for (const ligne of payload.lines) {
    ensure(lotsOriginaux.has(Number(ligne.lotId)),
      'La correction ne touche que les lots d’origine du transfert : '
      + 'pour ajouter un médicament, faites un NOUVEAU transfert.');
    ensure(!vus.has(Number(ligne.lotId)), 'Un même lot d’origine apparaît deux fois dans la correction.');
    vus.add(Number(ligne.lotId));
  }

  const correction = await TransferCorrection.create({
    reference: 'TMP',
    transferId,
    proposedBy: user.id,
    payload: {
      // Motif du transfert CORRIGÉ + remarque corrigée + nouvelles quantités.
      transferReason: String(payload.transferReason || '').trim(),
      note: payload.note || '',
      lines: payload.lines.map(ligne => ({ lotId: Number(ligne.lotId), quantity: Number(ligne.quantity) }))
    },
    reason: payload.reason.trim(),
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date()
  }, { transaction });
  await correction.update({ reference: makeReference('TRANSFER_CORRECTION', correction.id) }, { transaction });

  await log({
    userId: user.id, action: 'PROPOSE', entity: 'TRANSFER_CORRECTION', entityId: correction.id,
    after: { reference: correction.reference, transferId, reason: payload.reason.trim(), lignes: payload.lines.length }
  }, transaction);
  return correction;
}

/**
 * L'administrateur TRANCHE : validation (correction appliquée au stock) ou
 * refus motivé. La validation EXIGE un motif de transfert corrigé valide et
 * des quantités couvertes par les lots d'origine (re-contrôlé à la date de
 * décision, après ré-application de la garde « intact »).
 */
export async function deciderCorrectionTransfert(id, { decision, note }, user, transaction) {
  const correction = await TransferCorrection.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
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
      userId: user.id, action: 'REFUSE', entity: 'TRANSFER_CORRECTION', entityId: id,
      after: { reference: correction.reference, decisionNote: note.trim() }
    }, transaction);
    return { correction, appliques: false };
  }

  // ── VALIDATION : ré-application des gardes, puis échange transactionnel. ──
  const transfer = await Transfer.findByPk(correction.transferId, { transaction, lock: transaction.LOCK.UPDATE });
  const { lignes: anciennesLignes } = await assertTransfertIntact(transfer, transaction);
  const payload = correction.payload;
  ensure(String(payload.transferReason || '').trim().length >= 3,
    'Le motif corrigé du transfert est obligatoire (3 caractères minimum).');
  ensure(Array.isArray(payload.lines) && payload.lines.length > 0,
    'La correction proposée ne contient aucune ligne.');
  const before = {
    transfer: publicSnapshot(transfer.toJSON()),
    lines: anciennesLignes.map(l => publicSnapshot(l.toJSON ? l.toJSON() : l))
  };
  const ancienneParLot = new Map(anciennesLignes.map(ligne => [ligne.fromLotId, ligne]));
  const from = transfer.fromLocation;
  const to = transfer.toLocation;

  // 1) « Défaire » SANS SUPPRIMER L'HISTOIRE : contre-mouvements CANCEL de
  //    l'ancienne version (le dépôt retrouve ses quantités, la pharmacie les
  //    rend) — le journal des mouvements reste immuable (RG19).
  // 2.7.91/2.7.92 — REGISTRE NET (« safidy A », choix du dépôt) : la version
  //    REMPLACÉE du transfert sera marquée « superseded » juste après les
  //    contre-mouvements CANCEL ci-dessous (UN SEUL insert, voir plus bas) —
  //    elle ne compte plus dans les colonnes Entrées/Sorties/Stock final des
  //    fiches de stock (Entrées = réceptions réelles, Sorties = départs nets).
  //    La ligne RESTE en base : le journal « Mouvements » et l'audit la
  //    montrent toujours ; seul le registre lit chaque document à sa
  //    version FINALE, comptée À LA DATE DU TRANSFERT (documentDate).
  const defaire = anciennesLignes.flatMap(ligne => ([
    { productId: ligne.productId, lotId: ligne.fromLotId, location: from, quantity: Number(ligne.quantity), unitCost: ligne.unitCost },
    { productId: ligne.productId, lotId: ligne.toLotId, location: to, quantity: -Number(ligne.quantity), unitCost: ligne.unitCost }
  ]));
  await applyMovements({
    documentType: 'TRANSFER', documentId: transfer.id, userId: user.id, kind: 'CANCEL',
    reason: `Correction ${correction.reference} : version précédente du transfert ${transfer.reference} remplacée`,
    lines: defaire
  }, transaction);
  // 2.7.91/2.7.92 — TOUTES les écritures supplantées du document (versions
  // REMPLACÉES du transfert ET contre-mouvements CANCEL qui viennent d'être
  // créés) sont marquées « superseded » : sinon « Entrées » gonflerait du
  // retour d'annulation — c'était le défaut signalé par le dépôt (50 + 30).
  // ⚠ 2.7.92 — la marque N'EST PLUS un UPDATE des mouvements : le trigger
  // « movements_immutable » (RG19, sql/001) l'interdit et a fait échouer la
  // migration 1re mouture. Elle vit dans la table SÉPARÉE
  // « movement_superseded » (INSERT only, ignoreDuplicates → rejouable) :
  // le journal n'est jamais modifié ni effacé.
  const mvtSupplantes = await Movement.findAll({
    where: { documentType: 'TRANSFER', documentId: transfer.id },
    attributes: ['id'], transaction
  });
  await MovementSuperseded.bulkCreate(
    mvtSupplantes.map(mvt => ({ movementId: mvt.id })),
    { transaction, ignoreDuplicates: true }
  );
  await TransferLine.destroy({ where: { transferId: transfer.id }, transaction });

  // 2) Refaire avec les QUANTITÉS CORRIGÉES : mêmes lots d'origine (qualifiés
  //    après l'annulation : le lot source doit couvrir la nouvelle quantité),
  //    mêmes lots jumeaux côté pharmacie, mêmes coûts de revient.
  const sorties = [];
  const entrees = [];
  let costTotal = D(0);
  for (const ligne of payload.lines) {
    const ancienne = ancienneParLot.get(Number(ligne.lotId));
    ensure(ancienne, 'Données incohérentes : un lot proposé n’appartenait pas au transfert.');
    const source = await lockLot(Number(ligne.lotId), transaction);
    ensure(source.location === from,
      `Le lot ${source.number} n’est pas dans le magasin « ${LOCATION_LABELS[from]} ».`);
    ensure(Number(source.quantity) >= Number(ligne.quantity),
      `Quantité corrigée supérieure au stock du lot ${source.number} dans « ${LOCATION_LABELS[from]} » (disponible : ${source.quantity}).`);
    const produit = await Product.findByPk(ancienne.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(produit && produit.active, 'Médicament absent ou inactif : correction refusée.');

    await TransferLine.create({
      transferId: transfer.id, productId: ancienne.productId,
      fromLotId: ancienne.fromLotId, toLotId: ancienne.toLotId,
      quantity: Number(ligne.quantity), unitCost: ancienne.unitCost
    }, { transaction });
    sorties.push({ productId: ancienne.productId, lotId: ancienne.fromLotId, quantity: -Number(ligne.quantity), unitCost: ancienne.unitCost, location: from });
    entrees.push({ productId: ancienne.productId, lotId: ancienne.toLotId, quantity: Number(ligne.quantity), unitCost: ancienne.unitCost, location: to });
    costTotal = costTotal.add(D(ancienne.unitCost).mul(ligne.quantity));
  }

  const motif = `Transfert ${transfer.reference} de ${LOCATION_LABELS[from]} vers ${LOCATION_LABELS[to]} — ${payload.transferReason.trim()} (corrigé par ${correction.reference})`;
  // 2.7.91 — la version CORRIGÉE est écrite À LA DATE DU TRANSFERT
  // (`documentDate`) : la fiche de stock d'une période passée montre la valeur
  // finale (« safidy A »), pas une écriture injectée au jour de la décision.
  await applyMovements({
    documentType: 'TRANSFER', documentId: transfer.id, userId: user.id,
    kind: 'TRANSFER_OUT', reason: motif, lines: sorties, documentDate: transfer.createdAt
  }, transaction);
  await applyMovements({
    documentType: 'TRANSFER', documentId: transfer.id, userId: user.id,
    kind: 'TRANSFER_IN', reason: motif, lines: entrees, documentDate: transfer.createdAt
  }, transaction);

  // 3) En-tête corrigé : motif, remarque et valeur transférée.
  await transfer.update({
    reason: payload.transferReason.trim(),
    note: payload.note || '',
    costTotal: money(costTotal)
  }, { transaction });

  await correction.update({
    status: 'VALIDATED', decidedBy: user.id, decidedAt: new Date(),
    decisionNote: (note || '').trim(), updatedAt: new Date()
  }, { transaction });
  await log({
    userId: user.id, action: 'VALIDATE', entity: 'TRANSFER_CORRECTION', entityId: id,
    before, after: {
      reference: correction.reference,
      transfer: publicSnapshot(transfer.toJSON()),
      lines: payload.lines
    }
  }, transaction);
  return { correction, appliques: true };
}