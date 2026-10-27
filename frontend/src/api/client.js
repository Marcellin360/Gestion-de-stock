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
    // 2.7.60 — une erreur ne se résume plus à « Export impossible » : le corps
    // de la réponse du serveur ({error}/{detail} JSON ou HTML) est affiché
    // pour désigner la vraie cause (colonne manquante, route absente…).
    if (!response.ok) {
      const corps = await response.text().catch(() => '');
      let detail = '';
      try {
        const payload = JSON.parse(corps);
        detail = [payload?.error, payload?.detail].filter(Boolean).join(' — ');
      } catch { detail = corps.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
      detail = detail.slice(0, 240);
      throw new ApiError(
        detail ? `Export impossible : ${detail}` : 'Export impossible.',
        response.status, detail ? [detail] : []);
    }
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

/**
 * 2.7.56 — Télécharge un PDF produit par le serveur (ticket de vente,
 * ordonnance du carnet, ordonnance de séjour).
 *
 * 2.7.63 — FIN DU « 204 No Content » : certaines protections locales
 * (antivirus « protection web », extensions, proxy) VIDENT silencieusement la
 * réponse du fetch binaire (204 sans corps ni en-têtes), alors que le backend
 * est sain. Deux voies désormais, de la plus fiable à la plus complète :
 *   1. le fetch tente sa chance ; si le PDF arrive (content-type), tout
 *      se passe comme avant (blob, nom imposé) ;
 *   2. s'il revient vide/sans PDF, LE NAVIGATEUR lui-même télécharge :
 *      navigatePdf(path) ouvre l'adresse avec <a download> — un GET de
 *      navigation, que les protections locales traitent comme une URL
 *      normale (elles ne la vident PAS comme elles vident un fetch). Le
 *      toast d'information dit de vérifier le dossier « Téléchargements ».
 * Retour : { via: 'blob' | 'navigateur' }.
 */
export async function downloadPdf(path, filename) {
  const response = await api.download(path);
  // 2.7.58 — garde-fou « page vide » : si le backend n'a pas été REDÉMARRÉ
  // depuis la 2.7.56 (Node ne recharge pas le code tout seul), il répond la
  // page HTML d'impression au lieu du PDF ; ce HTML, téléchargé sous un nom
  // .pdf, s'affichait blanc. On refuse ici avec un message clair plutôt
  // qu'un fichier vide.
  //
  // 2.7.60 — DIAGNOSTIC PRÉCIS : au lieu du message générique, la cause exacte
  // est affichée (réponse 200 en HTML = backend ANCIEN encore en écoute,
  // colonne manquante = migration à jouer…), avec la piste de remède.
  if (!String(response.headers.get('content-type') || '').includes('application/pdf')) {
    const corps = await response.clone().text().catch(() => '');
    const empreinte = response.headers.get('x-pharmastock-code');
    // 2.7.63 — réponse vidée par une protection locale (204 No Content, ni
    // corps ni empreinte) : contourner par la NAVIGATION du navigateur.
    if (!empreinte && !corps.trim()) {
      navigatePdf(path, filename);
      return { via: 'navigateur' };
    }
    throw new ApiError(await causeRefusPdf(response), response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'document.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { via: 'blob' };
}

/** 2.7.63 — Téléchargement par NAVIGATION simple (GET d'URL, pas de fetch) :
 *  utilisé quand une protection locale (antivirus web-shield, extension)
 *  vide silencieusement les réponses fetch ; le navigateur, lui, gère le
 *  flux comme une adresse ordinaire et dépose le fichier. */
export function navigatePdf(path, filename) {
  const lien = document.createElement('a');
  lien.href = `/api${path}`;
  lien.download = filename || 'document.pdf';
  lien.rel = 'noopener';
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
}

/**
 * 2.7.60 — CAUSE PRÉCISE quand le serveur ne renvoie PAS un PDF (réponse 200
 * mais HTML, le cas « ancien backend encore en écoute »). Deux sondes :
 *   1. le corps de sa réponse ({error}/{detail} JSON ou page HTML nettoyée) ;
 *   2. la route publique /api/version — qu'aucun backend plus ancien que la
 *      2.7.60 ne connaît : si elle 404, c'est la PREUVE que le processus en
 *      écoute n'est pas celui qu'on vient de relancer (mauvais dossier,
 *      mauvais port, ou ancien Node encore vivant).
 */
async function causeRefusPdf(response) {
  const corps = await response.clone().text().catch(() => '');
  const version = await fetch('/api/version', { credentials: 'same-origin' })
    .then(reponse => (reponse.ok ? reponse.json() : null))
    .catch(() => null);

  if (!version?.versionAppli) {
    return 'PAS de PDF : le backend qui RÉPOND est un ANCIEN code (il ne connaît '
      + 'même pas /api/version, ajoutée en 2.7.60). Redémarrer ne change rien tant '
      + 'que ce n’est pas LUI qu’on relance : FERMEZ toutes les fenêtres de '
      + 'terminal, tuez les processus Node encore ouverts (gestionnaire des '
      + 'tâches), puis relancez le BACKEND DEPUIS LE DOSSIER du projet où vous avez '
      + 'collé le code — et vérifiez le PORT annoncé au démarrage. '
      + '(Ce n’est pas F5 : il faut relancer le BACKEND lui-même, pas le navigateur.)';
  }

  const detail = lectureCorpsErreur(corps);

  // 2.7.62 — EST-CE BIEN NOTRE backend qui a répondu ? Chaque réponse de
  // l'API porte l'empreinte X-PharmaStock-Code (posée par routes/index.js).
  // Un 204 VIDE sans cette empreinte ne peut PAS venir de PharmaStock :
  // c'est un intermédiaire (antivirus web-shield, proxy, extension) qui
  // intercepte les téléchargements. Fingerprint des en-têtes pour le
  // confirmer visuellement.
  const empreinte = response.headers.get('x-pharmastock-code');
  if (!empreinte) {
    const indices = ['server', 'via', 'x-powered-by', 'content-type']
      .map(nom => [nom, response.headers.get(nom)])
      .filter(([, valeur]) => valeur)
      .map(([nom, valeur]) => `${nom}: ${valeur}`)
      .join(' · ');
    return `PDF refusé (code ${response.status}) : CE N'EST PAS PharmaStock `
      + 'qui a répondu (empreinte X-PharmaStock-Code absente — un intermédiaire '
      + 'a pris la place sur la réponse : ANTIVIRUS « protection web », proxy, '
      + 'ou extension du navigateur). Essayez d’abord une FENÊTRE PRIVÉE '
      + '(Ctrl + Maj + N) : si le PDF passe, coupable = extension/antivirus '
      + '(ajoutez le site aux exclusions de sa protection web). '
      + (indices ? `En-têtes vus : ${indices}.` : '');
  }

  if (/discharged_on|does not exist|column/i.test(detail)) {
    return `PAS de PDF : la base n’a pas encore la colonne de la 2.7.59 — `
      + `lancez « npm run db:migrate » à la racine du projet, puis relancez le `
      + `BACKEND. (Cause serveur : ${detail.slice(0, 180)})`;
  }
  return `PDF refusé (code ${response.status}) : ${detail.slice(0, 220)} — `
    + 'arrêtez puis relancez le BACKEND (pas F5 !), refaites « npm run build » '
    + 'et recommencez ; la cause exacte figure aussi dans la console du serveur.';
}

/** Corps d'erreur rendu lisible : JSON du backend ({error}/{detail}) ou HTML. */
function lectureCorpsErreur(corps) {
  const brut = String(corps || '').trim();
  if (brut.startsWith('{')) {
    try {
      const payload = JSON.parse(brut);
      return [payload.error, payload.detail].filter(Boolean).join(' — ');
    } catch { /* laisse l'HTML */ }
  }
  return brut.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    || 'aucune réponse exploitable';
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