// Modèles HTML imprimables (les documents de la pharmacie s'impriment ou s'enregistrent en PDF).
export const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export const formatNumber = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value || 0));
export const formatMoney = (value, currency = 'Ar') => `${formatNumber(value)} ${currency}`;
export const formatDate = value => (value ? new Date(value).toLocaleDateString('fr-FR') : '—');
export const formatDateTime = value => (value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** Gabarit commun des documents imprimables (en-tête pharmacie + tableau + pied). */
export function printablePage({ title, subtitle = '', pharmacy, meta = [], body, footer = '' }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root{font-size:12px}
  body{font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;margin:0;padding:24px;color:#1f2d33}
  header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b6b5b;padding-bottom:12px;margin-bottom:18px}
  h1{font-size:19px;margin:0 0 4px}
  .pharmacy{font-size:15px;font-weight:700;color:#0b6b5b}
  .muted{color:#667b85}
  .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 24px;margin:12px 0 18px}
  .meta div{display:flex;justify-content:space-between;border-bottom:1px dotted #cbd8d4;padding:3px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #d3e0dc;padding:6px 8px;text-align:left}
  th{background:#eef6f2;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
  td.num,th.num{text-align:right;white-space:nowrap}
  tfoot td{font-weight:700;background:#f7fbf9}
  .signatures{display:flex;justify-content:space-between;gap:40px;margin-top:44px}
  .signatures div{flex:1;border-top:1px solid #9fb3ac;padding-top:6px;text-align:center;color:#5d7a72}
  .footer{margin-top:26px;font-size:10px;color:#8698a0;border-top:1px solid #e2ece8;padding-top:8px}
  .total{font-size:16px;font-weight:700;color:#0b6b5b}
  @media print{ body{padding:0} .no-print{display:none} }
</style></head><body>
<header>
  <div>
    <div class="pharmacy">${escapeHtml(pharmacy?.pharmacyName || 'Pharmacie')}</div>
    <div class="muted">${escapeHtml(pharmacy?.address || '')}${pharmacy?.phone ? ` · ${escapeHtml(pharmacy.phone)}` : ''}</div>
  </div>
  <div style="text-align:right">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<div class="muted">${escapeHtml(subtitle)}</div>` : ''}
    <div class="muted">Édité le ${formatDateTime(new Date())}</div>
  </div>
</header>
${meta.length ? `<section class="meta">${meta.map(([label, value]) => `<div><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>` : ''}
${body}
${footer ? `<div class="footer">${footer}</div>` : ''}
<script>window.addEventListener('load',()=>{if(location.hash!=='#noprint')window.print();});</script>
</body></html>`;
}
