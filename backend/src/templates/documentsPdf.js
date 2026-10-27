// ============================================================================
// 2.7.56 — VERSIONS **PDF** des documents de vente (téléchargeables, bouton
// « Télécharger le PDF » de la page Vente) — mise en page identique au modèle
// fourni par l'officine.
//
// 2.7.59 — FORME A5 **PAYSAGE**, UNE SEULE PAGE : les deux exemplaires sont
// côte à côte (à GAUCHE l'exemplaire du client/patient, à DROITE la copie
// pharmacie), et la coupe se fait VERTICALEMENT au milieu de la feuille —
// demande de l'officine : « atao ao amin'ny page 1 dia afaka tapahana eo
// ampovoany ». L'ordonnance porte en plus la DATE DE SORTIE de l'hôpital
// (« Sorti de l’hôpital le … », gravée à la sortie du service).
//
//   · ticketVentePdf      : Exemplaire client | Copie pharmacie — à conserver.
//   · ordonnancePdf       : pareil pour le carnet hôpital — AUCUN PRIX, avec
//     les cases de signature.
//   · ordonnanceSejourPdf : l'ordonnance de séjour (Quantité, Prix unitaire,
//     Montant + total, cases de signature).
//
//   Tout est dessiné par ../utils/pdf.js : zéro dépendance, hors-ligne.
// ============================================================================
import {
  creerPdf, nouvelleFeuille, texte, texteCentre, texteDroite, trait, traitVertical,
  lignesEncapsulees, PAGE_PAYSAGE
} from '../utils/pdf.js';
import { formatMoney, formatDateTime } from '../utils/html.js';
// 2.7.79 — « Servi par » saisi à la caisse : lu depuis la note (marqueur).
import { serviParDe } from '../utils/serviPar.js';

const UNITES = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };
const pluriel = valeur => (/[eéyi]$/.test(valeur) ? `${valeur}s` : valeur);
const ROLE_LABELS = { DOCTOR: 'Médecin', MIDWIFE: 'Sage-femme' };
const dateJour = valeur => (valeur ? String(valeur).slice(0, 10).split('-').reverse().join('/') : '—');

const quantiteUnite = ligne => {
  const nombre = Number(ligne.saleQuantity ?? ligne.quantity);
  const unite = UNITES[ligne.saleUnit] || UNITES.BOX;
  const entier = Number.isInteger(nombre) ? nombre : nombre.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return `${entier} ${nombre > 1 ? pluriel(unite) : unite}`;
};

const MILIEU = PAGE_PAYSAGE.largeur / 2;
const MOITIE = index => ({
  gauche: index === 0 ? PAGE_PAYSAGE.marge : MILIEU + 17,
  droite: index === 0 ? MILIEU - 17 : PAGE_PAYSAGE.largeur - PAGE_PAYSAGE.marge
});

/** Curseur d'écriture verticale : chaque exemplaire démarre sur la PAGE
 *  COMMUNE (feuilleDepart) ; `nouvelle()` n'est appelée que si un tableau
 *  déborde (pagination de la moitié concernée). */
function curseurPartage(feuiles, feuilleDepart) {
  const etat = { y: 24, courante: feuilleDepart };
  etat.nouvelle = () => {
    etat.courante = nouvelleFeuille();
    feuiles.push(etat.courante);
    etat.y = 24;
    return etat.courante;
  };
  return etat;
}

/** Ligne de coupe VERTICALE au milieu de la feuille + libellé en bas. */
function coupureVerticale(feuille) {
  traitVertical(feuille, {
    x: MILIEU, y1: 16, y2: PAGE_PAYSAGE.hauteur - 22, epaisseur: 0.8, pointille: true
  });
  texteCentre(feuille, {
    y: PAGE_PAYSAGE.hauteur - 12, taille: 8,
    contenu: '- - -  découper ici  - - -', de: MILIEU - 60, vers: MILIEU + 60
  });
}

/** En-tête d'exemplaire dans sa moitié de page : mention centrée, pharmacie |
 *  titre·référence, filet horizontal. */
function enteteExemplaire(feuille, curseur, geo, { mention, titre, reference, pharmacy }) {
  texteCentre(feuille, { y: curseur.y, taille: 9.5, contenu: mention, de: geo.gauche, vers: geo.droite });
  curseur.y += 16;
  texte(feuille, { x: geo.gauche, y: curseur.y, taille: 10.5, gras: true, contenu: pharmacy?.pharmacyName || 'Pharmacie' });
  texteDroite(feuille, { x2: geo.droite, y: curseur.y, taille: 10.5, gras: true, contenu: titre });
  curseur.y += 12;
  const coordonnees = [pharmacy?.address, pharmacy?.phone].filter(Boolean).join(' · ');
  if (coordonnees) texte(feuille, { x: geo.gauche, y: curseur.y, taille: 8.5, contenu: coordonnees });
  if (reference) texteDroite(feuille, { x2: geo.droite, y: curseur.y, taille: 8.5, contenu: reference });
  curseur.y += 12;
  trait(feuille, { x1: geo.gauche, x2: geo.droite, y: curseur.y, epaisseur: 0.9 });
  curseur.y += 11;
}

