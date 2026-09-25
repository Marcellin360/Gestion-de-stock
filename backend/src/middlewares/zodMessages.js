// ============================================================================
// Traduction des erreurs de validation (zod) en français compréhensible.
//
// Pourquoi : un refus technique comme
//     « lines.0 : Unrecognized key(s) in object: 'quantite' »
//     « lines.0.quantity : Required »
// n'aide pas l'utilisateur. Ici on obtient par exemple :
//     « lignes 1 · champ inconnu « quantite » : le champ attendu s'appelle
//       « quantity » (quantité) »
//     « lignes 1 · « quantity » : champ obligatoire manquant »
//
// Le nom technique exact reste affiché (il faut bien corriger l'appel), mais
// toujours accompagné de son libellé métier et d'une suggestion.
// ============================================================================

// Libellés métier des champs du contrat d'API (ce que l'utilisateur connaît).
const LIBELLES = {
  requestKey: 'clé de requête',
  supplierId: 'fournisseur',
  productId: 'médicament',
  lotId: 'lot',
  lines: 'lignes',
  quantity: 'quantité',
  physical: 'quantité comptée',
  theoretical: 'quantité théorique',
  purchasePrice: 'prix d’achat unitaire',
  unitPrice: 'prix unitaire de vente',
  expectedTotal: 'total attendu',
  fees: 'frais de livraison',
  note: 'remarque',
  reason: 'motif',
  customerName: 'client',
  location: 'magasin',
  fromLocation: 'magasin de départ',
  toLocation: 'magasin d’arrivée',
  receivedOn: 'date de réception',
  expiresOn: 'date d’expiration',
  manufacturedOn: 'date de fabrication',
  number: 'numéro de lot',
  id: 'identifiant de ligne',
  marginRate: 'taux de marge',
  sellingPrice: 'prix de vente',
  minMargin: 'marge minimale',
  maxMargin: 'marge maximale',
  expiryDays: 'délai d’alerte de péremption'
};

// Champs obligatoires minimum, par famille d'écran : sert à proposer le bon nom
// quand un champ est mal orthographié (le cas classique : « quantite »).
const CHAMPS_CONNUS = [
  'productId', 'quantity', 'lotId', 'id', 'physical', 'reason', 'number',
  'purchasePrice', 'unitPrice', 'receivedOn', 'expiresOn', 'manufacturedOn',
  'supplierId', 'fees', 'note', 'customerName', 'expectedTotal', 'requestKey',
  'location', 'fromLocation', 'toLocation'
];

/** Enlève accents, majuscules et ponctuation : « Quantité » → « quantite ». */
const normaliser = texte => String(texte)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/** Distance de Levenshtein : sert à proposer le champ le plus proche. */
function distance(a, b) {
  const lignes = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) lignes[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      lignes[i][j] = Math.min(lignes[i - 1][j] + 1, lignes[i][j - 1] + 1, lignes[i - 1][j - 1] + cout);
    }
  }
  return lignes[a.length][b.length];
}

/** Champ le plus proche de « saisi » parmi les champs connus (ou null). */
function champProche(saisi) {
  const cible = normaliser(saisi);
  let meilleur = null;
  let meilleureDistance = Infinity;
  for (const champ of CHAMPS_CONNUS) {
    const d = distance(cible, normaliser(champ));
    // On tolère une faute légère, un pluriel ou une lettre manquante.
    if (d < meilleureDistance) { meilleureDistance = d; meilleur = champ; }
  }
  const seuil = Math.max(2, Math.floor(cible.length / 3));
  return meilleureDistance <= seuil ? meilleur : null;
}

/** « lines.0.quantity » → « lignes 1 · quantity » (lisible par l’utilisateur). */
function lireChemin(chemin) {
  const morceaux = [];
  for (let i = 0; i < chemin.length; i += 1) {
    const partie = chemin[i];
    if (typeof partie === 'number') morceaux.push(`ligne ${partie + 1}`);
    else if (/^\d+$/.test(String(partie))) morceaux.push(`ligne ${Number(partie) + 1}`);
    else morceaux.push(String(partie));
  }
  const technique = chemin.join('.') || 'donnée';
  // Pour un champ de ligne : « lignes 1 · quantity » plutôt que « lines.0.quantity ».
  if (chemin.length === 2 && (chemin[0] === 'lines' || chemin[0] === 'rows')) {
    return { titre: `lignes ${Number(chemin[1]) + 1}`, technique };
  }
  if (chemin.length > 2 && (chemin[0] === 'lines' || chemin[0] === 'rows')) {
    return { titre: `lignes ${Number(chemin[1]) + 1} · ${chemin.slice(2).join('.')}`, technique };
  }
  return { titre: technique, technique };
}

