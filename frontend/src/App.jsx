// ============================================================================
// Point d'entrée de l'interface : session, données, notifications, puis la page
// correspondant à l'adresse (#/ventes, #/medicaments…). Chaque page est chargée
// à la demande pour garder un démarrage rapide sur un poste modeste.
// ============================================================================
import { Component, Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { DataProvider } from './context/DataContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import Layout from './components/Layout.jsx';
import { Banner, Btn, Spinner } from './components/ui.jsx';
import { navigate, useRoute } from './utils/router.js';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const SalesPage = lazy(() => import('./pages/SalesPage.jsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'));
const StockPage = lazy(() => import('./pages/StockPage.jsx'));
const InventoriesPage = lazy(() => import('./pages/InventoriesPage.jsx'));
const TransfersPage = lazy(() => import('./pages/TransfersPage.jsx'));
const ReceiptsPage = lazy(() => import('./pages/ReceiptsPage.jsx'));
const LossesPage = lazy(() => import('./pages/LossesPage.jsx'));
const CataloguePage = lazy(() => import('./pages/CataloguePage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

const PAGES = [
  { route: 'tableau-de-bord', page: DashboardPage, title: 'Tableau de bord' },
  { route: 'ventes', page: SalesPage, title: 'Ventes', permission: 'sale' },
  { route: 'documents', page: DocumentsPage, title: 'Documents' },
  // « Stock » et « Catalogue » regroupent plusieurs écrans en onglets : les
  // anciennes adresses (#/mouvements, #/categories…) continuent de fonctionner.
  { route: 'lots', page: StockPage, title: 'Stock — lots et quantités', permission: 'documents' },
  // Fiche de stock (registre : catégorie, unité, initial, entrées, sorties, final,
  // coût unitaire) : onglet de l'écran Stock, ouvert d'office pour le dépôt.
  { route: 'fiche-stock', page: StockPage, title: 'Stock — fiche de stock', permission: 'documents' },
  { route: 'mouvements', page: StockPage, title: 'Mouvements de stock', permission: 'documents' },
  { route: 'inventaires', page: InventoriesPage, title: 'Inventaires', permission: 'inventory' },
  { route: 'receptions', page: ReceiptsPage, title: 'Réceptions — entrées au dépôt', permission: 'receipt' },
  { route: 'transferts', page: TransfersPage, title: 'Transferts — dépôt vers pharmacie', permission: 'transfer' },
  { route: 'pertes', page: LossesPage, title: 'Pertes et dons', permission: 'loss' },
  { route: 'medicaments', page: CataloguePage, title: 'Catalogue — médicaments', permission: 'reference' },
  { route: 'categories', page: CataloguePage, title: 'Catalogue — catégories', permission: 'reference' },
  { route: 'fournisseurs', page: CataloguePage, title: 'Catalogue — fournisseurs', permission: 'reference' },
  // Les rapports couvrent la pharmacie et les marges : le profil dépôt n'y a pas accès
  // (sa fiche de stock est dans l'écran Stock). Ceinture et bretelles avec le menu.
  { route: 'rapports', page: ReportsPage, title: 'Rapports', permission: 'reports', hideFor: ['DEPOT'] },
  { route: 'audit', page: AuditPage, title: 'Journal d’audit', permission: 'audit' },
  { route: 'utilisateurs', page: UsersPage, title: 'Utilisateurs', permission: 'users' },
  { route: 'parametres', page: SettingsPage, title: 'Paramètres', permission: 'settings' }
];

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="content">
          <Banner tone="error" title="Un problème est survenu à l’affichage">
            <div>{this.state.error.message}</div>
          </Banner>
          <Btn variant="primary" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Recharger l’écran</Btn>
        </div>
      );
    }
    return this.props.children;
  }
}

function Routing() {
  const route = useRoute();
  const { user, can, ready } = useAuth();

  useEffect(() => {
    if (ready && !user) navigate('connexion');
  }, [ready, user]);

  if (!ready) return <Spinner page />;
  if (!user) return <Suspense fallback={<Spinner page />}><LoginPage /></Suspense>;

  const target = PAGES.find(page => page.route === route) || PAGES[0];
  const Element = target.page;

  // Écran fermé au profil (permission manquante ou écran réservé aux autres profils).
  if ((target.permission && !can(target.permission)) || (target.hideFor || []).includes(user.roleCode)) {
    return (
      <Layout>
        <Banner tone="warn" title="Accès non autorisé">
          {target.route === 'rapports' && user.roleCode === 'DEPOT'
            ? 'Le profil dépôt n’ouvre pas les rapports : sa fiche de stock (catégorie, unité, initial, entrées, sorties, final, coût unitaire) se trouve dans l’écran « Stock ».'
            : `Votre profil (${user.roleName}) ne permet pas d’ouvrir cet écran.`}
        </Banner>
      </Layout>
    );
  }

  return (
    <Layout>
      <ErrorBoundary key={target.route}>
        <Suspense fallback={<Spinner page />}>
          <Element />
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <Routing />
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}