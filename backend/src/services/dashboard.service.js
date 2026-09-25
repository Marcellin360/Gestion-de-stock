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
 * d'achat (nécessaires aux réceptions) mais jamais la marge ni le prix de vente,
 * et il ne voit pas le chiffre d'affaires de l'officine.
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
    products: payload.products.map(({ sellingPrice, ...rest }) => rest),
    lots: payload.lots.filter(l => l.location === 'DEPOT'),
    // Le bloc « pharmacie » (valeur du stock, ventes du jour, alertes du comptoir)
    // n'est pas transmis au dépôt : son tableau de bord ne montre que la réserve.
    locations: { DEPOT: payload.locations.DEPOT }
  };
}