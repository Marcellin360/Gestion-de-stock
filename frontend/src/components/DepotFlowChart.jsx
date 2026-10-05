// ============================================================================
// 2.7.20 — GRAPHIQUE DES FLUX MENSUELS DU DÉPÔT (tableau de bord, dépôt seul).
//
// « Fanafody rehetra niditra par mois sy ny nivoaka » : pour chacun des 12
// derniers mois, deux barres côte à côte — les quantités ENTRÉES à la réserve
// (vert) et les quantités SORTIES de la réserve (orange, transferts vers la
// pharmacie, pertes, écarts), en boîtes (unité de gestion).
// Source : GET /api/data/stock-flow-monthly (mouvements du dépôt).
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Card, Empty, Spinner } from './ui.jsx';
import { integer } from '../utils/format.js';

const NOMS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

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

  const W = 720; const H = 220; const PAD = { haut: 26, bas: 34, cote: 8 };
  const largeurGroupe = (W - PAD.cote * 2) / 12;
  const largeurBarre = largeurGroupe * 0.32;
  const moisCourant = new Date().toISOString().slice(0, 7);

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
            <line x1={PAD.cote} y1={H - PAD.bas} x2={W - PAD.cote} y2={H - PAD.bas}
              stroke="#cbd5e1" strokeWidth="1" />
            {barres.map((barre, index) => {
              const entree = Number(barre.in) || 0;
              const sortie = Number(barre.out) || 0;
              const hauteur = valeur => (valeur > 0 ? Math.max(3, (valeur / plafond) * (H - PAD.haut - PAD.bas)) : 0);
              const xGroupe = PAD.cote + index * largeurGroupe;
              const courant = barre.cle === moisCourant;
              return (
                <g key={barre.cle}>
                  <title>{`${NOMS_COURTS[barre.m]} ${barre.annee} — ↓ entrées ${integer(entree)} boîte(s) · ↑ sorties ${integer(sortie)} boîte(s)`}</title>
                  <rect x={xGroupe + largeurGroupe * 0.08} y={H - PAD.bas - hauteur(entree)}
                    width={largeurBarre} height={hauteur(entree)} rx={3}
                    fill={courant ? '#15803d' : '#86efac'} />
                  <rect x={xGroupe + largeurGroupe * 0.6 - largeurBarre} y={H - PAD.bas - hauteur(sortie)}
                    width={largeurBarre} height={hauteur(sortie)} rx={3}
                    fill={courant ? '#c2410c' : '#fdba74'} />
                  {entree > 0 ? (
                    <text x={xGroupe + largeurGroupe * 0.08 + largeurBarre / 2}
                      y={H - PAD.bas - hauteur(entree) - 5} textAnchor="middle" fontSize="9" fill="#166534">
                      {integer(entree)}
                    </text>
                  ) : null}
                  {sortie > 0 ? (
                    <text x={xGroupe + largeurGroupe * 0.6 - largeurBarre / 2}
                      y={H - PAD.bas - hauteur(sortie) - 5} textAnchor="middle" fontSize="9" fill="#9a3412">
                      {integer(sortie)}
                    </text>
                  ) : null}
                  <text x={xGroupe + largeurGroupe / 2} y={H - PAD.bas + 14} textAnchor="middle"
                    fontSize="9" fill="#64748b">{NOMS_COURTS[barre.m]}</text>
                  {barre.m === 0 || index === 0 ? (
                    <text x={xGroupe + largeurGroupe / 2} y={H - PAD.bas + 26} textAnchor="middle"
                      fontSize="9" fontWeight="600" fill="#475569">{barre.annee}</text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>
            Le mois en cours est en couleurs foncées ; survolez une barre pour le détail.
            Détail jour par jour : menu « Calendrier des stock ».
          </p>
        </>
      )}
    </Card>
  );
}