#!/usr/bin/env node
// ============================================================================
// Référentiels de démonstration (développement uniquement).
// ALLOW_DEMO=true est obligatoire et la commande est refusée en production :
// aucune donnée fictive ne doit se retrouver dans le registre réel d'une officine.
// ============================================================================
import { config } from '../src/config/index.js';
import { Category, Supplier, Product } from '../src/models/index.js';
import { sequelize, close } from '../src/config/database.js';

const CATEGORIES = [
  ['Antalgiques', 'Douleurs et fièvre'],
  ['Antibiotiques', 'Infections bactériennes'],
  ['Anti-inflammatoires', 'Inflammations'],
  ['Vitamines', 'Compléments et vitamines'],
  ['Solutions et antiseptiques', 'Soins, pansements, désinfection']
];

const SUPPLIERS = [
  ['Grossiste Central DEMO', 'Antananarivo', '+261 20 22 000 01'],
  ['Laboratoire Océan Indien DEMO', 'Antananarivo', '+261 20 22 000 02']
];

const PRODUCTS = [
  ['MED-001', 'Paracétamol 500 mg', 'Paracétamol', '500 mg', 'Comprimé', 'Boîte de 20', 'Antalgiques', 20, 10],
  ['MED-002', 'Amoxicilline 500 mg', 'Amoxicilline', '500 mg', 'Gélule', 'Boîte de 20', 'Antibiotiques', 22, 8],
  ['MED-003', 'Ibuprofène 400 mg', 'Ibuprofène', '400 mg', 'Comprimé', 'Boîte de 20', 'Anti-inflammatoires', 22, 8],
  ['MED-004', 'Vitamine C 500 mg', 'Acide ascorbique', '500 mg', 'Comprimé effervescent', 'Tube de 20', 'Vitamines', 25, 6],
  ['MED-005', 'Sérum physiologique', 'Chlorure de sodium', '0,9 %', 'Solution', 'Flacon 500 ml', 'Solutions et antiseptiques', 20, 12],
  ['MED-006', 'Povidone iodée', 'Povidone iodée', '10 %', 'Solution', 'Flacon 125 ml', 'Solutions et antiseptiques', 24, 6]
];

async function main() {
  if (process.env.ALLOW_DEMO !== 'true' || config.production) {
    throw new Error('Démonstration refusée : ALLOW_DEMO=true et NODE_ENV différent de « production » sont exigés.');
  }
  if (await Product.count() > 0) throw new Error('Des médicaments existent déjà : aucune donnée de démonstration ajoutée.');

  await sequelize.transaction(async transaction => {
    for (const [name, description] of CATEGORIES) {
      await Category.create({ name, description, active: true, createdAt: new Date() }, { transaction });
    }
    const categories = await Category.findAll({ transaction });
    let supplierIndex = 0;
    for (const [name, address, phone] of SUPPLIERS) {
      await Supplier.create({
        name, contact: '', phone, email: '', address, nif: '', note: 'Fournisseur fictif (démonstration)',
        active: true, createdAt: new Date()
      }, { transaction });
      supplierIndex += 1;
    }
    const suppliers = await Supplier.findAll({ transaction });
    let index = 0;
    for (const [code, name, ingredient, dosage, form, presentation, categoryName, marginRate, minStock] of PRODUCTS) {
      await Product.create({
        code, name, ingredient, dosage, form, presentation, barcode: null,
        categoryId: categories.find(c => c.name === categoryName)?.id ?? null,
        manufacturer: 'Laboratoire fictif (démonstration)', unit: 'boîte',
        minStock, maxStock: minStock * 30, storage: 'À l’abri de la lumière et de l’humidité', note: '',
        active: true, marginRate, sellingPrice: '0.000000', cmp: '0.000000', version: 0,
        createdAt: new Date(), updatedAt: new Date()
      }, { transaction });
      index += 1;
    }
    console.log(`${CATEGORIES.length} catégories, ${suppliers.length} fournisseurs et ${PRODUCTS.length} médicaments fictifs créés.`);
    console.log('Aucun stock n’est créé : enregistrer une réception (fiction) pour tester les flux.');
  });
}

main()
  .then(() => close())
  .catch(async error => { console.error('Échec :', error.message); await close().catch(() => {}); process.exit(1); });
