// ============================================================================
// 2.7.73 — VERSION **PDF** DE LA FICHE DE PERTE / DON (menu « Pertes et dons »,
//   boîte de dialogue « Détail », boutons « Télécharger » et « Imprimer »).
//   Même esprit que le bordereau de transfert (2.7.72) : le document se
//   TÉLÉCHARGE directement en PDF, plus de page HTML à imprimer à la main.
//
//   Mise en page : A4 PORTRAIT (595 × 842 points) ; en-tête d'officine, bloc
//   d'informations (motif obligatoire, date, magasin, enregistré par, « sortie
//   non commerciale »), tableau des lignes (Médicament · Lot · Expiration ·
//   Quantité · Coût retenu · Valeur de la perte) avec ligne de TOTAL,
//   « Remarque justificative » en encadré, puis les cases de SIGNATURE et la
//   pagination « Page n / N ». Dessiné par ../utils/pdf.js : zéro dépendance.
// ============================================================================
import {
  creerPdf, nouvelleFeuille, texte, texteCentre, texteDroite, trait, traitVertical,
  lignesEncapsulees
} from '../utils/pdf.js';
import { formatMoney, formatNumber, formatDate, formatDateTime } from '../utils/html.js';

// A4 portrait en points PDF (595 × 842), mêmes marges que la fiche papier.
const SUPPORT = { largeur: 595.35, hauteur: 841.98, marge: 34 };
const FIN_X = SUPPORT.largeur - SUPPORT.marge;

const TAILLE = 8;          // corps du tableau
const TAILLE_ENTETE = 8.2; // noms des colonnes
const PAS = 10.6;
const HAUT_PAGE_MAX = SUPPORT.hauteur - 210; // garde la place des signatures

const LIBELLES = { DEPOT: 'Dépôt (réserve)', PHARMACY: 'Pharmacie (comptoir)' };

/** En-tête de CHAQUE page : officine, titre, référence, informations fiscales. */
function entetePage(feuille, { loss, pharmacy, user }) {
  texte(feuille, { x: SUPPORT.marge, y: 28, taille: 9.6, gras: true, contenu: pharmacy?.name || 'PharmaStock' });
  texteDroite(feuille, { x2: FIN_X, y: 28, taille: 8, contenu: `Édité le ${formatDateTime(new Date())}` });
  texteCentre(feuille, { y: 50, taille: 13.5, gras: true, contenu: 'FICHE DE PERTE / DON', de: SUPPORT.marge, vers: FIN_X });
  texteCentre(feuille, { y: 64, taille: 9, contenu: 'Sortie non commerciale — justificatif de sortie du stock',
    de: SUPPORT.marge, vers: FIN_X });
  if (loss.status && loss.status !== 'VALIDATED') {
    texteCentre(feuille, { y: 77, taille: 10, gras: true, contenu: '— DOCUMENT ANNULÉ —', de: SUPPORT.marge, vers: FIN_X });
  }
  texte(feuille, { x: SUPPORT.marge, y: 92, taille: 9.6, gras: true, contenu: `Référence : ${loss.reference || ''}` });
  texteDroite(feuille, { x2: FIN_X, y: 92, taille: 9, contenu: `Date : ${formatDate(loss.createdAt)}` });
  texte(feuille, { x: SUPPORT.marge, y: 106, taille: 8.4, contenu: `Motif : ${loss.reason || '—'}` });
  texteDroite(feuille, { x2: FIN_X, y: 106, taille: 8.4, contenu: `Magasin : ${LIBELLES[loss.location] || loss.location || '—'}` });
  texte(feuille, { x: SUPPORT.marge, y: 119, taille: 8.4,
    contenu: `Enregistré par : ${user?.name || '—'} · Chiffre d’affaires : aucun (sortie non commerciale)` });
  return 134;
}

/** Plan des colonnes du tableau (largeurs fixes, en points — total 527). */
const PLAN = [
  { nom: 'Médicament', largeur: 185, align: 'gauche' },
  { nom: 'Lot', largeur: 70, align: 'gauche' },
  { nom: 'Expiration', largeur: 66, align: 'gauche' },
  { nom: 'Quantité', largeur: 56, align: 'droite' },
  { nom: 'Coût retenu', largeur: 70, align: 'droite' },
  { nom: 'Valeur de la perte', largeur: 80, align: 'droite' }
];

function enteteTableau(feuille, y) {
  let x = SUPPORT.marge;
  traitVertical(feuille, { x, y1: y, y2: y + 24 });
  PLAN.forEach(c => {
    texte(feuille, { x: x + 4, y: y + 11, taille: TAILLE_ENTETE, gras: true, contenu: c.nom });
    x += c.largeur;
    traitVertical(feuille, { x, y1: y, y2: y + 24 });
  });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y, epaisseur: 0.9 });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y: y + 24, epaisseur: 0.9 });
  return y + 24;
}

function valeursLigne(ligne, nomProduit, currency) {
  return [
    nomProduit || '—',
    ligne.lotNumber || '—',
    ligne.expiresOn ? formatDate(ligne.expiresOn) : '—',
    formatNumber(ligne.quantity),
    formatMoney(ligne.unitCost || 0, currency),
    formatMoney(Number(ligne.unitCost || 0) * ligne.quantity, currency)
  ];
}

function hauteurLigne(valeurs) {
  return Math.max(...PLAN.map((c, i) => lignesEncapsulees(valeurs[i], TAILLE, c.largeur - 8).length)) * PAS + 6;
}

