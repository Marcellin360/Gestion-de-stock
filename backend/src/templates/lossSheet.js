// Fiche de sortie non commerciale : casse, détérioration, expiration, perte, don.
import { printablePage, formatMoney, formatDate, escapeHtml, formatNumber } from '../utils/html.js';
import { table } from './table.js';

export function lossSheet({ loss, lines, pharmacy, products, lots, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(lots.find(l => l.id === line.lotId)?.number || '') },
    { label: 'Expiration', render: line => escapeHtml(formatDate(lots.find(l => l.id === line.lotId)?.expiresOn)) },
    { label: 'Quantité', align: 'right', render: line => formatNumber(line.quantity) },
    { label: 'Coût retenu', align: 'right', render: line => formatMoney(line.unitCost, currency) },
    { label: 'Valeur de la perte', align: 'right', render: line => formatMoney(Number(line.unitCost) * line.quantity, currency) }
  ], lines, { label: 'Total', cells: { 'Valeur de la perte': formatMoney(loss.costTotal, currency) } });
  return printablePage({
    title: 'Fiche de perte',
    subtitle: loss.reference,
    pharmacy,
    meta: [
      ['Motif', loss.reason],
      ['Date', formatDate(loss.createdAt)],
      ['Enregistré par', user?.name || ''],
      ['Chiffre d’affaires', 'Aucun (sortie non commerciale)']
    ],
    body: `${body}<p><strong>Remarque justificative :</strong> ${escapeHtml(loss.note)}</p>`,
    footer: 'À conserver comme justificatif de sortie. L’élimination des produits expirés suit la filière réglementaire locale.'
  });
}
