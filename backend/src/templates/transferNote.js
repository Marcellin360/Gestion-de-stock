// Bordereau de transfert dépôt → pharmacie (accompagne les cartons remis au
// comptoir : le pharmacien signe la réception, le dépôt garde une copie).
import { printablePage, formatMoney, formatDate, escapeHtml, formatNumber } from '../utils/html.js';
import { table } from './table.js';

const LIBELLES = { DEPOT: 'Dépôt (réserve)', PHARMACY: 'Pharmacie (officine)' };

export function transferNote({ transfer, lines, pharmacy, products, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(line.lotNumber) },
    { label: 'Expiration', render: line => escapeHtml(formatDate(line.expiresOn)) },
    { label: 'Quantité', align: 'right', render: line => formatNumber(line.quantity) },
    { label: 'Valeur', align: 'right', render: line => formatMoney(Number(line.unitCost) * line.quantity, currency) }
  ], lines, { label: 'Total transféré', cells: { 'Valeur': formatMoney(transfer.costTotal, currency) } });

  return printablePage({
    title: 'Bordereau de transfert — Dépôt vers Pharmacie',
    subtitle: transfer.reference,
    pharmacy,
    meta: [
      ['Sortie de', LIBELLES[transfer.fromLocation] || transfer.fromLocation],
      ['Entrée dans', LIBELLES[transfer.toLocation] || transfer.toLocation],
      ['Date', formatDate(transfer.createdAt)],
      ['Motif', transfer.reason],
      ['Remarque', transfer.note || '—'],
      ['Préparé par (dépôt)', user?.name || ''],
      ['Reçu par (pharmacie)', '……………………………………']
    ],
    body,
    footer: 'Le stock du dépôt diminue et celui de la pharmacie augmente dans le même mouvement : '
      + 'aucune quantité ne doit circuler sans ce bordereau.'
  });
}
