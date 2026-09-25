// ============================================================================
// Référentiels : médicaments, catégories, fournisseurs.
// Création, modification, désactivation (jamais de suppression : traçabilité),
// contrôle de la plage de marge (RG22) et historique des prix (RG23, RG24).
// ============================================================================
import { Category, Supplier, Product } from '../models/index.js';
import { read, write } from '../utils/transaction.js';
import { ensure } from '../utils/errors.js';
import { D } from '../utils/money.js';
import { log, publicSnapshot } from '../services/audit.service.js';
import { changeMarginRate, priceHistory, assertMarginRate } from '../services/pricing.service.js';
import { getSettings } from '../services/settings.service.js';

const MODELS = { categories: Category, suppliers: Supplier, products: Product };
const ENTITY = { categories: 'CATEGORY', suppliers: 'SUPPLIER', products: 'PRODUCT' };

const modelOf = resource => {
  const model = MODELS[resource];
  ensure(model, 'Référentiel inconnu.', 404);
  return model;
};

export async function create(req, res) {
  const resource = req.params.resource;
  const model = modelOf(resource);
  const record = await write(async transaction => {
    const values = { ...req.body };
    if (resource === 'products') {
      const settings = await getSettings(transaction);
      assertMarginRate(values.marginRate, settings.toJSON());
      values.cmp = '0.000000';
      values.sellingPrice = '0.000000';
      values.version = 0;
      values.updatedAt = new Date();
    }
    const created = await model.create({ ...values, createdAt: new Date() }, { transaction });
    await log({
      userId: req.user.id, action: 'CREATE', entity: ENTITY[resource], entityId: created.id,
      after: publicSnapshot(req.body), ip: req.ip
    }, transaction);
    return created;
  });
  res.status(201).json(record);
}

export async function update(req, res) {
  const resource = req.params.resource;
  const model = modelOf(resource);
  const record = await write(async transaction => {
    const current = await model.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(current, 'Élément introuvable.', 404);
    const before = current.toJSON();
    const values = { ...req.body };
    // Les valeurs calculées ne sont jamais modifiables directement par l'interface.
    delete values.cmp;
    delete values.sellingPrice;
    delete values.version;

    if (resource === 'products') {
      const settings = await getSettings(transaction);
      assertMarginRate(values.marginRate, settings.toJSON());
      const rateChanged = !D(values.marginRate).eq(current.marginRate);
      if (rateChanged) {
        ensure(req.permissions.includes('prices'), 'Seuls les profils autorisés modifient le taux de marge ou le prix de vente (RG24).', 403);
        await changeMarginRate(current.id, values.marginRate, settings.toJSON(), req.user, 'Modification de la fiche médicament', transaction);
        delete values.marginRate;
      }
      const movements = await import('../models/index.js').then(models => models.Movement.count({ where: { productId: current.id }, transaction }));
      ensure(movements === 0 || values.unit === current.unit,
        'L’unité de gestion ne peut plus changer après un mouvement de stock (une nouvelle référence est nécessaire).');
      values.updatedAt = new Date();
    }

    await current.update(values, { transaction });
    await log({
      userId: req.user.id, action: 'UPDATE', entity: ENTITY[resource], entityId: current.id,
      before: publicSnapshot(before), after: publicSnapshot(values), ip: req.ip
    }, transaction);
    return current;
  });
  res.json(record);
}

/** Modification du taux de marge : recalcul du prix de vente et trace (RG23, RG24). */
export async function updateMargin(req, res) {
  const result = await write(async transaction => {
    const settings = await getSettings(transaction);
    return changeMarginRate(Number(req.params.id), req.body.marginRate, settings.toJSON(), req.user, req.body.reason, transaction);
  });
  res.json({
    product: result.product,
    sellingPrice: result.sellingPrice,
    cost: result.cost,
    rate: result.rate
  });
}

export async function history(req, res) {
  res.json(await read(transaction => priceHistory(Number(req.params.id), transaction)));
}

/** Recherche rapide : nom, code, principe actif, code-barres (écrans Ventes, Stock, Réception). */
export async function search(req, res) {
  const term = String(req.query.q || '').trim();
  ensure(term.length >= 2, 'Saisir au moins 2 caractères.', 422);
  const needle = term.toLowerCase();
  const products = await Product.findAll({ order: [['name', 'ASC']], limit: 500 });
  res.json({
    term,
    products: products.filter(product => [product.code, product.name, product.ingredient, product.barcode, product.manufacturer]
      .some(field => String(field || '').toLowerCase().includes(needle)))
  });
}