/** Lignes « Libellé : valeur » empilées (Date / Client / Sorti de l’hôpital …). */
function blocMetas(feuille, curseur, geo, metas) {
  for (const entree of metas.filter(Boolean)) {
    const [libelle, valeur] = entree;
    if (valeur === null || valeur === undefined || valeur === '') continue;
    texte(feuille, { x: geo.gauche, y: curseur.y, taille: 8.8, contenu: `${libelle} : ${valeur}` });
    curseur.y += 11;
  }
  curseur.y += 1;
}

/** Début d'un tableau : filet au-dessus, légendes en capitales, filet au-dessous. */
function enteteTable(feuille, curseur, geo, colonnes) {
  trait(feuille, { x1: geo.gauche, x2: geo.droite, y: curseur.y, epaisseur: 0.7 });
  curseur.y += 9.5;
  for (const col of colonnes) {
    const props = { y: curseur.y, taille: 7.6, gras: true, contenu: col.titre };
    if (col.droite) texteDroite(feuille, { ...props, x2: col.x2 });
    else texte(feuille, { ...props, x: col.x });
  }
  curseur.y += 3;
  trait(feuille, { x1: geo.gauche, x2: geo.droite, y: curseur.y, epaisseur: 0.5 });
  curseur.y += 9.5;
}

/** Une ligne du tableau (les longs noms de médicaments passent à la ligne). */
function ligneTable(curseur, feuiles, geo, colonnes, nom, continuer) {
  const morceaux = lignesEncapsulees(nom, 8.6, colonnes[0].largeur);
  const hauteur = Math.max(1, morceaux.length) * 10 + 2;
  if (curseur.y + hauteur > PAGE_PAYSAGE.hauteur - 34) {
    continuer();
  }
  const fh = feuiles[feuiles.length - 1];
  morceaux.forEach((morceau, i) => {
    texte(fh, { x: colonnes[0].x, y: curseur.y + i * 10, taille: 8.6, contenu: morceau });
  });
  for (const col of colonnes.slice(1)) {
    texteDroite(fh, { x2: col.x2, y: curseur.y, taille: 9, contenu: col.valeur });
  }
  curseur.y += hauteur + 1;
}

/** Filet final du tableau + total centré en gras dans la moitié de page. */
function totalCentre(feuille, curseur, geo, libelle) {
  trait(feuille, { x1: geo.gauche, x2: geo.droite, y: curseur.y, epaisseur: 0.9 });
  curseur.y += 12;
  texteCentre(feuille, { y: curseur.y, taille: 11, gras: true, contenu: libelle, de: geo.gauche, vers: geo.droite });
  curseur.y += 10;
}

/** Bandeau de traçabilité quand la vente est annulée. */
function bandeauAnnule(feuille, curseur, geo, libelle) {
  texteCentre(feuille, { y: curseur.y, taille: 8.8, gras: true, contenu: libelle, de: geo.gauche, vers: geo.droite });
  curseur.y += 11;
}

/** Deux cases de signature dans la moitié de page (ordonnances). */
function casesSignature(feuille, curseur, geo) {
  const y = Math.max(curseur.y + 20, PAGE_PAYSAGE.hauteur - 58);
  const milieu = (geo.gauche + geo.droite) / 2;
  trait(feuille, { x1: geo.gauche + 2, x2: milieu - 8, y, epaisseur: 0.6 });
  trait(feuille, { x1: milieu + 8, x2: geo.droite - 2, y, epaisseur: 0.6 });
  texteCentre(feuille, { y: y + 9, taille: 7.6, contenu: 'Signature du délivreur', de: geo.gauche, vers: milieu - 8 });
  texteCentre(feuille, { y: y + 9, taille: 7.6, contenu: 'Cachet de la pharmacie', de: milieu + 8, vers: geo.droite });
}

const colonnesMontants = geo => [
  { titre: 'MÉDICAMENT', x: geo.gauche, largeur: 102 },
  // 2.7.82 — ③ : « Quantité » et « Prix unitaire » se touchaient — davantage
  // d'air entre les deux colonnes à droite (médicament un peu plus étroit).
  { titre: 'QUANTITÉ', droite: true, x2: geo.gauche + 140 },
  { titre: 'PRIX UNITAIRE', droite: true, x2: geo.gauche + 196 },
  { titre: 'MONTANT', droite: true, x2: geo.droite }
];
const colonnesSimples = geo => [
  { titre: 'MÉDICAMENT', x: geo.gauche, largeur: 152 },
  { titre: 'QUANTITÉ', droite: true, x2: geo.droite }
];

