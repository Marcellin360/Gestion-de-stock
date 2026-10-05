// ============================================================================
// Référentiels : médicaments, catégories, fournisseurs.
// Création, modification, désactivation (jamais de suppression : traçabilité),
// contrôle de la plage de marge (RG22) et historique des prix (RG23, RG24).
// ============================================================================
import { Category, Supplier, Product, Receipt, Lot } from '../models/index.js';
import { read, write } from '../utils/transaction.js';
import { ensure } from '../utils/errors.js';
import { D } from '../utils/money.js';
import { log, publicSnapshot } from '../services/audit.service.js';
import { changeMarginRate, priceHistory, assertMarginRate } from '../services/pricing.service.js';
import { getSettings } from '../services/settings.service.js';
import { prochainCodeProduit, prochainCodeBarres } from '../services/codes.service.js';

const MODELS = { categories: Category, suppliers: Supplier, products: Product };
const ENTITY = { categories: 'CATEGORY', suppliers: 'SUPPLIER', products: 'PRODUCT' };

/**
 * Nom automatique d'un fournisseur créé sans raison sociale.
 * On part de ce que l'utilisateur a bien voulu donner (personne à contacter,
 * puis téléphone) ; à défaut, « Fournisseur 4 », « Fournisseur 5 »… en évitant
 * les numéros déjà pris. Le nom reste modifiable ensuite par le crayon.
 */
async function nomFournisseurAuto(values, transaction) {
  const propose = String(values.contact || '').trim() || String(values.phone || '').trim();
  if (propose) return propose;
  const total = await Supplier.count({ transaction });
  for (let numero = total + 1; numero < total + 1000; numero += 1) {
    const nom = `Fournisseur ${numero}`;
    const pris = await Supplier.count({ where: { name: nom }, transaction });
    if (!pris) return nom;
  }
  return `Fournisseur ${Date.now()}`;
}

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
      // Code interne et code-barres : attribués par le logiciel (jamais saisis à
      // la main). Un import de fichier peut encore les fournir : dans ce cas la
      // valeur reçue est conservée.
      values.code = values.code ? String(values.code).trim() : await prochainCodeProduit(transaction);
      values.barcode = values.barcode ? String(values.barcode).trim() : await prochainCodeBarres(transaction);
      values.cmp = '0.000000';
      values.sellingPrice = '0.000000';
      values.version = 0;
      values.updatedAt = new Date();
    }
    if (resource === 'suppliers' && !String(values.name || '').trim()) {
      values.name = await nomFournisseurAuto(values, transaction);
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
    // Les valeurs calculées ne sont jamais modifiables directement par l'interface,
    // et les identifiants/horodatages renvoyés par un écran sont ignorés (le schéma
    // les accepte pour éviter un refus « champ inconnu », on les retire ici).
    for (const technique of ['id', 'createdAt', 'updatedAt', 'cmp', 'sellingPrice', 'version']) {
      delete values[technique];
    }

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

    if (resource === 'suppliers' && !String(values.name || '').trim()) {
      values.name = current.name; // le nom n'est jamais vidé : on garde celui en place
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

/**
 * Suppression d'un fournisseur (bouton corbeille de la liste).
 *
 * Deux garde-fous, dans cet ordre :
 *   • seuls les FOURNISSEURS peuvent être supprimés — un médicament ou une
 *     catégorie est cité par l'historique des mouvements, on les désactive ;
 *   • un fournisseur qui a déjà livré (réceptions ou lots enregistrés) n'est
 *     jamais supprimé : sinon les rapports d'achat deviendraient illisibles.
 *     Le message explique alors qu'il faut décocher « Fournisseur actif ».
 */
export async function remove(req, res) {
  const resource = req.params.resource;
  ensure(resource === 'suppliers',
    'Seuls les fournisseurs peuvent être supprimés : les médicaments et les catégories sont cités par l’historique de stock.', 403);
  const id = Number(req.params.id);

  await write(async transaction => {
    const fournisseur = await modelOf(resource).findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    ensure(fournisseur, 'Fournisseur introuvable.', 404);

    const receptions = await Receipt.count({ where: { supplierId: id }, transaction });
    const lots = await Lot.count({ where: { supplierId: id }, transaction });
    ensure(receptions === 0 && lots === 0,
      `Suppression impossible : « ${fournisseur.name} » a déjà servi (${receptions} réception(s), ${lots} lot(s)). `
      + 'Décochez « Fournisseur actif » dans sa fiche : il disparaît des listes de choix sans toucher à l’historique.');

    const before = publicSnapshot(fournisseur.toJSON());
    await log({
      userId: req.user.id, action: 'DELETE', entity: ENTITY[resource], entityId: id,
      before, ip: req.ip
    }, transaction);
    await fournisseur.destroy({ transaction });
  });

  res.json({ ok: true, message: 'Fournisseur supprimé.' });
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