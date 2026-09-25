// Ossature de l'application : navigation par métier, filtrée selon les droits,
// barre supérieure avec les alertes du jour, tiroir sur téléphone.
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, FileText, Boxes, ClipboardCheck,
  ArrowRightLeft, PackagePlus, PackageMinus, Pill, BarChart3,
  ShieldCheck, Users, Settings as SettingsIcon, Menu, Bell, LogOut, KeyRound, WifiOff
} from 'lucide-react';
import { navigate, useRoute } from '../utils/router.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { Btn, Field, Input, Modal, Banner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { auth } from '../api/endpoints.js';

// Navigation par métier. Le profil « dépôt » ne voit que ce qui le concerne
// (réceptions, transferts, stock du dépôt) ; la pharmacie voit les ventes.
const NAV = [
  { group: 'Quotidien', items: [
    { route: 'tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
    { route: 'ventes', label: 'Historique de vente', icon: ShoppingCart, permission: 'sale' },
    { route: 'documents', label: 'Documents', icon: FileText }
  ] },
  { group: 'Magasins', items: [
    // « Stock » réunit Lots & stock et Mouvements (onglets internes, avec le
    // sélecteur Dépôt / Pharmacie) : une seule entrée de menu pour l'usage courant.
    // « Stock » ouvre la fiche de stock pour le dépôt (son registre quotidien) et
    // les lots pour les autres profils ; les trois onglets restent accessibles.
    { route: 'lots', routeDepot: 'fiche-stock', label: 'Stock', icon: Boxes, permission: 'documents', match: ['lots', 'mouvements', 'fiche-stock'] },
    { route: 'receptions', label: 'Réceptions (dépôt)', icon: PackagePlus, permission: 'receipt' },
    { route: 'transferts', label: 'Transferts dépôt → pharmacie', icon: ArrowRightLeft, permission: 'transfer' },
    { route: 'inventaires', label: 'Inventaires', icon: ClipboardCheck, permission: 'inventory' }
  ] },
  { group: 'Sorties', items: [
    { route: 'pertes', label: 'Pertes et dons', icon: PackageMinus, permission: 'loss' }
  ] },
  { group: 'Catalogue', items: [
    // Un seul écran « Catalogue » : Médicaments, Catégories et Fournisseurs en onglets.
    { route: 'medicaments', label: 'Catalogue', icon: Pill, permission: 'reference', match: ['medicaments', 'categories', 'fournisseurs'] }
  ] },
  { group: 'Pilotage', items: [
    // Le dépôt ne voit pas les rapports (ils couvrent la pharmacie et la marge) :
    // sa fiche de stock est intégrée à l'écran « Stock ».
    { route: 'rapports', label: 'Rapports', icon: BarChart3, permission: 'reports', hideFor: ['DEPOT'] },
    { route: 'audit', label: 'Journal d’audit', icon: ShieldCheck, permission: 'audit' },
    { route: 'utilisateurs', label: 'Utilisateurs', icon: Users, permission: 'users' },
    { route: 'parametres', label: 'Paramètres', icon: SettingsIcon, permission: 'settings' }
  ] }
];

// Barre basse du téléphone : les gestes de la journée, différents selon le métier.
const MOBILE_DEFAUT = ['tableau-de-bord', 'documents', 'lots'];
const MOBILE = {
  // Barre basse du dépôt : sa fiche de stock remplace la liste des lots.
  DEPOT: ['tableau-de-bord', 'receptions', 'transferts', 'fiche-stock'],
  PHARMACIST: ['tableau-de-bord', 'ventes', 'lots', 'transferts'],
  ADMIN: ['tableau-de-bord', 'ventes', 'lots', 'transferts']
};

function PasswordModal({ onClose }) {
  const toast = useToast();
  const [values, setValues] = useState({ currentPassword: '', password: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError(null);
    if (values.password !== values.confirm) { setError({ message: 'Les deux mots de passe ne correspondent pas.' }); return; }
    setBusy(true);
    try {
      await auth.password({ currentPassword: values.currentPassword, password: values.password });
      toast.success('Mot de passe modifié. Reconnectez-vous sur les autres postes.');
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Changer mon mot de passe" onClose={onClose}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={submit} disabled={busy}>Enregistrer</Btn></>}>
      <Banner tone="info">12 caractères minimum. La modification ferme les sessions ouvertes sur les autres postes.</Banner>
      <ErrorBoxWrapper error={error} />
      <Field label="Mot de passe actuel">
        <Input type="password" value={values.currentPassword} onChange={e => setValues({ ...values, currentPassword: e.target.value })} autoComplete="current-password" />
      </Field>
      <Field label="Nouveau mot de passe">
        <Input type="password" value={values.password} onChange={e => setValues({ ...values, password: e.target.value })} autoComplete="new-password" />
      </Field>
      <Field label="Confirmation">
        <Input type="password" value={values.confirm} onChange={e => setValues({ ...values, confirm: e.target.value })} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}

const ErrorBoxWrapper = ({ error }) => (error ? <Banner tone="error" title="Opération refusée"><div>{error.message}</div></Banner> : null);

export default function Layout({ children }) {
  const route = useRoute();
  const { user, can, logout } = useAuth();
  const { data, alerts } = useDataSafe();
  const [drawer, setDrawer] = useState(false);
  const [password, setPassword] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => { setDrawer(false); }, [route]);

  const groups = useMemo(() => NAV.map(group => ({
    ...group,
    items: group.items.filter(item =>
      (!item.permission || can(item.permission))
      && !(item.hideFor || []).includes(user?.roleCode)
    )
  })).filter(group => group.items.length), [can, user?.roleCode]);

  // Certaines entrées de menu n'ouvrent pas le même écran selon le profil
  // (ex. « Stock » : fiche de stock pour le dépôt). On calcule la route réelle.
  const routeDe = item => (item.routeDepot && user?.roleCode === 'DEPOT' ? item.routeDepot : item.route);

  const alertCount = alerts.filter(alert => alert.level === 'red').length;
  const current = groups.flatMap(group => group.items).find(item => routeDe(item) === route);
  const routesMobile = MOBILE[user?.roleCode] || MOBILE_DEFAUT;
  const mobileItems = routesMobile
    .map(item => groups.flatMap(g => g.items).find(entry => routeDe(entry) === item))
    .filter(Boolean);

  return (
    <div className="app">
      {drawer ? <div className="sidebar__backdrop" onClick={() => setDrawer(false)} /> : null}
      <aside className={`sidebar ${drawer ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <Pill size={26} color="#7fd8cf" />
          <div>
            <strong>PharmaStock</strong>
            <span>{data?.settings?.pharmacyName || 'Ma pharmacie'}</span>
          </div>
        </div>
        <nav className="sidebar__nav">
          {groups.map(group => (
            <div key={group.group}>
              <div className="sidebar__group">{group.group}</div>
              {group.items.map(item => (
                <button
                  key={item.route}
                  className={`navlink ${route === routeDe(item) ? 'navlink--active' : ''}`}
                  onClick={() => navigate(routeDe(item))}
                >
                  <item.icon size={17} />
                  <span>{item.label}</span>
                  {item.route === 'tableau-de-bord' && alertCount > 0 ? <span className="navlink__badge">{alertCount}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <Btn variant="ghost" className="mobile-only" icon={Menu} onClick={() => setDrawer(true)} aria-label="Menu" />
          <div className="topbar__title">
            <h1 style={{ fontSize: '1.05rem', margin: 0 }}>{current?.label || 'PharmaStock'}</h1>
            <span>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="topbar__actions">
            {offline ? <span className="badge badge--danger"><WifiOff size={13} /> Hors ligne</span> : null}
            {user?.permissions?.includes('audit') || can('reports') ? (
              <Btn variant="ghost" icon={Bell} onClick={() => navigate('tableau-de-bord')} aria-label="Alertes" />
            ) : null}
            {user?.roleCode === 'DEPOT' ? <span className="badge badge--info">Dépôt</span> : null}
            {user?.roleCode === 'PHARMACIST' ? <span className="badge badge--info">Pharmacie</span> : null}
            <span className="user-chip">
              <span className="avatar">{(user?.name || '?').slice(0, 2).toUpperCase()}</span>
              <span className="desktop-only">{user?.name} · {user?.roleName}</span>
            </span>
            <Btn variant="ghost" icon={KeyRound} onClick={() => setPassword(true)} title="Changer mon mot de passe" aria-label="Mot de passe" />
            <Btn variant="ghost" icon={LogOut} onClick={logout} title="Se déconnecter" aria-label="Déconnexion" />
          </div>
        </header>

        <main className="content">{children}</main>

        <nav className="mobile-nav">
          {mobileItems.map(item => (
            <button key={routeDe(item)} className={route === routeDe(item) ? 'active' : ''} onClick={() => navigate(routeDe(item))}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {password ? <PasswordModal onClose={() => setPassword(false)} /> : null}
    </div>
  );
}

// /api/data peut être momentanément vide (premier chargement) : on sécurise.
function useDataSafe() {
  const context = useData();
  return { data: context?.data, alerts: context?.alerts || [] };
}