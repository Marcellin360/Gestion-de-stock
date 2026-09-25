// Routeur minimaliste basé sur le fragment d'URL (#/ventes) : aucune dépendance
// externe, l'historique du navigateur reste utilisable (précédent / suivant).
import { useEffect, useState } from 'react';

const clean = hash => {
  const path = (hash || '').replace(/^#\/?/, '').split('?')[0];
  return path || 'tableau-de-bord';
};

const currentHash = () => (typeof window === 'undefined' ? '' : window.location.hash);

export function useRoute() {
  const [route, setRoute] = useState(() => clean(currentHash()));

  useEffect(() => {
    const onChange = () => setRoute(clean(window.location.hash));
    window.addEventListener('hashchange', onChange);
    if (typeof window !== 'undefined' && !window.location.hash) window.location.hash = '#/tableau-de-bord';
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(route) {
  if (typeof window === 'undefined') return;
  if (clean(window.location.hash) === route) return;
  window.location.hash = `#/${route}`;
}
