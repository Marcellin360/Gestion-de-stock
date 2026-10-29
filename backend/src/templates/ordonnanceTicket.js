// ============================================================================
// 2.7.35 — ORDONNANCE HÔPITAL (document de sortie du carnet prescripteur).
//
//   Quand le facteur arrive avec le CARNET d'un médecin ou d'une sage-femme,
//   la caisse enregistre les médicaments du patient hospitalisé ; l'impression
//   qui lui est remise n'est PAS un ticket de caisse : c'est l'ORDONNANCE,
//   qui rassemble
//        • le PATIENT (nom, service) ;
//        • le PRESCRIPTEUR (médecin ou sage-femme) ;
//        • les MÉDICAMENTS et leurs quantités, dans l'unité du carnet.
//
//   L'ordonnance N'AFFICHE AUCUN MONTANT : ni prix, ni total. La facturation
//   de l'hôpital se fait ailleurs ; ici le papier sert à tracer ce qui a été
//   remis au patient hospitalisé. La sortie de stock est la même que pour
//   une vente au comptoir (FEFO, RG05).
//
//   Format : A5 portrait, DEUX EXEMPLAIRES sur la même feuille — l'ordonnance
//   du patient et la copie de la pharmacie, séparés par une ligne de découpe.
//
//   2.7.56 — même FORME « modèle ticket » que le ticket de vente (officine) :
//   mention centrée, en-tête pharmacie | titre·référence, lignes Patient /
//   Prescrit par / Date de délivrance / Délivré par, tableau à filets horizontaux
//   seuls, cases de signature, ligne de coupe ✂. Version PDF téléchargeable
//   dans documentsPdf.js.
//
//   2.7.59 — A5 **PAYSAGE** : les deux exemplaires sont CÔTE À CÔTE sur la
//   même feuille (patient à gauche, pharmacie à droite), coupés VERTICALEMENT
//   au milieu ; et l'ordonnance affiche la DATE DE SORTIE de l'hôpital
//   (« Sorti de l'hôpital le … ») quand elle est gravée (migration 013) —
//   « apetaka eo amin'ny ordonnance ny date nivoahany hôpital ».
// ============================================================================
import { printablePage, formatDateTime, escapeHtml } from '../utils/html.js';
import { table } from './table.js';
// 2.7.84 — unités de vente libres (chaîne de conditionnement) : ml, cm…
import { libelleUnite, pluraliseUnite } from '../utils/conditionnement.js';

const UNITES = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const pluriel = texte => pluraliseUnite(texte, 2);   // 2.7.84 : pluriels généralisés
const ROLE_LABELS = { DOCTOR: 'Médecin', MIDWIFE: 'Sage-femme' };

const dateJour = valeur => (valeur ? String(valeur).slice(0, 10).split('-').reverse().join('/') : '—');

const ORDER_CSS = `
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
  .signature { margin-top:14mm; display:flex; justify-content:space-between; }
  .signature .case { width:44%; border-top:1px solid #555; padding-top:1.5mm; text-align:center; font-size:10.5px; }
  .coupure { position:relative; width:0; align-self:stretch; border-left:1px dashed #777; }
  .coupure span { position:absolute; top:50%; left:0; transform:translate(-50%,-50%); background:#fff; padding:2mm 0; font-size:13px; }
`;

/** Un exemplaire (le même contenu sert aux deux). */
function exemplaire({ sale, lines, pharmacy, patient, prescriber, user, mention }) {
  const ordonnanceNula = nul => escapeHtml(nul || '—');
  const lignes = table([
    { label: 'MÉDICAMENT', render: line => `<strong>${escapeHtml(line.productName)}</strong>` },
    {
      label: 'QUANTITÉ', align: 'right', render: line => {
        const unite = libelleUnite(line.saleUnit || 'BOX');   // 2.7.84 : legacy + unités brutes
        const nombre = Number(line.saleQuantity ?? line.quantity);
        const libelle = nombre > 1 ? pluriel(unite) : unite;
        return `${escapeHtml(String(Number.isInteger(nombre) ? nombre : nombre.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')))} ${libelle}`;
      }
    }
    // VOLONTAIREMENT : ni prix unitaire, ni montant.
  ], lines);

  const rolePrescripteur = prescriber ? (ROLE_LABELS[prescriber.role] || prescriber.role) : '';
  const annulee = sale.status === 'CANCELLED'
    ? '<div class="tk-annule">ORDONNANCE ANNULÉE — voir la note d’annulation au comptoir.</div>'
    : '';

  return `<section class="ticket">
  <div class="tk-mention">${escapeHtml(mention)}</div>
  <header class="tk-head">
    <div>
      <div class="tk-pharma">${escapeHtml(pharmacy?.pharmacyName || 'Pharmacie hospitalière')}</div>
      <div class="tk-tel">${escapeHtml([pharmacy?.address, pharmacy?.phone].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="tk-droite">
      <div class="tk-titre">Ordonnance</div>
      <div class="tk-ref">${escapeHtml(sale.reference)}</div>
    </div>
  </header>
  <hr class="tk-regle"/>
  <div class="tk-metas">
    <div>Patient : <strong>${ordonnanceNula(patient?.name)}</strong>${patient?.service ? ` · ${escapeHtml(patient.service)}` : ''}</div>
    <div>Prescrit par : <strong>${ordonnanceNula(prescriber?.name)}</strong>${rolePrescripteur ? ` (${escapeHtml(rolePrescripteur)})` : ''}</div>
    <div>Date de délivrance : ${escapeHtml(formatDateTime(sale.createdAt))}</div>
    <div>Délivré par : ${escapeHtml(user?.name || '')}</div>
    ${patient?.dischargedOn ? `<div>Sorti de l’hôpital le : <strong>${escapeHtml(dateJour(patient.dischargedOn))}</strong></div>` : ''}
    ${annulee}
  </div>
  <div class="tk-table">${lignes}</div>
  <div class="tk-bas"></div>
  <div class="signature">
    <div class="case">Signature du délivreur</div>
    <div class="case">Cachet de la pharmacie</div>
  </div>
</section>`;
}

export function ordonnanceTicket({ sale, lines, pharmacy, products, user, patient, prescriber }) {
  const lignesResolues = lines.map(line => ({
    ...line,
    productName: products.find(p => p.id === line.productId)?.name || ''
  }));
  const base = { sale, lines: lignesResolues, pharmacy, patient, prescriber, user };
  return printablePage({
    title: `Ordonnance ${sale.reference || ''}`.trim(),
    pharmacy,
    bare: true,
    extraCss: ORDER_CSS,
    body: `<div class="tk-duo">
${exemplaire({ ...base, mention: 'Exemplaire du patient' })}
<div class="coupure"><span>✂</span></div>
${exemplaire({ ...base, mention: 'Copie pharmacie — à classer au registre du service' })}
</div>`,
    footer: ''
  });
}