const libelle = champ => (LIBELLES[champ] ? ` (${LIBELLES[champ]})` : '');

/** Traduit un problème zod en une phrase française exploitable. */
export function messageIssue(issue) {
  const { titre } = lireChemin(issue.path || []);
  const champ = String((issue.path || [])[issue.path.length - 1] ?? '');
  switch (issue.code) {
        case 'unrecognized_keys': {
      const inconnu = (issue.keys || []).join(' », « ');
      const premier = (issue.keys || [])[0] || '';
      const proche = champProche(premier);
      // On ne propose pas le champ lui-même : « location » est un vrai champ du
      // contrat, simplement pas accepté par cet écran-là.
      const suggestion = proche && normaliser(proche) !== normaliser(premier) ? proche : null;
      return `${titre} : champ inconnu « ${inconnu} »`
        + (suggestion ? ` — le champ attendu s’appelle « ${suggestion} »${libelle(suggestion)}`
          : ' — ce champ n’est pas accepté par cet écran (ou son nom est mal orthographié)');
    }
    case 'invalid_type':
      if (issue.received === 'undefined') return `${titre} : « ${champ} »${libelle(champ)} est obligatoire — champ manquant`;
      if (issue.received === 'null') return `${titre} : « ${champ} »${libelle(champ)} est obligatoire — aucune valeur reçue (null)`;
      return `${titre} : « ${champ} »${libelle(champ)} — valeur attendue de type ${issue.expected}, reçue ${issue.received}`;
    case 'too_small':
      if (issue.type === 'string') return `${titre} : texte trop court (minimum ${issue.minimum} caractère(s))`;
      return `${titre} : « ${champ} »${libelle(champ)} doit être au minimum ${issue.minimum} (reçu ${issue.received})`;
    case 'too_big':
      if (issue.type === 'string') return `${titre} : texte trop long (maximum ${issue.maximum} caractère(s))`;
      return `${titre} : « ${champ} »${libelle(champ)} dépasse le maximum autorisé (${issue.maximum})`;
    case 'invalid_enum_value':
      return `${titre} : valeur « ${issue.received} » refusée — valeurs possibles : ${(issue.options || []).join(', ')}`;
    case 'invalid_string':
      if (issue.validation === 'uuid') return `${titre} : identifiant technique (UUID) invalide — rechargez la page et recommencez`;
      if (issue.validation === 'regex') return `${titre} : « ${champ} »${libelle(champ)} n’a pas le format attendu`;
      return `${titre} : « ${champ} »${libelle(champ)} invalide (${issue.validation})`;
    case 'custom':
      return `${titre} : ${issue.message}`;
    case 'invalid_union':
      return `${titre} : « ${champ} »${libelle(champ)} n’a pas le format attendu`;
    default:
      return `${titre} : ${issue.message}`;
  }
}

/**
 * Traduit la liste complète : doublons retirés, message d'ensemble en tête.
 * La première phrase reste la plus utile pour l'utilisateur.
 */
export function traduireIssues(issues) {
  const details = [...new Set((issues || []).map(messageIssue))];
  const manquants = (issues || []).filter(i => i.code === 'invalid_type' && i.received === 'undefined').length;
  const inconnus = (issues || []).filter(i => i.code === 'unrecognized_keys').length;
  const resume = manquants && inconnus
    ? 'Formulaire incomplet : un champ obligatoire manque et un nom de champ est mal orthographié.'
    : manquants ? 'Formulaire incomplet : un champ obligatoire n’a pas été transmis.'
      : inconnus ? 'Formulaire refusé : un nom de champ ne correspond pas à celui attendu.'
        : 'Formulaire refusé : vérifiez les valeurs soulignées.';
  return { resume, details };
}