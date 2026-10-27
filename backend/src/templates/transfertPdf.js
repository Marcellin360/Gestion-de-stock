// ============================================================================
// 2.7.72 — VERSION **PDF** DU BORDEREAU DE TRANSFERT (menu « Historique de
//   transfert », boîte de dialogue « Détail », boutons « Télécharger » et
//   « Imprimer »).
//   Demande de l'officine : « misy erreur … rehefa manao téléchargement de
//   tokony ho forme pdf no hiseho » — le document s'enregistre désormais
//   directement en PDF (plus de fichier HTML déguisé).
//
//   Mise en page : A4 PORTRAIT (595 × 842 points) — le format classique des
//   bordereaux de l'officine ; tableau des lignes (Médicament · Lot ·
//   Expiration · Quantité · Coût unitaire · Valeur) avec sa ligne de TOTAL ;
//   en bas, les deux cases de SIGNATURE (préparé au dépôt / reçu à la
//   pharmacie) comme sur le bordereau papier ; pagination « Page n / N ».
//   Tout est dessiné par ../utils/pdf.js : zéro dépendance, hors-ligne.
// ============================================================================
import {
  creerPdf, nouvelleFeuille, texte, texteCentre, texteDroite, trait, traitVertical,
  lignesEncapsulees, largeurTexte
} from '../utils/pdf.js';
import { formatMoney, formatNumber, formatDate, formatDateTime } from '../utils/html.js';

// A4 portrait en points PDF (595 × 842), mêmes marges que le bordereau papier.
const SUPPORT = { largeur: 595.35, hauteur: 841.98, marge: 34 };
const FIN_X = SUPPORT.largeur - SUPPORT.marge;

const TAILLE = 8;          // corps du tableau
const TAILLE_ENTETE = 8.2; // noms des colonnes
const PAS = 10.6;
const HAUT_PAGE_MAX = SUPPORT.hauteur - 210; // garde la place des signatures

const LIBELLES = { DEPOT: 'Dépôt (réserve)', PHARMACY: 'Pharmacie (comptoir)' };

/** En-tête de CHAQUE page : officine, référence, titre et sens du transfert. */
function entetePage(feuille, { transfer, pharmacy, user }) {
  texte(feuille, { x: SUPPORT.marge, y: 28, taille: 9.6, gras: true, contenu: pharmacy?.name || 'PharmaStock' });
  texteDroite(feuille, { x2: FIN_X, y: 28, taille: 8, contenu: `Édité le ${formatDateTime(new Date())}` });
  texteCentre(feuille, { y: 50, taille: 13.5, gras: true, contenu: 'BORDEREAU DE TRANSFERT', de: SUPPORT.marge, vers: FIN_X });
  texteCentre(feuille, { y: 64, taille: 9, contenu: `${LIBELLES[transfer.fromLocation] || transfer.fromLocation || 'Dépôt (réserve)'} → ${LIBELLES[transfer.toLocation] || transfer.toLocation || 'Pharmacie (comptoir)'}`,
    de: SUPPORT.marge, vers: FIN_X });
  texte(feuille, { x: SUPPORT.marge, y: 82, taille: 9.6, gras: true, contenu: `Référence : ${transfer.reference || ''}` });
  texteDroite(feuille, { x2: FIN_X, y: 82, taille: 9, contenu: `Date : ${formatDate(transfer.createdAt)}` });
  // Bloc d'informations du bordereau (motif, remarque, préparé par).
  texte(feuille, { x: SUPPORT.marge, y: 96, taille: 8.4, contenu: `Motif : ${transfer.reason || '—'}` });
  texteDroite(feuille, { x2: FIN_X, y: 96, taille: 8.4, contenu: `Préparé par : ${user?.name || '—'}` });
  if (transfer.note) {
    texte(feuille, { x: SUPPORT.marge, y: 109, taille: 8.4, contenu: `Remarque : ${transfer.note}` });
    return 124;
  }
  return 112;
}

/** Plan des colonnes du tableau (largeurs fixes, en points). */
const PLAN = [
  { nom: 'Médicament', largeur: 205, align: 'gauche' },
  { nom: 'Lot', largeur: 72, align: 'gauche' },
  { nom: 'Expiration', largeur: 66, align: 'gauche' },
  { nom: 'Quantité', largeur: 60, align: 'droite' },
  { nom: 'Coût unitaire', largeur: 62, align: 'droite' },
  { nom: 'Valeur', largeur: 62, align: 'droite' }
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

/** Bordereau complet. Retourne le Buffer PDF prêt à télécharger. */
export function transfertPdf({ transfer, lines = [], pharmacy, products = [], user }) {
  const currency = pharmacy?.currency || 'Ar';
  const contexte = { transfer, pharmacy, user };
  const feuilles = [nouvelleFeuille()];
  let courante = feuilles[0];
  let y = entetePage(courante, contexte);

  if (!lines.length) {
    texteCentre(courante, { y: y + 40, taille: 9, contenu: 'Bordereau sans ligne.', de: SUPPORT.marge, vers: FIN_X });
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
    // Ligne « Total transféré » (même présentation que le bordereau papier).
    const total = ['Total transféré', '', '', '', '', formatMoney(transfer.costTotal || 0, currency)];
    if (y + hauteurLigne(total) > HAUT_PAGE_MAX) y = nouvellePage();
    y = dessinerLigne(courante, total, y, true);
  }

  // ── Signatures, en bas de la DERNIÈRE page (comme sur le papier). ──────
  const ys = SUPPORT.hauteur - 176;
  const derniere = feuilles[feuilles.length - 1];
  const milieu = SUPPORT.largeur / 2;
  texte(derniere, { x: SUPPORT.marge, y: ys, taille: 9, gras: true, contenu: 'Expédié du dépôt :' });
  texte(derniere, { x: SUPPORT.marge, y: ys + 16, taille: 8.6, contenu: user?.name ? `Par : ${user.name}` : 'Par : …………………………………' });
  texte(derniere, { x: SUPPORT.marge, y: ys + 44, taille: 8.2, contenu: 'Signature :' });
  trait(derniere, { x1: SUPPORT.marge + 46, x2: milieu - 30, y: ys + 46, epaisseur: 0.6, pointille: true });
  texte(derniere, { x: milieu + 10, y: ys, taille: 9, gras: true, contenu: 'Reçu à la pharmacie :' });
  texte(derniere, { x: milieu + 10, y: ys + 16, taille: 8.6, contenu: 'Par : …………………………………' });
  texte(derniere, { x: milieu + 10, y: ys + 44, taille: 8.2, contenu: 'Signature :' });
  trait(derniere, { x1: milieu + 56, x2: FIN_X, y: ys + 46, epaisseur: 0.6, pointille: true });
  texteCentre(derniere, { y: ys + 72, taille: 7.6,
    contenu: 'Le stock du dépôt diminue et celui de la pharmacie augmente dans le même mouvement : '
      + 'aucune quantité ne doit circuler sans ce bordereau.',
    de: SUPPORT.marge, vers: FIN_X });

  // Pied de chaque page : rappel du document + pagination « Page n / N ».
  feuilles.forEach((feuille, rang) => {
    trait(feuille, { x1: SUPPORT.marge, x2: FIN_X, y: SUPPORT.hauteur - 42, epaisseur: 0.4 });
    texte(feuille, { x: SUPPORT.marge, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `Bordereau de transfert — ${transfer.reference || ''}` });
    texteDroite(feuille, { x2: FIN_X, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `Page ${rang + 1} / ${feuilles.length}` });
  });

  return creerPdf(feuilles, SUPPORT);
}