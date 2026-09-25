// Catalogue : un seul écran avec trois onglets — Médicaments, Catégories, Fournisseurs.
// Les trois référentiels se consultent d'un même endroit, sans surcharger le menu.
import { useEffect } from 'react';
import { useRoute, navigate } from '../utils/router.js';
import { Tabs } from '../components/ui.jsx';
import ProductsPage from './ProductsPage.jsx';
import CategoriesPage from './CategoriesPage.jsx';
import SuppliersPage from './SuppliersPage.jsx';

const ONGLETS = [
  { route: 'medicaments', label: 'Médicaments' },
  { route: 'categories', label: 'Catégories' },
  { route: 'fournisseurs', label: 'Fournisseurs' }
];

export default function CataloguePage() {
  const route = useRoute();
  const actif = ONGLETS.some(onglet => onglet.route === route) ? route : 'medicaments';

  useEffect(() => {
    if (!ONGLETS.some(onglet => onglet.route === route)) navigate('medicaments');
  }, [route]);

  return (
    <>
      <Tabs items={ONGLETS} value={actif} onChange={onglet => navigate(onglet)} />
      {actif === 'categories' ? <CategoriesPage /> : actif === 'fournisseurs' ? <SuppliersPage /> : <ProductsPage />}
    </>
  );
}
