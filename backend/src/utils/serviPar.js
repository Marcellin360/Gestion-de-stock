// ============================================================================
// 2.7.79 — « Servi par » SAISI à la caisse (demande de l'officine : la
// personne qui sert au comptoir change d'une vente à l'autre — « mety
// hiovaova ny olona manao an'io »).
//
// Le nom choisi voyage DANS LA NOTE de la vente, sous un marqueur
// reconnaissable en tête (« ⟦Servi par : X⟧ … ») : AUCUNE colonne nouvelle
// n'est créée. Le marqueur est lu par les documents imprimés (ticket,
// ordonnance) et par les listes/listings, et retiré de la note avant tout
// affichage de la remarque elle-même.
// ============================================================================

const MARQUEUR = /^⟦Servi par : ([^⟧]{1,120})⟧ ?/;

/** Lit le nom « Servi par » en tête de note ('' si absent). */
export function serviParDe(note) {
  const trouve = String(note || '').match(MARQUEUR);
  return trouve ? String(trouve[1]).trim() : '';
}

/** Enlève le marqueur « Servi par » en tête de note (s'il existe). */
export function retirerServiPar(note) {
  return String(note || '').replace(MARQUEUR, '');
}

/** Réécrit une note en posant le marqueur « Servi par : nom » en tête. */
export function coudreServiPar(note, serviPar) {
  const nom = String(serviPar || '').trim().slice(0, 120);
  const suite = retirerServiPar(note);
  return nom ? `⟦Servi par : ${nom}⟧${suite ? ` ${suite}` : ''}` : suite;
}

/** Forme publique d'une note de vente : nom du serveur et remarque nettoyée. */
export function decortiquerNote(note) {
  return { servedBy: serviParDe(note), note: retirerServiPar(note) };
}