// 2.7.104 — évolution des ventes validées sur les 30 jours locaux, sans données fictives.
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { Card, Spinner } from './ui.jsx';
import { money } from '../utils/format.js';

const jourLocal = () => {
  const parties = new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const valeur = type => parties.find(p => p.type === type)?.value;
  return `${valeur('year')}-${valeur('month')}-${valeur('day')}`;
};

export default function DashboardSalesTrend() {
  const jours = useMemo(() => {
    const fin = new Date(`${jourLocal()}T12:00:00Z`);
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date(fin); date.setUTCDate(fin.getUTCDate() - 29 + i);
      return date.toISOString().slice(0, 10);
    });
  }, []);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    let actif = true;
    const mois = [...new Set(jours.map(j => j.slice(0, 7)))];
    Promise.all(mois.map(m => dashboard.salesCalendar(m))).then(reponses => {
      if (actif) setData(reponses.flatMap(r => r.days || []));
    }).catch(e => { if (actif) setErreur(e.message || 'Chargement impossible'); });
    return () => { actif = false; };
  }, [jours]);
  const series = useMemo(() => {
    const index = new Map((data || []).map(j => [j.date, Number(j.total || 0)]));
    return jours.map(date => ({ date, total: index.get(date) || 0 }));
  }, [data, jours]);
  const max = Math.max(1, ...series.map(j => j.total));
  const points = series.map((j, i) => ({ ...j, x: 46 + i * 9.8, y: 150 - j.total / max * 115 }));
  const chemin = points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  return <Card title={<span className="dhisto__title"><TrendingUp size={17} /> Évolution des ventes — 30 jours</span>}>
    {erreur ? <p role="alert">Impossible de charger les ventes : {erreur}</p> : data === null ? <Spinner /> : <>
      <svg viewBox="0 0 350 185" role="img" aria-label="Chiffre d’affaires quotidien des 30 derniers jours" style={{ width: '100%', display: 'block' }}>
        <defs><linearGradient id="tendanceVentes104" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3b82f6" stopOpacity=".28" /><stop offset="1" stopColor="#3b82f6" stopOpacity=".02" /></linearGradient></defs>
        {[0, .5, 1].map(r => <g key={r}><line x1="46" x2="334" y1={150 - r * 115} y2={150 - r * 115} stroke="#e2e8f0" /><text x="42" y={153 - r * 115} textAnchor="end" fontSize="7" fill="#64748b">{money(max * r)}</text></g>)}
        <path d={`${chemin} L 330.2 150 L 46 150 Z`} fill="url(#tendanceVentes104)" />
        <path d={chemin} fill="none" stroke="#1975e9" strokeWidth="2" />
        {points.map(p => <g key={p.date}><title>{`${p.date} : ${money(p.total)}`}</title><circle cx={p.x} cy={p.y} r="2" fill="#1975e9" /><rect x={p.x - 5} y="25" width="10" height="130" fill="transparent" /></g>)}
        <text x="46" y="171" fontSize="9" fill="#64748b">{jours[0].slice(8)}/{jours[0].slice(5, 7)}</text>
        <text x="334" y="171" textAnchor="end" fontSize="9" fill="#64748b">{jours[29].slice(8)}/{jours[29].slice(5, 7)}</text>
      </svg>
      <details><summary>Détail des 30 jours</summary><ul>{series.map(j => <li key={j.date}>{j.date} : {money(j.total)}</li>)}</ul></details>
    </>}
  </Card>;
}