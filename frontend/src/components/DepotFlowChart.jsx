// ============================================================================
// 2.7.20 — GRAPHIQUE DES FLUX MENSUELS DU DÉPÔT (tableau de bord, dépôt seul).
//
// « Fanafody rehetra niditra par mois sy ny nivoaka » : pour chacun des 12
// derniers mois, les quantités ENTRÉES à la réserve (vert) et les quantités
// SORTIES de la réserve (orange, transferts vers la pharmacie, pertes,
// écarts), en boîtes (unité de gestion).
// Source : GET /api/data/stock-flow-monthly (mouvements du dépôt).
//
// 2.7.76 — retour au thème clair professionnel (libellés ardoise habituels).
//
// 2.7.78 — MÊME FORME que la courbe des ventes de la pharmacie (demande de
//   l'officine : « Atao mitovy amin'ny pharmacie ny forme ny Diagramme ») :
//   fini les barres côte à côte — DEUX COURBES lissées (entrées VERTES,
//   sorties ORANGE) sur aire très légère, trames fines pointillées, mois au
//   pied, mois en cours discrètement teinté, valeur(s) du mois affichée(s).
//   Mêmes données, mêmes calculettes, mêmes infobulles : seule la forme
//   change, jamais le chiffre.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Card, Empty, Spinner } from './ui.jsx';
import { integer } from '../utils/format.js';

const NOMS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Courbe lissée (splines cubiques point milieu) : joli sans bibliothèque. */
function cheminLisse(points) {
  return points.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const avant = points[index - 1];
    const milieuX = (avant.x + point.x) / 2;
    return `C ${milieuX} ${avant.y}, ${milieuX} ${point.y}, ${point.x} ${point.y}`;
  }).join(' ');
}

