// Feuille de comptage : liste des lots à compter, avec cases pour le comptage manuel.
import { printablePage, formatDate, escapeHtml } from '../utils/html.js';
import { table } from './table.js';

export function inventorySheet({ inventory, lines, pharmacy, products, lots, user }) {
  const body = table([
    { label: 'Médicament', render: line => `<strong>${escapeHtml(products.find(p => p.id === line.productId)?.name || '')}</strong>` },
    { label: 'Lot', render: line => escapeHtml(lots.find(l => l.id === line.lotId)?.number || '') },
    { label: 'Expiration', render: line => escapeHtml(formatDate(lots.find(l => l.id === line.lotId)?.expiresOn)) },
    { label: 'Stock théorique', align: 'right', render: line => line.theoretical },
    { label: 'Comptage 1', align: 'right', render: () => '&nbsp;' },
    { label: 'Comptage 2', align: 'right', render: () => '&nbsp;' },
    { label: 'Écart', align: 'right', render: () => '&nbsp;' },
    { label: 'Justification', render: () => '&nbsp;' }
  ], lines);
  return printablePage({
    title: 'Feuille d’inventaire',
    subtitle: inventory.reference,
    pharmacy,
    meta: [
      ['Ouverture', formatDate(inventory.createdAt)],
      ['Périmètre', inventory.scope || 'Stock complet'],
      ['Lots à compter', String(lines.length)],
      ['Responsable', user?.name || '']
    ],
    body: `<p>Suspendez les ventes et les réceptions pendant le comptage. Toute opération sur un produit compté annule le relevé.</p>${body}`,
    footer: 'Saisir ensuite les quantités physiques dans l’application (écrans Inventaires) et justifier chaque écart.'
  });
}
