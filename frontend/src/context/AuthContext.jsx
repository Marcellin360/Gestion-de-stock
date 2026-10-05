// Session de travail : qui est connecté, avec quels droits (RG18).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth } from '../api/endpoints.js';
import { setCsrfToken, settingsRef } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const session = await auth.me();
        // Le jeton CSRF de la session en cours est mémorisé ici : sans cette
        // ligne, un onglet neuf (sessionStorage vide) gardait un jeton vide et
        // toutes les écritures étaient refusées (« Jeton de sécurité invalide »).
        setCsrfToken(session.csrf);
        if (vivant) setUser(session.user);
      } catch {
        setCsrfToken('');
        if (vivant) setUser(null);
      } finally {
        if (vivant) setReady(true);
      }
    })();
    return () => { vivant = false; };
  }, []);

  const login = useCallback(async (loginName, password) => {
    const session = await auth.login(loginName, password);
    setCsrfToken(session.csrf);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try { await auth.logout(); } catch { /* session déjà fermée */ }
    setCsrfToken('');
    setUser(null);
    window.location.hash = '#/connexion';
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    login,
    logout,
    // can('sale') ou can(['prices','costs']) : vrai si l'un des droits est accordé.
    can: permission => {
      const demandes = Array.isArray(permission) ? permission : [permission];
      const octroyes = user?.permissions || [];
      return demandes.some(droit => octroyes.includes(droit));
    },
    setCurrency: currency => { settingsRef.currency = currency; }
  }), [user, ready, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);