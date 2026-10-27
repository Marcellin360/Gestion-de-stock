// ============================================================================
// 2.7.56 — GÉNÉRATEUR DE PDF MINIMAL, SANS AUCUNE DÉPENDANCE.
//
//   Demande de l'officine : « atao forme PDF afaka telechargena » — le
//   ticket de vente et les ordonnances doivent pouvoir être TÉLÉCHARGÉS en
//   PDF depuis la page Vente, sans passer par l'impression du navigateur.
//
//   Ce module écrit des PDF 1.4 purs (Base-14 Helvetica / Helvetica-Bold,
//   encodage WinAnsi) entièrement à la main : pas de pdfkit, pas de
//   puppeteer — l'application reste installable hors-ligne, comme toujours.
//
//   Repères : page A5 portrait = 420 × 595 points ; origine en HAUT à gauche
//   dans les opérations (la conversion vers l'origine PDF se fait ici).
//   ✂ et les emoji ne font pas partie de WinAnsi : la ligne de coupe est
//   dessinée (pointillés + libellé) plutôt que représentée en caractères.
//
//   2.7.59 — format PAYSAGE ajouté : les tickets/ordonnances se dessinent
//   désormais sur UNE page A5 couchée (deux exemplaires côte à côte, coupe
//   VERTICALE au milieu), via `PAGE_PAYSAGE` et `creerPdf(feuilles, support)`.
// ============================================================================

/** Largeur estimée d'un texte en Helvetica (table AFM, base 1000/émcarré). */
const LARGEURS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556,
  ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778, 'H': 722,
  'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667,
  'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944, 'X': 667,
  'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
  'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556, 'h': 556,
  'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556, 'p': 556,
  'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722, 'x': 500,
  'y': 500, 'z': 500, '{': 334, '|': 260, '}': 334, '~': 584,
  'à': 556, 'â': 556, 'ä': 556, 'ç': 500, 'è': 556, 'é': 556, 'ê': 556, 'ë': 556,
  'î': 222, 'ï': 222, 'ô': 556, 'õ': 556, 'ù': 556, 'û': 556, 'ü': 556,
  'À': 667, 'Â': 667, 'Ä': 667, 'Ç': 722, 'È': 667, 'É': 667, 'Ê': 667, 'Î': 278,
  'Ï': 278, 'Ô': 778, 'Õ': 778, 'Ù': 722, 'Û': 722, 'Ü': 722,
  'œ': 944, 'Œ': 1000, '«': 556, '»': 556, '€': 556, '’': 222, '‘': 222,
  '“': 370, '”': 370, '–': 556, '—': 1000, '•': 350, '…': 1000, '°': 400
};

/** Montants de la table d'encodage : ISO-8859-1 direct ; le bloc 0x80–0x9F. */
const WINANSI_SPECIAL = {
  '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135,
  'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151,
  '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159
};

/** Largeur d'un texte à une taille donnée, en points PDF. */
export const largeurTexte = (texte, taille) =>
  [...String(texte ?? '')].reduce((somme, caractere) => somme + (LARGEURS[caractere] ?? 556), 0) * taille / 1000;

/** Chaîne sûre pour un flux PDF (parenthèses échapées, WinAnsi, latin-1).
 *  L'espace insécable FINE (U+202F, produit par Intl fr-FR dans les montants)
 *  devient l'insécable WinAnsi 0xA0 — sans cela elle sortirait en « ? ». */
function encoderTexte(texte) {
  let sortie = '';
  for (const caractere of String(texte ?? '')) {
    const k = caractere.codePointAt(0);
    const code = k === 0x202F ? 0xA0
      : (k < 128 ? k : (k < 256 ? k : (WINANSI_SPECIAL[caractere] ?? 63)));
    if (code === 40 || code === 41 || code === 92) sortie += '\\';
    sortie += String.fromCharCode(code);
  }
  return sortie;
}

const nombre = valeur => Number(valeur).toFixed(2);

// Dimensions A5 en points PDF : portrait (historique) et paysage (2.7.59).
export const PAGE = { largeur: 420.4, hauteur: 595.55, marge: 27 };
export const PAGE_PAYSAGE = { largeur: 595.55, hauteur: 420.4, marge: 27 };

/** Une feuille = une liste d'opérations dessinées dans l'ordre (y depuis le HAUT). */
export const nouvelleFeuille = () => [];

/** Ajoute un texte simple (x = bord GAUCHE). Retourne la feuille pour enchaîner. */
export function texte(feuille, { x, y, taille = 10, gras = false, contenu }) {
  feuille.push({ type: 'texte', x, y, taille, gras, contenu });
  return feuille;
}

