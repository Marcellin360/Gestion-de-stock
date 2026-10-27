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
const HistoriqueVentesPage = lazy(() => import('./pages/HistoriqueVentesPage.jsx'));
const PatientsPage = lazy(() => import('./pages/PatientsPage.jsx'));
const CalendrierPage = lazy(() => import('./pages/CalendrierPage.jsx'));
const CalendrierStockPage = lazy(() => import('./pages/CalendrierStockPage.jsx'));
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
  // 2.7.11 — le menu s'appelle désormais « Vente » ; l'historique détaillé des
  // ventes s'ouvre depuis le bouton « Historique de vente » de l'écran.
  { route: 'ventes', page: SalesPage, title: 'Vente', permission: 'sale' },
  // 2.7.18 — menu « Calendrier des ventes » juste sous « Vente » (page dédiée,
  // permission 'sale' : la pharmacie la voit, le dépôt — qui ne vend pas — non).
  { route: 'calendrier', page: CalendrierPage, title: 'Calendrier des ventes', permission: 'sale' },
  // 2.7.36 — menu « Historique de vente » sous « Vente » : 2 onglets (clients
  // tsotra / clients hôpital), recherche + détail + ordonnance de séjour.
  { route: 'historique-ventes', page: HistoriqueVentesPage, title: 'Historique de vente', permission: 'sale' },
  // 2.7.35 — hôpital : patients hospitalisés + carnet prescripteur (médecins,
  // sages-femmes), tour de garde de la semaine et activité d'un prescripteur.
  { route: 'patients', page: PatientsPage, title: 'Hôpital — carnets et tour de garde', permission: 'sale' },
  // 2.7.20 — menu « Calendrier des stock » sous « Stock » : entrées/sorties de
  // la réserve, métier du dépôt (permission 'receipt', comme « Réceptions »).
  { route: 'calendrier-stock', page: CalendrierStockPage, title: 'Calendrier des stock', permission: 'receipt' },
  // « Documents » n'est plus un menu (2.7.11) : l'écran reste joignable par
  // #/documents (annulation d'une pièce, historique complet) ; le dépôt y est
  // toujours refusé. Les ventes se gèrent depuis « Historique de vente ».
  { route: 'documents', page: DocumentsPage, title: 'Documents', hideFor: ['DEPOT'] },
  // L'ancien onglet « Stock » (lots, fiche, mouvements) n'est plus un menu
  // (2.7.11) : les trois adresses restent ouvertes pour qui les connaît.
  { route: 'lots', page: StockPage, title: 'Stock — lots et quantités', permission: 'documents' },
  { route: 'fiche-stock', page: StockPage, title: 'Stock — fiche de stock', permission: 'documents' },
  { route: 'mouvements', page: StockPage, title: 'Mouvements de stock', permission: 'documents' },
  { route: 'inventaires', page: InventoriesPage, title: 'Inventaires', permission: 'inventory' },
  { route: 'receptions', page: ReceiptsPage, title: 'Réceptions — entrées au dépôt', permission: 'receipt' },
  // 2.7.11 — le menu « Transferts dépôt → pharmacie » s'intitule désormais
  // « Historique de transfert » ; le détail complet reste via « Détail ».
  { route: 'transferts', page: TransfersPage, title: 'Historique de transfert — dépôt vers pharmacie', permission: 'transfer' },
  { route: 'pertes', page: LossesPage, title: 'Pertes et dons', permission: 'loss' },
  // 2.7.15 — menu « Catalogue » rétabli pour ADMINISTRATEUR et DÉPÔT (masqué
  // pour PHARMACIST — son comptoir n'y a pas l'usage), adresses toujours ouvertes.
  { route: 'medicaments', page: CataloguePage, title: 'Catalogue — médicaments', permission: 'reference' },
  { route: 'categories', page: CataloguePage, title: 'Catalogue — catégories', permission: 'reference' },
  { route: 'fournisseurs', page: CataloguePage, title: 'Catalogue — fournisseurs', permission: 'reference' },
  // 2.7.11 — le menu « Stock » affiche désormais cet écran (fiches de stock,
  // état, mouvements, ventes et marges…) pour TOUS les profils, y compris le
  // dépôt : plus de restriction d'adresse.
  { route: 'rapports', page: ReportsPage, title: 'Stock — rapports et fiches', permission: 'reports' },
  // 2.7.22 — menu ADMINISTRATEUR « Pharmacie » : la fiche Stock du COMPTOIR a
  // sa propre adresse (même écran que « Stock », magasin choisi d'après la
  // route — #/rapports = fiche du dépôt pour l'admin, #/stock-pharmacie =
  // fiche de la pharmacie ; autres profils : comme avant).
  { route: 'stock-pharmacie', page: ReportsPage, title: 'Stock (pharmacie) — rapports et fiches', permission: 'reports' },
  // « Journal d'audit » n'est plus un menu (2.7.11) : joignable par #/audit.
  // « Catalogue » Y est de nouveau un menu (2.7.15, ADMIN/DEPOT seuls).
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
          {target.route === 'documents' && user.roleCode === 'DEPOT'
            ? 'Le profil dépôt n’a pas d’écran Documents : ses bons (réceptions, transferts) restent consultables depuis les écrans « Réceptions » et « Historique de transfert », et depuis le tableau de bord.'
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