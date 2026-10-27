// Bon de réception fournisseur (contrôle à la livraison, classement papier).
import { printablePage, formatMoney, formatDate, escapeHtml, formatNumber } from '../utils/html.js';
import { table } from './table.js';

export function receiptNote({ receipt, lines, pharmacy, supplier, products, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(line.number) },
    // 2.7.49 — fabricant saisi à la réception, lot par lot (fiche imprimée).
    { label: 'Fabriquant', render: line => escapeHtml(line.manufacturer || '—') },
    { label: 'Expiration', render: line => escapeHtml(formatDate(line.expiresOn)) },
    { label: 'Qté reçue', align: 'right', render: line => formatNumber(line.quantity) },
    { label: 'Prix d’achat', align: 'right', render: line => formatMoney(line.purchasePrice, currency) },
    { label: 'Frais attribués', align: 'right', render: line => formatMoney(line.allocatedFees, currency) },
    { label: 'Coût de revient', align: 'right', render: line => formatMoney(line.unitCost, currency) },
    { label: 'Valeur', align: 'right', render: line => formatMoney(Number(line.unitCost) * line.quantity, currency) }
  ], lines, { label: 'Total', cells: { 'Valeur': formatMoney(receipt.costTotal, currency), 'Frais attribués': formatMoney(receipt.fees, currency) } });
  return printablePage({
    title: 'Bon de réception',
    subtitle: receipt.reference,
    pharmacy,
    meta: [
      ['Fournisseur', supplier?.name || ''],
      ['N° du bon', receipt.reference],
      ['Date de réception', formatDate(receipt.createdAt)],
      ['Destination', 'Dépôt (réserve) — la pharmacie sera servie par transfert'],
      ['Récepteur', user?.name || ''],
      // 2.7.47 — frais automatiques (Paramètres → « Frais d'achat », % du PA),
      // il n'y a plus de frais de livraison saisis manuellement.
      ['Frais appliqués (automatiques)', formatMoney(receipt.fees, currency)]
    ],
    body,
    footer: 'Contrôler les quantités, les numéros de lot et les dates d’expiration avant rangement. Signer et classer ce bon.'
  });
}