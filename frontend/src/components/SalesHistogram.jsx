// 2.7.103 — histogramme du chiffre d'affaires validé, 12 mois glissants.
// Mêmes données serveur qu'auparavant, sans chiffres ni variations fictifs.
import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { Badge, Card, Spinner } from './ui.jsx';
import { integer, money } from '../utils/format.js';

const NOMS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export default function SalesHistogram() {
  const [mois, setMois] = useState(null);
  const [erreur, setErreur] = useState('');
  const [periode, setPeriode] = useState(12);
  useEffect(() => {
    let actif = true;
    dashboard.salesMonthly().then(result => { if (actif) setMois(result.months || []); })
      .catch(error => { if (actif) setErreur(error.message || 'Chargement impossible'); });
    return () => { actif = false; };
  }, []);
  const barres = useMemo(() => {
    const map = new Map((mois || []).map(ligne => [ligne.month, ligne]));
    const now = new Date();
    return Array.from({ length: periode }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - periode + i + 1, 1);
      const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const ligne = map.get(cle) || {};
      return { cle, date, count: Number(ligne.count || 0), total: Number(ligne.total || 0), margin: Number(ligne.margin || 0) };
    });
  }, [mois, periode]);
  const total = barres.reduce((a, b) => a + b.total, 0);
  const nombre = barres.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...barres.map(b => b.total));
  const W = 800, base = 220, haut = 150, gauche = 100, largeur = 690;
  const pas = largeur / periode;
  return <Card title={<span className="dhisto__title"><BarChart3 size={18} /> Chiffre d’affaires par mois</span>}
    actions={<Badge tone="info">{integer(nombre)} vente(s) · {money(total)}</Badge>}>
    <div className="dhisto__period" aria-label="Période du graphique">
      {[12, 6, 3].map(n => <button key={n} type="button" className={periode === n ? 'dhisto__period-on' : ''}
        aria-pressed={periode === n} onClick={() => setPeriode(n)}>{n} mois</button>)}
    </div>
    {erreur ? <p role="alert">Chargement du graphique impossible : {erreur}</p> : mois === null ? <Spinner /> : <>
      <div className="dhisto__scroll"><svg viewBox={`0 0 ${W} 270`} role="img" aria-label={`Chiffre d’affaires sur les ${periode} derniers mois`}>
        <defs><linearGradient id="ventesBarres103" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3b82f6" /><stop offset="1" stopColor="#1261ce" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map(r => <g key={r}><line x1={gauche} x2={790} y1={base - r * haut} y2={base - r * haut} stroke="#e2e8f0" />
          <text x={gauche - 8} y={base - r * haut + 4} textAnchor="end" fontSize="10" fill="#526581">{money(max * r)}</text></g>)}
        {barres.map((b, i) => { const x = gauche + i * pas + pas / 2; const h = Math.max(0, b.total / max * haut); return <g key={b.cle}>
          <title>{`${b.cle} : ${money(b.total)} · ${integer(b.count)} vente(s) · marge ${money(b.margin)}`}</title>
          <rect x={x - Math.min(18, pas * .3)} y={base - h} width={Math.min(36, pas * .6)} height={h} rx="3" fill="url(#ventesBarres103)" />
          <rect x={x - pas / 2} y="55" width={pas} height="166" fill="transparent" />
          <text x={x} y={base - h - 6} textAnchor="middle" fontSize="9" fill="#173254">{integer(b.total)}</text>
          <text x={x} y="238" textAnchor="middle" fontSize="10" fill="#526581">{NOMS[b.date.getMonth()]}</text>
          <text x={x} y="252" textAnchor="middle" fontSize="9" fill="#64748b">{b.date.getFullYear()}</text>
        </g>; })}
      </svg></div>
      <p className="muted dhisto__note">Ventes validées ; les mois sans vente sont à zéro. Survolez une barre pour le détail.</p>
      <details><summary>Détail accessible par mois</summary><ul>{barres.map(b => <li key={b.cle}>{b.cle} : {money(b.total)} · {integer(b.count)} vente(s) · marge {money(b.margin)}</li>)}</ul></details>
    </>}
  </Card>;
}