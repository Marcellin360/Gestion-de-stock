// ============================================================================
// Réceptions fournisseur (§9.4, RG03, RG12) : la marchandise livrée entre
// TOUJOURS au DÉPÔT (jamais directement au comptoir). Frais AUTOMATIQUES
// (2.7.47), création ou mise à jour des lots, recalcul du coût de revient, du
// CMP et du prix de vente. Le passage vers la pharmacie se fait ensuite par
// un TRANSFERT.
// ============================================================================
import { Receipt, ReceiptLine, Lot, Product, Supplier } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { normalizeLotNumber } from '../utils/sanitize.js';
import { reference as makeReference } from '../utils/ids.js';
import { STATUS, VALUATION, LOCATION_LABELS } from '../config/constants.js';
import { applyMovements } from './stock.service.js';
import { recomputeProductCosting } from './pricing.service.js';
import { getSettings } from './settings.service.js';
import { log, publicSnapshot } from './audit.service.js';

/** Vérifications de cohérence des dates d'un lot (RG02, §16).
 *  Exportée pour la correction de réception (2.7.34, teboka ③). */
export function validateDates(line) {
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

// ============================================================================
// 2.7.47 — COÛT DE REVIENT : frais AUTOMATIQUES, suivant la formule de
// l'officine. Le champ manuel « Frais » de la réception est supprimé ; la part
// de frais n'est plus saisie bon par bon, elle vient des Paramètres :
//
//     CU (coût unitaire) = PA + Frais,     avec Frais = feesRate % × PA
//
// feesRate (Paramètres → « Frais d'achat », 10 % par défaut, modifiable par
// l'administrateur). Seuls les lots reçus APRÈS le réglage sont calculés ainsi ;
// le CMP est ensuite la moyenne pondérée des coûts unitaires :
//
//     CMP = Σ(CU × quantité) ÷ Σ(quantité reçue)
//     PV  = CMP + CMP × marge          (marge dans la plage min–max paramétrée)
//
// 2.7.49 — ENTIER SUPÉRIEUR (ceil) à l'Ariary près : le CU plafonne (la
// comptabilité de l'officine ne raisonne pas en fraction d'Ariary sur un coût
// unitaire) ; les frais de la ligne sont recalculés depuis ce plafond. Le prix
// de vente est lui-même arrondi à l'entier supérieur (pricing.service).
// ============================================================================
/** Applique le pourcentage de frais d'achat aux lignes d'une réception. */
export function appliquerFraisAchat(lines, feesRate) {
  const taux = D(feesRate ?? 10).div(100);
  return lines.map(line => {
    // CU d'abord, arrondi à l'ENTIER SUPÉRIEUR (2.7.49), puis la part de frais
    // de la ligne = (CU − PA) × quantité recalculée depuis ce plafond : la
    // somme des parts reste cohérente avec le coût affiché du lot.
    const unitCost = money(D(line.purchasePrice).mul(D(1).add(taux)).ceil());
    const allocatedFees = money(D(unitCost).sub(line.purchasePrice).mul(line.quantity));
    return { ...line, allocatedFees, unitCost };
  });
}

/** Total informatif des frais automatiques d'une réception (impressions, rapport). */
export const totalFraisAchat = lines => money(lines.reduce((acc, line) => acc.add(line.allocatedFees), D(0)));

/**
 * Retrouve (ou crée) le lot d'une ligne de réception.
 *
 * Un même numéro de lot revient forcément : une officine commande le même
 * médicament au même grossiste plusieurs fois dans l'année, et le numéro suggéré
 * (MED-001-2026) est le même. La règle est donc :
 *
 *   • lot inexistant                    → création du lot (dates et prix saisis) ;
 *   • lot existant, mêmes dates ET même prix → la quantité est simplement
 *     complétée (c'est le même lot physique, livré en deux fois) ;
 *   • lot existant, prix ou dates différends → un lot DISTINCT est créé pour le
 *     même numéro, suffixé « ·2 », « ·3 »… Aucune réception n'est refusée pour un
 *     numéro réutilisé, et les coûts restent séparés (donc le CMP reste juste).
 *
 * Chaque décision est renvoyée dans « ajustements » pour être affichée après
 * enregistrement (« lot MED-001-2026 déjà reçu à 1 000 Ar : enregistré comme
 * MED-001-2026·2 »).
 */
export async function resoudreLot({ produit, supplierId, location, ligne, transaction, ajustements }) {
  const base = String(ligne.number).trim();
  for (let rang = 1; rang <= 99; rang += 1) {
    const numero = rang === 1 ? base : `${base}·${rang}`;
    const existant = await Lot.findOne({
      where: { productId: produit.id, supplierId, number: numero, location },
      transaction, lock: transaction.LOCK.UPDATE
    });

    if (!existant) {
      const cree = await Lot.create({
        productId: produit.id, supplierId, number: numero, location,
        receivedOn: ligne.receivedOn, manufacturedOn: ligne.manufacturedOn, expiresOn: ligne.expiresOn,
        manufacturer: String(ligne.manufacturer || '').trim(),   // 2.7.49
        quantity: 0, receivedQuantity: ligne.quantity,
        purchasePrice: money(ligne.purchasePrice), allocatedFees: ligne.allocatedFees,
        unitCost: ligne.unitCost, status: STATUS.AVAILABLE
      }, { transaction });
      if (rang > 1) {
        ajustements.push({
          numeroDemande: base, numeroUtilise: numero, motif: 'autrePrix',
          message: `Le lot « ${base} » existe déjà (prix ou dates différents) : la livraison a été enregistrée `
            + `comme lot « ${numero} » pour garder les deux coûts séparés.`
        });
      }
      return cree;
    }

    ensure(existant.status === STATUS.AVAILABLE, `Lot ${numero} bloqué : lever le blocage avant de le compléter.`);
    const memesDates = existant.expiresOn === ligne.expiresOn && existant.manufacturedOn === ligne.manufacturedOn;
    const memePrix = D(existant.purchasePrice).eq(ligne.purchasePrice);

    if (memesDates && memePrix) {
      // Même lot physique livré en deux fois : les quantités s'additionnent et le
      // coût de revient est recalculé sur l'ensemble :
      //   coût unitaire = prix d'achat + (frais cumulés ÷ quantité cumulée)
      // (les frais sont désormais automatiques — feesRate % du PA, 2.7.47 ; à PA
      // constant le complétage redonne exactement le même CU.)
      // L'ancienne formule divisait aussi le PRIX D'ACHAT par la quantité, ce qui
      // écrasait le coût : un lot de 100 + 50 unités à 1 000 Ar tombait à 6,67 Ar.
      const totalQuantite = Number(existant.receivedQuantity) + Number(ligne.quantity);
      const totalFrais = D(existant.allocatedFees).add(ligne.allocatedFees);
      await existant.update({
        receivedQuantity: totalQuantite,
        allocatedFees: money(totalFrais),
        unitCost: money(D(existant.purchasePrice).add(totalFrais.div(totalQuantite))),
        // 2.7.49 — le fabricant saisi le plus récemment l'emporte s'il est
        // renseigné (même numéro de lot ⇒ même fabricant en principe).
        manufacturer: String(ligne.manufacturer || '').trim() || existant.manufacturer
      }, { transaction });
      return existant;
    }
    // Prix ou dates différents : on essaie le numéro suffixé suivant.
  }
  throw new Error(`Lot ${base} : trop de livraisons au même numéro (99). Utilisez un numéro de lot distinct.`);
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

  // 2.7.47 — frais AUTOMATIQUES (paramètre « feesRate », 10 % du PA par
  // défaut). Le champ manuel « fees » de l'ancienne interface est accepté
  // mais ignoré : il n'entre plus dans le coût.
  const lines = appliquerFraisAchat(
    payload.lines.map(line => ({ ...line, number: normalizeLotNumber(line.number) })),
    settings.feesRate
  );
  lines.forEach(validateDates);
  ensure(new Set(lines.map(l => `${l.productId}|${l.number}`)).size === lines.length,
    'Le même numéro de lot apparaît deux fois pour le même médicament dans cette réception.');

  const receipt = await Receipt.create({
    reference: `TMP-${payload.requestKey}`,
    location,
    supplierId: payload.supplierId,
    userId: user.id,
    // Frais enregistrés = total AUTOMATIQUE (paramètre feesRate), affiché
    // sur le bon et dans les rapports ; la valeur saisie n'est plus utilisée.
    fees: totalFraisAchat(lines),
    costTotal: '0.000000',
    note: payload.note || '',
    status: STATUS.VALIDATED,
    requestKey: payload.requestKey,
    createdAt: new Date()
  }, { transaction });

  const movementLines = [];
  const touchedProducts = new Set();
  // Numéros de lot réutilisés : la liste est renvoyée à l'écran après enregistrement.
  const ajustements = [];
  let costTotal = D(0);

  for (const line of lines) {
    const product = await Product.findByPk(line.productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(product, `Médicament introuvable (ligne ${line.number}).`, 404);
    ensure(product.active, `Médicament « ${product.name} » inactif : réception refusée.`);

    // 2.7.31 — l'« Unité de gestion » ne se saisit plus dans la fiche médicament
    // mais À LA RÉCEPTION (boîte, flacon, pièce, plaquette…, choix dépôt) ; elle
    // est REPORTÉE sur la fiche — l'unité reste unique par médicament, pour que
    // stock, CMP et prix restent cohérents d'une réception à l'autre.
    if (line.unit && line.unit !== product.unit) {
      await product.update({ unit: line.unit }, { transaction });
    }

    // Même numéro de lot, nouvelle livraison à un autre prix : un lot distinct est
    // créé automatiquement (voir resoudreLot) — la réception n'est jamais refusée.
    const lot = await resoudreLot({
      produit: product, supplierId: payload.supplierId, location, ligne: line, transaction, ajustements
    });

    await ReceiptLine.create({
      receiptId: receipt.id, productId: product.id, lotId: lot.id,
      number: lot.number, quantity: line.quantity, purchasePrice: money(line.purchasePrice),
      allocatedFees: line.allocatedFees, unitCost: line.unitCost,
      receivedOn: line.receivedOn, expiresOn: line.expiresOn, manufacturedOn: line.manufacturedOn,
      manufacturer: String(line.manufacturer || '').trim()     // 2.7.49
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
  // Propriété calculée (jamais écrite en base) : l'écran l'affiche après l'enregistrement.
  receipt.ajustements = ajustements;

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