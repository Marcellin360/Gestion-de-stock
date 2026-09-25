// Formatage des montants, quantités et dates — un seul endroit pour tout l'écran.
import { settingsRef } from '../api/client.js';

export const money = (value, currency) => {
  const unit = currency || settingsRef.currency || 'Ar';
  const number = Number(value || 0);
  return `${number.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${unit}`;
};

export const amount = value => Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 6 });

export const integer = value => Number(value || 0).toLocaleString('fr-FR');

export const percent = value => `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

export const date = value => (value ? new Date(value).toLocaleDateString('fr-FR') : '—');

export const dateTime = value => (value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Nombre de jours restants avant expiration (négatif si périmé). */
export const daysTo = value => {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - midnight) / 86400000);
};

export const expiryLabel = value => {
  const days = daysTo(value);
  if (days === null) return '—';
  if (days < 0) return `Périmé (${Math.abs(days)} j)`;
  if (days === 0) return 'Expire aujourd’hui';
  if (days <= 90) return `Dans ${days} j`;
  return date(value);
};

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 8)}01`;

// Les deux magasins du projet : le dépôt (réserve) et la pharmacie (comptoir).
export const LOCATION_LABELS = {
  DEPOT: 'Dépôt (réserve)',
  PHARMACY: 'Pharmacie (comptoir)'
};
export const LOCATION_SHORT = { DEPOT: 'Dépôt', PHARMACY: 'Pharmacie' };
export const locationLabel = code => LOCATION_LABELS[code] || '—';

export const DOCUMENT_LABELS = {
  RECEIPT: 'Réception (entrée au dépôt)', TRANSFER: 'Transfert dépôt → pharmacie',
  SALE: 'Vente (pharmacie)', LOSS: 'Perte ou don', ADJUSTMENT: 'Ajustement d’inventaire'
};

export const MOVEMENT_LABELS = {
  RECEIPT: 'Entrée par réception (dépôt)', TRANSFER_OUT: 'Sortie vers la pharmacie',
  TRANSFER_IN: 'Entrée depuis le dépôt', SALE: 'Sortie par vente (pharmacie)',
  LOSS: 'Sortie sur perte', ADJUSTMENT: 'Ajustement d’inventaire', CANCEL: 'Annulation'
};

export const absolute = value => (value ? new Date(value).toISOString().replace('T', ' ').slice(0, 19) : '—');
