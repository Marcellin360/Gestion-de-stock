// ============================================================================
// Ticket de vente / justificatif remis au client.
//
// 2.7.12 — vente au détail : la quantité est affichée DANS L'UNITÉ vendue
// (« 3 plaquettes », « 4 comprimé », « 2 boîtes ») avec le prix de cette unité.
//
// 2.7.33 — TEBOKA ⑬ : le ticket est imprimé au format A5 PORTRAIT, en DEUX
// EXEMPLAIRES sur la même feuille (l'un au-dessus de l'autre, séparés par une
// ligne de découpe ✂) : celui du haut pour le CLIENT, celui du bas, la COPIE
// PHARMACIE à conserver au comptoir. Les colonnes « Lot » et « Expiration »
// ne figurent PLUS : elles encombraient le ticket remis au client (la
// traçabilité complète reste dans le logiciel et le Détail).
//
// 2.7.56 — FORME « modèle ticket » demandée par l'officine (visuel unique) :
//   mention centrée en haut (« Exemplaire client » / « Copie pharmacie — à
//   conserver »), en-tête « Dispensaire · téléphone | Ticket de vente ·
//   référence », filet horizontal, lignes Date/Client/Servi par, tableau aux
//   filets UNIQUEMENT horizontaux (aucune case à cocher ni liseré vertical),
//   total CENTRÉ en gras, ligne de coupe pointillée avec ✂ centré. La version
//   PDF identique (téléchargeable) vit dans documentsPdf.js.
//
// 2.7.59 — FORME A5 **PAYSAGE** : les deux exemplaires sont CÔTE À CÔTE (à
//   gauche l'exemplaire du client, à droite la copie pharmacie) sur la même
//   feuille, et on coupe VERTICALEMENT au milieu — « atao ao amin'ny page 1
//   dia afaka tapahana eo ampovoany » (demande de l'officine).
// ============================================================================
import { printablePage, formatMoney, formatDateTime, escapeHtml } from '../utils/html.js';
import { table } from './table.js';
// 2.7.79 — « Servi par » SAISI à la caisse : le nom tapé au moment de la vente
// (cousu en tête de la note, utils/serviPar.js) remplace le compte connecté.
import { serviParDe } from '../utils/serviPar.js';

// Libellés des unités vendues (fiche médicament → conditionnement).
const UNITES = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const pluriel = texte => (/[eéyi]$/.test(texte)) ? `${texte}s` : texte;

// 2.7.59 — A5 PAYSAGE (210 × 148 mm) : les deux exemplaires côte à côte,
// coupés au milieu de la feuille par un trait VERTICAL pointillé.
const TICKET_CSS = `
  @page { size: A5 landscape; margin: 7mm; }
  .tk-duo { display:flex; align-items:stretch; gap:5mm; }
  .tk-duo > .ticket { flex:1 1 0; min-width:0; }
  .ticket { page-break-inside: avoid; color:#1a1a1a; }
  .tk-mention { text-align:center; font-size:11.5px; margin:1mm 0 4mm; }
  .tk-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .tk-pharma { font-weight:700; font-size:14px; }
  .tk-tel { font-size:11px; margin-top:1.2mm; }
  .tk-droite { text-align:right; }
  .tk-titre { font-weight:700; font-size:14px; }
  .tk-ref { font-size:11.5px; margin-top:1.2mm; }
  .tk-regle { border:none; border-top:1px solid #444; margin:2.6mm 0 3mm; }
  .tk-metas { font-size:11.5px; line-height:1.75; margin-bottom:1mm; }
  .tk-annule { font-weight:700; font-size:11.5px; }
  .tk-table table, .tk table { width:100%; border-collapse:collapse; margin-top:2mm; }
  .tk-table th, .tk-table td, .tk th, .tk td { border:none; background:transparent; padding:1.7mm 0; font-size:11.5px; vertical-align:top; }
  .tk-table th, .tk th { font-size:10.5px; text-transform:none; letter-spacing:0; }
  .tk-table thead tr, .tk thead tr { border-top:1px solid #444; border-bottom:1px solid #444; }
  .tk-table td.num, .tk-table th.num, .tk td.num, .tk th.num { text-align:right; white-space:nowrap; padding-left:4mm; }
  .tk-bas { border-top:1px solid #444; margin-top:0.6mm; }
  .tk-total { text-align:center; font-weight:700; font-size:15px; margin:5mm 0 2mm; }
  .coupure { position:relative; width:0; align-self:stretch; border-left:1px dashed #777; }
  .coupure span { position:absolute; top:50%; left:0; transform:translate(-50%,-50%); background:#fff; padding:2mm 0; font-size:13px; }
`;

