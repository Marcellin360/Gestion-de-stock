// ============================================================================
// Données du poste de travail : /api/data renvoie en une seule requête tout ce
// dont l'interface a besoin, filtré selon le rôle (RG18).
//
// Répartition des magasins :
//   • DEPOT    : réserve — la marchandise reçue y entre, le dépôt approvisionne ;
//   • PHARMACY : officine — c'est là que se font les ventes.
// Chaque magasin a ses alertes, sa valeur de stock et ses documents.
// ============================================================================
import {
  Category, Supplier, Product, Lot, Inventory, Movement,
  ProductForm, UnitOfMeasure
} from '../models/index.js';
import { getSettings } from './settings.service.js';
import { listRecent } from './document.service.js';
import { computeAlerts, computeStats } from './alert.service.js';
import { sequelize } from '../config/database.js';
import { config } from '../config/index.js';
import { today } from '../utils/dates.js';
import { LOCATION_LABELS } from '../config/constants.js';

const plain = rows => rows.map(row => row.toJSON());

export async function buildData(user, transaction) {
  const settings = (await getSettings(transaction)).toJSON();
  // Les taux de marge sont des pourcentages : on renvoie des nombres, pas des
  // chaînes décimales, pour que les formulaires les affichent directement.
  settings.minMargin = Number(settings.minMargin);
  settings.maxMargin = Number(settings.maxMargin);
  settings.expiryDays = Number(settings.expiryDays);

  const [categories, suppliers, products, lots, inventories, productForms, units] = await Promise.all([
    Category.findAll({ order: [['name', 'ASC']], transaction }),
    Supplier.findAll({ order: [['name', 'ASC']], transaction }),
    Product.findAll({ order: [['name', 'ASC']], transaction }),
    Lot.findAll({ order: [['expiresOn', 'ASC NULLS LAST'], ['id', 'ASC']], transaction }),
    Inventory.findAll({ order: [['id', 'DESC']], limit: 100, transaction }),
    ProductForm.findAll({ order: [['name', 'ASC']], transaction }),
    UnitOfMeasure.findAll({ order: [['name', 'ASC']], transaction })
  ]);

  const documents = await listRecent(300, transaction);
  const movements = await Movement.findAll({ order: [['id', 'DESC']], limit: 600, transaction });
  const date = today();
  const lotsPlats = plain(lots);
  const produitsPlats = plain(products);
  const fournisseursPlats = plain(suppliers);

  const parMagasin = location => ({
    location,
    label: LOCATION_LABELS[location],
    stats: computeStats({ products: produitsPlats, lots: lotsPlats, settings, documents, date, location }),
    alerts: computeAlerts({ products: produitsPlats, lots: lotsPlats, suppliers: fournisseursPlats, settings, date, location })
  });

  const payload = {
    date,
    settings,
    categories: plain(categories),
    suppliers: fournisseursPlats,
    products: produitsPlats,
    lots: lotsPlats,
    inventories: plain(inventories),
    productForms: plain(productForms),
    units: plain(units),
    documents,
    movements: plain(movements),
    stats: computeStats({ products: produitsPlats, lots: lotsPlats, settings, documents, date }),
    alerts: computeAlerts({ products: produitsPlats, lots: lotsPlats, suppliers: fournisseursPlats, settings, date }),
    locations: { DEPOT: parMagasin('DEPOT'), PHARMACY: parMagasin('PHARMACY') }
  };

  const roleCode = user.roleCode || user.role?.code;
  if (roleCode === 'DEPOT') return restrictForDepot(payload);
  return payload;
}

/**
 * Vue « Dépôt » : le magasin travaille sur le dépôt — il voit les coûts
 * d'achat (nécessaires aux réceptions) ET, depuis la 2.7.9, le prix de vente
 * (il sert aux étiquettes et à renseigner le comptoir). Le chiffre d'affaires
 * et la marge du jour restent l'affaire de la pharmacie.
 */
