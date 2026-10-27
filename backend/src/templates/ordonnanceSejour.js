// ============================================================================
// 2.7.36 — ORDONNANCE DE SÉJOUR (une SEULE ordonnance par hospitalisation).
//
//   Demande de l'officine : « raha misy olona narary tao amin'ny hopital ka
//   naka fanafody tany amin'ny pharmacie androany ary rehefa naka fanafody koa
//   ny andro manaraka dia tokony mitohy ny contenue ny client iray iny
//   mandritra ny fotoana ijanonany ao satria 1 ihany ny ordonnance omena azy ».
//
//   → Le patient reçoit UNE SEULE ordonnance qui RESUME TOUT SON SÉJOUR :
//   ses médicaments sont CUMULÉS par produit (de la date d'admission jusqu'à
//   aujourd'hui), avec les noms de TOUS les prescripteurs qu'il a vus. La
//   pharmacie ré-imprime ce document CHAQUE JOUR si le médicament du jour
//   vient s'ajouter : il remplace l'ancienne feuille.
//
//   2.7.37 — teboka ⑤ : la demande porte désormais QUANTITÉ, PRIX UNITAIRE ET
//   MONTANT par médicament + le total du séjour (facturation hospitalière).
//
//   2.7.56 — FORME « modèle ticket » (officine) : même habillage que le ticket
//   de vente et l'ordonnance (mentions centrées, en-tête, lignes d'infos,
//   filets horizontaux, signatures, coupe ✂) ; version PDF dans documentsPdf.js.
//
//   2.7.59 — A5 **PAYSAGE** (exemplaires côte à côte, coupe VERTICALE au
//   milieu) et la DATE DE SORTIE de l'hôpital s'affiche sous « Admis à
//   l'hôpital le : » quand elle est gravée (migration 013).
// ============================================================================
import { printablePage, formatDateTime, formatMoney, escapeHtml } from '../utils/html.js';
import { table } from './table.js';

const UNITES = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const pluriel = texte => (/[eéyi]$/.test(texte)) ? `${texte}s` : texte;
const ROLE_LABELS = { DOCTOR: 'Médecin', MIDWIFE: 'Sage-femme' };

const SEJOUR_CSS = `
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
  .tk-table table, .tk table { width:100%; border-collapse:collapse; margin-top:2mm; }
  .tk-table th, .tk-table td, .tk th, .tk td { border:none; background:transparent; padding:1.7mm 0; font-size:11.5px; vertical-align:top; }
  .tk-table th, .tk th { font-size:10.5px; text-transform:none; letter-spacing:0; }
  .tk-table thead tr, .tk thead tr { border-top:1px solid #444; border-bottom:1px solid #444; }
  /* 2.7.82 — ③ : qté / prix / montant étaient trop serrés (4 mm) — souffle. */
  .tk-table td.num, .tk-table th.num, .tk td.num, .tk th.num { text-align:right; white-space:nowrap; padding-left:6.5mm; }
  .tk-bas { border-top:1px solid #444; margin-top:0.6mm; }
  .tk-total { text-align:center; font-weight:700; font-size:14px; margin:4mm 0 2mm; }
  .signature { margin-top:10mm; display:flex; justify-content:space-between; }
  .signature .case { width:44%; border-top:1px solid #555; padding-top:1.5mm; text-align:center; font-size:10.5px; }
  .coupure { position:relative; width:0; align-self:stretch; border-left:1px dashed #777; }
  .coupure span { position:absolute; top:50%; left:0; transform:translate(-50%,-50%); background:#fff; padding:2mm 0; font-size:13px; }
`;

const dateJour = valeur => (valeur ? String(valeur).slice(0, 10).split('-').reverse().join('/') : '—');

/** Un exemplaire (le même contenu sert aux deux).
 * 2.7.82 — demandes de l'officine sur l'ordonnance de séjour :
 *   ① « Service : … » SUR SA PROPRE LIGNE, juste sous le patient (fini le
 *      « Nom · Service » collé) ;
 *   ② ligne « Servi par : … » — les noms saisis à la caisse à CHAQUE carnet
 *      (hospital.service.serveurs) ; s'il n'y en a pas, le compte connecté
 *      reste cité comme avant ;
 *   ③ les colonnes QUANTITÉ / PRIX UNITAIRE / MONTANT sont AÉRÉES (marge à
 *      gauche portée à 6,5 mm) : qté et prix ne se touchent plus. */
