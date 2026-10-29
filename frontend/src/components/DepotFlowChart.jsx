// 2.7.103 — histogramme divergent des mouvements du dépôt sur 12 mois.
// Entrées positives au-dessus de zéro, sorties sous zéro ; données inchangées.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { Badge, Card, Spinner } from './ui.jsx';
import { integer } from '../utils/format.js';

const NOMS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export default function DepotFlowChart() {
  const [mois, setMois] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    let actif = true;
    dashboard.stockFlowMonthly().then(result => { if (actif) setMois(result.months || []); })
      .catch(error => { if (actif) setErreur(error.message || 'Chargement impossible'); });
    return () => { actif = false; };
  }, []);
  const barres = useMemo(() => {
    const map = new Map((mois || []).map(ligne => [ligne.month, ligne]));
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const ligne = map.get(cle) || {};
      return { cle, date, in: Number(ligne.in || 0), out: Number(ligne.out || 0) };
    });
  }, [mois]);
  const entrees = barres.reduce((a, b) => a + b.in, 0);
  const sorties = barres.reduce((a, b) => a + b.out, 0);
  const max = Math.max(1, ...barres.map(b => Math.max(b.in, b.out)));
  const zero = 150, hauteur = 100, gauche = 80, pas = 59;
  return <Card title={<span className="dhisto__title"><ArrowDownUp size={18} /> Entrées et sorties du dépôt par mois</span>}
    actions={<Badge tone="info">Solde des mouvements : {integer(entrees - sorties)}</Badge>}>
    <div className="dhisto__legend"><span><i style={{ background: '#16a34a' }} /> Entrées</span><span><i style={{ background: '#ea580c' }} /> Sorties</span></div>
    {erreur ? <p role="alert">Chargement du graphique impossible : {erreur}</p> : mois === null ? <Spinner /> : <>
      <div className="dhisto__scroll"><svg viewBox="0 0 800 300" role="img" aria-label="Entrées et sorties mensuelles du dépôt">
        <defs>
          <linearGradient id="entreesBarres103" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#16a34a" /><stop offset="1" stopColor="#75dba1" /></linearGradient>
          <linearGradient id="sortiesBarres103" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ea580c" /><stop offset="1" stopColor="#fb923c" /></linearGradient>
        </defs>
        {[-1, -.5, 0, .5, 1].map(r => <g key={r}><line x1={gauche} x2="790" y1={zero - r * hauteur} y2={zero - r * hauteur} stroke={r === 0 ? '#64748b' : '#e2e8f0'} />
          <text x={gauche - 8} y={zero - r * hauteur + 4} textAnchor="end" fontSize="10" fill="#526581">{integer(max * r)}</text></g>)}
        {barres.map((b, i) => { const x = gauche + i * pas + pas / 2, hIn = b.in / max * hauteur, hOut = b.out / max * hauteur; return <g key={b.cle}>
          <title>{`${b.cle} : entrées ${integer(b.in)} · sorties ${integer(b.out)}`}</title>
          <rect x={x - 17} y={zero - hIn} width="34" height={hIn} rx="3" fill="url(#entreesBarres103)" />
          <rect x={x - 17} y={zero} width="34" height={hOut} rx="3" fill="url(#sortiesBarres103)" />
          <rect x={x - pas / 2} y="38" width={pas} height="225" fill="transparent" />
          <text x={x} y={Math.max(10, zero - hIn - 5)} textAnchor="middle" fontSize="9" fill="#15803d">{b.in ? `+${integer(b.in)}` : ''}</text>
          <text x={x} y={zero + hOut + 11} textAnchor="middle" fontSize="9" fill="#c2410c">{b.out ? `−${integer(b.out)}` : ''}</text>
          <text x={x} y="280" textAnchor="middle" fontSize="10" fill="#526581">{NOMS[b.date.getMonth()]}</text>
          <text x={x} y="294" textAnchor="middle" fontSize="9" fill="#64748b">{b.date.getFullYear()}</text>
        </g>; })}
      </svg></div>
      <p className="muted dhisto__note">Quantités en unités de gestion des produits : leur addition mélange des unités différentes. Le solde représente les mouvements de la période, pas le stock disponible. Sorties : transferts, pertes et autres mouvements.</p>
      <details><summary>Détail accessible par mois</summary><ul>{barres.map(b => <li key={b.cle}>{b.cle} : entrées {integer(b.in)} · sorties {integer(b.out)}</li>)}</ul></details>
    </>}
  </Card>;
}