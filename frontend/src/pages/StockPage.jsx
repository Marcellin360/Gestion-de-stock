// Stock : un seul écran avec trois onglets — « Fiche de stock » (le registre),
// « Lots & stock » et « Mouvements ».
// Objectif d'ergonomie : moins d'entrées de menu, tout ce qui concerne le stock
// au même endroit (les deux autres écrans restent accessibles par leur adresse).
//
// Le profil DÉPÔT arrive directement sur sa fiche de stock (catégorie, unité,
// stock initial, entrées, sorties, stock final, coût unitaire) : c'est le
// registre qu'il doit suivre au quotidien.
import { useEffect } from 'react';
import { useRoute, navigate } from '../utils/router.js';
import { Tabs } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import FicheStockTab from './FicheStockTab.jsx';
import LotsPage from './LotsPage.jsx';
import MovementsPage from './MovementsPage.jsx';

const ONGLETS = [
  { route: 'fiche-stock', label: 'Fiche de stock' },
  { route: 'lots', label: 'Lots & stock' },
  { route: 'mouvements', label: 'Mouvements' }
];

export default function StockPage() {
  const route = useRoute();
  const { user } = useAuth();
  const actif = ONGLETS.some(onglet => onglet.route === route) ? route : 'lots';

  // Adresse inconnue (ex. #/stock) : le dépôt va sur sa fiche, les autres sur les lots.
  useEffect(() => {
    if (!ONGLETS.some(onglet => onglet.route === route)) {
      navigate(user?.roleCode === 'DEPOT' ? 'fiche-stock' : 'lots');
    }
  }, [route, user?.roleCode]);

  return (
    <>
      <Tabs items={ONGLETS} value={actif} onChange={onglet => navigate(onglet)} />
      {actif === 'fiche-stock' ? <FicheStockTab /> : actif === 'mouvements' ? <MovementsPage /> : <LotsPage />}
    </>
  );
}