function restrictForDepot(payload) {
  return {
    ...payload,
    stats: {
      ...payload.locations.DEPOT.stats,
      salesToday: '0.000000',
      salesTodayCount: 0,
      marginToday: '0.000000'
    },
    alerts: payload.locations.DEPOT.alerts,
    documents: payload.documents.filter(d => ['RECEIPT', 'TRANSFER', 'LOSS', 'ADJUSTMENT'].includes(d.kind))
      .map(({ margin, ...rest }) => rest),
    movements: payload.movements.filter(m => m.location === 'DEPOT'),
    inventories: payload.inventories.filter(i => i.location === 'DEPOT'),
    // 2.7.9 — le dépôt VOIT désormais le prix de vente (demande du comptoir :
    // il sert aux étiquettes et aux réponses aux clients). Aucun masquage : les
    // produits sont transmis tels quels. JAMAIS de « 0 Ar » fabriqué : le prix
    // vient du serveur, calculé sur le CMP par défaut (voir pricing.service.js).
    products: payload.products,
    lots: payload.lots.filter(l => l.location === 'DEPOT'),
    // Le bloc « pharmacie » (valeur du stock, ventes du jour, alertes du comptoir)
    // n'est pas transmis au dépôt : son tableau de bord ne montre que la réserve.
    locations: { DEPOT: payload.locations.DEPOT }
  };
}

// ============================================================================
// 2.7.17 — CALENDRIER DES VENTES (tableau de bord de la pharmacie).
// Agrégat jour par jour d'un mois (AAAA-MM) : nombre de ventes validées,
// chiffre d'affaires et marge. Le détail du jour cliqué est lu via le rapport
// « sales » existant (/api/reports?type=sales&from=JJ&to=JJ).
// Les regroupements se font sur la DATE LOCALE de la pharmacie (fuseau
// Indian/Antananarivo, comme « Ventes du jour » du tableau de bord).
// ============================================================================
export async function salesCalendar(month, transaction) {
  const [annee, mois] = month.split('-').map(Number);
  // Bornes du mois à l'heure de la pharmacie (+03:00, comme dayRange()).
  const debut = new Date(`${month}-01T00:00:00+03:00`);
  const fin = mois === 12
    ? new Date(`${annee + 1}-01-01T00:00:00+03:00`)
    : new Date(`${annee}-${String(mois + 1).padStart(2, '0')}-01T00:00:00+03:00`);

  const [jours] = await sequelize.query(
    `SELECT to_char(created_at AT TIME ZONE :fuseau, 'YYYY-MM-DD') AS "date",
            COUNT(*)::int AS "count",
            ROUND(COALESCE(SUM(total), 0), 2)::float8 AS "total",
            ROUND(COALESCE(SUM(margin), 0), 2)::float8 AS "margin"
     FROM sales
     WHERE status = 'VALIDATED' AND created_at >= :debut AND created_at < :fin
     GROUP BY 1 ORDER BY 1`,
    { replacements: { debut, fin, fuseau: config.timezone }, transaction }
  );
  return { month, days: jours };
}

