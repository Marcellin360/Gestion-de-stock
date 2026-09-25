// Rendu de tableau HTML partagé par tous les documents imprimables.
import { escapeHtml } from '../utils/html.js';

export function table(columns, rows, footer = null) {
  const head = columns.map(c => `<th${c.align === 'right' ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map(row => `<tr>${columns.map(c => `<td${c.align === 'right' ? ' class="num"' : ''}>${c.render ? c.render(row) : escapeHtml(row[c.key])}</td>`).join('')}</tr>`).join('');
  const foot = footer
    ? `<tfoot><tr>${columns.map((c, index) => `<td${c.align === 'right' ? ' class="num"' : ''}>${index === 0 ? escapeHtml(footer.label) : escapeHtml(footer.cells?.[c.key] ?? '')}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">Aucune ligne.</td></tr>`}</tbody>${foot}</table>`;
}
