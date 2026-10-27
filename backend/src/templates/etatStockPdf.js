// ============================================================================
// 2.7.71 — VERSION **PDF** DE LA FICHE DE STOCK (menu « Stock »).
//   Demande de l'officine : « Rehefa mikitika ilay bouton imprimer koa dia
//   tokony tonga dia mitelecharge forme pdf » — le bouton « Imprimer » de la
//   fiche TÉLÉCHARGE désormais le document directement : plus de page HTML à
//   passer par l'impression du navigateur.
//
//   Mise en page : A4 PAYSAGE (842 × 595 points) — les colonnes détaillées
//   (Sorties et Stock final découpés en boîtes/plaquettes) y restent lisibles.
//   Colonnes : TOUTES celles du serveur, sauf « Seuil minimum » et
//   « Situation » (jamais affichées — règle 2.7.17 inchangée) ; la ligne des
//   TOTAUX clôt le tableau ; l'en-tête de page et celui du tableau se
//   répètent à chaque feuille ; la pagination figure en bas à droite.
//   Tout est dessiné par ../utils/pdf.js : zéro dépendance, hors-ligne.
// ============================================================================
import {
  creerPdf, nouvelleFeuille, texte, texteCentre, texteDroite, trait, traitVertical,
  lignesEncapsulees, largeurTexte
} from '../utils/pdf.js';
import { formatMoney, formatNumber, formatDateTime } from '../utils/html.js';

// A4 paysage en points PDF (842 × 595), marges fines de registre.
const SUPPORT = { largeur: 841.98, hauteur: 595.35, marge: 34 };
const FIN_X = SUPPORT.largeur - SUPPORT.marge; // bord droit de la zone utile

// Jamais imprimées, comme à l'écran (2.7.17) : le serveur les calcule quand
// même (le calcul ne change pas), seules ces deux cases ne sortent jamais.
const JAMAIS_IMPRIMEES = ['Seuil minimum', 'Situation'];

// Ligne de TOTAUX : uniquement les sommes qui ont un sens (un total de coût
// unitaire ou de catégorie n'en aurait aucun).
const COLONNES_SOMMEES = ['Stock initial', 'Entrées', 'Sorties', 'Stock final'];
const COLONNES_VALEUR = ['Valeur', 'Valeur (Ar)'];

const TAILLE = 7;          // corps du tableau
const TAILLE_ENTETE = 7.2; // noms des colonnes
const PAS = 9.2;           // interligne vertical d'une cellule
const HAUT_PAGE_MAX = SUPPORT.hauteur - 64; // limite basse du tableau

const estArgent = colonne => /montant|valeur|prix|marge|cout|coût/i.test(colonne);

/** Contenu d'une case : montants en Ariary (avec unité), nombres formatés,
 *  texte tel quel — mêmes règles qu'à l'écran. */
const cellule = (ligne, colonne) => {
  const valeur = ligne[colonne];
  if (valeur === null || valeur === undefined || valeur === '') return '';
  if (estArgent(colonne)) return formatMoney(valeur);
  if (typeof valeur === 'number') return formatNumber(valeur);
  return String(valeur);
};

/** Largeur de chaque colonne : mesurée sur les vrais contenus (plafonnés pour
 *  garder le tableau lisible), puis mises à l'échelle si le total déborde. */
function planirColonnes(colonnes, lignes) {
  const budget = FIN_X - SUPPORT.marge;
  const echantillon = lignes.slice(0, 80);
  const plan = colonnes.map(colonne => {
    const numerique = lignes.some(ligne => typeof ligne[colonne] === 'number');
    let largeur = largeurTexte(colonne, TAILLE_ENTETE) + 8;
    for (const ligne of echantillon) {
      largeur = Math.max(largeur, largeurTexte(cellule(ligne, colonne), TAILLE) + 8);
    }
    const plafond = colonne === 'Médicament' ? 200
      : (numerique ? (estArgent(colonne) ? 92 : 58) : 120);
    return { colonne, numerique, largeur: Math.min(largeur, plafond) };
  });
  let total = plan.reduce((somme, c) => somme + c.largeur, 0);
  if (total > budget) {
    const facteur = budget / total;
    plan.forEach(c => { c.largeur = Math.max(c.numerique ? 34 : 44, c.largeur * facteur); });
    total = plan.reduce((somme, c) => somme + c.largeur, 0);
    if (total > budget) {
      // Très nombreuses colonnes (vue détaillée) : encore un cran de resserre.
      const facteur2 = budget / total;
      plan.forEach(c => { c.largeur = Math.max(c.numerique ? 30 : 40, c.largeur * facteur2); });
    }
  }
  return plan;
}

/** En-tête de CHAQUE page : officine, date d'édition, titre et période. */
function entetePage(feuille, { titre, sousTitre, pharmacy }) {
  texte(feuille, { x: SUPPORT.marge, y: 26, taille: 9.4, gras: true, contenu: pharmacy?.name || 'PharmaStock' });
  texteDroite(feuille, { x2: FIN_X, y: 26, taille: 7.6, contenu: `Édité le ${formatDateTime(new Date())}` });
  texteCentre(feuille, { y: 44, taille: 13, gras: true, contenu: titre, de: SUPPORT.marge, vers: FIN_X });
  if (sousTitre) {
    texteCentre(feuille, { y: 57, taille: 8.4, contenu: sousTitre, de: SUPPORT.marge, vers: FIN_X });
  }
  return 72; // ordonnée du premier filet du tableau
}

