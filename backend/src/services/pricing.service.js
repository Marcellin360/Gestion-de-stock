// ============================================================================
// Coûts, prix de vente et marges (§9.6, §9.7, RG12, RG13, RG21, RG22, RG23).
// Tout le calcul est fait côté serveur : l'interface ne décide jamais d'un prix.
// ============================================================================
import { Product, Lot, PriceHistory } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { MARGIN_MODES, VALUATION } from '../config/constants.js';

/**
 * Prix de vente à partir du coût retenu et du taux de marge (RG21).
 *  - mode COST : prix = coût × (1 + taux/100)   → marge calculée sur le coût
 *  - mode SALE : prix = coût ÷ (1 − taux/100)   → marge exprimée en % du prix de vente
 * La plage autorisée (RG22) est contrôlée ici, donc côté serveur.
 */
export function salePrice(cost, rate, mode, minMargin, maxMargin) {
  const costValue = D(cost);
  const rateValue = D(rate);
  ensure(costValue.gte(0), 'Coût négatif interdit.');
  ensure(rateValue.gte(minMargin) && rateValue.lte(maxMargin),
    `Taux de marge ${rateValue} % hors de la plage autorisée (${minMargin} – ${maxMargin} %).`);
  ensure([MARGIN_MODES.COST, MARGIN_MODES.SALE].includes(mode), 'Mode de calcul de marge inconnu.');
  ensure(mode !== MARGIN_MODES.SALE || rateValue.lt(100), 'Le taux sur prix de vente doit rester inférieur à 100 %.');
  const price = mode === MARGIN_MODES.COST
    ? costValue.mul(D(1).add(rateValue.div(100)))
    : costValue.div(D(1).sub(rateValue.div(100)));
  return money(price);
}

/** Contrôle d'une plage de marge sans calcul de prix (création/modification d'un médicament). */
/**
 * Coût retenu pour le calcul du PRIX DE VENTE.
 *  - « CMP » (défaut) : coût moyen pondéré de toutes les réceptions du médicament ;
 *  - « LOT »          : coût de revient du dernier lot reçu.
 * C'est réglable dans Paramètres ; cela ne change pas la valorisation du stock
 * (coût de sortie d'un lot, qui reste celui du lot réellement vendu).
 */
export function coutPourLePrix(lots, product, cmp, settings) {
  const base = String(settings.pricingBasis || VALUATION.CMP).toUpperCase();
  if (base === VALUATION.LOT) {
    return money(lots.slice().sort((a, b) => b.id - a.id)[0]?.unitCost ?? 0);
  }
  return money(cmp);
}

export function assertMarginRate(rate, settings) {
  const value = D(rate);
  ensure(value.gte(settings.minMargin ?? settings.min_rate) && value.lte(settings.maxMargin ?? settings.max_rate),
    `Taux de marge ${value} % hors de la plage autorisée (${settings.minMargin ?? settings.min_rate} – ${settings.maxMargin ?? settings.max_rate} %).`);
  return value;
}

/** Marge brute unitaire = prix de vente − coût retenu (§9.6). */
export const grossMargin = (price, cost) => money(D(price).sub(cost));

/**
 * Coût retenu pour une sortie :
 *  - valorisation CMP : coût moyen pondéré du médicament ;
 *  - valorisation LOT : coût de revient réel du lot sorti.
 */
export const retainedCost = (product, lot, valuation) =>
  money(valuation === VALUATION.CMP ? product.cmp : lot.unitCost);

/**
 * Recalcule le coût moyen pondéré du médicament à partir des lots reçus (RG20),
 * puis le prix de vente correspondant. Appelé après chaque réception ou annulation
 * de réception : le CMP reste ainsi cohérent avec les quantités réellement entrées.
 */
export async function recomputeProductCosting(productId, settings, { userId = null, origin = '', reason = '' }, transaction) {
  const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(product, 'Médicament introuvable.', 404);

  const lots = await Lot.findAll({ where: { productId }, transaction });
  const received = lots.filter(lot => Number(lot.receivedQuantity) > 0);
  const quantity = received.reduce((acc, lot) => acc + Number(lot.receivedQuantity), 0);
  const cmp = quantity > 0
    ? money(received.reduce((acc, lot) => acc.add(D(lot.unitCost).mul(Number(lot.receivedQuantity))), D(0)).div(quantity))
    : money(0);

  // Le PRIX DE VENTE suit sa propre base (Paramètres → « Prix de vente calculé
  // sur »), par défaut le CMP : deux réceptions du même médicament sont donc
  // additionnées puis moyennées (100 × 1 000 + 80 × 2 000 → 1 444,444444 Ar),
  // au lieu de suivre le prix de la dernière livraison.
  const costUsed = coutPourLePrix(lots, product, cmp, settings);

  const price = salePrice(costUsed, product.marginRate, settings.marginMode, settings.minMargin, settings.maxMargin);
  const changed = !D(product.cmp).eq(cmp) || !D(product.sellingPrice).eq(price);
  await product.update({ cmp, sellingPrice: price, updatedAt: new Date() }, { transaction });

  if (changed && userId) {
    await PriceHistory.create({
      productId: product.id, userId, cost: costUsed, rate: product.marginRate, price,
      mode: settings.marginMode, origin, reason, createdAt: new Date()
    }, { transaction });
  }
  return { product, cmp, sellingPrice: price, costUsed, changed };
}

/** Change le taux de marge d'un médicament (RG24) en conservant la trace (RG23). */
export async function changeMarginRate(productId, rate, settings, user, reason, transaction) {
  const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(product, 'Médicament introuvable.', 404);
  const before = { marginRate: product.marginRate, sellingPrice: product.sellingPrice };
  const lots = await Lot.findAll({ where: { productId }, transaction });
  // Même base que le recalcul automatique : le nouveau taux s'applique au CMP
  // (ou au dernier lot, selon le réglage), jamais à un mélange des deux.
  const cost = coutPourLePrix(lots, product, product.cmp, settings);

  const price = salePrice(cost, rate, settings.marginMode, settings.minMargin, settings.maxMargin);
  await product.update({ marginRate: rate, sellingPrice: price, updatedAt: new Date() }, { transaction });
  await PriceHistory.create({
    productId, userId: user.id, cost, rate, price, mode: settings.marginMode,
    origin: 'TAUX', reason: reason || 'Modification du taux de marge', createdAt: new Date()
  }, { transaction });
  return { product, before, sellingPrice: price, cost, rate };
}

export function priceHistory(productId, transaction) {
  return PriceHistory.findAll({ where: { productId }, order: [['id', 'DESC']], limit: 500, transaction });
}