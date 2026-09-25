// ============================================================================
// Cœur du stock : disponibilité, sélection des lots (FEFO) et mouvements.
// Chaque diminution de stock est un mouvement enregistré (RG04) dans la table
// movements, qui est immuable : on corrige par des mouvements inverses (RG19).
// ============================================================================
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Lot, Movement, Product } from '../models/index.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { today } from '../utils/dates.js';
import { LOT_PICKING, STATUS, VALUATION } from '../config/constants.js';

/**
 * Stock d'un médicament dans un magasin donné (lots bloqués et expirés inclus).
 * `location` vaut 'DEPOT' (réserve) ou 'PHARMACY' (officine).
 */
export async function productStock(productId, transaction, location = null) {
  const where = location ? { productId, location } : { productId };
  return Number(await Lot.sum('quantity', { where, transaction }) || 0);
}

/** Stock d'un médicament dans les deux magasins : { DEPOT, PHARMACY, total }. */
export async function stockByLocation(productId, transaction) {
  const lots = await Lot.findAll({ where: { productId }, transaction });
  const stock = { DEPOT: 0, PHARMACY: 0, total: 0 };
  for (const lot of lots) {
    stock[lot.location] = (stock[lot.location] || 0) + Number(lot.quantity);
    stock.total += Number(lot.quantity);
  }
  return stock;
}

