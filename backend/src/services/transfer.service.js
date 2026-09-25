// ============================================================================
// Transferts de stock DÉPÔT → PHARMACIE
//
//  • La marchandise reçue entre au dépôt (réception). Elle rejoint la pharmacie
//    uniquement par un transfert : c'est ce document qui alimente le stock du
//    comptoir (stock initial / entrées / sorties / stock final de la pharmacie).
//  • Le stock des deux magasins est suivi séparément : un lot du dépôt et son
//    jumeau en pharmacie sont deux enregistrements distincts (même numéro, même
//    péremption, même coût), ce qui permet de compter chaque magasin sans
//    mélanger les quantités.
//  • Tout est tracé : mouvements immuables (sortie au dépôt, entrée en pharmacie),
//    journal d'audit, annulation possible avec motif.
// ============================================================================
import { Transfer, TransferLine, Lot, Product } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, LOCATIONS, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements, lockLot } from './stock.service.js';
import { getSettings } from './settings.service.js';
import { log, publicSnapshot } from './audit.service.js';

const verifierMagasin = location => {
  ensure(LOCATIONS.includes(location), `Magasin inconnu : ${location}.`);
  return location;
};

/**
 * Crée un transfert : chaque ligne sort du lot source (dépôt) et entre dans le
 * lot jumeau de la pharmacie, créé au besoin avec les mêmes caractéristiques.
 * payload.lines : [{ lotId, quantity }]
 */
