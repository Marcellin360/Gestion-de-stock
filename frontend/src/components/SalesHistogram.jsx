// ============================================================================
// 2.7.18 — COURBE DES VENTES MENSUELLES (tableau de bord de la pharmacie).
//
// « Total ny vidin'ny lafo isam-bolana » : douze points, un par mois glissant,
// hauteur proportionnelle au CHIFFRE D'AFFAIRES du mois ; le mois courant est
// mis en valeur (colonne discrètement teintée + valeur affichée). Survol /
// titre de chaque point : nombre de ventes, CA, marge. Dessin en SVG pur :
// aucune bibliothèque, léger, imprimable. Source : GET /api/data/sales-monthly.
//
// 2.7.76 — présentation PROFESSIONNELLE légère (demande de l'officine, adieu
// le thème sombre essayé) : courbe lissée turquoise sur aire très légère,
// trames fines, libellés ardoise — cohérent avec le thème clair du logiciel.
// Mêmes données, mêmes infobulles : seule la forme change, jamais le calcul.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Card, Empty, Spinner } from './ui.jsx';
import { integer, money } from '../utils/format.js';

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

export default function SalesHistogram() {
  const toast = useToast();
  const [mois, setMois] = useState(null);   // [{month,count,total,margin}, …]
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await dashboard.salesMonthly();
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

  // Les points couvrent TOUJOURS 12 mois : un mois sans vente reste à zéro
  // (sinon l'échelle saute d'un mois à l'autre).
  const barres = useMemo(() => {
    if (!mois) return [];
    const parMois = new Map(mois.map(ligne => [ligne.month, ligne]));
    const maintenant = new Date();
    const fenetre = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      fenetre.push({ cle, annee: date.getFullYear(), m: date.getMonth(), ...(parMois.get(cle) || { count: 0, total: 0, margin: 0 }) });
    }
    return fenetre;
  }, [mois]);

  const plafond = Math.max(...barres.map(barre => Number(barre.total) || 0), 1);
  const totalAnnee = useMemo(() => barres.reduce((acc, barre) => ({
    count: acc.count + Number(barre.count), total: acc.total + Number(barre.total), margin: acc.margin + Number(barre.margin)
  }), { count: 0, total: 0, margin: 0 }), [barres]);

  // SVG : trames + aire légère + courbe lissée + mois au pied.
  const W = 760; const H = 240; const PAD = { haut: 34, bas: 36, cote: 12 };
  const pas = (W - PAD.cote * 2) / 12;
  const ligneBase = H - PAD.bas;
  const moisCourant = new Date().toISOString().slice(0, 7);

  const points = barres.map((barre, index) => {
    const valeur = Number(barre.total) || 0;
    const ratio = valeur > 0 ? Math.max(0.035, valeur / plafond) : 0;
    return {
      barre, valeur,
      x: PAD.cote + index * pas + pas / 2,
      y: ligneBase - ratio * (ligneBase - PAD.haut)
    };
  });
  const courant = points.find(point => point.barre.cle === moisCourant);
  const chemin = points.length ? cheminLisse(points) : '';
  const aire = chemin && points.length
    ? `${chemin} L ${points[points.length - 1].x} ${ligneBase} L ${points[0].x} ${ligneBase} Z`
    : '';

  return (
    <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <BarChart3 size={18} /> Ventes — total encaissé par mois (12 derniers mois)
    </span>}
    actions={<Badge tone="info">{integer(totalAnnee.count)} vente(s) · {money(totalAnnee.total)} encaissé(s)</Badge>}>
      {busy ? <Spinner /> : !barres.some(barre => barre.count > 0) ? (
        <Empty>Aucune vente validée sur les 12 derniers mois.</Empty>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Courbe des ventes mensuelles"
            style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="degradeAireVentes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#12897f" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#12897f" stopOpacity="0.02" />
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
            {courant ? (
              <rect x={courant.x - pas / 2} y={PAD.haut} width={pas} height={ligneBase - PAD.haut}
                rx={7} fill="rgba(18, 137, 127, 0.07)" stroke="#99d6cd" strokeOpacity="0.6" />
            ) : null}

            {/* Aire légère + trait de la courbe. */}
            <path d={aire} fill="url(#degradeAireVentes)" stroke="none" />
            <path d={chemin} fill="none" stroke="#0f766e" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />

            {points.map((point, index) => (
              <g key={point.barre.cle}>
                {/* Infobulle conservée : ventes · encaissé · marge du mois. */}
                <title>
                  {`${NOMS_COURTS[point.barre.m]} ${point.barre.annee} — ${integer(point.barre.count)} vente(s) · encaissé ${money(point.valeur)} · marge ${money(point.barre.margin)}`}
                </title>
                {/* Zone de survol couvrant toute la tranche du mois. */}
                <rect x={point.x - pas / 2} y={PAD.haut} width={pas} height={ligneBase - PAD.haut}
                  fill="transparent" />
                {point.valeur > 0 ? (
                  <circle cx={point.x} cy={point.y} r={point.barre.cle === moisCourant ? 4 : 2.6}
                    fill="#12897f" stroke="#ffffff" strokeWidth="1.4" />
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

            {/* Valeur du mois courant, affichée au-dessus de son point. */}
            {courant && courant.valeur > 0 ? (
              <text x={Math.min(courant.x, W - 70)} y={Math.max(12, courant.y - 10)} textAnchor="middle"
                fontSize="10.5" fontWeight="700" fill="#0f766e">
                {money(courant.valeur).replace(/\s?Ar$/, ' Ar')}
              </text>
            ) : null}
          </svg>
          <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
            La courbe suit le total encaissé chaque mois ; le mois en cours est teinté et
            sa valeur affichée au-dessus. Survolez le graphique pour le détail
            (ventes · encaissé · marge). Détail jour par jour : menu « Calendrier des ventes ».
          </p>
        </>
      )}
    </Card>
  );
}