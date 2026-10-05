// Ossature de l'application : navigation par métier, filtrée selon les droits,
// barre supérieure avec les alertes du jour, tiroir sur téléphone.
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Boxes, CalendarDays,
  ArrowRightLeft, PackagePlus, PackageMinus, Pill, Warehouse,
  ChevronDown, ChevronRight,
  Users, Settings as SettingsIcon, Menu, Bell, LogOut, KeyRound, WifiOff
} from 'lucide-react';
import { navigate, useRoute } from '../utils/router.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { Btn, Field, Input, Modal, Banner } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { auth } from '../api/endpoints.js';

// Navigation par métier (restructurée en 2.7.11, demande de l'officine) :
//   • « Vente » remplace « Historique de vente » — l'historique détaillé des
//     ventes s'ouvre depuis un bouton EN HAUT de l'écran Vente ;
//   • « Stock » affiche désormais le contenu des anciens « Rapports » (fiches
//     de stock, état, mouvements, ventes et marges, expirations…) ;
//   • « Transferts dépôt → pharmacie » devient « Historique de transfert » ;
//   • « Documents », « Rapports » et « Journal d'audit » ne sont plus des menus :
//     leurs écrans restent joignables par leurs adresses (#/documents, #/rapports,
//     #/audit), comme Inventaires (2.7.8) ;
//   • « Catalogue » : présent pour l'ADMINISTRATEUR et le DÉPÔT (2.7.15) mais
//     masqué pour le PHARMACIEN — son comptoir n'utilise ni la création de
//     fiche ni le réglage des prix ; toutes les adresses restent ouvertes par
//     #/medicaments, #/categories et #/fournisseurs.
const NAV = [
  { group: 'Quotidien', items: [
    { route: 'tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
    { route: 'ventes', label: 'Vente', icon: ShoppingCart, permission: 'sale' },
    // 2.7.18 — le suivi des ventes a SON MENU, juste sous « Vente » (le
    // calendrier a quitté le tableau de bord ; celui-ci garde l'histogramme).
    { route: 'calendrier', label: 'Calendrier des ventes', icon: CalendarDays, permission: 'sale' }
  ] },
  { group: 'Magasins', items: [
    { route: 'rapports', label: 'Stock', icon: Boxes, permission: 'reports' },
    // 2.7.20/2.7.21 — « Calendrier des stock » : suivi J/J des entrées (réceptions)
    // et sorties (transferts) de la RÉSERVE, placé sous « Stock » — ouvert au
    // DÉPÔT et à l'ADMINISTRATEUR (masqué pour la pharmacie seule).
    { route: 'calendrier-stock', label: 'Calendrier des stock', icon: CalendarDays, permission: 'receipt', hideFor: ['PHARMACIST'] },
    { route: 'receptions', label: 'Réceptions (dépôt)', icon: PackagePlus, permission: 'receipt' },
    { route: 'transferts', label: 'Historique de transfert', icon: ArrowRightLeft, permission: 'transfer' },
    // 2.7.15 — Catalogue rétabli pour ADMIN/DEPOT, masqué pour PHARMACIST.
    { route: 'medicaments', label: 'Catalogue', icon: Pill, permission: 'reference', hideFor: ['PHARMACIST'] }
  ] },
  { group: 'Sorties', items: [
    { route: 'pertes', label: 'Pertes et dons', icon: PackageMinus, permission: 'loss' }
  ] },
  { group: 'Pilotage', items: [
    { route: 'utilisateurs', label: 'Utilisateurs', icon: Users, permission: 'users' },
    { route: 'parametres', label: 'Paramètres', icon: SettingsIcon, permission: 'settings' }
  ] }
];

// ============================================================================
// 2.7.22 — MENU ADMINISTRATEUR : exactement 5 menus (demande de l'officine) —
//   1. « Tableau de bord » (déjà présent, inchangé) ;
//   2. « Pharmacie » — bloc DÉPLIABLE : tout le comptoir, « otran'ny hoe
//      tafiditra ao amin'ny pharmacie mihitsy » (Vente + son calendrier,
//      fiche Stock du comptoir — nouvelle adresse #/stock-pharmacie, pertes,
//      historique des transferts reçus) ;
//   3. « Dépôt » — bloc DÉPLIABLE : toute la réserve (fiche Stock du dépôt en
//      cartes — 2.7.21, calendrier des stock, réceptions, transferts vers la
//      pharmacie, pertes, catalogue) ;
//   4. « Utilisateurs » et 5. « Paramètres » : inchangés.
// Les autres profils (PHARMACIST, DEPOT) gardent le menu plat ci-dessus.
// ============================================================================
const SOUS_MENUS_PHARMACIE = [
  { route: 'ventes', label: 'Vente', icon: ShoppingCart, permission: 'sale' },
  { route: 'calendrier', label: 'Calendrier des ventes', icon: CalendarDays, permission: 'sale' },
  { route: 'stock-pharmacie', label: 'Stock (pharmacie)', icon: Boxes, permission: 'reports' },
  { route: 'pertes', label: 'Pertes et dons', icon: PackageMinus, permission: 'loss' },
  { route: 'transferts', label: 'Historique de transfert', icon: ArrowRightLeft, permission: 'transfer' }
];
const SOUS_MENUS_DEPOT = [
  { route: 'rapports', label: 'Stock (dépôt)', icon: Boxes, permission: 'reports' },
  { route: 'calendrier-stock', label: 'Calendrier des stock', icon: CalendarDays, permission: 'receipt' },
  { route: 'receptions', label: 'Réceptions', icon: PackagePlus, permission: 'receipt' },
  { route: 'transferts', label: 'Historique de transfert', icon: ArrowRightLeft, permission: 'transfer' },
  { route: 'pertes', label: 'Pertes et dons', icon: PackageMinus, permission: 'loss' },
  { route: 'medicaments', label: 'Catalogue', icon: Pill, permission: 'reference' }
];
const NAV_ADMIN = [
  { group: 'Menu principal', items: [
    { route: 'tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
    { label: 'Pharmacie', icon: ShoppingCart, enfants: SOUS_MENUS_PHARMACIE },
    { label: 'Dépôt', icon: Warehouse, enfants: SOUS_MENUS_DEPOT },
    { route: 'utilisateurs', label: 'Utilisateurs', icon: Users, permission: 'users' },
    { route: 'parametres', label: 'Paramètres', icon: SettingsIcon, permission: 'settings' }
  ] }
];

// Barre basse du téléphone : les gestes de la journée, différents selon le métier.
// « Stock » = les rapports (fiches de stock incluses) depuis la 2.7.11.
const MOBILE_DEFAUT = ['tableau-de-bord', 'ventes', 'rapports'];
const MOBILE = {
  DEPOT: ['tableau-de-bord', 'receptions', 'transferts', 'rapports'],
  PHARMACIST: ['tableau-de-bord', 'ventes', 'rapports', 'transferts'],
  ADMIN: ['tableau-de-bord', 'ventes', 'rapports', 'transferts']
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
      <Banner tone="info">4 caractères minimum (chiffres, lettres ou symboles). La modification ferme les sessions ouvertes sur les autres postes.</Banner>
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
  // 2.7.10 — la déconnexion demande une confirmation (un clic perdu fermait la
  // journée de caisse en pleine saisie).
  const [deconnexion, setDeconnexion] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => { setDrawer(false); }, [route]);

  // 2.7.22 — ADMINISTRATEUR : navigation replacée (NAV_ADMIN, 5 menus dont
  // deux blocs dépliables « Pharmacie » et « Dépôt »). Autres profils : NAV plat.
  const racine = user?.roleCode === 'ADMIN' ? NAV_ADMIN : NAV;
  const groups = useMemo(() => racine.map(group => ({
    ...group,
    items: group.items
      .map(item => item.enfants
        ? { ...item, enfants: item.enfants.filter(enfant =>
            (!enfant.permission || can(enfant.permission))
            && !(enfant.hideFor || []).includes(user?.roleCode)) }
        : item)
      .filter(item => item.enfants
        ? item.enfants.length > 0
        : (!item.permission || can(item.permission))
          && !(item.hideFor || []).includes(user?.roleCode))
  })).filter(group => group.items.length), [racine, can, user?.roleCode]);

  // 2.7.22 — les blocs « Pharmacie »/« Dépôt » s'ouvrent/ferment (souvenirs par
  // session) ; ils s'ouvrent automatiquement quand un de leurs enfants est actif.
  const [ouverts, setOuverts] = useState({});
  useEffect(() => {
    for (const bloc of groups.flatMap(groupe => groupe.items).filter(item => item.enfants)) {
      if (bloc.enfants.some(enfant => enfant.route === route) && !ouverts[bloc.label]) {
        setOuverts(avant => ({ ...avant, [bloc.label]: true }));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Depuis la 2.7.11 chaque menu ouvre le même écran pour tous les profils
  // (« Stock » = les rapports partout) : la route est directe.
  const routeDe = item => item.route;

  // 2.7.22 — aplatissement (enfants compris) : titre de la page + pastilles.
  const paitList = items => items.flatMap(item => item.enfants ? item.enfants : [item]);

  // Pastille de la cloche : nombre total d'alertes du profil, en rouge dès qu'une
  // alerte est urgente (rupture, péremption, lot bloqué).
  const alertCount = alerts.filter(alert => alert.level === 'red').length;
  const alertesTotal = alerts.length;
  const tousLesItems = paitList(groups.flatMap(group => group.items));
  const current = tousLesItems.find(item => routeDe(item) === route);
  const routesMobile = MOBILE[user?.roleCode] || MOBILE_DEFAUT;
  const mobileItems = routesMobile
    .map(item => tousLesItems.find(entry => routeDe(entry) === item))
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
              {group.items.map(item => item.enfants ? (
                /* 2.7.22 — bloc dépliable « Pharmacie »/« Dépôt » (admin) :
                   clic = ouvrir/fermer ; actif si l'un de ses enfants l'est. */
                <div key={item.label}>
                  <button
                    className={`navlink ${item.enfants.some(e => e.route === route) ? 'navlink--active' : ''}`}
                    onClick={() => setOuverts(avant => ({ ...avant, [item.label]: !avant[item.label] }))}
                    aria-expanded={ouverts[item.label] ? 'true' : 'false'}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                    <span className="navlink__chevron">
                      {ouverts[item.label] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                  </button>
                  {ouverts[item.label] ? (
                    <div className="sidebar__submenu">
                      {item.enfants.map(enfant => (
                        <button
                          key={enfant.route}
                          className={`navlink navlink--sub ${route === routeDe(enfant) ? 'navlink--active' : ''}`}
                          onClick={() => navigate(routeDe(enfant))}
                        >
                          <enfant.icon size={15} />
                          <span>{enfant.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
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
              <span className="topbar__icon">
                <Btn variant="ghost" icon={Bell} onClick={() => navigate('tableau-de-bord')}
                  title={alertCount > 0 ? `${alertesTotal} alerte(s) — voir le tableau de bord` : 'Aucune alerte'}
                  aria-label={alertesTotal > 0 ? `Alertes (${alertesTotal})` : 'Alertes'} />
                {alertesTotal > 0 ? (
                  <span className={`topbar__badge ${alertCount > 0 ? 'topbar__badge--danger' : 'topbar__badge--warn'}`}
                    title={alertCount > 0 ? `${alertCount} alerte(s) urgente(s)` : `${alertesTotal} alerte(s) à surveiller`}>
                    {alertesTotal > 99 ? '99+' : alertesTotal}
                  </span>
                ) : null}
              </span>
            ) : null}
            {user?.roleCode === 'DEPOT' ? <span className="badge badge--info">Dépôt</span> : null}
            {user?.roleCode === 'PHARMACIST' ? <span className="badge badge--info">Pharmacie</span> : null}
            <span className="user-chip">
              <span className="avatar">{(user?.name || '?').slice(0, 2).toUpperCase()}</span>
              <span className="desktop-only">{user?.name} · {user?.roleName}</span>
            </span>
            <Btn variant="ghost" icon={KeyRound} onClick={() => setPassword(true)} title="Changer mon mot de passe" aria-label="Mot de passe" />
            <Btn variant="ghost" icon={LogOut} onClick={() => setDeconnexion(true)} title="Se déconnecter" aria-label="Déconnexion" />
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

      {deconnexion ? (
        <Modal title="Se déconnecter ?" onClose={() => setDeconnexion(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => setDeconnexion(false)}>Rester connecté</Btn>
            <Btn variant="primary" icon={LogOut} onClick={logout}>Oui, me déconnecter</Btn>
          </>}>
          <p>
            La session de <strong>{user?.name}</strong> sera fermée sur ce poste.
          </p>
        </Modal>
      ) : null}

      {password ? <PasswordModal onClose={() => setPassword(false)} /> : null}
    </div>
  );
}

// /api/data peut être momentanément vide (premier chargement) : on sécurise.
function useDataSafe() {
  const context = useData();
  return { data: context?.data, alerts: context?.alerts || [] };
}