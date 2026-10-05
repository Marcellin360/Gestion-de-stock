// ============================================================================
// Client HTTP unique : session par cookie HttpOnly + jeton CSRF dans l'en-tête
// X-CSRF-Token (mémorisé à la connexion, et rechargé à chaque ouverture).
// Toute erreur de l'API est transformée en Error avec son code HTTP et son
// message en français.
//
// Deux précautions expliquent le code ci-dessous :
//   • le jeton est conservé dans sessionStorage, mais une session valide peut
//     exister sans lui (nouvel onglet, navigateur rouvert) : on le redemande
//     alors à /api/auth/me — voir reparerJeton() ;
//   • si le serveur répond « Jeton de sécurité invalide », la requête est
//     rejouée une seule fois avec le jeton frais : l'utilisateur ne voit plus
//     d'erreur de sécurité après un simple changement d'onglet.
// ============================================================================

export const settingsRef = { currency: 'Ar' };
const CSRF_KEY = 'pharmastock.csrf';

const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage;
let csrf = (storage && storage.getItem(CSRF_KEY)) || '';

export function setCsrfToken(token) {
  csrf = token || '';
  if (!storage) return;
  if (token) storage.setItem(CSRF_KEY, token);
  else storage.removeItem(CSRF_KEY);
}

export function getCsrfToken() {
  return csrf;
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || [];
  }
}

/** Un seul appel de réparation à la fois, même si plusieurs écritures échouent. */
let reparation = null;

async function reparerJeton() {
  if (reparation) return reparation;
  reparation = fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(response => (response.ok ? response.json() : null))
    .then(payload => {
      if (payload?.csrf) { setCsrfToken(payload.csrf); return true; }
      return false;
    })
    .catch(() => false)
    .finally(() => { reparation = null; });
  return reparation;
}

async function request(path, { method = 'GET', body, raw = false, rejoue = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`/api${path}`, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (raw) {
    if (!response.ok) throw new ApiError('Export impossible.', response.status);
    return response;
  }
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }

  // Jeton périmé (autre onglet, navigateur rouvert, session renouvelée) :
  // on récupère le jeton de la session en cours puis on rejoue la requête.
  if (!response.ok && response.status === 403 && !rejoue
    && String(payload?.error || '').includes('Jeton de sécurité')) {
    if (await reparerJeton()) return request(path, { method, body, raw, rejoue: true });
  }

  if (!response.ok) {
    const message = payload?.error || `Erreur ${response.status}`;
    throw new ApiError(message, response.status, payload?.details);
  }
  return payload;
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  delete: path => request(path, { method: 'DELETE' }),
  /** Téléchargement (CSV ou impression) : conserve la session par cookie. */
  download: path => request(path, { raw: true })
};

/** Clé d'idempotence pour les écritures sensibles (vente, réception, perte…). */
export const newRequestKey = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Ouvre un document imprimable dans un nouvel onglet (tickets, bons, rapports). */
export function openPrintable(path) {
  window.open(`/api${path}`, '_blank', 'noopener');
}

/**
 * Télécharge un document imprimable (bon de réception, bordereau de transfert,
 * ticket de vente, rapport) dans le dossier « Téléchargements ».
 * Le fichier HTML s'ouvre ensuite dans le navigateur et s'imprime en PDF si besoin
 * — aucun nouvel onglet n'est ouvert : c'est l'utilisateur qui décide.
 */
export async function downloadDocument(path, filename) {
  const response = await api.download(path);
  const html = await response.text();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'document.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Télécharge un export CSV produit par le serveur. */
export async function downloadCsv(path, filename) {
  const response = await api.download(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}