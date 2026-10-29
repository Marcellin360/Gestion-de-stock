// ============================================================================
// 2.7.84 — CONDITIONNEMENT GÉNÉRALISÉ (présentation par fiche + conversions)
//
// Jusqu'ici (2.7.12) la vente au détail ne connaissait que 3 unités codées en
// dur : boîte (BOX), plaquette (BLISTER), comprimé (UNIT), avec le
// conditionnement réglé par 2 colonnes de la fiche (blistersPerBox,
// unitsPerBlister). La demande du dépôt généralise :
//
//   • un carton peut contenir N boîtes, une boîte N plaquettes, une plaquette
//     N comprimés — et ces nombres NE SONT PAS FIXES (ils changent d'un
//     fournisseur à l'autre) ;
//   • un flacon a une contenance (100 ml, 250 ml, 500 ml…) — les présentations
//     d'un même médicament (même prix différents) ne se MÉLANGENT JAMAIS dans
//     le stock : chaque présentation est une fiche produit à part entière ;
//   • un rouleau a une longueur (cm) ; certains articles (gants) n'ont aucune
//     contenance mais une taille — portée par le texte « Présentation ».
//
// La chaîne de conditionnement d'un produit est donc une LISTE DE MAILLONS
// mémorisée sur la fiche (colonne `packaging`, JSON compact) :
//
//     [["carton","boîte",100],["boîte","plaquette",10],["plaquette","comprimé",10]]
//
// Chaque maillon = [unité conteneur, unité contenue, combien dans 1 conteneur].
//     1 carton = 100 boîtes ; 1 boîte = 10 plaquettes ; 1 plaquette = 10 cp.
// Pour les liquides : [["flacon","ml",250]] (1 flacon = 250 ml).
// Pour les longueurs : [["rouleau","cm",500]] (1 rouleau de 5 m = 500 cm).
//
// Le facteur entre deux unités se calcule en suivant les maillons ; les
// conversions sont SAISIES À LA RÉCEPTION et MÉMORISÉES sur la fiche (elles
// sont re-proposées à la réception suivante, modifiables à chaque fois).
// ============================================================================

/** Parse la chaîne mémorisée sur la fiche (tolère vide, JSON cassé, objets). */
export function parserChaine(packaging) {
  if (!packaging) return [];
  let brut = packaging;
  if (typeof packaging === 'string') {
    try { brut = JSON.parse(packaging); } catch { return []; }
  }
  if (!Array.isArray(brut)) return [];
  return brut
    .map(maillon => (Array.isArray(maillon)
      ? { from: maillon[0], to: maillon[1], count: Number(maillon[2]) }
      : { from: maillon?.from, to: maillon?.to, count: Number(maillon?.count) }))
    .filter(maillon => typeof maillon.from === 'string' && maillon.from.trim()
      && typeof maillon.to === 'string' && maillon.to.trim()
      && Number.isFinite(maillon.count) && maillon.count >= 1
      && maillon.from.trim() !== maillon.to.trim())
    .map(maillon => ({ from: maillon.from.trim().toLowerCase(), to: maillon.to.trim().toLowerCase(), count: Math.floor(maillon.count) }));
}

/**
 * Chaîne effective d'un produit : la chaîne mémorisée (packaging) si elle
 * existe, sinon l'équivalent de l'ANCIEN conditionnement 2.7.12 (boîte =
 * plaquettes N, plaquette = comprimés M) pour que les fiches déjà réglées
 * continuent de fonctionner sans être ressaisies.
 */
export function chaineEffective(produit) {
  const chaine = parserChaine(produit?.packaging);
  if (chaine.length) return chaine;
  const gestion = String(produit?.unit || 'boîte').toLowerCase();
  const plaquettes = Number(produit?.blistersPerBox || 0);
  const comprimes = Number(produit?.unitsPerBlister || 0);
  const legacy = [];
  if (plaquettes > 0) legacy.push({ from: gestion, to: 'plaquette', count: plaquettes });
  if (plaquettes > 0 && comprimes > 0) legacy.push({ from: 'plaquette', to: 'comprimé', count: comprimes });
  return legacy;
}

/** Sérialise une chaîne pour la colonne `packaging` (forme compacte). */
export const chaineCompacte = conversions => JSON.stringify(
  parserChaine(conversions).map(maillon => [maillon.from, maillon.to, maillon.count]));

