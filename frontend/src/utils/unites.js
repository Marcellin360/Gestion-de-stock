// ============================================================================
// 2.7.84 — UNITÉS DE VENTE GÉNÉRALISÉES (côté écrans).
//
// Depuis la chaîne de conditionnement mémorisée sur la fiche (« 1 carton =
// 100 boîtes », « 1 flacon = 250 ml », « 1 rouleau = 500 cm »…), toute unité
// SOUS l'unité de gestion est vendable : les codes historiques BOX / BLISTER /
// UNIT (2.7.12) cohabitent avec les noms d'unités eux-mêmes (« plaquette »,
// « comprimé », « ml », « cm »…). Ce module fait trois choses :
//   1. lire la chaîne `packaging` d'une fiche (JSON compact) ;
//   2. calculer les facteurs / lister les unités vendables d'un médicament ;
//   3. afficher proprement une unité, singulier ou pluriel, y compris les
//      codes historiques des ventes passées.
// ============================================================================

/** Libellés des codes historiques BOX / BLISTER / UNIT (2.7.12). */
export const UNITES_LEGACY = { BOX: 'boîte', BLISTER: 'plaquette', UNIT: 'comprimé' };

/** Libellé français (première lettre en capitale) d'une unité quelconque. */
export const libelleUnite = code => {
  const brut = String(code || '').trim();
  const base = UNITES_LEGACY[brut] || brut || 'boîte';
  return base.charAt(0).toUpperCase() + base.slice(1);
};

/** Pluriel français d'une unité : rouleau→rouleaux, ml/cm invariables, sinon « s ». */
export const pluraliseUnite = (unite, nombre) => {
  const u = String(unite || '');
  if (Number(nombre) <= 1) return u;
  if (['ml', 'cm', 'g', 'mg', 'l'].includes(u.toLowerCase())) return u;
  if (u.endsWith('eau') || u.endsWith('au')) return `${u}x`;
  if (/[sxz]$/.test(u)) return u;
  return `${u}s`;
};

/** « 3 plaquettes », « 250 ml », « 1 boîte »… (codes legacy compris). */
export const libelleQuantiteUnite = (code, nombre) =>
  `${pluraliseUnite(libelleUnite(code), nombre)}`;

/** Parse la chaîne mémorisée sur la fiche (tolère vide et JSON cassé). */
export const parserConditionnement = produit => {
  if (!produit?.packaging) return [];
  try {
    const brut = JSON.parse(produit.packaging);
    if (!Array.isArray(brut)) return [];
    return brut
      .filter(m => Array.isArray(m) && m.length === 3)
      .map(([from, to, count]) => ({ from: String(from), to: String(to), count: Number(count) }))
      .filter(m => m.from && m.to && m.from !== m.to && Number.isFinite(m.count) && m.count >= 1);
  } catch { return []; }
};

/**
 * Combien d'unités « to » dans 1 « from » le long de la chaîne, null s'il n'y
 * a pas de chemin. Identique à l'utilitaire serveur (mêmes règles, sans base).
 */
export const facteurEntre = (conversions, from, to) => {
  const depart = String(from || '').toLowerCase();
  const cible = String(to || '').toLowerCase();
  if (!depart || !cible) return null;
  if (depart === cible) return 1;
  const vu = new Set([depart]);
  let frontiere = [{ unite: depart, facteur: 1 }];
  while (frontiere.length) {
    const suivante = [];
    for (const { unite, facteur } of frontiere) {
      for (const m of conversions.filter(x => x.from.toLowerCase() === unite && !vu.has(x.to.toLowerCase()))) {
        const arrivee = m.to.toLowerCase();
        if (arrivee === cible) return facteur * m.count;
        vu.add(arrivee);
        suivante.push({ unite: arrivee, facteur: facteur * m.count });
      }
    }
    frontiere = suivante;
  }
  return null;
};

/**
 * Chaîne EFFECTIVE d'un produit : la chaîne mémorisée si elle existe, sinon
 * l'équivalent de l'ancien réglage 2.7.12 (boîte = plaquettes N, etc.).
 */
