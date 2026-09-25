// ============================================================================
// Rapports (§9.16, §9.15). Toutes les requêtes sont paramétrées (aucune
// concaténation de valeur utilisateur) et paginées, avec export CSV possible.
//
// NOUVEAU — les rapports sont par magasin :
//   • la FICHE DE STOCK existe en double : celle du DÉPÔT (réserve) et celle de
//     la PHARMACIE (comptoir). Chacune a son stock initial, ses entrées, ses
//     sorties et son stock final, calculés depuis les mouvements du magasin ;
//   • le rapport « Transferts » montre ce qui est passé du dépôt à la pharmacie ;
//   • le stock initial d'une période reste le stock final de la précédente,
//     automatiquement, dans chaque magasin.
// ============================================================================
import { sequelize } from '../config/database.js';
import { today, addDays, dayRange } from '../utils/dates.js';
import { D, money } from '../utils/money.js';
import { ensure } from '../utils/errors.js';
import { getSettings } from './settings.service.js';
import { LOCATIONS, LOCATION_LABELS } from '../config/constants.js';

export const REPORT_TYPES = [
  'fiche', 'fiche_depot', 'stock', 'movements', 'transfers', 'sales', 'receipts',
  'losses', 'expirations', 'inventories', 'prices', 'suppliers'
];

export const REPORT_LABELS = {
  fiche: 'Fiche de stock — PHARMACIE (initial · entrées · sorties · final)',
  fiche_depot: 'Fiche de stock — DÉPÔT (initial · entrées · sorties · final)',
  stock: 'État du stock',
  movements: 'Mouvements de stock',
  transfers: 'Transferts dépôt → pharmacie',
  sales: 'Ventes et marges (pharmacie)',
  receipts: 'Achats et réceptions (dépôt)',
  losses: 'Pertes et dons',
  expirations: 'Expirations (proches et dépassées)',
  inventories: 'Inventaires et écarts',
  prices: 'Historique des prix (RG23)',
  suppliers: 'Activité par fournisseur'
};

const LIMIT = 500;

/** Magasin par défaut de chaque rapport. */
const LOCATION_PAR_DEFAUT = {
  fiche: 'PHARMACY', fiche_depot: 'DEPOT', stock: 'PHARMACY', movements: 'PHARMACY',
  losses: 'PHARMACY', expirations: 'PHARMACY', inventories: 'PHARMACY'
};