// ============================================================================
// 2.7.18 — HISTOGRAMME DES VENTES (tableau de bord de la pharmacie).
// Agrégat MOIS PAR MOIS sur les 12 derniers mois glissants : nombre de ventes,
// chiffre d'affaires (total des ventes) et marge — toujours en jour/mois local.
// ============================================================================
export async function salesMonthly(transaction) {
  // Premier jour du mois de référence, -11 mois → fenêtre de 12 mois glissants.
  const maintenant = today();
  const [annee, mois] = maintenant.slice(0, 7).split('-').map(Number);
  const total = annee * 12 + (mois - 1) - 11;
  const debut = new Date(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01T00:00:00+03:00`);

  const [lignes] = await sequelize.query(
    `SELECT to_char(created_at AT TIME ZONE :fuseau, 'YYYY-MM') AS "month",
            COUNT(*)::int AS "count",
            ROUND(COALESCE(SUM(total), 0), 2)::float8 AS "total",
            ROUND(COALESCE(SUM(margin), 0), 2)::float8 AS "margin"
     FROM sales
     WHERE status = 'VALIDATED' AND created_at >= :debut
     GROUP BY 1 ORDER BY 1`,
    { replacements: { debut, fuseau: config.timezone }, transaction }
  );
  return lignes;
}

// ============================================================================
// 2.7.20 — DÉPÔT.
// A) CALENDRIER DES STOCK (menu dédié) : agrégat JOUR PAR JOUR d'un mois —
//    entrées au dépôt (réceptions validées, valeur d'achat) et sorties du
//    dépôt vers la pharmacie (transferts validés, valeur au coût).
// B) GRAPHIQUE FLUX (tableau de bord du dépôt) : médicaments ENTRÉS vs SORTIS
//    chaque mois (12 mois glissants), quantités en unité de gestion (boîtes).
//    « Sorties » = tout ce qui quitte la réserve (transferts, pertes, écarts).
// ============================================================================
export async function stockCalendar(month, transaction) {
  const [annee, mois] = month.split('-').map(Number);
  const debut = new Date(`${month}-01T00:00:00+03:00`);
  const fin = mois === 12
    ? new Date(`${annee + 1}-01-01T00:00:00+03:00`)
    : new Date(`${annee}-${String(mois + 1).padStart(2, '0')}-01T00:00:00+03:00`);

  const [entrees] = await sequelize.query(
    `SELECT to_char(created_at AT TIME ZONE :fuseau, 'YYYY-MM-DD') AS "date",
            COUNT(*)::int AS "count",
            ROUND(COALESCE(SUM(cost_total), 0), 2)::float8 AS "value"
     FROM receipts
     WHERE status = 'VALIDATED' AND created_at >= :debut AND created_at < :fin
     GROUP BY 1`,
    { replacements: { debut, fin, fuseau: config.timezone }, transaction }
  );
  const [sorties] = await sequelize.query(
    `SELECT to_char(created_at AT TIME ZONE :fuseau, 'YYYY-MM-DD') AS "date",
            COUNT(*)::int AS "count",
            ROUND(COALESCE(SUM(cost_total), 0), 2)::float8 AS "value"
     FROM transfers
     WHERE status = 'VALIDATED' AND created_at >= :debut AND created_at < :fin
     GROUP BY 1`,
    { replacements: { debut, fin, fuseau: config.timezone }, transaction }
  );
  const entreesParJour = new Map(entrees.map(jour => [jour.date, jour]));
  const sortiesParJour = new Map(sorties.map(jour => [jour.date, jour]));
  const dates = new Set([...entreesParJour.keys(), ...sortiesParJour.keys()]);
  const days = [...dates].sort().map(date => ({
    date,
    receipts: entreesParJour.get(date)?.count ?? 0,
    receiptsValue: entreesParJour.get(date)?.value ?? 0,
    transfers: sortiesParJour.get(date)?.count ?? 0,
    transfersValue: sortiesParJour.get(date)?.value ?? 0
  }));
  return { month, days };
}

/** Flux mensuels du DÉPÔT : quantités (boîtes) entrées et sorties par mois. */
export async function stockFlowMonthly(transaction) {
  const maintenant = today();
  const [annee, mois] = maintenant.slice(0, 7).split('-').map(Number);
  const totalMois = annee * 12 + (mois - 1) - 11;
  const debut = new Date(`${Math.floor(totalMois / 12)}-${String((totalMois % 12) + 1).padStart(2, '0')}-01T00:00:00+03:00`);

  const [lignes] = await sequelize.query(
    `SELECT to_char(created_at AT TIME ZONE :fuseau, 'YYYY-MM') AS "month",
            ROUND(COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0), 3)::float8 AS "in",
            ROUND(COALESCE(SUM(CASE WHEN quantity < 0 THEN -quantity ELSE 0 END), 0), 3)::float8 AS "out"
     FROM movements
     WHERE location = 'DEPOT' AND created_at >= :debut
     GROUP BY 1 ORDER BY 1`,
    { replacements: { debut, fuseau: config.timezone }, transaction }
  );
  return lignes;
}