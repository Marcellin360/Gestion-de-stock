// ============================================================================
// Vérification de rendu : chaque écran est monté hors navigateur pour détecter
// une erreur de code (référence manquante, donnée absente) avant livraison.
// Exécution : npm run qa:render -w frontend
// ============================================================================
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import { DataProvider } from '../src/context/DataContext.jsx';
import { ToastProvider } from '../src/context/ToastContext.jsx';
import Layout from '../src/components/Layout.jsx';

const pages = {
  LoginPage: () => import('../src/pages/LoginPage.jsx'),
  DashboardPage: () => import('../src/pages/DashboardPage.jsx'),
  SalesPage: () => import('../src/pages/SalesPage.jsx'),
  DocumentsPage: () => import('../src/pages/DocumentsPage.jsx'),
  LotsPage: () => import('../src/pages/LotsPage.jsx'),
  MovementsPage: () => import('../src/pages/MovementsPage.jsx'),
  StockPage: () => import('../src/pages/StockPage.jsx'),
  CataloguePage: () => import('../src/pages/CataloguePage.jsx'),
  InventoriesPage: () => import('../src/pages/InventoriesPage.jsx'),
  ReceiptsPage: () => import('../src/pages/ReceiptsPage.jsx'),
  TransfersPage: () => import('../src/pages/TransfersPage.jsx'),
  LossesPage: () => import('../src/pages/LossesPage.jsx'),
  ProductsPage: () => import('../src/pages/ProductsPage.jsx'),
  CategoriesPage: () => import('../src/pages/CategoriesPage.jsx'),
  SuppliersPage: () => import('../src/pages/SuppliersPage.jsx'),
  ReportsPage: () => import('../src/pages/ReportsPage.jsx'),
  AuditPage: () => import('../src/pages/AuditPage.jsx'),
  UsersPage: () => import('../src/pages/UsersPage.jsx'),
  SettingsPage: () => import('../src/pages/SettingsPage.jsx')
};

const forms = {
  ProductForm: m => createElement(m.default, { produit: null, onDone() {}, onCancel() {} }),
  MarginForm: m => createElement(m.default, { produit: { id: 1, name: 'Test', cmp: '1000', sellingPrice: '1200', marginRate: 20 }, onDone() {}, onCancel() {} }),
  SupplierForm: m => createElement(m.default, { fournisseur: null, onDone() {}, onCancel() {} }),
  CategoryForm: m => createElement(m.default, { categorie: null, onDone() {}, onCancel() {} }),
  ReceiptForm: m => createElement(m.default, { onDone() {}, onCancel() {} }),
  TransferForm: m => createElement(m.default, { onDone() {}, onCancel() {} }),
  LossForm: m => createElement(m.default, { onDone() {}, onCancel() {} }),
  UserForm: m => createElement(m.default, { utilisateur: null, roles: [], onDone() {}, onCancel() {} })
};

const render = element => renderToStaticMarkup(element);
const enveloppe = element => createElement(ToastProvider, null,
  createElement(AuthProvider, null, createElement(DataProvider, null, element)));

let echecs = 0;
for (const [nom, charger] of Object.entries(pages)) {
  try {
    const module = await charger();
    const Page = module.default;
    const html = render(enveloppe(nom === 'LoginPage'
      ? createElement(Page)
      : createElement(Layout, null, createElement(Page))));
    if (!html || html.length < 40) throw new Error('rendu vide');
    console.log(`ok   ${nom} (${html.length} caractères)`);
  } catch (erreur) {
    echecs += 1;
    console.error(`ECHEC ${nom} : ${erreur.message}`);
  }
}

for (const [nom, monter] of Object.entries(forms)) {
  try {
    const module = await import(`../src/forms/${nom}.jsx`);
    const html = render(enveloppe(monter(module)));
    if (!html || html.length < 40) throw new Error('rendu vide');
    console.log(`ok   forme ${nom} (${html.length} caractères)`);
  } catch (erreur) {
    echecs += 1;
    console.error(`ECHEC forme ${nom} : ${erreur.message}`);
  }
}

console.log(echecs === 0 ? '\nTous les écrans se rendent correctement.' : `\n${echecs} écran(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
