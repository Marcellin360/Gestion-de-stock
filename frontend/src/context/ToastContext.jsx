// Messages courts en bas de l'écran : succès, avertissement, erreur.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems(list => [...list, { id, message, tone }]);
    setTimeout(() => setItems(list => list.filter(item => item.id !== id)), 6000);
  }, []);

  const value = useMemo(() => ({
    success: message => push(message, 'ok'),
    warn: message => push(message, 'warn'),
    error: message => push(message, 'error')
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        {items.map(item => <div key={item.id} className={`toast toast--${item.tone}`}>{item.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