/** Sélectionne et exécute la requête correspondant au rapport demandé. */
export async function buildReport({ type, from, to, supplierId = null, location = null, page = 1, limit = LIMIT }, transaction) {
  ensure(REPORT_TYPES.includes(type), 'Type de rapport inconnu.');
  ensure(from <= to, 'Période invalide : la date de début est postérieure à la date de fin.');

  // Le magasin demandé : « ALL » (les deux, avec une colonne Magasin) ou l'un des deux.
  let magasin = location || LOCATION_PAR_DEFAUT[type] || 'PHARMACY';
  if (type === 'fiche_depot') magasin = 'DEPOT';
  if (type === 'fiche') magasin = 'PHARMACY';
  ensure(magasin === 'ALL' || LOCATIONS.includes(magasin), 'Magasin inconnu.');

  const { start, end } = dayRange(from, to);
  const offset = (page - 1) * limit;
  const settings = await getSettings(transaction);
  const replacements = {
    start, end, supplierId, limit, offset,
    onDate: today(),
    horizon: addDays(today(), Number(settings.expiryDays || 90)),
    cmp: settings.valuation,
    location: magasin,
    parMagasin: magasin !== 'ALL',
    depot: 'DEPOT',
    pharmacie: 'PHARMACY'
  };

  /** Bloc SQL commun : la fiche de stock d'un magasin donné. */
  const ficheSql = (withLocationColumn) => `
      SELECT p.code AS "Code", p.name AS "Médicament",
             ${withLocationColumn ? "CASE :location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS \"Magasin\"," : ''}
             COALESCE(c.name, '—') AS "Catégorie", p.unit AS "Unité",
             COALESCE(avant.qte, 0)::int AS "Stock initial",
             COALESCE(entrees.qte, 0)::int AS "Entrées",
             COALESCE(sorties.qte, 0)::int AS "Sorties",
             (COALESCE(avant.qte, 0) + COALESCE(entrees.qte, 0) - COALESCE(sorties.qte, 0))::int AS "Stock final",
             p.min_stock::int AS "Seuil minimum",
             CASE
               WHEN (COALESCE(avant.qte, 0) + COALESCE(entrees.qte, 0) - COALESCE(sorties.qte, 0)) <= 0 THEN 'Rupture'
               WHEN (COALESCE(avant.qte, 0) + COALESCE(entrees.qte, 0) - COALESCE(sorties.qte, 0)) <= p.min_stock THEN 'Sous le seuil'
               ELSE 'Correct'
             END AS "Situation",
             ROUND(CASE WHEN :cmp = 'CMP' THEN p.cmp ELSE COALESCE(cout.cout, p.cmp) END, 2) AS "Coût unitaire (Ar)",
             ROUND((COALESCE(avant.qte, 0) + COALESCE(entrees.qte, 0) - COALESCE(sorties.qte, 0))
                   * CASE WHEN :cmp = 'CMP' THEN p.cmp ELSE COALESCE(cout.cout, p.cmp) END, 2) AS "Valeur (Ar)"
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS qte FROM movements
        WHERE location = :location AND created_at < :start GROUP BY product_id
      ) avant ON avant.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS qte FROM movements
        WHERE location = :location AND created_at >= :start AND created_at < :end AND quantity > 0 GROUP BY product_id
      ) entrees ON entrees.product_id = p.id
      LEFT JOIN (
        SELECT product_id, -SUM(quantity) AS qte FROM movements
        WHERE location = :location AND created_at >= :start AND created_at < :end AND quantity < 0 GROUP BY product_id
      ) sorties ON sorties.product_id = p.id
      LEFT JOIN (
        SELECT product_id,
               CASE WHEN SUM(quantity) > 0 THEN SUM(quantity * unit_cost) / SUM(quantity) ELSE 0 END AS cout
        FROM lots WHERE location = :location GROUP BY product_id
      ) cout ON cout.product_id = p.id
      WHERE p.active
      ORDER BY p.name`;

  const queries = {
    // §9.13 — Fiche de stock de la PHARMACIE (le registre du comptoir).
    fiche: ficheSql(false),

    // Fiche de stock du DÉPÔT : même présentation, magasin de la réserve.
    fiche_depot: ficheSql(false),

    stock: `
      SELECT p.code AS "Code", p.name AS "Médicament", c.name AS "Catégorie", p.unit AS "Unité",
             CASE l.location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS "Magasin",
             l.number AS "Lot", l.expires_on AS "Expiration", l.quantity::int AS "Quantité",
             l.unit_cost AS "Coût unitaire (Ar)",
             ROUND(l.quantity * CASE WHEN :cmp = 'CMP' THEN p.cmp ELSE l.unit_cost END, 2) AS "Valeur (Ar)",
             s.name AS "Fournisseur"
      FROM lots l
      JOIN products p ON p.id = l.product_id
      JOIN suppliers s ON s.id = l.supplier_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE (:parMagasin = FALSE OR l.location = :location)
        AND (:supplierId::int IS NULL OR s.id = :supplierId::int)
      ORDER BY p.name, l.expires_on NULLS LAST, l.number`,

    movements: `
      SELECT m.created_at AS "Date", m.document_type AS "Type", m.kind AS "Nature",
             CASE m.location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS "Magasin",
             p.code AS "Code", p.name AS "Médicament", l.number AS "Lot",
             m.quantity::int AS "Quantité", m.unit_cost AS "Coût unitaire (Ar)",
             ROUND(m.quantity * m.unit_cost, 2) AS "Valeur (Ar)",
             u.name AS "Utilisateur", m.reason AS "Motif"
      FROM movements m
      JOIN products p ON p.id = m.product_id
      JOIN lots l ON l.id = m.lot_id
      JOIN users u ON u.id = m.user_id
      WHERE m.created_at >= :start AND m.created_at < :end
        AND (:parMagasin = FALSE OR m.location = :location)
      ORDER BY m.id DESC`,

    // Ce qui est passé de la réserve au comptoir sur la période.
    transfers: `
      SELECT t.created_at AS "Date", t.reference AS "Référence", t.reason AS "Motif",
             p.code AS "Code", p.name AS "Médicament", l.number AS "Lot", l.expires_on AS "Expiration",
             tl.quantity::int AS "Quantité transférée",
             tl.unit_cost AS "Coût unitaire (Ar)",
             ROUND(tl.quantity * tl.unit_cost, 2) AS "Valeur (Ar)",
             u.name AS "Auteur", t.status AS "État"
      FROM transfer_lines tl
      JOIN transfers t ON t.id = tl.transfer_id
      JOIN products p ON p.id = tl.product_id
      JOIN lots l ON l.id = tl.from_lot_id
      JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= :start AND t.created_at < :end
      ORDER BY t.id DESC, tl.id ASC`,

    sales: `
      SELECT sa.created_at AS "Date", sa.reference AS "Référence", sa.customer_name AS "Client",
             sl.quantity::int AS "Quantité", p.name AS "Médicament", l.number AS "Lot",
             sl.unit_price AS "Prix unitaire (Ar)", sl.unit_cost AS "Coût retenu (Ar)",
             ROUND(sl.margin, 2) AS "Marge (Ar)", u.name AS "Servi par"
      FROM sale_lines sl
      JOIN sales sa ON sa.id = sl.sale_id
      JOIN products p ON p.id = sl.product_id
      JOIN lots l ON l.id = sl.lot_id
      JOIN users u ON u.id = sa.user_id
      WHERE sa.status = 'VALIDATED' AND sa.created_at >= :start AND sa.created_at < :end
      ORDER BY sa.id DESC, sl.id ASC`,

    receipts: `
      SELECT r.created_at AS "Date", r.reference AS "Référence", s.name AS "Fournisseur",
             p.name AS "Médicament", rl.number AS "Lot", rl.quantity::int AS "Quantité reçue",
             rl.purchase_price AS "Prix d'achat (Ar)", rl.allocated_fees AS "Frais attribués (Ar)",
             rl.unit_cost AS "Coût de revient (Ar)", rl.expires_on AS "Expiration",
             r.invoice_ref AS "Facture", u.name AS "Récepteur"
      FROM receipt_lines rl
      JOIN receipts r ON r.id = rl.receipt_id
      JOIN suppliers s ON s.id = r.supplier_id
      JOIN products p ON p.id = rl.product_id
      JOIN users u ON u.id = r.user_id
      WHERE r.status = 'VALIDATED' AND r.created_at >= :start AND r.created_at < :end
        AND (:supplierId::int IS NULL OR s.id = :supplierId::int)
      ORDER BY r.id DESC, rl.id ASC`,

    losses: `
      SELECT lo.created_at AS "Date", lo.reference AS "Référence", lo.reason AS "Motif",
             CASE lo.location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS "Magasin",
             p.name AS "Médicament", l.number AS "Lot", ll.quantity::int AS "Quantité",
             ll.unit_cost AS "Coût retenu (Ar)", ROUND(ll.quantity * ll.unit_cost, 2) AS "Valeur (Ar)",
             u.name AS "Utilisateur", lo.note AS "Remarque"
      FROM loss_lines ll
      JOIN losses lo ON lo.id = ll.loss_id
      JOIN products p ON p.id = ll.product_id
      JOIN lots l ON l.id = ll.lot_id
      JOIN users u ON u.id = lo.user_id
      WHERE lo.status = 'VALIDATED' AND lo.created_at >= :start AND lo.created_at < :end
        AND (:parMagasin = FALSE OR lo.location = :location)
      ORDER BY lo.id DESC, ll.id ASC`,

    expirations: `
      SELECT p.code AS "Code", p.name AS "Médicament",
             CASE l.location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS "Magasin",
             l.number AS "Lot", l.expires_on AS "Expiration", l.quantity::int AS "Quantité en stock",
             l.unit_cost AS "Coût unitaire (Ar)",
             ROUND(l.quantity * l.unit_cost, 2) AS "Valeur immobilisée (Ar)",
             CASE
               WHEN l.expires_on IS NULL THEN 'Date manquante'
               WHEN l.expires_on < :onDate THEN 'Expiré'
               WHEN l.expires_on <= :horizon THEN 'Expire bientôt'
               ELSE 'Valide'
             END AS "Situation",
             s.name AS "Fournisseur"
      FROM lots l
      JOIN products p ON p.id = l.product_id
      JOIN suppliers s ON s.id = l.supplier_id
      WHERE l.quantity > 0 AND (l.expires_on IS NULL OR l.expires_on <= :horizon)
        AND (:parMagasin = FALSE OR l.location = :location)
        AND (:supplierId::int IS NULL OR s.id = :supplierId::int)
      ORDER BY l.expires_on NULLS FIRST`,

    inventories: `
      SELECT i.created_at AS "Ouverture", i.reference AS "Référence",
             CASE i.location WHEN 'DEPOT' THEN 'Dépôt' ELSE 'Pharmacie' END AS "Magasin",
             i.status AS "Statut",
             i.scope AS "Périmètre", i.lines_count::int AS "Lots comptés",
             COUNT(il.id) FILTER (WHERE il.gap <> 0)::int AS "Lots avec écart",
             COALESCE(SUM(il.gap), 0)::int AS "Écart total (unités)",
             u.name AS "Responsable", i.validated_at AS "Validation",
             a.reference AS "Ajustement"
      FROM inventories i
      JOIN users u ON u.id = i.user_id
      LEFT JOIN inventory_lines il ON il.inventory_id = i.id
      LEFT JOIN adjustments a ON a.id = i.adjustment_id
      WHERE i.created_at >= :start AND i.created_at < :end
        AND (:parMagasin = FALSE OR i.location = :location)
      GROUP BY i.id, u.name, a.reference
      ORDER BY i.id DESC`,

    prices: `
      SELECT ph.created_at AS "Date", p.code AS "Code", p.name AS "Médicament",
             ph.cost AS "Coût retenu (Ar)", ph.rate AS "Taux (%)", ph.price AS "Prix de vente (Ar)",
             CASE ph.mode WHEN 'COST' THEN 'Marge sur coût' ELSE 'Marge sur prix de vente' END AS "Base",
             ph.origin AS "Origine", ph.reason AS "Motif", u.name AS "Auteur"
      FROM price_history ph
      JOIN products p ON p.id = ph.product_id
      JOIN users u ON u.id = ph.user_id
      WHERE ph.created_at >= :start AND ph.created_at < :end
      ORDER BY ph.id DESC`,

    suppliers: `
      SELECT s.name AS "Fournisseur", s.phone AS "Téléphone",
             COUNT(DISTINCT r.id)::int AS "Réceptions",
             ROUND(COALESCE(SUM(DISTINCT r.cost_total), 0), 2) AS "Valeur reçue (Ar)",
             COUNT(DISTINCT rl.lot_id)::int AS "Lots fournis"
      FROM suppliers s
      LEFT JOIN receipts r ON r.supplier_id = s.id AND r.created_at >= :start AND r.created_at < :end AND r.status = 'VALIDATED'
      LEFT JOIN receipt_lines rl ON rl.receipt_id = r.id
      WHERE (:supplierId::int IS NULL OR s.id = :supplierId::int)
      GROUP BY s.id, s.name, s.phone
      ORDER BY s.name`
  };

  const base = queries[type];
  const [rows] = await sequelize.query(
    `SELECT * FROM (${base}) AS rapport LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    { replacements, transaction }
  );
  const [counted] = await sequelize.query(
    `SELECT COUNT(*)::int AS total FROM (${base}) AS rapport`,
    { replacements, transaction }
  );

  // Les totaux de la fiche de stock servent d'en-tête à l'impression.
  let totals = null;
  if (type === 'fiche' || type === 'fiche_depot') {
    totals = rows.reduce((acc, ligne) => ({
      initial: acc.initial + Number(ligne['Stock initial']),
      entrees: acc.entrees + Number(ligne['Entrées']),
      sorties: acc.sorties + Number(ligne['Sorties']),
      final: acc.final + Number(ligne['Stock final']),
      valeur: acc.valeur + Number(ligne['Valeur (Ar)'])
    }), { initial: 0, entrees: 0, sorties: 0, final: 0, valeur: 0 });
  }

  return {
    rows, count: counted[0]?.total ?? rows.length, page, limit, type,
    label: REPORT_LABELS[type],
    location: (type === 'fiche' || type === 'fiche_depot') ? magasin : (magasin === 'ALL' ? 'ALL' : magasin),
    locationLabel: magasin === 'ALL' ? 'Dépôt et pharmacie' : LOCATION_LABELS[magasin],
    totals
  };
}

/** Totaux de synthèse affichés en tête de rapport (au-delà de la pagination). */
export async function reportSummary({ from, to }, transaction) {
  const { start, end } = dayRange(from, to);
  const [rows] = await sequelize.query(`
    SELECT
      (SELECT ROUND(COALESCE(SUM(total),0),2) FROM sales WHERE status='VALIDATED' AND created_at >= :start AND created_at < :end) AS "ventes",
      (SELECT ROUND(COALESCE(SUM(margin),0),2) FROM sales WHERE status='VALIDATED' AND created_at >= :start AND created_at < :end) AS "marge",
      (SELECT ROUND(COALESCE(SUM(cost_total),0),2) FROM losses WHERE status='VALIDATED' AND created_at >= :start AND created_at < :end) AS "pertes",
      (SELECT ROUND(COALESCE(SUM(cost_total),0),2) FROM receipts WHERE status='VALIDATED' AND created_at >= :start AND created_at < :end) AS "achats",
      (SELECT ROUND(COALESCE(SUM(cost_total),0),2) FROM transfers WHERE status='VALIDATED' AND created_at >= :start AND created_at < :end) AS "transferts",
      (SELECT COUNT(*)::int FROM movements WHERE created_at >= :start AND created_at < :end) AS "mouvements"
  `, { replacements: { start, end }, transaction });
  return rows[0];
}

export const reportValue = money;
export const reportDecimal = D;