/**
 * Combien d'unités « to » dans 1 unité « from », en suivant les maillons.
 *   facteurVers(chaîne, 'carton', 'comprimé') avec l'exemple ci-dessus = 10 000.
 * Renvoie null si aucun chemin n'existe (conversion non renseignée) et 1 si
 * les deux unités sont identiques. Les cycles sont ignorés (ensemble « vu »).
 */
export function facteurVers(conversions, from, to) {
  const depart = String(from || '').trim().toLowerCase();
  const cible = String(to || '').trim().toLowerCase();
  if (!depart || !cible) return null;
  if (depart === cible) return 1;
  const maillons = parserChaine(conversions);
  const vu = new Set([depart]);
  let frontiere = [{ unite: depart, facteur: 1 }];
  while (frontiere.length) {
    const suivante = [];
    for (const { unite, facteur } of frontiere) {
      for (const maillon of maillons.filter(m => m.from === unite && !vu.has(m.to))) {
        if (maillon.to === cible) return facteur * maillon.count;
        vu.add(maillon.to);
        suivante.push({ unite: maillon.to, facteur: facteur * maillon.count });
      }
    }
    frontiere = suivante;
  }
  return null;
}

/**
 * Toutes les unités atteignables EN DESCENDANT depuis une unité (vers les
 * plus petites) — utilisé pour proposer les unités de vente d'un médicament.
 * Retourne [{ unit, factor }] avec factor = nombre d'unités dans 1 « racine ».
 */
export function descendantsDe(conversions, racine) {
  const maillons = parserChaine(conversions);
  const depart = String(racine || '').trim().toLowerCase();
  const trouves = new Map();
  const vu = new Set([depart]);
  let frontiere = [{ unite: depart, facteur: 1 }];
  while (frontiere.length) {
    const suivante = [];
    for (const { unite, facteur } of frontiere) {
      for (const maillon of maillons.filter(m => m.from === unite && !vu.has(m.to))) {
        vu.add(maillon.to);
        trouves.set(maillon.to, facteur * maillon.count);
        suivante.push({ unite: maillon.to, facteur: facteur * maillon.count });
      }
    }
    frontiere = suivante;
  }
  return [...trouves.entries()].map(([unit, factor]) => ({ unit, factor }));
}

// ── Unités de VENTE : codes historiques (2.7.12) ↔ noms d'unités (2.7.84) ──

/** Libellés des codes historiques (ventes passées et fiches sans chaîne). */
export const UNITES_LEGACY = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };

/**
 * Traduit le code envoyé par la caisse en unité de la chaîne du produit :
 *   BOX     → l'unité de gestion (peu importe son nom : boîte, flacon…),
 *   BLISTER → « plaquette » si la chaîne en comporte,
 *   UNIT    → « comprimé » si la chaîne en comporte,
 *   autre   → l'unité brute telle quelle (2.7.84 : « ml », « cm », « carton »…).
 */
export function saleUnitCanonique(produit, saleUnit) {
  const code = String(saleUnit || 'BOX').trim();
  const chaine = chaineEffective(produit);
  if (!chaine.length) return code;
  const gestion = String(produit?.unit || 'boîte').toLowerCase();
  if (code === 'BOX') return gestion;
  if (code === 'BLISTER' && chaine.some(m => m.to === 'plaquette')) return 'plaquette';
  if (code === 'UNIT' && chaine.some(m => m.to === 'comprimé')) return 'comprimé';
  return code.toLowerCase();
}

/** Libellé français d'une unité (legacy ou brute) pour tickets et messages. */
export function libelleUnite(code) {
  const brut = String(code || '').trim();
  return UNITES_LEGACY[brut] || brut || 'boîte';
}

/**
 * Pluriel simple d'une unité (« rouleau » → « rouleaux », « ml »/« cm »
 * invariables, sinon « s »). Sert à tous les documents imprimés.
 */
export function pluraliseUnite(unite, nombre) {
  const u = String(unite || '');
  if (Number(nombre) <= 1) return u;
  if (['ml', 'cm', 'g', 'mg', 'l'].includes(u.toLowerCase())) return u;
  if (u.endsWith('eau') || u.endsWith('au')) return `${u}x`;      // rouleau → rouleaux
  if (/[sxz]$/.test(u)) return u;                                  // déjà marqué
  return `${u}s`;
}