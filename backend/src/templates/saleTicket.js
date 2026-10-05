// Ticket de vente / justificatif remis au client.
// 2.7.12 — vente au détail : la quantité est affichée DANS L'UNITÉ vendue
// (« 3 plaquettes », « 4 comprimé », « 2 boîtes ») avec le prix de cette unité.
import { printablePage, formatMoney, formatDate, escapeHtml } from '../utils/html.js';
import { table } from './table.js';

// Libellés des unités vendues (fiche médicament → conditionnement).
const UNITES = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const pluriel = texte => (/[eéyi]$/.test(texte)) ? `${texte}s` : texte;

export function saleTicket({ sale, lines, pharmacy, products, lots, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(lots.find(l => l.id === line.lotId)?.number || '') },
    { label: 'Expiration', render: line => escapeHtml(formatDate(lots.find(l => l.id === line.lotId)?.expiresOn)) },
    { label: 'Quantité', align: 'right', render: line => {
      // Les ventes enregistrées avant la 2.7.12 n'ont pas de saleUnit : boîte.
      const unite = UNITES[line.saleUnit] || UNITES.BOX;
      const nombre = Number(line.saleQuantity ?? line.quantity);
      const libelle = nombre > 1 ? pluriel(unite) : unite;
      return `${escapeHtml(String(Number.isInteger(nombre) ? nombre : nombre.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')))} ${libelle}`;
    } },
    { label: 'Prix unitaire', align: 'right', render: line => formatMoney(line.unitPrice, currency) },
    { label: 'Montant', align: 'right', render: line =>
      formatMoney(Number(line.unitPrice) * Number(line.saleQuantity ?? line.quantity), currency) }
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