function dessinerLigne(feuille, valeurs, y, gras = false) {
  const encapsulees = PLAN.map((c, i) => lignesEncapsulees(valeurs[i], TAILLE, c.largeur - 8));
  const hauteur = Math.max(...encapsulees.map(l => l.length)) * PAS + 6;
  let x = SUPPORT.marge;
  traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  PLAN.forEach((c, i) => {
    if (c.align === 'droite') {
      texteDroite(feuille, { x2: x + c.largeur - 4, y: y + 11, taille: TAILLE, gras, contenu: encapsulees[i][0] || '' });
    } else {
      encapsulees[i].forEach((contenu, rang) =>
        texte(feuille, { x: x + 4, y: y + 11 + rang * PAS, taille: TAILLE, gras, contenu }));
    }
    x += c.largeur;
    traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y: y + hauteur, epaisseur: 0.4 });
  return y + hauteur;
}

/** Fiche de perte complète. Retourne le Buffer PDF prêt à télécharger. */
export function pertesPdf({ loss, lines = [], pharmacy, products = [], user }) {
  const currency = pharmacy?.currency || 'Ar';
  const contexte = { loss, pharmacy, user };
  const feuilles = [nouvelleFeuille()];
  let courante = feuilles[0];
  let y = entetePage(courante, contexte);

  if (!lines.length) {
    texteCentre(courante, { y: y + 40, taille: 9, contenu: 'Fiche sans ligne.', de: SUPPORT.marge, vers: FIN_X });
  } else {
    y = enteteTableau(courante, y);
    const nouvellePage = () => {
      courante = nouvelleFeuille();
      feuilles.push(courante);
      return enteteTableau(courante, entetePage(courante, contexte));
    };
    for (const ligne of lines) {
      const valeurs = valeursLigne(ligne, products.find(p => Number(p.id) === Number(ligne.productId))?.name, currency);
      if (y + hauteurLigne(valeurs) > HAUT_PAGE_MAX) y = nouvellePage();
      y = dessinerLigne(courante, valeurs, y);
    }
    // Ligne « Total » : valeur totale de la sortie (perte / don).
    const total = ['Total', '', '', '', '', formatMoney(loss.costTotal || 0, currency)];
    if (y + hauteurLigne(total) > HAUT_PAGE_MAX) y = nouvellePage();
    y = dessinerLigne(courante, total, y, true);
  }

  // ── « Remarque justificative » (obligatoire, RG17). ─────────────────────
  let yr = y + 10;
  const remarque = `Remarque justificative : ${loss.note || '—'}`;
  const encapsulees = lignesEncapsulees(remarque, 8.4, FIN_X - SUPPORT.marge - 16);
  const hauteur = encapsulees.length * PAS + 14;
  if (yr + hauteur > SUPPORT.hauteur - 130) {
    courante = nouvelleFeuille();
    feuilles.push(courante);
    yr = 140;
    entetePage(courante, contexte);
  }
  const page = feuilles[feuilles.length - 1];
  encapsulees.forEach((contenu, rang) =>
    texte(page, { x: SUPPORT.marge + 8, y: yr + 12 + rang * PAS, taille: 8.4, contenu }));

  // ── Signatures, en bas de la DERNIÈRE page (comme sur le papier). ──────
  const ys = SUPPORT.hauteur - 176;
  const derniere = feuilles[feuilles.length - 1];
  const milieu = SUPPORT.largeur / 2;
  texte(derniere, { x: SUPPORT.marge, y: ys, taille: 9, gras: true, contenu: 'Enregistré par :' });
  texte(derniere, { x: SUPPORT.marge, y: ys + 16, taille: 8.6, contenu: user?.name ? `Par : ${user.name}` : 'Par : …………………………………' });
  texte(derniere, { x: SUPPORT.marge, y: ys + 44, taille: 8.2, contenu: 'Signature :' });
  trait(derniere, { x1: SUPPORT.marge + 46, x2: milieu - 30, y: ys + 46, epaisseur: 0.6, pointille: true });
  texte(derniere, { x: milieu + 10, y: ys, taille: 9, gras: true, contenu: 'Visa de la direction :' });
  texte(derniere, { x: milieu + 10, y: ys + 16, taille: 8.6, contenu: 'Par : …………………………………' });
  texte(derniere, { x: milieu + 10, y: ys + 44, taille: 8.2, contenu: 'Signature :' });
  trait(derniere, { x1: milieu + 56, x2: FIN_X, y: ys + 46, epaisseur: 0.6, pointille: true });
  texteCentre(derniere, { y: ys + 72, taille: 7.6,
    contenu: 'À conserver comme justificatif de sortie. L’élimination des produits expirés suit la filière réglementaire locale.',
    de: SUPPORT.marge, vers: FIN_X });

  // Pied de chaque page : rappel du document + pagination « Page n / N ».
  feuilles.forEach((feuille, rang) => {
    trait(feuille, { x1: SUPPORT.marge, x2: FIN_X, y: SUPPORT.hauteur - 42, epaisseur: 0.4 });
    texte(feuille, { x: SUPPORT.marge, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `Fiche de perte — ${loss.reference || ''}` });
    texteDroite(feuille, { x2: FIN_X, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `Page ${rang + 1} / ${feuilles.length}` });
  });

  return creerPdf(feuilles, SUPPORT);
}