/** Rangée des NOMS DE COLONNES, encadrée de deux filets appuyés (gras). */
function enteteTableau(feuille, plan, y) {
  const encapsulees = plan.map(c => lignesEncapsulees(c.colonne, TAILLE_ENTETE, c.largeur - 8));
  const hauteur = Math.max(...encapsulees.map(l => l.length)) * PAS + 6;
  let x = SUPPORT.marge;
  traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  plan.forEach((c, i) => {
    encapsulees[i].forEach((contenu, rang) =>
      texte(feuille, { x: x + 4, y: y + 10.6 + rang * PAS, taille: TAILLE_ENTETE, gras: true, contenu }));
    x += c.largeur;
    traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y, epaisseur: 0.9 });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y: y + hauteur, epaisseur: 0.9 });
  return y + hauteur;
}

/** Hauteur théorique d'une rangée (pour anticiper les sauts de page). */
function hauteurLigne(plan, valeurs) {
  return Math.max(...plan.map((c, i) =>
    lignesEncapsulees(valeurs[i], TAILLE, c.largeur - 8).length)) * PAS + 5;
}

/** UNE rangée de données : nombres à droite, texte encapsulé, filets fins. */
function dessinerLigne(feuille, plan, valeurs, y, gras = false) {
  const encapsulees = plan.map((c, i) => lignesEncapsulees(valeurs[i], TAILLE, c.largeur - 8));
  const hauteur = Math.max(...encapsulees.map(l => l.length)) * PAS + 5;
  let x = SUPPORT.marge;
  traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  plan.forEach((c, i) => {
    if (c.numerique) {
      // Les chiffres s'alignent à DROITE (première ligne de la case).
      texteDroite(feuille, { x2: x + c.largeur - 4, y: y + 9.6, taille: TAILLE, gras, contenu: encapsulees[i][0] || '' });
    } else {
      encapsulees[i].forEach((contenu, rang) =>
        texte(feuille, { x: x + 4, y: y + 9.6 + rang * PAS, taille: TAILLE, gras, contenu }));
    }
    x += c.largeur;
    traitVertical(feuille, { x, y1: y, y2: y + hauteur });
  });
  trait(feuille, { x1: SUPPORT.marge, x2: x, y: y + hauteur, epaisseur: 0.4 });
  return y + hauteur;
}

/** Fiche de stock complète. Retourne le Buffer PDF prêt à télécharger. */
export function etatStockPdf({ titre = 'Fiche de stock', sousTitre = '', pharmacy, lignes = [] }) {
  const entete = { titre, sousTitre, pharmacy };
  const feuilles = [nouvelleFeuille()];
  let courante = feuilles[0];
  let y = entetePage(courante, entete);

  if (!lignes.length) {
    texteCentre(courante, { y: y + 40, taille: 9, contenu: 'Aucun médicament actif sur cette période.',
      de: SUPPORT.marge, vers: FIN_X });
  } else {
    const colonnes = Object.keys(lignes[0]).filter(c => !JAMAIS_IMPRIMEES.includes(c));
    const plan = planirColonnes(colonnes, lignes);
    y = enteteTableau(courante, plan, y);
    const nouvellePage = () => {
      courante = nouvelleFeuille();
      feuilles.push(courante);
      return enteteTableau(courante, plan, entetePage(courante, entete));
    };
    for (const ligne of lignes) {
      const valeurs = colonnes.map(colonne => cellule(ligne, colonne));
      if (y + hauteurLigne(plan, valeurs) > HAUT_PAGE_MAX) y = nouvellePage();
      y = dessinerLigne(courante, plan, valeurs, y);
    }
    // Rangée des TOTAUX (même esprit que le bandeau « Totaux du magasin »).
    const totaux = colonnes.map((colonne, rang) => {
      if (rang === 0) return 'TOTAUX';
      if (COLONNES_SOMMEES.includes(colonne)) {
        return formatNumber(Math.round(lignes.reduce((s, l) => s + Number(l[colonne] || 0), 0) * 1000) / 1000);
      }
      if (COLONNES_VALEUR.includes(colonne)) {
        return formatMoney(Math.round(lignes.reduce((s, l) => s + Number(l[colonne] || 0), 0) * 100) / 100);
      }
      return '';
    });
    if (y + hauteurLigne(plan, totaux) > HAUT_PAGE_MAX) y = nouvellePage();
    dessinerLigne(courante, plan, totaux, y, true);
  }

  // Pied de chaque page : rappel du document + pagination « Page n / N ».
  feuilles.forEach((feuille, rang) => {
    trait(feuille, { x1: SUPPORT.marge, x2: FIN_X, y: SUPPORT.hauteur - 42, epaisseur: 0.4 });
    texte(feuille, { x: SUPPORT.marge, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `${titre}${sousTitre ? ` · ${sousTitre}` : ''}` });
    texteDroite(feuille, { x2: FIN_X, y: SUPPORT.hauteur - 30, taille: 7.6,
      contenu: `Page ${rang + 1} / ${feuilles.length}` });
  });

  return creerPdf(feuilles, SUPPORT);
}