export default function DepotFlowChart() {
  const toast = useToast();
  const [mois, setMois] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await dashboard.stockFlowMonthly();
        if (vivant) setMois(reponse.months || []);
      } catch (cause) {
        if (vivant) toast.error(cause.message);
      } finally {
        if (vivant) setBusy(false);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Les points couvrent TOUJOURS 12 mois : un mois sans mouvement reste à zéro
  // (sinon l'échelle saute d'un mois à l'autre).
  const barres = useMemo(() => {
    if (!mois) return [];
    const parMois = new Map(mois.map(ligne => [ligne.month, ligne]));
    const maintenant = new Date();
    const fenetre = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      fenetre.push({ cle, annee: date.getFullYear(), m: date.getMonth(), ...(parMois.get(cle) || { in: 0, out: 0 }) });
    }
    return fenetre;
  }, [mois]);

  const plafond = Math.max(...barres.map(barre => Math.max(Number(barre.in) || 0, Number(barre.out) || 0)), 1);
  const totaux = useMemo(() => barres.reduce((acc, barre) => ({
    in: acc.in + Number(barre.in), out: acc.out + Number(barre.out)
  }), { in: 0, out: 0 }), [barres]);

  // SVG : trames + aires légères + deux courbes lissées + mois au pied
  // (même gabarit que la courbe des ventes de la pharmacie, 2.7.78).
  const W = 760; const H = 240; const PAD = { haut: 34, bas: 36, cote: 12 };
  const pas = (W - PAD.cote * 2) / 12;
  const ligneBase = H - PAD.bas;
  const moisCourant = new Date().toISOString().slice(0, 7);

  /** Points d'une série : x = milieu de la tranche du mois, y = hauteur. */
  const pointsDe = clef => barres.map((barre, index) => {
    const valeur = Number(barre[clef]) || 0;
    const ratio = valeur > 0 ? Math.max(0.035, valeur / plafond) : 0;
    return {
      barre, valeur,
      x: PAD.cote + index * pas + pas / 2,
      y: ligneBase - ratio * (ligneBase - PAD.haut)
    };
  });

  const pointesEntrees = pointsDe('in');
  const pointesSorties = pointsDe('out');
  const cheminEntrees = pointesEntrees.length ? cheminLisse(pointesEntrees) : '';
  const cheminSorties = pointesSorties.length ? cheminLisse(pointesSorties) : '';
  const aireDe = (chemin, points) => (chemin && points.length
    ? `${chemin} L ${points[points.length - 1].x} ${ligneBase} L ${points[0].x} ${ligneBase} Z`
    : '');
  const courant = pointesEntrees.length ? pointesEntrees[barres.findIndex(b => b.cle === moisCourant)] : null;
  const moisEnCours = barres.find(b => b.cle === moisCourant);

  return (
    <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ArrowDownUp size={18} /> Flux du dépôt — entrées / sorties par mois (12 derniers mois)
    </span>}
    actions={<>
      <Badge tone="ok">↓ entré {integer(totaux.in)} boîte(s)</Badge>
      <Badge tone="warn">↑ sorti {integer(totaux.out)} boîte(s)</Badge>
    </>}>
      {busy ? <Spinner /> : !barres.some(barre => barre.in > 0 || barre.out > 0) ? (
        <Empty>Aucun mouvement de la réserve sur les 12 derniers mois.</Empty>
      ) : (
        <>
          <div className="row" style={{ gap: 14, fontSize: '.8rem', marginBottom: 4 }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 5 }} />Entrées (réceptions)</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ea580c', borderRadius: 2, marginRight: 5 }} />Sorties (transferts vers la pharmacie, pertes…)</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flux mensuels du dépôt"
            style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="degradeAireFluxEntrees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="degradeAireFluxSorties" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ea580c" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Trames horizontales discrètes, à peine marquées. */}
            {[0.33, 0.66].map(ratio => (
              <line key={ratio} x1={PAD.cote} x2={W - PAD.cote}
                y1={ligneBase - ratio * (ligneBase - PAD.haut)} y2={ligneBase - ratio * (ligneBase - PAD.haut)}
                stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 5" />
            ))}
            {/* Ligne de base. */}
            <line x1={PAD.cote} y1={ligneBase} x2={W - PAD.cote} y2={ligneBase}
              stroke="#cbd5e1" strokeWidth="1" />

            {/* Colonne du mois courant, très légèrement teintée. */}
            {moisEnCours ? (
              <rect x={PAD.cote + (barres.indexOf(moisEnCours)) * pas} y={PAD.haut}
                width={pas} height={ligneBase - PAD.haut}
                rx={7} fill="rgba(100, 116, 139, 0.07)" stroke="#cbd5e1" strokeOpacity="0.6" />
            ) : null}

            {/* Aires légères + traits des deux courbes (vert = entrées, orange = sorties). */}
            <path d={aireDe(cheminEntrees, pointesEntrees)} fill="url(#degradeAireFluxEntrees)" stroke="none" />
            <path d={aireDe(cheminSorties, pointesSorties)} fill="url(#degradeAireFluxSorties)" stroke="none" />
            <path d={cheminEntrees} fill="none" stroke="#16a34a" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />
            <path d={cheminSorties} fill="none" stroke="#ea580c" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />

            {pointesEntrees.map((point, index) => (
              <g key={point.barre.cle}>
                {/* Infobulle conservée : entrées et sorties du mois. */}
                <title>
                  {`${NOMS_COURTS[point.barre.m]} ${point.barre.annee} — ↓ entrées ${integer(point.valeur)} boîte(s) · ↑ sorties ${integer(pointesSorties[index].valeur)} boîte(s)`}
                </title>
                {/* Zone de survol couvrant toute la tranche du mois. */}
                <rect x={point.x - pas / 2} y={PAD.haut} width={pas} height={ligneBase - PAD.haut}
                  fill="transparent" />
                {point.valeur > 0 ? (
                  <circle cx={point.x} cy={point.y} r={point.barre.cle === moisCourant ? 4 : 2.6}
                    fill="#16a34a" stroke="#ffffff" strokeWidth="1.4" />
                ) : null}
                {pointesSorties[index].valeur > 0 ? (
                  <circle cx={pointesSorties[index].x} cy={pointesSorties[index].y}
                    r={point.barre.cle === moisCourant ? 4 : 2.6}
                    fill="#ea580c" stroke="#ffffff" strokeWidth="1.4" />
                ) : null}
                <text x={point.x} y={ligneBase + 14} textAnchor="middle"
                  fontSize="9" fill="#64748b">
                  {NOMS_COURTS[point.barre.m]}
                </text>
                {/* L'année n'apparaît que sous janvier (limites propres). */}
                {point.barre.m === 0 || index === 0 ? (
                  <text x={point.x} y={ligneBase + 27} textAnchor="middle"
                    fontSize="9" fontWeight="600" fill="#475569">{point.barre.annee}</text>
                ) : null}
              </g>
            ))}

            {/* Valeurs du mois courant, affichées au-dessus de ses points. */}
            {courant && moisEnCours && Number(moisEnCours.in) > 0 ? (
              <text x={Math.min(Math.max(courant.x, 64), W - 64)} y={Math.max(12, courant.y - 8)} textAnchor="middle"
                fontSize="10.5" fontWeight="700" fill="#15803d">
                {`↓ ${integer(moisEnCours.in)}`}
              </text>
            ) : null}
            {courant && moisEnCours && Number(moisEnCours.out) > 0 ? (
              <text x={Math.min(Math.max(courant.x, 64), W - 64)}
                y={Math.max(Number(moisEnCours.in) > 0 ? 24 : 12,
                  ligneBase - Math.max(0.035, Number(moisEnCours.out) / plafond) * (ligneBase - PAD.haut) - 8)}
                textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#c2410c">
                {`↑ ${integer(moisEnCours.out)}`}
              </text>
            ) : null}
          </svg>
          <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
            Les deux courbes suivent les boîtes entrées et sorties chaque mois ; le mois en cours
            est teinté et ses quantités affichées. Survolez le graphique pour le détail.
            Détail jour par jour : menu « Calendrier des stock ».
          </p>
        </>
      )}
    </Card>
  );
}