/** Un seul exemplaire du ticket (le même contenu sert aux deux). */
function exemplaire({ sale, lines, pharmacy, currency, user, mention }) {
  const lignes = table([
    {
      label: 'MÉDICAMENT',
      render: line => `<strong>${escapeHtml(line.productName)}</strong>`
    },
    {
      label: 'QUANTITÉ', align: 'right', render: line => {
        // Les ventes enregistrées avant la 2.7.12 n'ont pas de saleUnit : boîte.
        const unite = UNITES[line.saleUnit] || UNITES.BOX;
        const nombre = Number(line.saleQuantity ?? line.quantity);
        const libelle = nombre > 1 ? pluriel(unite) : unite;
        return `${escapeHtml(String(Number.isInteger(nombre) ? nombre : nombre.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')))} ${libelle}`;
      }
    },
    { label: 'PRIX UNITAIRE', align: 'right', render: line => formatMoney(line.unitPrice, currency) },
    {
      label: 'MONTANT', align: 'right', render: line =>
        formatMoney(Number(line.unitPrice) * Number(line.saleQuantity ?? line.quantity), currency)
    }
  ], lines);

  // Statut affiché seulement si la vente est annulée (traçabilité ; une vente
  // normale n'alourdit pas le ticket du client).
  const annulee = sale.status === 'CANCELLED'
    ? '<div class="tk-annule">VENTE ANNULÉE — voir la note d’annulation au comptoir.</div>'
    : '';

  return `<section class="ticket">
  <div class="tk-mention">${escapeHtml(mention)}</div>
  <header class="tk-head">
    <div>
      <div class="tk-pharma">${escapeHtml(pharmacy?.pharmacyName || 'Pharmacie')}</div>
      <div class="tk-tel">${escapeHtml([pharmacy?.address, pharmacy?.phone].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="tk-droite">
      <div class="tk-titre">Ticket de vente</div>
      <div class="tk-ref">${escapeHtml(sale.reference)}</div>
    </div>
  </header>
  <hr class="tk-regle"/>
  <div class="tk-metas">
    <div>Date: ${escapeHtml(formatDateTime(sale.createdAt))}</div>
    <div>Client: ${escapeHtml(sale.customerName || 'Client comptoir')}</div>
    <div>Servi par: ${escapeHtml(serviParDe(sale.note) || user?.name || '')}</div>
    ${annulee}
  </div>
  <div class="tk-table">${lignes}</div>
  <div class="tk-bas"></div>
  <p class="tk-total">Total à payer : ${formatMoney(sale.total, currency)}</p>
</section>`;
}

export function saleTicket({ sale, lines, pharmacy, products, lots, user }) {
  const currency = pharmacy?.currency || 'Ar';
  // Les noms de médicaments sont résolus une fois (id → nom) pour les deux exemplaires.
  const lignesResolues = lines.map(line => ({
    ...line,
    productName: products.find(p => p.id === line.productId)?.name || ''
  }));
  const base = { sale, lines: lignesResolues, pharmacy, currency, user };
  return printablePage({
    title: `Ticket de vente ${sale.reference || ''}`.trim(),
    pharmacy,
    bare: true,
    extraCss: TICKET_CSS,
    body: `<div class="tk-duo">
${exemplaire({ ...base, mention: 'Exemplaire client' })}
<div class="coupure"><span>✂</span></div>
${exemplaire({ ...base, mention: 'Copie pharmacie — à conserver' })}
</div>`,
    footer: ''
  });
}