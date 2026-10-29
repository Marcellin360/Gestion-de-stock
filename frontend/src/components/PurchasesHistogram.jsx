// 2.7.101 — achats fournisseurs : réceptions validées, pas paiements effectifs.
import { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { dashboard } from '../api/endpoints.js';
import { Badge, Card, Spinner } from './ui.jsx';
import { money } from '../utils/format.js';

export default function PurchasesHistogram() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;

    dashboard.purchasesMonthly()
      .then(result => {
        if (actif) setDonnees(result.months || []);
      })
      .catch(error => {
        if (actif) {
          setErreur(error.message || 'Chargement impossible.');
        }
      });

    return () => {
      actif = false;
    };
  }, []);

  const mois = useMemo(() => {
    const map = new Map(
      (donnees || []).map(row => [row.month, row])
    );

    const aujourdhui = new Date();

    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(
        aujourdhui.getFullYear(),
        aujourdhui.getMonth() - 11 + i,
        1
      );

      const cle =
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}`;

      return {
        cle,
        date,
        total: Number(map.get(cle)?.total || 0),
        count: Number(map.get(cle)?.count || 0)
      };
    });
  }, [donnees]);

  const maximum = Math.max(1, ...mois.map(item => item.total));
  const total = mois.reduce(
    (somme, item) => somme + item.total,
    0
  );

  return (
    <Card
      title={
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <ShoppingCart size={18} />
          Achats fournisseurs par mois — 12 derniers mois
        </span>
      }
      actions={
        <Badge tone="info">
          Total : {money(total)}
        </Badge>
      }
    >
      <p className="muted">
        Valeur d’achat des réceptions validées, qu’elles soient
        payées ou non. Ce graphique ne représente pas les
        paiements effectués.
      </p>

      {erreur ? (
        <p role="alert">
          Impossible de charger les achats : {erreur}
        </p>
      ) : donnees === null ? (
        <Spinner />
      ) : (
        <>
          <svg
            viewBox="0 0 780 260"
            role="img"
            aria-label="Valeur des achats fournisseurs par mois"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block'
            }}
          >
            {[0, 0.5, 1].map(ratio => (
              <g key={ratio}>
                <line
                  x1="105"
                  x2="770"
                  y1={210 - ratio * 170}
                  y2={210 - ratio * 170}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />

                <text
                  x="100"
                  y={214 - ratio * 170}
                  textAnchor="end"
                  fontSize="10"
                  fill="#475569"
                >
                  {money(maximum * ratio)}
                </text>
              </g>
            ))}

            {mois.map((item, i) => {
              const height = Math.max(
                0,
                item.total / maximum * 170
              );

              const label = item.date.toLocaleDateString(
                'fr-FR',
                { month: 'short' }
              );

              return (
                <g key={item.cle}>
                  <title>
                    {`${item.cle} : ${money(item.total)} — ${item.count} réception(s) validée(s)`}
                  </title>

                  <rect
                    x={112 + i * 54.5}
                    y={210 - height}
                    width="31"
                    height={height}
                    rx="4"
                    fill="#f59e0b"
                  />

                  <text
                    x={127.5 + i * 54.5}
                    y="228"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#475569"
                  >
                    {label}
                  </text>

                  <text
                    x={127.5 + i * 54.5}
                    y="243"
                    textAnchor="middle"
                    fontSize="9"
                    fill="#64748b"
                  >
                    {item.date.getFullYear()}
                  </text>
                </g>
              );
            })}
          </svg>

          <details>
            <summary>Détail des montants par mois</summary>

            <ul>
              {mois.map(item => (
                <li key={item.cle}>
                  {item.cle} : {money(item.total)} —{' '}
                  {item.count} réception(s)
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Card>
  );
}