// ---------------------------------------------------------------------------
// TICKET DE VENTE — client | copie pharmacie, côte à côte sur UNE page paysage.
// ---------------------------------------------------------------------------
export function ticketVentePdf({ sale, lines, pharmacy, products, user }) {
  const currency = pharmacy?.currency || 'Ar';
  const lignesResolues = lines.map(ligne => ({
    ...ligne,
    productName: products.find(p => p.id === ligne.productId)?.name || ''
  }));
  const feuiles = [nouvelleFeuille()];
  const premiere = feuiles[0];

  ['Exemplaire client', 'Copie pharmacie — à conserver'].forEach((mention, index) => {
    const geo = MOITIE(index);
    const curseur = curseurPartage(feuiles, premiere);
    enteteExemplaire(premiere, curseur, geo, { mention, titre: 'Ticket de vente', reference: sale.reference, pharmacy });
    blocMetas(premiere, curseur, geo, [
      ['Date', formatDateTime(sale.createdAt)],
      ['Client', sale.customerName || 'Client comptoir'],
      // 2.7.79 — le nom « Servi par » saisi à la caisse prime sur le compte.
      ['Servi par', serviParDe(sale.note) || user?.name || '']
    ]);
    if (sale.status === 'CANCELLED') bandeauAnnule(premiere, curseur, geo, 'VENTE ANNULÉE — voir comptoir.');
    const colonnes = colonnesMontants(geo);
    enteteTable(premiere, curseur, geo, colonnes);
    const continuer = () => {
      const fh = curseur.nouvelle();
      texteCentre(fh, { y: curseur.y, taille: 8, contenu: `${mention} (suite)`, de: geo.gauche, vers: geo.droite });
      curseur.y += 12;
      enteteTable(fh, curseur, geo, colonnes);
    };
    for (const ligne of lignesResolues) {
      ligneTable(curseur, feuiles, geo, [
        colonnes[0],
        { ...colonnes[1], valeur: quantiteUnite(ligne) },
        { ...colonnes[2], valeur: formatMoney(ligne.unitPrice, currency) },
        { ...colonnes[3], valeur: formatMoney(Number(ligne.unitPrice) * Number(ligne.saleQuantity ?? ligne.quantity), currency) }
      ], ligne.productName, continuer);
    }
    totalCentre(feuiles[feuiles.length - 1], curseur, geo, `Total à payer : ${formatMoney(sale.total, currency)}`);
  });
  coupureVerticale(feuiles[0]);
  return creerPdf(feuiles, PAGE_PAYSAGE);
}

// ---------------------------------------------------------------------------
// ORDONNANCE D'UNE VENTE SUR CARNET — SANS AUCUN PRIX, avec signatures.
// 2.7.59 : la DATE DE SORTIE de l'hôpital figure quand elle est connue.
// ---------------------------------------------------------------------------
export function ordonnancePdf({ sale, lines, pharmacy, products, user, patient, prescriber }) {
  const lignesResolues = lines.map(ligne => ({
    ...ligne,
    productName: products.find(p => p.id === ligne.productId)?.name || ''
  }));
  const rolePrescripteur = prescriber ? (ROLE_LABELS[prescriber.role] || prescriber.role) : '';
  const feuiles = [nouvelleFeuille()];
  const premiere = feuiles[0];

  ['Exemplaire du patient', 'Copie pharmacie — à classer au registre du service'].forEach((mention, index) => {
    const geo = MOITIE(index);
    const curseur = curseurPartage(feuiles, premiere);
    enteteExemplaire(premiere, curseur, geo, { mention, titre: 'Ordonnance', reference: sale.reference, pharmacy });
    blocMetas(premiere, curseur, geo, [
      ['Patient', `${patient?.name || '—'}${patient?.service ? ` · ${patient.service}` : ''}`],
      // 2.7.79 — motif de l'hospitalisation (fiche patient, migration 014).
      patient?.motif ? ['Motif d’hospitalisation', patient.motif] : null,
      ['Prescrit par', `${prescriber?.name || '—'}${rolePrescripteur ? ` (${rolePrescripteur})` : ''}`],
      ['Date de délivrance', formatDateTime(sale.createdAt)],
      // 2.7.79 — le nom « Servi par » saisi à la caisse prime sur le compte.
      ['Délivré par', serviParDe(sale.note) || user?.name || ''],
      patient?.dischargedOn ? ['Sorti de l’hôpital le', dateJour(patient.dischargedOn)] : null
    ]);
    if (sale.status === 'CANCELLED') bandeauAnnule(premiere, curseur, geo, 'ORDONNANCE ANNULÉE — voir comptoir.');
    const colonnes = colonnesSimples(geo);
    enteteTable(premiere, curseur, geo, colonnes);
    const continuer = () => {
      const fh = curseur.nouvelle();
      texteCentre(fh, { y: curseur.y, taille: 8, contenu: `${mention} (suite)`, de: geo.gauche, vers: geo.droite });
      curseur.y += 12;
      enteteTable(fh, curseur, geo, colonnes);
    };
    for (const ligne of lignesResolues) {
      ligneTable(curseur, feuiles, geo, [
        colonnes[0],
        { ...colonnes[1], valeur: quantiteUnite(ligne) }
      ], ligne.productName, continuer);
    }
    trait(feuiles[feuiles.length - 1], { x1: geo.gauche, x2: geo.droite, y: curseur.y, epaisseur: 0.9 });
    casesSignature(feuiles[feuiles.length - 1], curseur, geo);
  });
  coupureVerticale(feuiles[0]);
  return creerPdf(feuiles, PAGE_PAYSAGE);
}

