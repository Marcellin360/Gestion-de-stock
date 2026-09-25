// ============================================================================
// Calculs monétaires exacts (Decimal.js) : aucune opération en flottant.
// Toutes les valeurs sont stockées et manipulées en decimal(20,6).
// ============================================================================
import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const D = value => new Decimal(value ?? 0);

/** Format canonique stocké en base : 6 décimales, chaîne de caractères. */
export const money = value => D(value).toDecimalPlaces(6).toFixed(6);

export const sum = (values, mapper = v => v) => values.reduce((acc, item) => acc.add(D(mapper(item))), D(0));

/** Arrondi « caisse » à l'unité monétaire, pour l'affichage uniquement. */
export const display = (value, decimals = 2) => D(value).toDecimalPlaces(decimals).toNumber();

/** Répartit un montant de frais au prorata de la valeur, sans perte d'arrondi. */
export function distributeFees(lines, fees) {
  const valueBase = sum(lines, l => D(l.purchasePrice).mul(l.quantity));
  const quantityBase = lines.reduce((acc, l) => acc + Number(l.quantity), 0);
  let assigned = D(0);
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? D(fees).sub(assigned)
      : (valueBase.gt(0)
        ? D(fees).mul(D(line.purchasePrice).mul(line.quantity).div(valueBase))
        : D(fees).mul(D(line.quantity).div(quantityBase))
      ).toDecimalPlaces(6);
    assigned = assigned.add(share);
    const allocatedFees = money(share);
    const unitCost = money(D(line.purchasePrice).add(D(allocatedFees).div(line.quantity)));
    return { ...line, allocatedFees, unitCost };
  });
}

/** Coût moyen pondéré après entrée d'une quantité à un coût donné (§9.7). */
export function weightedAverageCost(currentQuantity, currentCost, quantity, unitCost) {
  const totalQuantity = D(currentQuantity).add(quantity);
  if (totalQuantity.lte(0)) return money(currentCost);
  const totalValue = D(currentQuantity).mul(currentCost).add(D(quantity).mul(unitCost));
  return money(totalValue.div(totalQuantity));
}