/** Texte CENTRÉ entre deux abscisses (par défaut : toute la largeur utile). */
export function texteCentre(feuille, { y, taille = 10, gras = false, contenu,
  de = PAGE.marge, vers = PAGE.largeur - PAGE.marge }) {
  const x = de + ((vers - de) - largeurTexte(contenu, taille)) / 2;
  return texte(feuille, { x: Math.max(x, de), y, taille, gras, contenu });
}

/** Texte ALIGNÉ À DROITE sur l'abscisse `vers`. */
export function texteDroite(feuille, { x2, y, taille = 10, gras = false, contenu }) {
  return texte(feuille, { x: x2 - largeurTexte(contenu, taille), y, taille, gras, contenu });
}

/** Ligne HORIZONTALE (les tickets n'ont que des filets horizontaux). */
export function trait(feuille, { x1 = PAGE.marge, x2 = PAGE.largeur - PAGE.marge, y,
  epaisseur = 0.7, pointille = false }) {
  feuille.push({ type: 'trait', x1, y1: y, x2, y2: y, epaisseur, pointille });
  return feuille;
}

/** Ligne VERTICALE (ligne de coupe au milieu de la page paysage, 2.7.59). */
export function traitVertical(feuille, { x, y1, y2, epaisseur = 0.7, pointille = false }) {
  feuille.push({ type: 'trait', x1: x, y1, x2: x, y2, epaisseur, pointille });
  return feuille;
}

/** Découpe un texte long en lignes qui tiennent dans `largeurMax` (noms longs). */
export function lignesEncapsulees(contenu, taille, largeurMax) {
  const mots = String(contenu ?? '').split(/\s+/).filter(Boolean);
  const lignes = [''];
  for (const mot of mots) {
    const essai = lignes[lignes.length - 1] ? `${lignes[lignes.length - 1]} ${mot}` : mot;
    if (largeurTexte(essai, taille) <= largeurMax || !lignes[lignes.length - 1]) {
      lignes[lignes.length - 1] = essai;
    } else {
      lignes.push(mot);
    }
  }
  return lignes;
}

/** Dessin d'UNE opération dans le flux de contenu (coordonnées PDF, `support`). */
function operation(op, support) {
  if (op.type === 'trait') {
    const tirets = op.pointille ? '[2.4 2.4] 0 d ' : '[] 0 d ';
    return `q ${nombre(op.epaisseur || 0.7)} w ${tirets}`
      + `${nombre(op.x1)} ${nombre(support.hauteur - op.y1)} m `
      + `${nombre(op.x2)} ${nombre(support.hauteur - op.y2)} l S Q`;
  }
  return `BT /${op.gras ? 'F2' : 'F1'} ${nombre(op.taille || 10)} Tf 1 0 0 1 `
    + `${nombre(op.x)} ${nombre(support.hauteur - op.y)} Tm (${encoderTexte(op.contenu)}) Tj ET`;
}

/** Assemble les feuilles en un fichier PDF complet (Buffer application/pdf).
 *  `support` = PAGE (portrait, défaut) ou PAGE_PAYSAGE (2.7.59, côte à côte). */
export function creerPdf(feuilles, support = PAGE) {
  const pages = feuilles.length ? feuilles : [nouvelleFeuille()];
  // Objets : 1 = catalogue, 2 = arbre des pages, 3 = Helvetica, 4 = Helvetica-Bold,
  // puis pour chaque page : un objet /Page et un objet flux de contenu.
  const objetPage = index => 5 + index * 2;
  const objetContenu = index => 6 + index * 2;
  const dernierObjet = 4 + pages.length * 2;

  const corps = new Array(dernierObjet + 1);
  corps[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  corps[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${objetPage(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  corps[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  corps[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((feuille, i) => {
    corps[objetPage(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(support.largeur)} ${nombre(support.hauteur)}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${objetContenu(i)} 0 R >>`;
    const flux = feuille.map(op => operation(op, support)).join('\n');
    corps[objetContenu(i)] = `<< /Length ${Buffer.from(flux, 'latin1').length} >>\nstream\n${flux}\nendstream`;
  });

  const morceaux = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const decalages = [0];
  let position = morceaux[0].length;
  const pousser = texteLatin1 => {
    const tampon = Buffer.from(texteLatin1, 'latin1');
    morceaux.push(tampon);
    position += tampon.length;
  };
  for (let id = 1; id <= dernierObjet; id++) {
    decalages[id] = position;
    pousser(`${id} 0 obj\n${corps[id]}\nendobj\n`);
  }
  const debutXref = position;
  pousser(`xref\n0 ${dernierObjet + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= dernierObjet; id++) {
    pousser(`${String(decalages[id]).padStart(10, '0')} 00000 n \n`);
  }
  pousser(`trailer\n<< /Size ${dernierObjet + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`);
  return Buffer.concat(morceaux);
}