// ---------------------------------------------------------------------------
// ORDONNANCE DE SÉJOUR — quantités, prix, total ; admission + SORTIE de
// l'hôpital quand elle est connue (2.7.59).
// ---------------------------------------------------------------------------
export function ordonnanceSejourPdf({ patient, sejour, pharmacy, user, periode = {} }) {
  const currency = pharmacy?.currency || 'Ar';
  const medecines = [...(sejour.medecines || [])]
    .sort((a, b) => String(a.product).localeCompare(String(b.product), 'fr'));
  const totalSejour = medecines
    .reduce((somme, ligne) => somme + Number(ligne.totalAmount || 0), 0)
    .toFixed(6);
  const prescripteursLigne = (sejour.prescribers || []).length
    ? sejour.prescribers
      .map(p => `${p.name}${p.role ? ` (${ROLE_LABELS[p.role] || p.role})` : ''}`)
      .join(', ')
    : '—';
  const feuiles = [nouvelleFeuille()];
  const premiere = feuiles[0];

  ['Exemplaire du patient', 'Copie pharmacie — à classer au registre du service'].forEach((mention, index) => {
    const geo = MOITIE(index);
    const curseur = curseurPartage(feuiles, premiere);
    enteteExemplaire(premiere, curseur, geo, {
      mention,
      titre: 'Ordonnance de séjour',
      reference: 'Cumul de l’hospitalisation',
      pharmacy
    });
    blocMetas(premiere, curseur, geo, [
      // 2.7.82 — ① « Service : … » SUR SA PROPRE LIGNE sous le patient (fini
      // le « Nom · Service » collé).
      ['Patient', patient.name],
      patient.service ? ['Service', patient.service] : null,
      // 2.7.79 — motif de l'hospitalisation (fiche patient, migration 014).
      patient.motif ? ['Motif d’hospitalisation', patient.motif] : null,
      ['Admis à l’hôpital le', dateJour(patient.admittedOn)],
      patient.dischargedOn ? ['Sorti de l’hôpital le', dateJour(patient.dischargedOn)] : null,
      ['Prescripteurs vus', prescripteursLigne],
      ['Délivrances comptées', `${(sejour.ventes || []).length} carnet(s)`],
      // 2.7.82 — ② « Servi par » : les noms saisis à la caisse à chaque carnet
      // (hospital.service.serveurs) ; vide → le compte connecté, comme avant.
      ['Servi par', (sejour.serveurs || []).join(', ') || user?.name || ''],
      ['Délivré par', user?.name || ''],
      periode?.du || periode?.au
        ? ['Période', `${periode.du ? dateJour(periode.du) : '—'} → ${periode.au ? dateJour(periode.au) : '—'}`]
        : null
    ]);
    const colonnes = colonnesMontants(geo);
    enteteTable(premiere, curseur, geo, colonnes);
    const continuer = () => {
      const fh = curseur.nouvelle();
      texteCentre(fh, { y: curseur.y, taille: 8, contenu: `${mention} (suite)`, de: geo.gauche, vers: geo.droite });
      curseur.y += 12;
      enteteTable(fh, curseur, geo, colonnes);
    };
    for (const ligne of medecines) {
      ligneTable(curseur, feuiles, geo, [
        colonnes[0],
        { ...colonnes[1], valeur: quantiteUnite(ligne) },
        { ...colonnes[2], valeur: formatMoney(ligne.unitPrice || '0', currency) },
        { ...colonnes[3], valeur: formatMoney(ligne.totalAmount || '0', currency) }
      ], ligne.product, continuer);
    }
    totalCentre(feuiles[feuiles.length - 1], curseur, geo,
      `Total de l’ordonnance de séjour : ${formatMoney(totalSejour, currency)}`);
    casesSignature(feuiles[feuiles.length - 1], curseur, geo);
  });
  coupureVerticale(feuiles[0]);
  return creerPdf(feuiles, PAGE_PAYSAGE);
}