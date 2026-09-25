// Rapport tabulaire imprimable (tous les types de rapports de l'application).
import { printablePage, escapeHtml } from '../utils/html.js';

export function reportTable({ title, subtitle, pharmacy, rows, summary = null, user }) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const head = columns.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows.map(row => `<tr>${columns.map(c => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('');
  const tableHtml = rows.length
    ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    : '<p>Aucune donnée sur la période sélectionnée.</p>';
  const summaryHtml = summary
    ? `<table style="width:auto"><tbody>${Object.entries(summary).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>`
    : '';
  return printablePage({
    title,
    subtitle,
    pharmacy,
    meta: [['Édité par', user?.name || ''], ['Lignes affichées', String(rows.length)]],
    body: `${summaryHtml}${tableHtml}`,
    footer: 'Rapport interne PharmaStock — données à conserver selon les obligations de traçabilité de l’officine.'
  });
}
