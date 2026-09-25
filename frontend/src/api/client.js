// ============================================================================
// Client HTTP unique : session par cookie HttpOnly + jeton CSRF dans l'en-tête
// X-CSRF-Token (mémorisé au moment de la connexion). Toute erreur de l'API est
// transformée en Error avec son code HTTP et son message en français.
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

async function request(path, { method = 'GET', body, raw = false } = {}) {
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
