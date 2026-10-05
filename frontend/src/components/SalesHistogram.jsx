// ============================================================================
// 2.7.18 — HISTOGRAMME DES VENTES MENSUELLES (tableau de bord de la pharmacie).
//
// « Total ny vidin'ny lafo isam-bolana » : douze barres, une par mois glissant,
// hauteur proportionnelle au CHIFFRE D'AFFAIRES du mois ; le mois courant est
// mis en valeur. Survol / titre de chaque barre : nombre de ventes, CA, marge.
// Dessin en SVG pur : aucune bibliothèque, léger, imprimable.
// Source : GET /api/data/sales-monthly.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Card, Empty, Spinner } from './ui.jsx';
import { integer, money } from '../utils/format.js';

const NOMS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

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

  // Les barres couvrent TOUJOURS 12 mois : un mois sans vente reste à zéro
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

  // SVG : 12 barres + un texte de valeur en pointe, libellé mois au pied.
  const W = 720; const H = 220; const PAD = { haut: 26, bas: 34, cote: 8 };
  const largeurBarre = (W - PAD.cote * 2) / 12;
  const moisCourant = new Date().toISOString().slice(0, 7);

  return (
    <Card title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <BarChart3 size={18} /> Ventes — total encaissé par mois (12 derniers mois)
    </span>}
    actions={<Badge tone="info">{integer(totalAnnee.count)} vente(s) · {money(totalAnnee.total)} encaissé(s)</Badge>}>
      {busy ? <Spinner /> : !barres.some(barre => barre.count > 0) ? (
        <Empty>Aucune vente validée sur les 12 derniers mois.</Empty>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogramme des ventes mensuelles"
            style={{ width: '100%', height: 'auto', display: 'block' }}>
            {/* Ligne de base */}
            <line x1={PAD.cote} y1={H - PAD.bas} x2={W - PAD.cote} y2={H - PAD.bas}
              stroke="#cbd5e1" strokeWidth="1" />
            {barres.map((barre, index) => {
              const valeur = Number(barre.total) || 0;
              const hauteur = valeur > 0 ? Math.max(3, (valeur / plafond) * (H - PAD.haut - PAD.bas)) : 0;
              const x = PAD.cote + index * largeurBarre + largeurBarre * 0.15;
              const y = H - PAD.bas - hauteur;
              const courant = barre.cle === moisCourant;
              return (
                <g key={barre.cle}>
                  <title>
                    {`${NOMS_COURTS[barre.m]} ${barre.annee} — ${integer(barre.count)} vente(s) · encaissé ${money(valeur)} · marge ${money(barre.margin)}`}
                  </title>
                  <rect x={x} y={y} width={largeurBarre * 0.7} height={hauteur} rx={3}
                    fill={courant ? '#2563eb' : '#93c5fd'} />
                  {valeur > 0 ? (
                    <text x={x + largeurBarre * 0.35} y={y - 5} textAnchor="middle"
                      fontSize="9" fill={courant ? '#1e3a8a' : '#475569'}>
                      {money(valeur).replace(/\s?Ar$/, ' Ar')}
                    </text>
                  ) : null}
                  <text x={x + largeurBarre * 0.35} y={H - PAD.bas + 14} textAnchor="middle"
                    fontSize="9" fill="#64748b">
                    {NOMS_COURTS[barre.m]}
                  </text>
                  {/* L'année n'apparaît que sous janvier (limites propres). */}
                  {barre.m === 0 || index === 0 ? (
                    <text x={x + largeurBarre * 0.35} y={H - PAD.bas + 26} textAnchor="middle"
                      fontSize="9" fontWeight="600" fill="#475569">{barre.annee}</text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
            Le mois en cours est en bleu foncé ; survolez une barre pour le détail
            (ventes · encaissé · marge). Détail jour par jour : menu « Calendrier des ventes ».
          </p>
        </>
      )}
    </Card>
  );
}