/** Lots d'un médicament dans un magasin, verrouillés pour la transaction courante. */
export async function lockProductLots(productId, transaction, location = 'PHARMACY') {
  const where = location ? { productId, location } : { productId };
  return Lot.findAll({ where, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
}

/**
 * Sélection des lots à sortir (§9.8, RG08, RG09).
 *  - FEFO : priorité au lot dont l'expiration est la plus proche (méthode opérationnelle) ;
 *  - FIFO : priorité au lot reçu le plus ancien ;
 *  - LIFO : priorité au lot reçu le plus récent (méthode conservée, non prioritaire en officine).
 * Un lot bloqué, épuisé, expiré ou sans date d'expiration n'est jamais proposé à la vente,
 * sauf paramétrage explicite « autoriser la vente de lots expirés ».
 */
export function pickLots(lots, quantity, { date = today(), method = LOT_PICKING.FEFO, allowExpired = false } = {}) {
  const eligible = lots.filter(lot => {
    if (lot.status !== STATUS.AVAILABLE || Number(lot.quantity) <= 0) return false;
    if (allowExpired) return true;
    return Boolean(lot.expiresOn) && lot.expiresOn >= date;
  });
  const comparators = {
    FEFO: (a, b) => String(a.expiresOn).localeCompare(String(b.expiresOn)) || a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id,
    FIFO: (a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id,
    LIFO: (a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id - a.id
  };
  const sorted = eligible.slice().sort(comparators[method] || comparators.FEFO);
  const picked = [];
  let remaining = Number(quantity);
  for (const lot of sorted) {
    const take = Math.min(remaining, Number(lot.quantity));
    if (take > 0) picked.push({ lot, quantity: take });
    remaining -= take;
    if (remaining === 0) break;
  }
  return { picked, missing: remaining };
}

/** Sélection FEFO avec contrôle du disponible ; erreur explicite si insuffisant. */
export function allocate(lots, quantity, options = {}) {
  const { picked, missing } = pickLots(lots, quantity, options);
  ensure(missing === 0,
    'Stock vendable insuffisant : les lots expirés, bloqués ou sans date d’expiration sont exclus.');
  return picked;
}

export async function lockLot(lotId, transaction) {
  const lot = await Lot.findByPk(lotId, { transaction, lock: transaction.LOCK.UPDATE });
  ensure(lot, 'Lot introuvable.', 404);
  return lot;
}

/**
 * Applique une liste de mouvements de stock : verrouillage des lots, contrôle du
 * stock disponible, écriture au journal immuable et incrément de la version du
 * médicament (détection des saisies concurrentes, notamment pendant l'inventaire).
 * lines : [{ productId, lotId, quantity (signé), unitCost, reason? }]
 */
export async function applyMovements({ documentType, documentId, userId, kind, reason = '', lines }, transaction) {
  const touched = new Map();
  for (const line of lines) {
    const lot = await lockLot(line.lotId, transaction);
    ensure(Number(lot.quantity) + Number(line.quantity) >= 0,
      `Stock insuffisant sur le lot ${lot.number} (disponible : ${lot.quantity}).`);
    await lot.update({ quantity: Number(lot.quantity) + Number(line.quantity) }, { transaction });
    await Movement.create({
      documentType, documentId, productId: line.productId, lotId: lot.id,
      location: line.location ?? lot.location,
      quantity: Number(line.quantity), unitCost: money(line.unitCost), kind,
      reason: line.reason ?? reason, userId, createdAt: new Date()
    }, { transaction });
    touched.set(line.productId, (touched.get(line.productId) || 0) + 1);
  }
  for (const [productId, count] of touched) {
    const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(product, 'Médicament introuvable.', 404);
    await product.update({ version: product.version + count }, { transaction });
  }
  return [...touched.keys()];
}

export const movementsOf = (documentType, documentId, transaction) =>
  Movement.findAll({ where: { documentType, documentId }, order: [['id', 'DESC']], transaction });

/**
 * Détecte des mouvements postérieurs sur les mêmes médicaments.
 * Empêche d'annuler une opération ancienne qui perturberait un stock déjà chargé (RG19).
 */
/**
 * Vérifie qu'un document peut être annulé sans casser le stock : chaque ligne
 * à inverser doit pouvoir l'être sur le lot d'origine (jamais de quantité
 * négative). Les mouvements ultérieurs ne bloquent donc plus l'annulation
 * lorsque le stock est suffisant — le journal garde la trace des deux
 * documents, aucun effacement n'a lieu.
 */
export async function ensureReversalPossible(movements, transaction) {
  const manques = [];
  for (const movement of movements) {
    if (Number(movement.quantity) <= 0) continue;       // sortie de stock : l'annulation la remet
    const lot = await Lot.findByPk(movement.lotId, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(lot, `Lot du mouvement ${movement.id} introuvable : annulation impossible.`, 409);
    if (Number(lot.quantity) < Number(movement.quantity)) {
      manques.push(`${lot.number} (${lot.quantity} en stock, ${movement.quantity} à retirer)`);
    }
  }
  ensure(manques.length === 0,
    `Annulation refusée : la marchandise n'est plus en stock sur ${manques.join(', ')}. `
    + 'Effectuer une correction justifiée (réception, perte ou inventaire) après contrôle.', 409);
  return true;
}

/** Contrôle d'intégrité : quantité du lot = somme de ses mouvements (§12). */
export async function integrityReport(transaction) {
  const [rows] = await sequelize.query(`
    SELECT l.id, p.name AS produit, p.code AS code, l.number AS lot, l.location AS magasin,
           l.quantity::int AS quantite_lot,
           COALESCE(SUM(m.quantity), 0)::int AS somme_mouvements
    FROM lots l
    JOIN products p ON p.id = l.product_id
    LEFT JOIN movements m ON m.lot_id = l.id
    GROUP BY l.id, p.name, p.code, l.number, l.location
    HAVING l.quantity <> COALESCE(SUM(m.quantity), 0)::int
    ORDER BY l.id`, { transaction });
  return rows;
}

/** Coût retenu pour une sortie (CMP du médicament ou coût réel du lot). */
export const costFor = (product, lot, valuation) =>
  money(valuation === VALUATION.CMP ? product.cmp : lot.unitCost);

/** Valeur du stock détenu (totalité des lots), selon la méthode retenue (RG20). */
export const valueOfLots = (lots, products, valuation) => lots.reduce((acc, lot) => {
  const product = products.find(p => p.id === lot.productId);
  return acc.add(D(costFor(product || { cmp: 0 }, lot, valuation)).mul(lot.quantity));
}, D(0));
