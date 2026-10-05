// Données de travail : /api/data renvoie en une requête les référentiels, les
// lots, les documents récents, les alertes et les indicateurs. Après chaque
// écriture, `refresh()` recharge l'ensemble : l'écran ne peut pas mentir.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dashboard } from '../api/endpoints.js';
import { settingsRef } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user, setCurrency } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return null;
    try {
      const payload = await dashboard.data();
      settingsRef.currency = payload.settings?.currency || 'Ar';
      setCurrency(settingsRef.currency);
      setData(payload);
      setError('');
      return payload;
    } catch (cause) {
      setError(cause.message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, [user, setCurrency]);

  useEffect(() => {
    if (!user) { setData(null); setLoading(false); return; }
    setLoading(true);
    refresh().catch(() => setLoading(false));
  }, [user, refresh]);

  const helpers = useMemo(() => {
    const products = data?.products || [];
    const lots = data?.lots || [];
    const byId = (list, id) => list.find(item => Number(item.id) === Number(id));
    /**
     * Quantité réellement vendable AU COMPTOIR : uniquement les lots de la
     * pharmacie, non périmés, non bloqués et non vides. Le stock de la réserve
     * (dépôt) ne doit jamais apparaître comme vendable : il faut d'abord le
     * transférer.
     */
    const sellableStock = productId => {
      const maintenant = new Date();
      return lots
        .filter(lot => Number(lot.productId) === Number(productId)
          && lot.location === 'PHARMACY'
          && lot.status === 'AVAILABLE'
          && Number(lot.quantity) > 0
          && (!lot.expiresOn || new Date(`${lot.expiresOn}T23:59:59`) >= maintenant))
        .reduce((total, lot) => total + Number(lot.quantity), 0);
    };
    const stockByProduct = productId => lots
      .filter(lot => Number(lot.productId) === Number(productId))
      .reduce((total, lot) => total + Number(lot.quantity), 0);
    /** Stock d'un médicament dans un magasin précis (DEPOT ou PHARMACY). */
    const stockOf = (productId, location) => lots
      .filter(lot => Number(lot.productId) === Number(productId) && lot.location === location)
      .reduce((total, lot) => total + Number(lot.quantity), 0);
    /** Lots d'un magasin (les deux magasins ont leurs propres lots). */
    const lotsOf = location => lots.filter(lot => lot.location === location);
    /** Bloc « magasin » renvoyé par /api/data : indicateurs + alertes dédiées. */
    const store = location => data?.locations?.[location] || { location, stats: {}, alerts: [] };
    return {
      products, lots,
      stockOf,
      lotsOf,
      store,
      locations: data?.locations || {},
      categories: data?.categories || [],
      suppliers: data?.suppliers || [],
      documents: data?.documents || [],
      movements: data?.movements || [],
      inventories: data?.inventories || [],
      alerts: data?.alerts || [],
      stats: data?.stats || {},
      settings: data?.settings || {},
      stats2: data?.stats || {},
      productName: id => byId(products, id)?.name || `Médicament #${id}`,
      product: id => byId(products, id),
      lot: id => byId(lots, id),
      // Numéro de lot lisible (bons de réception, transferts, détail des documents).
      lotNumber: id => byId(lots, id)?.number || '—',
      supplierName: id => byId(data?.suppliers || [], id)?.name || '—',
      categoryName: id => byId(data?.categories || [], id)?.name || '—',
      userName: id => data?.users?.find(u => Number(u.id) === Number(id))?.name || `Utilisateur #${id}`,
      sellableStock,
      stockByProduct
    };
  }, [data]);

  const value = useMemo(() => ({ data, loading, error, refresh, ...helpers }), [data, loading, error, refresh, helpers]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);