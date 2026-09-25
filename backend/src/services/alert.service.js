// ============================================================================
// Alertes (§9.14) : stock minimum, rupture, expiration proche, expiré, lot
// bloqué, surstock, réception partielle. Calculées côté serveur, pour que
// tous les utilisateurs voient exactement les mêmes priorités.
// ============================================================================
import { today, addDays, localDate } from '../utils/dates.js';
import { D, money } from '../utils/money.js';

/**
 * @param {object} context { products, lots, settings, date, location }
 * @returns {Array} alertes triées par criticité, prêtes à l'affichage
 */
export function computeAlerts({ products, lots, suppliers = [], settings, date = today(), location = null }) {
  // Les alertes sont calculées magasin par magasin : le dépôt et la pharmacie
  // n'ont pas les mêmes priorités (le dépôt approvisionne, la pharmacie vend).
  if (location) lots = lots.filter(lot => lot.location === location);
  const lieu = location ? (location === 'DEPOT' ? 'dépôt' : 'pharmacie') : 'magasin';
  const alerts = [];
  const sellableByProduct = new Map();
  const totalByProduct = new Map();

  for (const lot of lots) {
    const quantity = Number(lot.quantity);
    totalByProduct.set(lot.productId, (totalByProduct.get(lot.productId) || 0) + quantity);
    const sellable = lot.status === 'AVAILABLE' && quantity > 0
      && (settings.allowExpiredSale || (lot.expiresOn && lot.expiresOn >= date && !(lot.expiresOn < date)));
    if (sellable) sellableByProduct.set(lot.productId, (sellableByProduct.get(lot.productId) || 0) + quantity);
  }

  const horizon = addDays(date, Number(settings.expiryDays || 90));

  for (const product of products.filter(p => p.active)) {
    const sellable = sellableByProduct.get(product.id) || 0;
    const physical = totalByProduct.get(product.id) || 0;
    if (sellable === 0 && physical === 0) {
      alerts.push({
        id: `rupture-${location || 'all'}-${product.id}`, type: 'RUPTURE', level: 'red', target: 'transferts',
        productId: product.id, title: 'Rupture de stock', name: product.name,
        detail: `Aucune unité en stock (${lieu}) · seuil minimum ${product.minStock}`, location
      });
    } else if (sellable === 0) {
      alerts.push({
        id: `nonvendable-${product.id}`, type: 'RUPTURE_VENDABLE', level: 'red', target: 'lots',
        productId: product.id, title: 'Aucune unité vendable', name: product.name,
        detail: `${physical} unité(s) en stock mais expirées, bloquées ou sans date d'expiration (${lieu})`, location
      });
    } else if (sellable <= Number(product.minStock)) {
      alerts.push({
        id: `faible-${location || 'all'}-${product.id}`, type: 'STOCK_FAIBLE', level: 'amber', target: 'transferts',
        productId: product.id, title: 'Stock faible', name: product.name,
        detail: `${sellable} ${product.unit}(s) disponibles · seuil minimum ${product.minStock} (${lieu})`, location
      });
    }
    if (product.maxStock !== null && product.maxStock !== undefined && physical > Number(product.maxStock)) {
      alerts.push({
        id: `surstock-${location || 'all'}-${product.id}`, type: 'SURSTOCK', level: 'amber', target: 'lots',
        productId: product.id, title: 'Surstock', name: product.name,
        detail: `${physical} unités · seuil maximum ${product.maxStock} (${lieu})`, location
      });
    }
  }

  for (const lot of lots.filter(l => Number(l.quantity) > 0)) {
    const product = products.find(p => p.id === lot.productId);
    if (!product) continue;
    if (lot.status === 'BLOCKED') {
      alerts.push({
        id: `bloque-${location || 'all'}-${lot.id}`, type: 'LOT_BLOQUE', level: 'red', target: 'lots',
        productId: product.id, lotId: lot.id, title: 'Lot bloqué', name: product.name,
        detail: `Lot ${lot.number} · ${lot.quantity} unités indisponibles${lot.blockReason ? ` · ${lot.blockReason}` : ''}`, location
      });
      continue;
    }
    if (!lot.expiresOn) {
      alerts.push({
        id: `sans-date-${location || 'all'}-${lot.id}`, type: 'SANS_EXPIRATION', level: 'amber', target: 'lots',
        productId: product.id, lotId: lot.id, title: 'Date d’expiration manquante', name: product.name,
        detail: `Lot ${lot.number} · ${lot.quantity} unités non vendables en l'état`, location
      });
    } else if (lot.expiresOn < date) {
      alerts.push({
        id: `expire-${location || 'all'}-${lot.id}`, type: 'EXPIRE', level: 'red', target: 'losses',
        productId: product.id, lotId: lot.id, title: 'Lot expiré', name: product.name,
        detail: `Lot ${lot.number} expiré le ${lot.expiresOn} · ${lot.quantity} unités à sortir et enregistrer en perte`, location
      });
    } else if (lot.expiresOn <= horizon) {
      alerts.push({
        id: `expire-bientot-${location || 'all'}-${lot.id}`, type: 'EXPIRATION_PROCHE', level: 'amber', target: 'lots',
        productId: product.id, lotId: lot.id, title: 'Expiration proche', name: product.name,
        detail: `Lot ${lot.number} expire le ${lot.expiresOn} · ${lot.quantity} unités · à écouler en priorité (FEFO)`, location
      });
    }
  }

  const order = { red: 0, amber: 1 };
  return alerts.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
}

/** Indicateurs de synthèse utilisés par le tableau de bord. */
export function computeStats({ products, lots, settings, documents, date = today(), location = null }) {
  const active = products.filter(p => p.active);
  if (location) lots = lots.filter(lot => lot.location === location);
  const stockValue = lots.reduce((acc, lot) => {
    const product = products.find(p => p.id === lot.productId);
    const cost = settings.valuation === 'CMP' ? product?.cmp : lot.unitCost;
    return acc.add(D(cost || 0).mul(lot.quantity));
  }, D(0));
  const onDate = document => localDate(document.date) === date;
  // Chaque magasin a son propre chiffre d'affaires : la pharmacie vend, le dépôt
  // ne vend pas. Les pertes, elles, se déclarent des deux côtés.
  const lieu = document => document.location || (document.kind === 'SALE' ? 'PHARMACY' : document.kind === 'RECEIPT' ? 'DEPOT' : null);
  const duMagasin = document => !location || lieu(document) === location;
  const todaySales = documents.filter(d => d.kind === 'SALE' && d.status === 'VALIDATED' && onDate(d) && duMagasin(d));
  const todayLosses = documents.filter(d => d.kind === 'LOSS' && d.status === 'VALIDATED' && onDate(d) && duMagasin(d));
  return {
    activeProducts: active.length,
    activeLots: lots.filter(l => Number(l.quantity) > 0).length,
    stockValue: money(stockValue),
    salesToday: location === 'DEPOT' ? money(D(0)) : money(todaySales.reduce((acc, d) => acc.add(D(d.total)), D(0))),
    marginToday: location === 'DEPOT' ? money(D(0)) : money(todaySales.reduce((acc, d) => acc.add(D(d.margin)), D(0))),
    lossesToday: money(todayLosses.reduce((acc, d) => acc.add(D(d.costTotal)), D(0))),
    salesTodayCount: location === 'DEPOT' ? 0 : todaySales.length
  };
}