export async function createTransfer(payload, user, transaction) {
  const existing = await Transfer.findOne({ where: { requestKey: payload.requestKey }, transaction });
  if (existing) {
    ensure(existing.userId === user.id, 'Clé de requête déjà utilisée par un autre utilisateur.', 409);
    return existing;   // rejeu réseau : le stock n'est pas touché deux fois
  }

  const from = verifierMagasin(payload.fromLocation || 'DEPOT');
  const to = verifierMagasin(payload.toLocation || 'PHARMACY');
  ensure(from !== to, 'Le magasin de départ et le magasin d’arrivée doivent être différents.');
  ensure(String(payload.reason || '').trim().length >= 3,
    'Indiquer le motif du transfert (3 caractères minimum).');

  const settings = await getSettings(transaction);
  const transfer = await Transfer.create({
    reference: `TMP-${payload.requestKey}`,
    userId: user.id,
    fromLocation: from, toLocation: to,
    requestedBy: payload.requestedBy ?? null,
    reason: payload.reason.trim(),
    note: payload.note || '',
    costTotal: '0.000000',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  const sorties = [];   // sortie du magasin d'origine
  const entrees = [];   // entrée dans le magasin d'arrivée
  let costTotal = D(0);

  for (const ligne of payload.lines) {
    const source = await lockLot(ligne.lotId, transaction);
    ensure(source.location === from,
      `Le lot ${source.number} n’est pas dans le magasin « ${LOCATION_LABELS[from]} ».`);
    ensure(Number(source.quantity) >= Number(ligne.quantity),
      `Quantité supérieure au stock du lot ${source.number} dans « ${LOCATION_LABELS[from]} » (disponible : ${source.quantity}).`);

    const produit = await Product.findByPk(source.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(produit && produit.active, 'Médicament absent ou inactif : transfert refusé.');

    // Lot jumeau dans le magasin d'arrivée : mêmes dates, même fournisseur,
    // même coût de revient — le numéro de lot reste identique pour la traçabilité.
    let cible = await Lot.findOne({
      where: { productId: source.productId, supplierId: source.supplierId, number: source.number, location: to },
      transaction, lock: transaction.LOCK.UPDATE
    });
    if (cible) {
      ensure(cible.status === STATUS.AVAILABLE,
        `Le lot ${source.number} est bloqué dans « ${LOCATION_LABELS[to]} » : le débloquer avant de transférer.`);
      // Seule la quantité « reçue » est ajustée ici : la quantité en stock est
      // portée par le mouvement d'entrée ci-dessous (une seule écriture, donc
      // aucune double comptabilisation possible).
      await cible.update({
        receivedQuantity: Number(cible.receivedQuantity) + Number(ligne.quantity)
      }, { transaction });
    } else {
      cible = await Lot.create({
        productId: source.productId, supplierId: source.supplierId, number: source.number, location: to,
        receivedOn: source.receivedOn, manufacturedOn: source.manufacturedOn, expiresOn: source.expiresOn,
        quantity: 0, receivedQuantity: Number(ligne.quantity),
        purchasePrice: source.purchasePrice, allocatedFees: '0.000000',
        unitCost: source.unitCost, status: STATUS.AVAILABLE
      }, { transaction });
    }

    await TransferLine.create({
      transferId: transfer.id, productId: source.productId,
      fromLotId: source.id, toLotId: cible.id,
      quantity: Number(ligne.quantity), unitCost: source.unitCost
    }, { transaction });

    sorties.push({ productId: source.productId, lotId: source.id, quantity: -Number(ligne.quantity), unitCost: source.unitCost, location: from });
    entrees.push({ productId: source.productId, lotId: cible.id, quantity: Number(ligne.quantity), unitCost: source.unitCost, location: to });
    costTotal = costTotal.add(D(source.unitCost).mul(ligne.quantity));
  }

  const motif = `Transfert ${transfer.reference} de ${LOCATION_LABELS[from]} vers ${LOCATION_LABELS[to]} — ${transfer.reason}`;
  await applyMovements({
    documentType: 'TRANSFER', documentId: transfer.id, userId: user.id,
    kind: 'TRANSFER_OUT', reason: motif, lines: sorties
  }, transaction);
  await applyMovements({
    documentType: 'TRANSFER', documentId: transfer.id, userId: user.id,
    kind: 'TRANSFER_IN', reason: motif, lines: entrees
  }, transaction);

  await transfer.update({ reference: makeReference('TRANSFER', transfer.id), costTotal: money(costTotal) }, { transaction });

  await log({
    userId: user.id, action: 'VALIDATE', entity: 'TRANSFER', entityId: transfer.id,
    after: {
      reference: transfer.reference, from, to, reason: transfer.reason,
      lines: payload.lines.length, costTotal: money(costTotal), valorisation: settings.valuation
    }
  }, transaction);

  return transfer;
}

/** Contenu détaillé d'un transfert (lignes + mouvements). */
export async function transferDetail(id, transaction) {
  const transfer = await Transfer.findByPk(id, { transaction });
  ensure(transfer, 'Transfert introuvable.', 404);
  const lignes = await TransferLine.findAll({ where: { transferId: id }, order: [['id', 'ASC']], transaction });
  const details = [];
  for (const ligne of lignes) {
    const produit = await Product.findByPk(ligne.productId, { transaction });
    const source = await Lot.findByPk(ligne.fromLotId, { transaction });
    const cible = ligne.toLotId ? await Lot.findByPk(ligne.toLotId, { transaction }) : null;
    details.push({
      id: ligne.id, productId: ligne.productId,
      product: produit?.name ?? '—', code: produit?.code ?? '—', unit: produit?.unit ?? '',
      lot: source?.number ?? '—', expiresOn: source?.expiresOn ?? null,
      quantity: Number(ligne.quantity), unitCost: money(ligne.unitCost),
      value: money(D(ligne.unitCost).mul(ligne.quantity)),
      stockDepart: source ? Number(source.quantity) : 0,
      stockArrivee: cible ? Number(cible.quantity) : 0
    });
  }
  return { transfer, lines: details };
}

/** Quantités disponibles dans un magasin, par lot (écran « Nouveau transfert »). */
export async function availableLots(transaction, location = 'DEPOT') {
  const lots = await Lot.findAll({
    where: { location }, order: [['expiresOn', 'ASC NULLS LAST'], ['id', 'ASC']], transaction
  });
  return lots.filter(lot => Number(lot.quantity) > 0).map(lot => lot.toJSON());
}

export { LOCATION_LABELS };
export const transferLabel = transfer =>
  `${LOCATION_LABELS[transfer.fromLocation]} → ${LOCATION_LABELS[transfer.toLocation]}`;
void publicSnapshot;
