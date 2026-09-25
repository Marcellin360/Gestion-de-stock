// Ticket de vente / justificatif remis au client.
import { printablePage, formatMoney, formatDate, escapeHtml } from '../utils/html.js';
import { table } from './table.js';

export function saleTicket({ sale, lines, pharmacy, products, lots, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(lots.find(l => l.id === line.lotId)?.number || '') },
    { label: 'Expiration', render: line => escapeHtml(formatDate(lots.find(l => l.id === line.lotId)?.expiresOn)) },
    { label: 'Qté', align: 'right', render: line => line.quantity },
    { label: 'Prix unitaire', align: 'right', render: line => formatMoney(line.unitPrice, currency) },
    { label: 'Montant', align: 'right', render: line => formatMoney(Number(line.unitPrice) * line.quantity, currency) }
  ], lines);
  return printablePage({
    title: 'Ticket de vente',
    subtitle: sale.reference,
    pharmacy,
    meta: [
      ['Date', formatDate(sale.createdAt)],
      ['Servi par', user?.name || ''],
      ['Client', sale.customerName || 'Client comptoir'],
      ['Statut', sale.status === 'CANCELLED' ? 'ANNULÉE' : 'Validée']
    ],
    body: `${body}<p class="total">Total à payer : ${formatMoney(sale.total, currency)}</p>`,
    footer: 'Document interne — ne remplace pas la facture normalisée exigée par la réglementation fiscale locale.'
  });
}
