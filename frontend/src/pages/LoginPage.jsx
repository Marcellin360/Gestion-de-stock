// ============================================================
// 2.7 LOGIN — Authentification (refonte isométrique, sans défilement)
// ------------------------------------------------------------
// * CONFORM : champs login / mot de passe + bouton « Se connecter »
// * CONFORT : affichage/masquage du mot de passe, auto-complétion standard
//   (username / current-password), focus automatique, icônes explicites,
//   erreur en ligne sous chaque champ + bannière globale, spinner du bouton.
// * IHM (2.7.26 → 2.7.27) : VALIDATION CÔTÉ CLIENT d'abord (aucun appel réseau
//   tant qu'un champ obligatoire manque, erreur SOUS LE CHAMP concerné, focus
//   sur la première faute) ; erreur COHÉRENTE AVEC LA FAUTE — un identifiant
//   ou mot de passe FAUX (401) affiche TOUJOURS « Identifiant ou mot de passe
//   incorrect. », le secours « serveur impossible » n'apparaît qu'après une
//   NOUVELLE TENTATIVE automatique (5xx ou silence) et guide vers le
//   redémarrage ; champs verrouillés pendant la vérification.
// * FORME : tout tient à l'écran (aucun scroll sur ordinateur) ; la
//   décoration est dans styles.css, blocs préfixés .lp-* (fin de fichier).
//   Pas de nav « Accueil/Services/… » : seuls les éléments utiles au
//   login restent (logo, titre, champs, bouton, note de bas de page).
// ============================================================

import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, LogIn, Pill, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Input } from '../components/ui.jsx';
import { navigate } from '../utils/router.js';