function exemplaire({ sejour, patient, pharmacy, user, mention, periode }) {
  const prescripteursLigne = sejour.prescribers.length
    ? sejour.prescribers
      .map(p => `${p.name}${p.role ? ` (${ROLE_LABELS[p.role] || p.role})` : ''}`)
      .join(', ')
    : '—';

  // 2.7.37 — teboka ⑤ : la demande porte désormais QUANTITÉ, PRIX UNITAIRE ET
  // MONTANT par médicament + le total (facturation possible du séjour ; c'était
  // une ordonnance sans montants demandée par ailleurs — l'ordre change par volonté).
  const lignes = table([
    { label: 'MÉDICAMENT', render: ligne => `<strong>${escapeHtml(ligne.product)}</strong>` },
    {
      label: 'Quantité', align: 'right', render: ligne => {
        const nombre = Number(ligne.saleQuantity);
        const unite = UNITES[ligne.saleUnit] || UNITES.BOX;
        const libelle = nombre > 1 ? pluriel(unite) : unite;
        return `${escapeHtml(String(Number.isInteger(nombre) ? nombre : nombre.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')))} ${libelle}`;
      }
    },
    { label: 'Prix unitaire', align: 'right', render: ligne => formatMoney(ligne.unitPrice || '0', pharmacy?.currency) },
    { label: 'Montant', align: 'right', render: ligne => formatMoney(ligne.totalAmount || '0', pharmacy?.currency) }
  ], sejour.medecines);
  const totalSejour = sejour.medecines
    .reduce((somme, ligne) => somme + Number(ligne.totalAmount || 0), 0)
    .toFixed(6);
  const fenetre = periode?.du || periode?.au
    ? `<div>Période : ${periode.du ? escapeHtml(dateJour(periode.du)) : '—'} → ${periode.au ? escapeHtml(dateJour(periode.au)) : '—'}</div>`
    : '';

  return `<section class="ticket">
  <div class="tk-mention">${escapeHtml(mention)}</div>
  <header class="tk-head">
    <div>
      <div class="tk-pharma">${escapeHtml(pharmacy?.pharmacyName || 'Pharmacie hospitalière')}</div>
      <div class="tk-tel">${escapeHtml([pharmacy?.address, pharmacy?.phone].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="tk-droite">
      <div class="tk-titre">Ordonnance de séjour</div>
      <div class="tk-ref">Cumul de l'hospitalisation</div>
    </div>
  </header>
  <hr class="tk-regle"/>
  <div class="tk-metas">
    <div>Patient : <strong>${escapeHtml(patient.name)}</strong></div>
    ${patient.service ? `<div>Service : <strong>${escapeHtml(patient.service)}</strong></div>` : ''}
    ${patient.motif ? `<div>Motif d’hospitalisation : ${escapeHtml(patient.motif)}</div>` : ''}
    <div>Admis à l’hôpital le : ${escapeHtml(dateJour(patient.admittedOn))}</div>
    ${patient.dischargedOn ? `<div>Sorti de l’hôpital le : <strong>${escapeHtml(dateJour(patient.dischargedOn))}</strong></div>` : ''}
    <div>Prescripteurs vus : ${escapeHtml(prescripteursLigne)}</div>
    <div>Délivrances comptées : ${sejour.ventes.length} carnet(s)</div>
    <div>Servi par : ${escapeHtml((sejour.serveurs || []).join(', ') || user?.name || '')}</div>
    <div>Délivré par : ${escapeHtml(user?.name || '')}</div>
    ${fenetre}
  </div>
  <div class="tk-table">${lignes}</div>
  <div class="tk-bas"></div>
  <p class="tk-total">Total de l’ordonnance de séjour : ${formatMoney(totalSejour, pharmacy?.currency)}</p>
  <div class="signature">
    <div class="case">Signature du délivreur</div>
    <div class="case">Cachet de la pharmacie</div>
  </div>
</section>`;
}

export function ordonnanceSejourTicket({ patient, sejour, pharmacy, user, periode = {} }) {
  // Médicaments par ordre alphabétique : le papier est stable d'un jour à
  // l'autre, seules les quantités grandissent au fil du séjour.
  const base = {
    patient,
    pharmacy,
    user,
    periode,
    sejour: {
      ...sejour,
      medecines: [...sejour.medecines]
        .sort((a, b) => String(a.product).localeCompare(String(b.product), 'fr'))
    }
  };
  return printablePage({
    title: `Ordonnance de séjour — ${patient.name}`.trim(),
    pharmacy,
    bare: true,
    extraCss: SEJOUR_CSS,
    body: `<div class="tk-duo">
${exemplaire({ ...base, mention: 'Exemplaire du patient' })}
<div class="coupure"><span>✂</span></div>
${exemplaire({ ...base, mention: 'Copie pharmacie — à classer au registre du service' })}
</div>`,
    footer: ''
  });
}