export const chaineEffective = produit => {
  const chaine = parserConditionnement(produit);
  if (chaine.length) return chaine;
  const gestion = String(produit?.unit || 'boîte').toLowerCase();
  const plaquettes = Number(produit?.blistersPerBox || 0);
  const comprimes = Number(produit?.unitsPerBlister || 0);
  const legacy = [];
  if (plaquettes > 0) legacy.push({ from: gestion, to: 'plaquette', count: plaquettes });
  if (plaquettes > 0 && comprimes > 0) legacy.push({ from: 'plaquette', to: 'comprimé', count: comprimes });
  return legacy;
};

/**
 * Traduit un code caisse historique en unité de la chaîne (2.7.84) :
 * BOX → unité de gestion ; BLISTER → « plaquette » ; UNIT → « comprimé » ;
 * sinon le nom brut. Sans chaîne : le code historique est renvoyé tel quel.
 */
export const saleUnitCanonique = (produit, saleUnit) => {
  const code = String(saleUnit || 'BOX');
  if (!parserConditionnement(produit).length) return code;
  const gestion = String(produit?.unit || 'boîte').toLowerCase();
  if (code === 'BOX') return gestion;
  if (code === 'BLISTER') return 'plaquette';
  if (code === 'UNIT') return 'comprimé';
  return code.toLowerCase();
};

// 2.7.100 — LISTE COMPLÈTE DES UNITÉS (même liste que l'« Unité de gestion »
// du dépôt — 13 choix). Le menu de la caisse montre TOUTES ces unités, pas
// seulement les 3 codes historiques : celles que la chaîne de conditionnement
// du médicament ne connaît pas restent visibles mais grisées à l'écran
// (« vendable: false » + la raison en title). Le texte des options reste NU
// (2.7.99) : jamais de facteur ni de mention écrite dans la liste.
export const UNITES_VENTE = ['boîte', 'plaquette', 'flacon', 'comprimé', 'ampoule', 'rouleau', 'carton', 'sachet', 'pièce', 'paire', 'tube', 'ml', 'cm'];

/**
 * Unités d'un médicament pour le menu déroulant du panier (caisse) :
 * la liste COMPLÈTE des 13 unités (2.7.100), chacune avec `vendable` :
 *   • fiche avec chaîne → vendable si c'est l'unité de gestion ou un
 *     descendant atteignable dans la chaîne ;
 *   • fiche historique (sans chaîne, repli 2.7.12) → codes BOX / BLISTER /
 *     UNIT, vendables selon le conditionnement de la fiche.
 * Les options non vendables sont affichées grisées, raison en title.
 */
export const unitesVendables = produit => {
  const conversion = parserConditionnement(produit);
  const gestion = String(produit?.unit || 'boîte').toLowerCase();
  // Sécurité : une unité de gestion hors liste (ancienne donnée) est mise en
  // tête pour que la ligne du panier reste sélectionnable.
  const noms = UNITES_VENTE.includes(gestion) ? UNITES_VENTE : [gestion, ...UNITES_VENTE];
  if (conversion.length) {
    return noms.map(nom => ({
      code: nom,
      label: libelleUnite(nom),
      vendable: nom === gestion || (facteurEntre(conversion, gestion, nom) ?? 0) >= 1
    }));
  }
  // Fiche historique : Boîte / Plaquette / Comprimé (codes 2.7.12), les autres
  // unités de la liste restent visibles mais grisées (conditionnement absent).
  const plaquettes = Number(produit?.blistersPerBox || 0);
  const comprimes = Number(produit?.unitsPerBlister || 0);
  return noms.map(nom => {
    if (nom === gestion) return { code: 'BOX', label: libelleUnite(nom), vendable: true };
    if (nom === 'plaquette') return { code: 'BLISTER', label: 'Plaquette', vendable: plaquettes > 0 };
    if (nom === 'comprimé') return { code: 'UNIT', label: 'Comprimé', vendable: plaquettes > 0 && comprimes > 0 };
    return { code: nom, label: libelleUnite(nom), vendable: false };
  });
};