export default function LoginPage() {
  const { login } = useAuth();
  const [values, setValues] = useState({ login: '', password: '' });
  // Erreur PAR CHAMP (validation côté client) — affichée sous le champ fautif.
  const [champs, setChamps] = useState({ login: '', password: '' });
  // Erreur GLOBALE (réponse du serveur ou coupure) — bannière en tête de forme.
  const [erreur, setErreur] = useState('');
  // Affichage/masquage du mot de passe (confort standard des écrans de login).
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Saisie : l'erreur du champ retapé s'efface aussitôt (feedback immédiat). */
  const maj = (nom, valeur) => {
    setValues(etat => ({ ...etat, [nom]: valeur }));
    setChamps(etat => (etat[nom] ? { ...etat, [nom]: '' } : etat));
  };

  /**
   * Validation côté client AVANT tout appel réseau : chaque champ obligatoire
   * reçoit son propre message, et le focus suit la première faute rencontrée.
   */
  const valider = () => {
    const fautes = {
      login: values.login.trim() ? '' : 'Saisissez votre identifiant.',
      password: values.password ? '' : 'Saisissez votre mot de passe.'
    };
    setChamps(fautes);
    if (fautes.login) { document.getElementById('identifiant')?.focus(); return false; }
    if (fautes.password) { document.getElementById('mot-de-passe')?.focus(); return false; }
    return true;
  };

  /**
   * Traduit UNE réponse du serveur en message d'affichage. Chaque faute reçoit
   * le message qui lui correspond (règle IHM : erreur cohérente avec la faute) :
   *   • 401 — le serveur A répondu : l'identifiant ou le mot de passe est faux
   *     (la norme interdit de préciser lequel) ;
   *   • 429/422 — message français du serveur, déjà clair ;
   *   • 5xx ou silence — le serveur est en faute : message guidé vers le
   *     redémarrage, sans « 500 » ni texte technique.
   */
  const presenter = cause => {
    const statut = cause?.status;
    const texte = String(cause?.message || '');
    if (statut === 401) {
      setErreur(/désactivé/i.test(texte) ? texte : 'Identifiant ou mot de passe incorrect.');
    } else if (statut && statut < 500) {
      setErreur(texte || 'Requête refusée.');
    } else {
      setErreur('La connexion au serveur est impossible. Redémarrez-le (arrêt puis « npm start »), vérifiez qu’il est bien démarré, puis réessayez.');
    }
  };

  const submit = async event => {
    event.preventDefault();
    if (busy || !valider()) return;
    setBusy(true);
    setErreur('');
    const identifiant = values.login.trim();
    try {
      await login(identifiant, values.password);
      navigate('tableau-de-bord');
      return;
    } catch (premier) {
      // 2.7.27 — 401 & 4xx : la faute est certaine (le serveur a répondu) →
      // message adapté immédiatement, SANS nouvelle tentative.
      if (premier?.status && premier.status < 500) {
        presenter(premier);
        setBusy(false);
        return;
      }
      // Faute interne (5xx) ou silence : une NOUVELLE TENTATIVE automatique
      // après une courte pause, avant de conclure (panne transitoire, serveur
      // en cours de redémarrage).
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        await login(identifiant, values.password);
        navigate('tableau-de-bord');
        return;
      } catch (second) {
        presenter(second);
      }
    }
    setBusy(false);
  };

  return (
    <div className="lp-page">
      <div className="lp-scene">
        <div className="lp-card">

          {/* ---------- Panneau de marque (héritier du « login-brand » de la
              2.7.26) : vagues + illustration isométrique (SVG pur, aucun
              fichier externe) ---------- */}
          <div className="lp-art" aria-hidden="true">
            <svg className="lp-waves" viewBox="0 0 1120 620" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lpWaveMid" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#cdeef2" /><stop offset="1" stopColor="#eefafb" />
                </linearGradient>
                <linearGradient id="lpWaveCyan" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#8bd7e2" /><stop offset="1" stopColor="#22a7c4" />
                </linearGradient>
                <linearGradient id="lpWaveDeep" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#1790ab" /><stop offset="1" stopColor="#0a6b90" />
                </linearGradient>
              </defs>
              <path d="M1120,0 L1120,620 L430,620 C560,552 650,468 700,362 C745,268 812,208 900,158 C980,112 1058,62 1102,0 Z" fill="url(#lpWaveMid)" />
              <path d="M1120,128 L1120,620 L545,620 C680,548 758,462 800,372 C840,286 908,232 1000,190 C1048,167 1092,146 1120,128 Z" fill="url(#lpWaveCyan)" />
              <path d="M1120,330 L1120,620 L742,620 C868,566 950,502 1004,428 C1044,373 1086,346 1120,330 Z" fill="url(#lpWaveDeep)" />
              <g stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeDasharray="26 30" opacity=".38" fill="none">
                <path d="M760,-40 L1460,660" />
                <path d="M880,-40 L1580,660" />
                <path d="M1000,-40 L1700,660" />
              </g>
              <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 26" opacity=".55" fill="none">
                <path d="M960,40 L1230,310" />
              </g>
            </svg>

            <svg className="lp-iso" viewBox="0 0 560 440">
              <defs>
                <radialGradient id="lpDiscTop" cx=".38" cy=".32" r="1.1">
                  <stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#f4f0e7" /><stop offset="1" stopColor="#e6ded0" />
                </radialGradient>
                <linearGradient id="lpDiscSide" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ded6c6" /><stop offset="1" stopColor="#b3a995" />
                </linearGradient>
                <linearGradient id="lpRedTop" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#e04b43" /><stop offset="1" stopColor="#c22b26" />
                </linearGradient>
                <linearGradient id="lpBottleGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#93a7ee" /><stop offset=".28" stopColor="#6b83d8" /><stop offset="1" stopColor="#42589f" />
                </linearGradient>
                <linearGradient id="lpCapGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#f2f4f9" /><stop offset=".5" stopColor="#dfe4ec" /><stop offset="1" stopColor="#b9c2d4" />
                </linearGradient>
                <linearGradient id="lpPink" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f7c3d4" /><stop offset="1" stopColor="#ec8fb0" />
                </linearGradient>
                <linearGradient id="lpLeaf" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#16c2ab" /><stop offset="1" stopColor="#0a8a7d" />
                </linearGradient>
              </defs>

              <g fill="#064a60" opacity=".22">
                <ellipse cx="240" cy="352" rx="158" ry="26" />
                <ellipse cx="435" cy="404" rx="62" ry="13" />
                <ellipse cx="140" cy="404" rx="60" ry="11" />
              </g>

              <g>
                <path d="M0,0 C18,-30 56,-38 80,-16 C58,10 16,18 0,0 Z" transform="translate(66,332) rotate(-24)" fill="url(#lpLeaf)" />
                <path d="M0,0 C14,-24 46,-30 66,-13 C48,8 14,15 0,0 Z" transform="translate(96,352) rotate(8)" fill="#0a8f86" />
                <path d="M0,0 C18,-30 56,-38 80,-16 C58,10 16,18 0,0 Z" transform="translate(520,352) rotate(196) scale(1.15)" fill="url(#lpLeaf)" />
              </g>

              <g>
                <path d="M110,252 L110,300 A130,78 0 0 0 370,300 L370,252 Z" fill="url(#lpDiscSide)" />
                <ellipse cx="240" cy="252" rx="130" ry="78" fill="url(#lpDiscTop)" />
                <ellipse cx="240" cy="252" rx="130" ry="78" fill="none" stroke="#e8e0d0" strokeWidth="2" />
                <g transform="translate(240,266) scale(1,0.6)" fill="#8e1c1a">
                  <rect x="-23" y="-58" width="46" height="116" rx="10" />
                  <rect x="-58" y="-23" width="116" height="46" rx="10" />
                </g>
                <g transform="translate(240,252) scale(1,0.6)" fill="url(#lpRedTop)">
                  <rect x="-23" y="-58" width="46" height="116" rx="10" />
                  <rect x="-58" y="-23" width="116" height="46" rx="10" />
                  <rect x="-16" y="-50" width="10" height="34" rx="5" fill="#ffffff" opacity=".28" />
                </g>
              </g>

              <g>
                <path d="M393,316 L393,398 A42,20 0 0 0 477,398 L477,316 Z" fill="url(#lpBottleGrad)" opacity=".94" />
                <rect x="399" y="324" width="9" height="66" rx="4.5" fill="#ffffff" opacity=".38" />
                <ellipse cx="435" cy="316" rx="42" ry="20" fill="#7d95e4" />
                <path d="M387,292 L387,316 A48,23 0 0 0 483,316 L483,292 Z" fill="url(#lpCapGrad)" />
                <g stroke="#aeb8cc" strokeWidth="2" opacity=".8">
                  <path d="M393,296 L393,312" /><path d="M405,297 L405,313" /><path d="M417,298 L417,314" />
                  <path d="M429,298 L429,314" /><path d="M441,298 L441,314" /><path d="M453,297 L453,313" /><path d="M465,296 L465,312" />
                </g>
                <ellipse cx="435" cy="292" rx="48" ry="23" fill="#f4f6fa" stroke="#ccd4e2" strokeWidth="2" />
                <g transform="translate(435,292) scale(1,.48)" fill="#d94040" opacity=".92">
                  <rect x="-8" y="-22" width="16" height="44" rx="4" />
                  <rect x="-22" y="-8" width="44" height="16" rx="4" />
                </g>
              </g>

              <g>
                <g transform="translate(140,376) rotate(-14)">
                  <ellipse cy="6" rx="31" ry="18" fill="#d9799f" />
                  <ellipse rx="31" ry="18" fill="url(#lpPink)" />
                  <path d="M0,-13 L0,13" stroke="#d9799f" strokeWidth="2.4" strokeLinecap="round" />
                  <ellipse cx="-9" cy="-6" rx="11" ry="5" fill="#ffffff" opacity=".35" transform="rotate(-14)" />
                </g>
                <g transform="translate(192,398) rotate(12) scale(.82)">
                  <ellipse cy="6" rx="31" ry="18" fill="#d9799f" />
                  <ellipse rx="31" ry="18" fill="url(#lpPink)" />
                  <path d="M0,-13 L0,13" stroke="#d9799f" strokeWidth="2.6" strokeLinecap="round" />
                </g>
                <g transform="translate(96,356) rotate(26) scale(.62)" opacity=".95">
                  <ellipse cy="6" rx="31" ry="18" fill="#d9799f" />
                  <ellipse rx="31" ry="18" fill="url(#lpPink)" />
                </g>
              </g>

              <g stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" opacity=".65">
                <path d="M330,96 h14 M337,89 v14" />
                <path d="M96,168 h10 M101,163 v10" opacity=".5" />
              </g>
            </svg>
          </div>

          {/* ---------- Panneau formulaire ---------- */}
          <div className="lp-panel">
            <div className="lp-brand">
              <span className="lp-brand-ico"><Pill size={20} /></span>
              <div>
                <div className="lp-brand-name">Pharma<span>Stock</span></div>
                <div className="lp-brand-tag">Gestion de stock — pharmacie</div>
              </div>
            </div>

            <div className="lp-title-block">
              <h1>CONNEXION <span className="lp-accent">UTILISATEUR</span></h1>
              <p className="lp-subtitle">Accédez au tableau de bord de gestion du stock.</p>
            </div>

            {erreur ? (
              <div className="lp-erreur login-alert" role="alert">
                <AlertTriangle size={16} />
                <span>{erreur}</span>
              </div>
            ) : null}

            <form onSubmit={submit} noValidate>
              <Field error={champs.login}>
                <div className={'lp-field' + (champs.login ? ' lp-field--error' : '')}>
                  <User size={16} className="lp-ico" />
                  <Input id="identifiant" type="text"
                    placeholder="Identifiant"
                    autoComplete="username" autoFocus disabled={busy}
                    value={values.login}
                    onChange={e => maj('login', e.target.value)}
                    aria-invalid={Boolean(champs.login)}
                    className={champs.login ? 'input--error' : ''} />
                </div>
              </Field>

              <Field error={champs.password}>
                <div className={'lp-field' + (champs.password ? ' lp-field--error' : '')}>
                  <Lock size={16} className="lp-ico" />
                  <Input id="mot-de-passe" type={visible ? 'text' : 'password'}
                    placeholder="Mot de passe"
                    autoComplete="current-password" disabled={busy}
                    value={values.password}
                    onChange={e => maj('password', e.target.value)}
                    aria-invalid={Boolean(champs.password)}
                    className={champs.password ? 'input--error' : ''} />
                  <button type="button"
                    className="lp-eye login-eye" tabIndex={-1}
                    onClick={() => setVisible(v => !v)}
                    aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                    {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Field>

              <div className="lp-row">
                <a className="lp-forgot" href="#" onClick={e => e.preventDefault()}
                  title="Demandez à l’administrateur de le réinitialiser depuis l’écran « Utilisateurs »">
                  Mot de passe oublié ?
                </a>
              </div>

              <button type="submit" className="lp-btn" disabled={busy}>
                {busy
                  ? <><span className="spinner spinner--btn lp-spinner" aria-hidden="true" /> Connexion…</>
                  : <><LogIn size={17} /> {'Se connecter'}</>}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}