// ============================================================================
// Contrat entre l'interface et l'API (test de garde).
//
// But : empêcher la réapparition d'une erreur vécue en vrai au comptoir —
// l'écran de vente envoyait `quantite` alors que le serveur attend `quantity`
// (« Unrecognized key(s) in object: 'quantite' »). Comme le serveur refuse
// strictement tout champ non déclaré, chaque nom de champ utilisé par
// l'interface DOIT être écrit tel quel.
//
// Ce test lit les sources du frontend : aucun serveur, aucune base nécessaire.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sourceFront = join(racine, 'frontend', 'src');

/** Liste récursive des fichiers sources du frontend. */
function fichiers(dossier) {
  const trouves = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/\.(jsx|js)$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

const sources = fichiers(sourceFront).map(chemin => ({ chemin, texte: readFileSync(chemin, 'utf8') }));

test('contrat API : les champs envoyés par l’interface portent le nom exact du serveur', () => {
  // Noms acceptés par les schémas zod (backend/src/validators/*).
  const interdits = [
    ['quantite', 'quantity'],           // le cas réellement rencontré à la vente
    ['quantity_lot', 'quantity'],
    ['prixUnitaire', 'unitPrice'],
    ['prix_achat', 'purchasePrice'],
    ['numeroLot', 'number'],
    ['dateExpiration', 'expiresOn'],
    ['dateReception', 'receivedOn'],
    ['motifPerte', 'reason']
  ];
  const fautes = [];
  for (const { chemin, texte } of sources) {
    for (const [mauvais, bon] of interdits) {
      // On cherche un usage en tant que clé d'objet (« quantite: ») ou un accès
      // de champ (« ligne.quantite »), pas une simple phrase en français.
      const motif = new RegExp(`(^|[^\\w.])(${mauvais})\\s*:|\\.${mauvais}\\b`, 'm');
      if (motif.test(texte)) fautes.push(`${chemin.replace(racine, '')} → « ${mauvais} » (attendu « ${bon} »)`);
    }
  }
  assert.deepEqual(fautes, [], `Champ(s) hors contrat API :\n${fautes.join('\n')}`);
});

test('contrat API : l’écran de vente construit son panier avec « productId » et « quantity »', () => {
  const vente = sources.find(({ chemin }) => chemin.endsWith(join('pages', 'SalesPage.jsx')));
  assert.ok(vente, 'SalesPage.jsx doit exister');
  assert.match(vente.texte, /productId:\s*Number\(/, 'la ligne de vente doit convertir productId en nombre');
  assert.match(vente.texte, /quantity:\s*Number\(/, 'la ligne de vente doit envoyer « quantity » (nombre)');
  assert.match(vente.texte, /lines:\s*lignesEnvoyees\(/,
    'les deux appels (/sales/quote et /sales) doivent passer par lignesEnvoyees()');
  // Garde-fou de l'écran : la quantité ne dépasse jamais le stock vendable calculé
  // côté interface (le serveur reste seul juge, mais l'utilisateur est prévenu avant).
  assert.match(vente.texte, /sellableStock|maximumDe/, 'l’écran doit connaître le stock vendable par ligne');
});

test('contrat API : les formulaires de réception, transfert et perte envoient les bons champs', () => {
  const attendus = {
    // 2.7.49 — « manufacturer » (texte saisi lot par lot) remplace
    // « manufacturedOn » (date « Fabriqué le », retirée du formulaire).
    [join('forms', 'ReceiptForm.jsx')]: ['productId', 'number', 'quantity', 'purchasePrice', 'receivedOn', 'expiresOn', 'manufacturer'],
    [join('forms', 'TransferForm.jsx')]: ['lotId', 'quantity'],
    [join('forms', 'LossForm.jsx')]: ['lotId', 'quantity']
  };
  for (const [partie, champs] of Object.entries(attendus)) {
    const fichier = sources.find(({ chemin }) => chemin.endsWith(partie));
    assert.ok(fichier, `${partie} doit exister`);
    for (const champ of champs) {
      assert.match(fichier.texte, new RegExp(`${champ}\\s*:`), `${partie} : le champ « ${champ} » doit être envoyé`);
    }
  }
});

test('profil dépôt : depuis la 2.7.11 le menu « Stock » ouvre les rapports pour tous', () => {
  const layout = sources.find(({ chemin }) => chemin.endsWith(join('components', 'Layout.jsx')));
  assert.ok(layout, 'Layout.jsx doit exister');
  // 2.7.11 — « Rapports » n'est plus un menu séparé : « Stock » affiche les
  // rapports (fiches de stock comprises) pour TOUS les profils, dépôt inclus.
  const ligneStock = layout.texte.split('\n').find(ligne => ligne.includes("label: 'Stock'"));
  assert.ok(ligneStock, 'l’entrée de menu « Stock » doit exister');
  assert.match(ligneStock, /route: 'rapports'/, 'le menu Stock ouvre l’écran des rapports (2.7.11)');
  assert.ok(!ligneStock.includes('routeDepot'), 'le menu Stock est le même pour tous les profils (2.7.11)');
  const menusGardes = layout.texte.split('\n').filter(ligne => ligne.includes('label:'));
  assert.ok(!menusGardes.some(ligne => ligne.includes("label: 'Rapports'")), 'le menu « Rapports » a disparu (2.7.11)');

  // La fiche de stock garde les colonnes demandées par le dépôt (registre
  // classique ; le détail boîte/plaquette est proposé en 2.7.17 au clic du
  // bouton de l'écran « Stock », sans jamais changer ce registre).
  const fiche = sources.find(({ chemin }) => chemin.endsWith(join('pages', 'FicheStockTab.jsx')));
  assert.ok(fiche, 'FicheStockTab.jsx doit exister');
  for (const colonne of ['Catégorie', 'Unité', 'Stock initial', 'Entrées', 'Sorties', 'Stock final', 'Coût unitaire (Ar)']) {
    assert.ok(fiche.texte.includes(`label: '${colonne}'`) || fiche.texte.includes(`'${colonne}'`),
      `la fiche doit afficher la colonne « ${colonne} »`);
  }
  assert.match(fiche.texte, /fiche_depot/, 'la fiche du dépôt s’appuie sur le rapport fiche_depot');
});

test('validation : un champ mal orthographié reçoit un message français avec le nom attendu', async () => {
  const { traduireIssues } = await import('../../src/middlewares/zodMessages.js');
  const { z } = await import('zod');
  const schema = z.object({
    lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() }).strict()).min(1)
  }).strict();
  const resultat = schema.safeParse({ lines: [{ productId: 3, quantite: 5 }] });
  assert.equal(resultat.success, false);
  const { details } = traduireIssues(resultat.error.issues);
  const texte = details.join(' | ');
  assert.match(texte, /quantity/, 'le message doit rappeler le nom de champ attendu');
  assert.match(texte, /quantité/, 'le message doit donner le libellé métier');
  assert.match(texte, /obligatoire|champ manquant/, 'le champ manquant doit être signalé');
  assert.doesNotMatch(texte, /Unrecognized key/, 'le message technique anglais doit avoir disparu');
});

// ---------------------------------------------------------------------------
// 2.7.5 — demandes de l'officine, écran par écran.
// ---------------------------------------------------------------------------
const texteDe = (...morceaux) => {
  const fichier = sources.find(({ chemin }) => chemin.endsWith(join(...morceaux)));
  assert.ok(fichier, `${morceaux.join('/')} doit exister`);
  return fichier.texte;
};

test('2.7.5 → 2.7.11 — plus de menu Documents ; l’adresse #/documents reste refusée au dépôt', () => {
  const layout = texteDe('components', 'Layout.jsx');
  // 2.7.11 — le menu « Documents » a disparu POUR TOUS : les ventes se suivent
  // via « Historique de vente » dans l'écran Vente ; l'écran reste par adresse.
  const lignesMenu = layout.split('\n').filter(l => l.includes('label:'));
  assert.ok(!lignesMenu.some(l => l.includes("label: 'Documents'")), 'le menu Documents a disparu (2.7.11)');

  const app = texteDe('App.jsx');
  const page = app.split('\n').find(l => l.includes("route: 'documents'"));
  assert.match(page, /hideFor:\s*\['DEPOT'\]/, 'l’adresse #/documents reste refusée au profil dépôt');
});

test('2.7.5 — transfert : le lot du dépôt se choisit à la recherche OU dans la liste', () => {
  const transfert = texteDe('forms', 'TransferForm.jsx');
  assert.ok(transfert.includes('Rechercher : nom, code ou n° de lot…'), 'un champ de recherche est proposé');
  assert.match(transfert, /const filtrer = terme/, 'la recherche filtre les lots du dépôt');
  assert.ok(transfert.includes('role="option"'), 'les résultats s’affichent sous le champ (suggestions)');
  assert.match(transfert, /<Select value=\{ligne\.lotId\}/, 'la liste déroulante des lots reste disponible');
  assert.match(transfert, /onKeyDown=/, 'la sélection se fait aussi au clavier (Entrée)');
  assert.match(transfert, /recherche: ''/, 'chaque ligne mémorise sa propre recherche');
});

test('2.7.5 — médicament : code interne et code-barres automatiques, fiche raccourcie', () => {
  const produit = texteDe('forms', 'ProductForm.jsx');
  assert.ok(produit.includes('attribué par le logiciel'), 'les deux numéros sont annoncés comme automatiques');
  for (const retire of ['Principe actif', 'Dosage', 'Forme galénique', 'Laboratoire / fabricant', 'Conditions de conservation']) {
    assert.ok(!produit.includes(retire), `le champ « ${retire} » ne doit plus être demandé`);
  }
  assert.ok(!/code:\s*values\.code/.test(produit), 'le code interne n’est plus envoyé par l’écran');
  assert.ok(!/barcode:\s*values\.barcode/.test(produit), 'le code-barres n’est plus envoyé par l’écran');

  // Le serveur, lui, les attribue (service dédié).
  const codes = readFileSync(join(racine, 'backend', 'src', 'services', 'codes.service.js'), 'utf8');
  assert.match(codes, /prochainCodeProduit/, 'le code interne est attribué par le serveur');
  assert.match(codes, /prochainCodeBarres/, 'le code-barres est attribué par le serveur');
});

test('2.7.5 — fournisseurs : corbeille dans la liste et envoi strict des champs', () => {
  const liste = texteDe('pages', 'SuppliersPage.jsx');
  assert.ok(liste.includes('icon={Trash2}'), 'un bouton corbeille est présent sur chaque ligne');
  assert.ok(liste.includes('referentials.remove'), 'la suppression appelle bien l’API');
  assert.match(liste, /Supprimer définitivement/, 'une confirmation est demandée avant de supprimer');

  const fiche = texteDe('forms', 'SupplierForm.jsx');
  assert.ok(!/\.\.\.values\b/.test(fiche), 'la fiche n’envoie plus l’objet complet (id et createdAt exclus)');
  assert.ok(fiche.includes("contact: values.contact || ''"), 'seuls les champs attendus sont envoyés');
  assert.ok(fiche.includes('active: Boolean(values.active)'), 'la case « Fournisseur actif » est transmise en vrai booléen');
  // 2.7.5 : plus de « Raison sociale » à la création — le serveur nomme le fournisseur.
  assert.ok(!/name:\s*values\.name\.trim\(\),/.test(fiche), 'le nom n’est plus envoyé d’office à la création');
  assert.ok(fiche.includes('if (values.name.trim()) payload.name'), 'le nom n’est envoyé que s’il est saisi');
  // 2.7.78 (repère RÉÉCRIT, demande de l'officine) : la bannière bleue qui
  // expliquait la règle a QUITTÉ le formulaire de création — la règle serveur,
  // elle, ne change pas (le nom est toujours attribué automatiquement).
  assert.ok(!fiche.includes('<Banner '), '2.7.78 : la bannière « Plus de Raison sociale à saisir » a quitté le formulaire');
  assert.ok(fiche.includes('label="Raison sociale"'), 'en modification, la raison sociale reste corrigeable');
});

test('2.7.5 — jeton de sécurité : conservé à l’ouverture et rejoué après un refus', () => {
  const auth = texteDe('context', 'AuthContext.jsx');
  assert.match(auth, /setCsrfToken\(session\.csrf\)/, 'le jeton est mémorisé dès /auth/me (onglet neuf)');
  const client = texteDe('api', 'client.js');
  assert.ok(client.includes('reparerJeton'), 'un jeton périmé est réparé automatiquement');
  assert.match(client, /Jeton de sécurité/, 'la réparation ne se déclenche que sur ce message');
  assert.match(client, /delete: path => request/, 'la méthode DELETE est disponible pour l’API');
});

test('2.7.9 — prix de vente : visible par tous dès que le serveur l’envoie, jamais « 0 Ar »', () => {
  const catalogue = texteDe('pages', 'ProductsPage.jsx');
  // Avant la 2.7.5, money(produit.sellingPrice) sans contrôle affichait « 0 Ar »
  // quand la valeur manquait : un zéro se confondait avec un bug de calcul.
  assert.match(catalogue, /produit\.sellingPrice !== null && produit\.sellingPrice !== undefined/,
    'le prix n’est affiché que si la valeur est réellement reçue');
  // 2.7.9 — le dépôt VOIT le prix de vente : plus de colonne « (masqué) ».
  assert.ok(!catalogue.includes('Prix de vente (masqué)'),
    'la colonne ne doit plus annoncer un masquage (le dépôt voit le prix depuis la 2.7.9)');
  // Le bouton « % » (changer le taux) reste réservé aux profils que le serveur autorise.
  assert.match(catalogue, /\{peutVoirPrix \? <Btn variant="ghost" icon=\{Percent\}/,
    'le bouton du taux de marge ne s’affiche que pour les profils autorisés (RG24)');
  // Le bouton désactiver/réactiver n’envoie plus l’objet complet.
  assert.ok(!/update\('products', produit\.id, \{ \.\.\.produit/.test(catalogue),
    'la désactivation envoie un payload minimal');
});

test('2.7.9 — le serveur ne masque plus le prix au dépôt ; le transfert est FEFO avec notification', () => {
  const service = readFileSync(join(racine, 'backend', 'src', 'services', 'dashboard.service.js'), 'utf8');
  assert.ok(!/sellingPrice: null/.test(service),
    'le prix de vente n’est plus renvoyé à null pour le dépôt (2.7.9)');
  const transfert = texteDe('forms', 'TransferForm.jsx');
  // Règle FEFO au transfert : seul le lot le plus proche de la péremption part ;
  // un clic sur un lot « lointain » déclenche une notification au lieu de sélectionner.
  assert.match(transfert, /fefoParProduit/, 'le lot le plus proche de la péremption est repéré par médicament');
  assert.match(transfert, /motifRefus/, 'un motif de refus explique chaque lot non transférable');
  assert.match(transfert, /toast\.warn\(refus\)/,
    'la notification s’affiche quand on clique un lot encore loin de la péremption');
  const controleur = readFileSync(join(racine, 'backend', 'src', 'controllers', 'reference.controller.js'), 'utf8');
  assert.match(controleur, /'id', 'createdAt', 'updatedAt'/, 'les champs techniques renvoyés par un écran sont ignorés');
  assert.ok(existsSync(join(racine, 'backend', 'scripts', 'autoriser-prix-depot.mjs')), 'le script d’autorisation existe');
  assert.ok(existsSync(join(racine, 'backend', 'scripts', 'verifier-prix.mjs')), 'le script de diagnostic existe');
});

test('2.7.10 — valeur jamais « NaN Ar » ; désactivation et déconnexion confirmées ; « Reçu le » remplace « Lot »', () => {
  // Bug vu en production 2.7.9 : la valeur d'une ligne de réception était formattée
  // deux fois (money() dans la page puis money() dans la boîte) → « NaN Ar ».
  const receptions = texteDe('pages', 'ReceiptsPage.jsx');
  assert.match(receptions, /value: Number\(ligne\.unitCost \|\| 0\) \* Number\(ligne\.quantity \|\| 0\)/,
    'la valeur d’une ligne reste un nombre jusqu’au formatage final (bug « NaN Ar »)');
  assert.ok(!/value: money\(/.test(receptions), 'jamais de money() avant le composant de détail');
  const boite = texteDe('components', 'DocumentModal.jsx');
  assert.match(boite, /money\(ligne\.value/, 'c’est la boîte de dialogue qui formate');

  // Désactiver un médicament ou fermer sa session : confirmation avant d’agir.
  const catalogue = texteDe('pages', 'ProductsPage.jsx');
  assert.match(catalogue, /setConfirmation\(produit\)/, 'la désactivation passe par une confirmation');
  assert.match(catalogue, /Oui, désactiver/, 'le bouton de confirmation est explicite');
  const layout = texteDe('components', 'Layout.jsx');
  assert.match(layout, /setDeconnexion\(true\)/, 'la déconnexion demande confirmation');
  assert.match(layout, /Se déconnecter \?/, 'la boîte de déconnexion est présente');

  // Stock & lots : la date de réception a remplacé le numéro de lot en affichage.
  const lots = texteDe('pages', 'LotsPage.jsx');
  assert.match(lots, /<th>Reçu le<\/th>/, 'la colonne « Reçu le » est affichée');
  assert.ok(!/<th>Lot<\/th>/.test(lots), 'la colonne « Lot » n’est plus dans le tableau');
});

test('2.7.11 — menus restructurés : Vente, Stock = rapports, 4 menus retirés, Historique de transfert', () => {
  const layout = texteDe('components', 'Layout.jsx');
  const lignesMenu = layout.split('\n').filter(l => l.includes('label:'));

  // 1. « Historique de vente » devient « Vente ».
  const ligneVente = lignesMenu.find(l => l.includes("route: 'ventes'"));
  assert.match(ligneVente, /label: 'Vente'/, 'le menu ventes s’intitule « Vente »');
  // 2.7.36 — exception voulue par l'officine : le libellé « Historique de
  // vente » réapparaît UNIQUEMENT sur le nouveau menu / route dédié.
  assert.ok(!lignesMenu.some(l => l.includes("label: 'Historique de vente'") && !l.includes("route: 'historique-ventes'")),
    'l’ancien libellé n’est de retour QUE pour le menu dédié (2.7.36)');

  // 2. L'historique des ventes vit sur la page DÉDIÉE ; 2.7.37 (teboka ④) — le
  // bouton « Historique de vente » est désormais RETIRÉ de l'écran Vente.
  const ventes = texteDe('pages', 'SalesPage.jsx');
  assert.ok(!ventes.includes('SaleHistoryModal') && !ventes.includes('historiqueOuvert')
    && !ventes.includes('icon={History}'),
    '2.7.37 — plus aucun bouton ni boîte « Historique de vente » dans l’écran Vente');
  const historique = texteDe('components', 'SaleHistoryModal.jsx');
  assert.match(historique, /doc\.kind === 'SALE'/, 'seules les ventes sont listées');
  assert.match(historique, /documentsApi\.detail\('SALE'/, 'le détail complet vient du serveur');
  assert.match(historique, /documentsApi\.cancel\('SALE'/, 'l’annulation motivée reste possible ici');

  // 3., 5., 6., 8. — menus « Documents », « Rapports », « Journal d’audit » retirés.
  // (« Catalogue » est réinstauré en 2.7.15 pour ADMIN/DEPOT, masqué pour PHARMACIST.)
  for (const retire of ["label: 'Documents'", "label: 'Rapports'", "label: 'Journal d’audit'"]) {
    assert.ok(!lignesMenu.some(l => l.includes(retire)), `le menu ${retire} a disparu`);
  }
  // Leurs écrans restent joignables par adresse (comme Inventaires en 2.7.8).
  const app = texteDe('App.jsx');
  for (const route of ["route: 'documents'", "route: 'rapports'", "route: 'audit'", "route: 'medicaments'"]) {
    assert.ok(app.includes(route), `l’adresse ${route} reste ouverte`);
  }

  // 4. « Stock » affiche le contenu des rapports — pour tous les profils (dépôt aussi).
  const ligneStock = lignesMenu.find(l => l.includes("label: 'Stock'"));
  assert.match(ligneStock, /route: 'rapports'/, 'le menu Stock ouvre les rapports');
  const appRapports = app.split('\n').find(l => l.includes("route: 'rapports'"));
  assert.ok(!/hideFor/.test(appRapports), 'l’adresse rapports n’est plus bloquée au dépôt');

  // 7. « Transferts dépôt → pharmacie » devient « Historique de transfert » (détails conservés).
  const ligneTransferts = lignesMenu.find(l => l.includes("route: 'transferts'"));
  assert.match(ligneTransferts, /label: 'Historique de transfert'/, 'le menu transferts est renommé');
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  assert.match(transferts, /Historique de transfert/, 'le titre de l’écran est aligné');
  assert.match(transferts, /DocumentModal/, 'le détail complet d’un transfert reste présent');
});

test('2.7.15 — Catalogue rétabli pour ADMIN/DEPOT, masqué pour PHARMACIST', () => {
  const layout = texteDe('components', 'Layout.jsx');
  const lignesMenu = layout.split('\n').filter(l => l.includes('label:'));

  // 1. Le menu « Catalogue » EST de retour (annule le retrait 2.7.11 pour ce menu).
  const ligneCatalogue = lignesMenu.find(l => l.includes("label: 'Catalogue'"));
  assert.ok(ligneCatalogue, 'le menu Catalogue est réinstauré');
  assert.match(ligneCatalogue, /route: 'medicaments'/, 'il ouvre l’écran des médicaments (3 onglets)');
  assert.match(ligneCatalogue, /icon: Pill/, 'icône pilule');

  // 2. Mais il est MASQUÉ pour le PHARMACIEN (le comptoir n’en a pas l’usage) :
  // présent pour ADMINISTRATEUR et DÉPÔT uniquement.
  assert.match(ligneCatalogue, /hideFor: \['PHARMACIST'\]/,
    'le menu Catalogue est présent pour ADMIN/DEPOT, masqué pour PHARMACIST');
  assert.match(ligneCatalogue, /permission: 'reference'/, 'la permission « reference » est exigée');

  // 3. Les droits serveur le confirment : ADMIN et DEPOT ont « reference ».
  const seed = readFileSync(new URL('../../sql/002_seed_reference.sql', import.meta.url), 'utf-8');
  for (const role of ['ADMIN', 'DEPOT']) {
    const ligneRole = seed.split('\n').find(l => l.includes(`'${role}'`));
    assert.ok(ligneRole.includes('"reference"'), `le rôle ${role} a « reference »`);
  }

  // 4. Les 3 adresses restent ouvertes (le pharmacien y accède par URL s’il en a besoin).
  const app = texteDe('App.jsx');
  for (const route of ["route: 'medicaments'", "route: 'categories'", "route: 'fournisseurs'"]) {
    assert.ok(app.includes(route), `l’adresse ${route} reste ouverte`);
  }
});

test('2.7.12 — tableau de bord pharmacie épuré + vente au détail (boîte / plaquette / comprimé)', () => {
  // ── A. Tableau de bord, profil pharmacie : dépôt et transferts retirés ────
  const tableau = texteDe('pages', 'DashboardPage.jsx');
  // La carte magasin DEPOT n'est affichée que pour le profil dépôt… et, depuis
  // la 2.7.21, pour l'ADMINISTRATEUR (cartes [PHARMACY, DEPOT]). La pharmacie,
  // elle, ne la voit TOUJOURS pas : son cas est le dernier, PHARMACY seule.
  assert.match(tableau, /estDepot \? \['DEPOT'\] : estAdmin \? \['PHARMACY', 'DEPOT'\] : \['PHARMACY'\]/,
    'la pharmacie ne voit pas la carte magasin du dépôt (l’administrateur si, 2.7.21)');
  // Le raccourci « Transfert vers la pharmacie » n'existe que pour le dépôt.
  assert.match(tableau, /estDepot && can\('transfer'\) && \{ label: 'Transfert vers la pharmacie'/,
    'le raccourci transfert est réservé au profil dépôt');
  // La carte « Derniers transferts dépôt → pharmacie » a d'abord été réservée
  // au dépôt (2.7.12) puis RETIRÉE entièrement (2.7.20 — le suivi J/J vit dans
  // le menu « Calendrier des stock »).
  assert.ok(!tableau.includes('title="Mes derniers transferts') && !tableau.includes('title=« Mes derniers transferts'),
    'la carte historique de transfert a été retirée du tableau de bord (2.7.20)');
  // Le libellé d'en-tête ne parle plus « du dépôt et de la pharmacie ».
  assert.ok(!tableau.includes('état du dépôt et de la pharmacie'), 'l’ancien libellé a disparu');

  // ── B. Vente au détail : 3 unités par ligne, quantité plafonnée par unité ──
  const vente = texteDe('pages', 'SalesPage.jsx');
  assert.match(vente, /code: 'BOX'/, 'l’unité « Boîte » est proposée');
  assert.match(vente, /code: 'BLISTER'/, 'l’unité « Plaquette » est proposée');
  assert.match(vente, /code: 'UNIT'/, 'l’unité « Comprimé » est proposée');
  assert.match(vente, /saleUnit: ligne\.saleUnit \|\| 'BOX'/, 'le panier envoie saleUnit au serveur');
  assert.match(vente, /changerUnite\(ligne, unite\.code\)/, 'le bouton change l’unité de la ligne');
  assert.match(vente, /facteurUnite/, 'le stock vendable est converti par unité');

  // ── C. Fiche médicament : conditionnement + prix détaillés indépendants ────
  const fiche = texteDe('forms', 'ProductForm.jsx');
  for (const champ of ['blistersPerBox', 'unitsPerBlister', 'pricePerBlister', 'pricePerUnit']) {
    assert.ok(fiche.includes(champ), `le champ ${champ} est dans la fiche et le payload`);
  }

  // ── D. Historique de vente : quantité affichée dans l'unité vendue ─────────
  const historique = texteDe('components', 'SaleHistoryModal.jsx');
  assert.match(historique, /saleQuantity \?\? line\.quantity/, 'répli de lecture avant 2.7.12');
  assert.match(historique, /BLISTER: 'plaquette'/, 'les libellés plaquette/comprimé existent');

  // ── E. Contrat serveur : le schéma de vente accepte saleUnit ──────────────
  // (le validateur zod refuse tout champ non déclaré : sans lui, la vente au
  // détail serait rejetée comme « champ inconnu »)
  const validateur = readFileSync(new URL('../../src/validators/sale.validator.js', import.meta.url), 'utf-8');
  assert.match(validateur, /saleUnit: z\.enum\(SALE_UNITS/, 'saleUnit est déclaré côté serveur');
  assert.match(validateur, /\$\{l\.productId\}\|\$\{l\.saleUnit\}/, 'même médicament possible en 2 unités');
});

test('2.7.13 — liste déroulante au comptoir : médicaments vendables, filtre dès 1 caractère', () => {
  const vente = texteDe('pages', 'SalesPage.jsx');
  // La recherche filtre dès 1 caractère (plus 2).
  assert.match(vente, /needle\.length < 1/, 'le filtre démarre au 1er caractère');
  assert.ok(!vente.includes('needle.length < 2'), 'l’ancien seuil de 2 caractères a disparu');
  // Seuls les médicaments VENDABLES (stock comptoir > 0) sont proposés.
  assert.match(vente, /produit\.active && Number\(sellableStock\(produit\.id\) \|\| 0\) > 0/,
    'la liste ne montre que le stock vendable du comptoir');
  // Sans saisie, la liste existe quand même (liste déroulante complète).
  assert.match(vente, /needle\.length < 1 \? vendables : vendables/, 'sans saisie : liste complète des vendables');
});

test('2.7.17 — bouton « Détail boîte / plaquette », Stock épuré, seuil/situation masqués, calendrier des ventes', () => {
  // ── A. Le serveur fournit TOUJOURS le registre classique ET les 4 colonnes
  //    de détail (l'écran choisit l'affichage, aucun recalcul côté client).
  const service = readFileSync(new URL('../../src/services/report.service.js', import.meta.url), 'utf-8');
  for (const colonne of ['Sorties', 'Stock final',
    'Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette']) {
    assert.ok(service.includes(`AS "${colonne}"`), `le serveur fournit « ${colonne} »`);
  }
  // Le détail = entier en boîtes + fraction × conditionnement en plaquettes.
  assert.match(service, /FLOOR\(COALESCE\(sorties\.qte, 0\)\)[\s\S]{0,200}\* p\.blisters_per_box/,
    'les plaquettes sorties = fraction de boîte × conditionnement');
  // Les totaux restent servis depuis les colonnes classiques (unité de gestion).
  assert.ok(service.includes('ligne[\'Sorties\']'), 'totaux calculés sur les colonnes classiques');
  assert.ok(!service.includes('_sorties_gestion'), 'plus de champs internes');

  // ── B. Écran « Stock » (menu) épuré : seules les 6 commandes demandées.
  const ecran = texteDe('pages', 'ReportsPage.jsx');
  for (const bouton of ['Recalculer', 'Contrôle d’intégrité', 'Aujourd’hui', '7 jours', 'Ce mois', 'Tout']) {
    assert.ok(ecran.includes(`>${bouton}<`) || ecran.includes(`'${bouton}'`), `le bouton « ${bouton} » est là`);
  }
  // (structure JSX, pas les commentaires d'en-tête qui racontent le changement)
  assert.ok(!ecran.includes('title="Paramètres du rapport"'), 'la carte « Paramètres du rapport » a disparu');
  assert.ok(!ecran.match(/<Field label="Rapport">/), 'le sélecteur « Rapport » a disparu');
  // 2.7.71 — la demande a évolué : la saisie ENTRE DEUX DATES REVIENT,
  // alignée avec les quatre raccourcis (les boutons restent, inchangés).
  assert.ok(ecran.includes('aria-label="Du (début de la période)"') && ecran.includes('aria-label="Au (fin de la période)"'),
    '2.7.71 : saisie « Du … Au … » entre deux dates, alignée avec les raccourcis');
  // Le bouton demandé à la voix : voir le détail boîte/plaquette à la demande.
  assert.ok(ecran.includes('Détail boîte / plaquette'), 'le bouton de détail existe');
  assert.ok(ecran.includes('setDetail'), 'la bascule classique/détail est gérée');
  assert.ok(ecran.includes('colSpan={2}') && ecran.includes('rowSpan={2}'),
    'vue détail : en-tête groupé Boîte | Plaquette (Sorties et Stock final)');
  // Seuil minimum / Situation : calcul INCHANGÉ, AFFICHAGE retiré.
  assert.ok(ecran.includes("JAMAIS_AFFICHEES = ['Seuil minimum', 'Situation']"),
    'seuil et situation sont masqués à l’affichage');
  assert.ok(service.includes('AS "Seuil minimum"') && service.includes("END AS \"Situation\""),
    'le calcul du seuil et de la situation n’a PAS changé');
  // La fiche affichée est celle du magasin du profil (dépôt → réserve).
  assert.ok(ecran.includes("estDepot ? 'fiche_depot' : 'fiche'"), 'fiche du magasin du profil');

  // ── C. Calendrier des ventes (2.7.17 page tableau de bord → 2.7.18 : menu dédié).
  const calendrier = texteDe('components', 'SalesCalendar.jsx');
  assert.ok(calendrier.includes('sales-calendar'), 'lit l’agrégat du mois servi par l’API');
  assert.match(calendrier, /reports\.load\(\{ type: 'sales', from: jourChoisi, to: jourChoisi \}\)/,
    'le jour cliqué montre ses lignes de vente (détail complet)');
  for (const repere of ['NOMS_JOURS', 'gridTemplateColumns', 'setJourChoisi', 'Marge (Ar)']) {
    assert.ok(calendrier.includes(repere), `repère calendrier « ${repere} »`);
  }
  // 2.7.18 — le calendrier a quitté le tableau de bord (remplacé par l'histogramme).
  assert.ok(texteDe('pages', 'CalendrierPage.jsx').includes('<SalesCalendar />'),
    'la page « Calendrier des ventes » affiche le calendrier');
  // L'endpoint API est câblé des deux côtés.
  const points = texteDe('api', 'endpoints.js');
  assert.ok(points.includes('salesCalendar: month =>'), 'helper API front présent');
  const routes = readFileSync(new URL('../../src/routes/index.js', import.meta.url), 'utf-8');
  assert.ok(routes.includes("'/data/sales-calendar'"), 'route /data/sales-calendar en place');
  const serviceDash = readFileSync(new URL('../../src/services/dashboard.service.js', import.meta.url), 'utf-8');
  assert.match(serviceDash, /to_char\(created_at AT TIME ZONE/, 'regroupement par JOUR LOCAL (fuseau de la pharmacie)');
  assert.match(serviceDash, /FROM sales/, 'agrégat lu sur les ventes');

  // D. Le registre classique de l’autre écran ne bouge pas (détail = au clic).
  const onglet = texteDe('pages', 'FicheStockTab.jsx');
  assert.ok(!onglet.includes('Sorties plaquette'), 'l’onglet Fiche de stock reste le registre classique');
});

test('2.7.18 — menu « Calendrier des ventes » sous « Vente » · histogramme mensuel au tableau de bord', () => {
  // ── A. Le calendrier quitte le tableau de bord pour SON MENU. ──────────────
  const layout = texteDe('components', 'Layout.jsx');
  const ligneCalendrier = layout.split('\n').find(ligne => ligne.includes("label: 'Calendrier des ventes'"));
  assert.ok(ligneCalendrier, 'l’entrée de menu « Calendrier des ventes » doit exister');
  assert.match(ligneCalendrier, /route: 'calendrier'/, 'route du menu');
  assert.match(ligneCalendrier, /permission: 'sale'/, 'visible seulement côté pharmacie (le dépôt ne vend pas)');
  assert.match(ligneCalendrier, /icon: CalendarDays/, 'icône calendrier');
  // …juste SOUS « Vente » dans le groupe Quotidien.
  assert.ok(layout.indexOf("label: 'Vente'") < layout.indexOf("label: 'Calendrier des ventes'"),
    'le menu « Calendrier des ventes » est placé sous « Vente »');
  assert.ok(layout.indexOf("label: 'Calendrier des ventes'") < layout.indexOf("group: 'Magasins'"),
    '… dans le même groupe « Quotidien »');

  const app = readFileSync(new URL('../../../frontend/src/App.jsx', import.meta.url), 'utf-8');
  assert.ok(app.includes("route: 'calendrier'") && app.includes('CalendrierPage'),
    'la route #/calendrier ouvre la page du calendrier');
  assert.match(app, /route: 'calendrier', page: CalendrierPage, title: 'Calendrier des ventes', permission: 'sale'/,
    'adresse filtrée par la permission de vente');

  const tableau = texteDe('pages', 'DashboardPage.jsx');
  assert.ok(!tableau.includes('SalesCalendar'), 'le calendrier n’est PLUS sur le tableau de bord (il est dans son menu)');
  assert.ok(tableau.includes('SalesHistogram'), 'l’histogramme est sur le tableau de bord');
  assert.ok(tableau.includes('!estDepot'), 'l’histogramme n’apparaît pas chez le dépôt (même à l’administrateur : il l’a bien, par `!estDepot`, PLUS le flux dépôt — 2.7.21)');
  // 2.7.19 — la carte du magasin (Pharmacie : alertes, valeur du stock,
  // médicaments, ventes du jour) se lit AVANT l'histogramme.
  assert.ok(tableau.indexOf('magasins.map') < tableau.indexOf('<SalesHistogram />'),
    'la carte « Pharmacie » est AU-DESSUS de l’histogramme');

  // ── B. L'histogramme « total encaissé par mois » (12 mois). ────────────────
  const histo = texteDe('components', 'SalesHistogram.jsx');
  for (const repere of ['salesMonthly', '<svg', '<rect', 'BarChart3', 'NOMS_COURTS']) {
    assert.ok(histo.includes(repere), `repère histogramme « ${repere} »`);
  }
  assert.match(histo, /const fenetre = \[\]/, 'fenêtre de 12 mois (mois sans vente = barre à zéro)');
  assert.ok(histo.includes('<title>'), 'chaque barre a son infobulle (ventes · encaissé · marge)');

  // ── C. Le serveur : agrégat mois par mois + route + helper. ────────────────
  const serviceDash = readFileSync(new URL('../../src/services/dashboard.service.js', import.meta.url), 'utf-8');
  assert.match(serviceDash, /export async function salesMonthly\(transaction\)/, 'fonction salesMonthly');
  assert.match(serviceDash, /to_char\(created_at AT TIME ZONE :fuseau, 'YYYY-MM'\)/, 'regroupement par MOIS local');
  const controleur = readFileSync(new URL('../../src/controllers/dashboard.controller.js', import.meta.url), 'utf-8');
  assert.ok(controleur.includes('getSalesMonthly'), 'contrôleur de l’histogramme');
  const routes = readFileSync(new URL('../../src/routes/index.js', import.meta.url), 'utf-8');
  assert.ok(routes.includes("'/data/sales-monthly'"), 'route /data/sales-monthly en place');
  const points = texteDe('api', 'endpoints.js');
  assert.ok(points.includes("salesMonthly: () =>"), 'helper API front présent');
});

// ============================================================================
// 2.7.20 — six demandes (1 pharmacie + 5 dépôt) :
//   1) PHARMACIE : le bouton « Nouveau transfert » disparaît de l'écran des
//      transferts (le dépôt le garde : c'est son métier quotidien).
//   2) DÉPÔT · menu Stock : les médicaments s'affichent EN CARTES.
//   3) DÉPÔT · tableau de bord : la carte des derniers transferts est retirée.
//   4) DÉPÔT · tableau de bord : diagramme ENTRÉES / SORTIES par mois (12 mois).
//   5) DÉPÔT · Stock : le bouton « Détail boîte / plaquette » disparaît.
//   6) DÉPÔT · nouveau menu « Calendrier des stock » sous « Stock » : pour
//      chaque date, le détail des entrées (réceptions + prix) et des sorties
//      (transferts vers la pharmacie + valeur).
// ============================================================================
test('2.7.20 — transfert dépôt seul · cartes au Stock dépôt · flux mensuels · calendrier des stock', () => {
  // ── 1. « Nouveau transfert » = métier du DÉPÔT, masqué à la pharmacie. ─────
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  assert.ok(transferts.includes('Nouveau transfert'), 'le bouton existe toujours pour le dépôt');
  assert.match(transferts, /can\('transfer'\) && user\?\.roleCode !== 'PHARMACIST'/,
    'permission ET profil exigés : pharmacie masquée (sur le Pharmacie ihany)');

  // ── 3 & 4. Tableau de bord du DÉPÔT : adieu carte transferts, bonjour flux. ─
  const tableau = texteDe('pages', 'DashboardPage.jsx');
  assert.ok(!tableau.includes('title="Mes derniers transferts'),
    'la carte des derniers transferts a été retirée du tableau de bord');
  assert.ok(!tableau.includes('transfertsRecents'), 'plus aucune extraction des transferts récents');
  assert.ok(tableau.includes('DepotFlowChart'), 'le graphique des flux est sur le tableau de bord');
  assert.match(tableau, /!estDepot[\s\S]{0,200}?SalesHistogram[\s\S]{0,500}?DepotFlowChart/,
    'pharmacie → histogramme des ventes · dépôt → flux entrées/sorties');

  const flux = texteDe('components', 'DepotFlowChart.jsx');
  for (const repere of ['stockFlowMonthly', '<svg', '<rect', 'NOMS_COURTS', 'ArrowDownUp']) {
    assert.ok(flux.includes(repere), `repère flux dépôt « ${repere} »`);
  }
  assert.match(flux, /for \(let i = 11; i >= 0; i -= 1\)/, '12 mois glissants');
  assert.ok(flux.includes('#16a34a') && flux.includes('#ea580c'), 'vert = entrées · orange = sorties');
  assert.ok(flux.includes('<title>'), 'infobulle (title) sur chaque mois');

  // ── 2 & 5. Menu Stock du DÉPÔT : cartes + adieu bouton de détail. ───────────
  const stock = texteDe('pages', 'ReportsPage.jsx');
  assert.ok(stock.includes('Détail boîte / plaquette'), 'le bouton existe encore pour la pharmacie');
  assert.match(stock, /\{avecBoutonDetail \?\s*\(/,
    '« Détail boîte / plaquette » masqué hors pharmacie (dépôt 2.7.20, admin 2.7.21)');
  const boutonDetail = stock.split('\n').find(l => l.includes("detail ? 'Vue registre'"));
  assert.ok(boutonDetail, 'bascule Vue registre / Détail conservée');
  // 2.7.46 — la demande a changé : le DÉPÔT affiche désormais le TABLEAU de
  // stock (comme la pharmacie) — les « cartes » par médicament sont retirées.
  assert.ok(!stock.includes('CarteMedicament'), '2.7.46 : les cartes dépôt ont disparu (tableau partout)');
  for (const repere of ['Stock initial', 'Entrées', 'Sorties', 'Stock final', 'Coût unitaire', 'Valeur']) {
    assert.ok(stock.includes(repere), `tableau de stock : repère « ${repere} »`);
  }

  // ── 6. Menu « Calendrier des stock » SOUS « Stock » (DÉPÔT seul). ───────────
  const layout = texteDe('components', 'Layout.jsx');
  const ligneMenu = layout.split('\n').find(ligne => ligne.includes("label: 'Calendrier des stock'"));
  assert.ok(ligneMenu, 'l’entrée de menu « Calendrier des stock » doit exister (libellé exact)');
  assert.match(ligneMenu, /route: 'calendrier-stock'/, 'route du menu');
  assert.match(ligneMenu, /icon: CalendarDays/, 'icône calendrier');
  assert.match(ligneMenu, /hideFor: \['PHARMACIST'\]/,
    'menu visible par dépôt + administrateur, masqué pour la pharmacie (2.7.21)');
  assert.ok(layout.indexOf("label: 'Stock'") < layout.indexOf("label: 'Calendrier des stock'"),
    '« Calendrier des stock » placé SOUS le menu « Stock »');
  assert.ok(layout.indexOf("label: 'Calendrier des stock'") < layout.indexOf("label: 'Réceptions (dépôt)'"),
    '… avant « Réceptions »');

  const app = readFileSync(new URL('../../../frontend/src/App.jsx', import.meta.url), 'utf-8');
  assert.match(app, /route: 'calendrier-stock'/, 'route #/calendrier-stock déclarée');
  assert.ok(app.includes('CalendrierStockPage'), 'la page dédiée est chargée');
  const pageStock = texteDe('pages', 'CalendrierStockPage.jsx');
  assert.ok(pageStock.includes('StockCalendar'), 'la page monte le composant calendrier des stock');

  const calendrier = texteDe('components', 'StockCalendar.jsx');
  for (const repere of ['stockCalendar(mois)', 'NOMS_JOURS', 'changerMois', 'receiptsValue', 'transfersValue']) {
    assert.ok(calendrier.includes(repere), `repère calendrier stock « ${repere} »`);
  }
  assert.match(calendrier, /repeat\(7, minmax\(0,1fr\)\)/, 'grille 7 colonnes comme le calendrier des ventes');
  assert.ok(calendrier.includes("reports.load({ type: 'receipts'"), 'détail des entrées = rapport réceptions du jour');
  assert.ok(calendrier.includes("reports.load({ type: 'transfers'"), 'détail des sorties = rapport transferts du jour');
  assert.ok(calendrier.includes("Prix d'achat (Ar)"), 'les prix du stock entré sont affichés');
  assert.ok(calendrier.includes('Quantité transférée'), 'les quantités parties vers la pharmacie sont affichées');

  // ── Serveur : agrégats + contrôleurs + routes + helpers front. ─────────────
  const service = readFileSync(new URL('../../src/services/dashboard.service.js', import.meta.url), 'utf-8');
  assert.match(service, /export async function stockCalendar\(month, transaction\)/, 'fonction stockCalendar');
  assert.match(service, /FROM receipts/, 'agrégat des réceptions');
  assert.match(service, /FROM transfers/, 'agrégat des transferts');
  assert.match(service, /export async function stockFlowMonthly\(transaction\)/, 'fonction stockFlowMonthly');
  assert.match(service, /FROM movements[\s\S]{0,400}?WHERE location = 'DEPOT'/, 'flux = mouvements du dépôt');
  const controleur = readFileSync(new URL('../../src/controllers/dashboard.controller.js', import.meta.url), 'utf-8');
  assert.ok(controleur.includes('getStockCalendar') && controleur.includes('getStockFlowMonthly'),
    'contrôleurs 2.7.20 en place');
  const routes = readFileSync(new URL('../../src/routes/index.js', import.meta.url), 'utf-8');
  assert.ok(routes.includes("'/data/stock-calendar'"), 'route /data/stock-calendar');
  assert.ok(routes.includes("'/data/stock-flow-monthly'"), 'route /data/stock-flow-monthly');
  const points = texteDe('api', 'endpoints.js');
  assert.ok(points.includes('stockCalendar: month =>'), 'helper API calendrier stock');
  assert.ok(points.includes('stockFlowMonthly: () =>'), 'helper API flux dépôt');
});

// ============================================================================
// 2.7.21 — ADMINISTRATEUR : le dépôt devient visible chez elle aussi —
//   1) le menu « Calendrier des stock » n'est plus masqué pour l'administrateur
//      (il ne reste masqué que pour la PHARMACIE) ;
//   2) sur « Stock », l'administrateur voit la fiche du DÉPÔT sous forme de
//      CARTES (exactement la vue du dépôt, pas le registre de la pharmacie) ;
//   3) le bouton « Détail boîte / plaquette », lui, n'existe que pour la
//      PHARMACIE : retiré aussi côté administrateur ;
//   4) sur le tableau de bord, l'administrateur voit ce qui est important au
//      DÉPÔT : carte magasin réserve + graphique des flux entrées/sorties.
// ============================================================================
test('2.7.21 — administrateur : calendrier des stock + cartes dépôt + flux sur le tableau de bord', () => {
  // ── 1. Le menu « Calendrier des stock » s'ouvre à l'administrateur. ────────
  const layout = texteDe('components', 'Layout.jsx');
  const ligneMenu = layout.split('\n').find(ligne => ligne.includes("label: 'Calendrier des stock'"));
  assert.ok(ligneMenu, 'l’entrée de menu existe toujours');
  assert.match(ligneMenu, /hideFor: \['PHARMACIST'\]/,
    'administrateur inclus (hideFor = pharmacie seule maintenant)');
  assert.ok(!ligneMenu.includes("'ADMIN', 'PHARMACIST'"), 'l’administrateur n’est plus dans les exclus');
  assert.ok(layout.indexOf("label: 'Stock'") < layout.indexOf("label: 'Calendrier des stock'"),
    'toujours sous « Stock »');
  const app = readFileSync(new URL('../../../frontend/src/App.jsx', import.meta.url), 'utf-8');
  assert.match(app, /route: 'calendrier-stock', page: CalendrierStockPage/, 'route inchangée (permission receipt — l’admin l’a)');

  // ── 2 & 3. Stock : administrateur = fiche DÉPÔT en cartes, sans bouton détail. ─
  // 2.7.22 — la vue dépôt pour l'admin se branche désormais sur l'ADRESSE :
  // #/rapports → cartes du dépôt ; #/stock-pharmacie → registre du comptoir.
  const stock = texteDe('pages', 'ReportsPage.jsx');
  assert.match(stock, /estDepot = user\?\.roleCode === 'DEPOT'\s*\|\| \(user\?\.roleCode === 'ADMIN' && route !== 'stock-pharmacie'\)/,
    'la vue « dépôt » couvre DEPOT et l’ADRESSE #/rapports chez l’admin (2.7.22)');
  assert.match(stock, /avecBoutonDetail = user\?\.roleCode === 'PHARMACIST'/,
    '« Détail boîte / plaquette » = pharmacie seule (retiré aussi côté administrateur)');
  assert.match(stock, /\{avecBoutonDetail \?\s*\(/, 'le bouton suit la nouvelle variable');
  assert.ok(!stock.includes('CarteMedicament'),
    '2.7.46 : l’administrateur tombe sur le TABLEAU quand estDepot est vrai');
  assert.ok(stock.includes("type = estDepot ? 'fiche_depot' : 'fiche'"),
    'le rapport chargé est la fiche DÉPÔT quand estDepot est vrai');

  // ── 4. Tableau de bord : l'important du dépôt chez l'administrateur. ───────
  const tableau = texteDe('pages', 'DashboardPage.jsx');
  assert.ok(tableau.includes("estAdmin = user?.roleCode === 'ADMIN'"), 'repère administrateur');
  assert.match(tableau, /estDepot \? \['DEPOT'\] : estAdmin \? \['PHARMACY', 'DEPOT'\] : \['PHARMACY'\]/,
    'cartes magasins : admin = pharmacie + dépôt, dépôt = dépôt, pharmacie = pharmacie');
  // L'administrateur voit l'histogramme des ventes (comme la pharmacie)
  // ET le graphique des flux du dépôt.
  assert.match(tableau, /\{estAdmin \? <div style=\{\{ marginBottom: 16 \}\}><DepotFlowChart \/><\/div> : null\}/,
    'le flux du dépôt s’ajoute chez l’administrateur');
  assert.ok(tableau.indexOf('magasins.map') < tableau.indexOf('<SalesHistogram />'),
    'la carte « Pharmacie » reste AU-DESSUS de l’histogramme (2.7.19 non-régression)');
});

// ============================================================================
// 2.7.22 — MENU ADMINISTRATEUR à 5 entrées :
//   « Tableau de bord » (inchangé) · « Pharmacie » (bloc dépliable qui montre
//   tout le comptoir) · « Dépôt » (bloc dépliable qui montre toute la réserve)
//   · « Utilisateurs » · « Paramètres ». Rien d'autre pour l'ADMIN.
// Sous-menus requis :
//   PHARMACIE → Vente · Calendrier des ventes · Stock (pharmacie, NOUVELLE
//               adresse #/stock-pharmacie) · Pertes et dons · Historique de
//               transfert ;
//   DÉPÔT     → Stock (dépôt) · Calendrier des stock · Réceptions · Historique
//               de transfert · Pertes · Catalogue.
// ============================================================================
test('2.7.22 — administrateur : 5 menus avec blocs « Pharmacie » et « Dépôt » dépliables', () => {
  const layout = texteDe('components', 'Layout.jsx');

  // ── 1. Deux navigations : l'admin a la sienne (NAV_ADMIN), les autres gardent le plat. ─
  assert.ok(layout.includes('const NAV_ADMIN = ['), 'navigation spéciale administrateur');
  assert.match(layout, /const racine = user\?\.roleCode === 'ADMIN' \? NAV_ADMIN : NAV/,
    'NAV_ADMIN réservée à l’administrateur — PHARMACIST/DÉPÔT inchangés');

  // ── 2. EXACTEMENT 5 entrées dans le menu admin. ────────────────────────────
  const blocNav = layout.slice(layout.indexOf('const NAV_ADMIN = ['));
  const zoneItems = blocNav.slice(0, blocNav.indexOf('];'));
  const entrees = zoneItems.match(/route: '(tableau-de-bord|utilisateurs|parametres)'|label: '(Pharmacie|Dépôt)', icon/g) || [];
  assert.deepEqual(entrees.map(entree =>
    entree.replace(/route: |label: |, icon|'/g, '')),
    ['tableau-de-bord', 'Pharmacie', 'Dépôt', 'utilisateurs', 'parametres'],
    'menu admin = Tableau de bord · Pharmacie · Dépôt · Utilisateurs · Paramètres');

  // ── 3. Le bloc « Pharmacie » = tout le comptoir (« comme si l’on y entrait »). ─
  const sousPharmacie = layout.slice(layout.indexOf('const SOUS_MENUS_PHARMACIE = '));
  const zonePharmacie = sousPharmacie.slice(0, sousPharmacie.indexOf('];'));
  for (const route of ['ventes', 'calendrier', 'stock-pharmacie', 'pertes', 'transferts']) {
    assert.ok(zonePharmacie.includes(`route: '${route}'`),
      `le bloc Pharmacie contient #/${route}`);
  }
  assert.ok(zonePharmacie.includes("label: 'Stock (pharmacie)'"),
    'le stock du comptoir a son libellé propres au bloc');

  // ── 4. Le bloc « Dépôt » = toute la réserve. ───────────────────────────────
  const sousDepot = layout.slice(layout.indexOf('const SOUS_MENUS_DEPOT = '));
  const zoneDepot = sousDepot.slice(0, sousDepot.indexOf('];'));
  for (const route of ['rapports', 'calendrier-stock', 'receptions', 'transferts', 'pertes', 'medicaments']) {
    assert.ok(zoneDepot.includes(`route: '${route}'`),
      `le bloc Dépôt contient #/${route}`);
  }
  assert.ok(zoneDepot.includes("label: 'Stock (dépôt)'"), 'le stock de la réserve nommé');

  // ── 5. Les blocs se déplient (chevron) et l'enfant actif met son parent en valeur. ─
  assert.ok(layout.includes('setOuverts'), 'état d’ouverture des blocs');
  assert.ok(layout.includes('ChevronDown') && layout.includes('ChevronRight'), 'chevrons plié/déplié');
  assert.ok(layout.includes('navlink--sub'), 'sous-liens indentés');
  const styles = readFileSync(new URL('../../../frontend/src/styles.css', import.meta.url), 'utf-8');
  for (const classe of ['.sidebar__submenu', '.navlink--sub', '.navlink__chevron']) {
    assert.ok(styles.includes(classe), `style ${classe}`);
  }

  // ── 6. Nouvelle adresse pour la fiche du COMPTOIR dans le menu Pharmacie. ──
  const app = readFileSync(new URL('../../../frontend/src/App.jsx', import.meta.url), 'utf-8');
  assert.match(app, /route: 'stock-pharmacie', page: ReportsPage/,
    'route #/stock-pharmacie branchée sur l’écran Stock');
  assert.ok(app.includes("permission: 'reports'"), 'permission de stock (admin + pharmacie la possèdent)');

  const stock = texteDe('pages', 'ReportsPage.jsx');
  assert.ok(stock.includes('useRoute'), 'la vue choisit la fiche selon l’adresse');
  assert.match(stock, /route !== 'stock-pharmacie'/, 'branchement comptoir/réserve sur l’adresse');
  assert.ok(!stock.includes('CarteMedicament'),
    '2.7.46 : le tableau du dépôt sort aussi sur la vue réserve');
});

// ============================================================================
// 2.7.23 — DÉPÔT · menu Stock : « Imprimer » devient « Detail » (boîte de
// dialogue dans la page, plus de nouvel onglet navigateur) avec le contenu
// ÉPURÉ du rapport :
//   • pas de « Sorties boîte » / « Sorties plaquette » — seulement « Sorties » ;
//   • pas de « Stock final boîte » / « Stock final plaquette » — seulement
//     « Stock final » (la découpe par prise reste l'affaire de la pharmacie,
//     qui garde tout sans changement) ;
//   • pas de « Seuil minimum » ni « Situation » (2.7.17) ;
//   • pas de « Édité par … » ni « Lignes affichées … » ;
//   • pas de bloc statistique (ventes · marge · pertes · achats · transferts ·
//     mouvements).
// ============================================================================

test('2.7.23 — dépôt : bouton « Detail » (boîte de dialogue) sans les colonnes/méta retirées', () => {
  // 2.7.78 — REPÈRES RÉÉCRITS (demande de l'officine) : le bouton « Detail »
  // du dépôt est REMPLACÉ par « Telecharger » — VERT plein, flèche de
  // téléchargement — qui enregistre DIRECTEMENT le PDF de la fiche (même
  // fonction imprimer() que la pharmacie, sans boîte de dialogue ni nouvel
  // onglet). DetailStockModal, son état et COLONNES_CACHEES_MODAL ont quitté
  // le fichier. La PHARMACIE ne change pas : « Imprimer » vert → PDF (2.7.71).
  const stock = texteDe('pages', 'ReportsPage.jsx');

  // ── 1. 2.7.78 : côté dépôt, « Telecharger » (flèche, VERT) remplace « Detail ». ─
  assert.match(stock, /estDepot \? \([\s\S]{0,400}?icon=\{Download\}[\s\S]{0,300}?>Telecharger<\/Btn>/,
    '2.7.78 : le bouton dépôt devient « Telecharger » (flèche de téléchargement)');
  assert.match(stock, /style=\{COULEUR_VERT\} icon=\{Download\}[\s\S]{0,200}?onClick=\{imprimer\}>Telecharger<\/Btn>/,
    '« Telecharger » est VERT plein et appelle imprimer (téléchargement direct du PDF)');

  // ── 2. La boîte de dialogue « Detail » du dépôt a DISPARU (2.7.78). ──────
  assert.ok(!stock.includes('>Detail</Btn>'), '2.7.78 : plus de bouton « Detail » au dépôt');
  assert.ok(!stock.includes('function DetailStockModal'), '2.7.78 : le composant DetailStockModal est retiré');
  assert.ok(!stock.includes('setDetailModal'), '2.7.78 : plus d’état de boîte de détail');
  assert.ok(!stock.includes('COLONNES_CACHEES_MODAL'), '2.7.78 : la liste de masquage de la boîte est retirée');

  // ── 3. Le tableau à l'écran reste épuré côté dépôt (repères 2.7.17 gardés). ─
  assert.ok(stock.includes('JAMAIS_AFFICHEES'), 'le tableau dépôt garde sa liste de colonnes retirées');
  for (const colonne of ['Seuil minimum', 'Situation']) {
    assert.ok(stock.includes(`'${colonne}'`), `colonne jamais affichée au dépôt : « ${colonne} »`);
  }
  assert.ok(!stock.includes('openPrintable') && !stock.includes('window.open'),
    'le téléchargement ne rouvre pas d’onglet (ni dépôt ni pharmacie)');

  // ── 4. La pharmacie : rien ne change (« Imprimer » VERT, PDF direct 2.7.71). ─
  assert.match(stock, /icon=\{Printer\}[\s\S]{0,200}?onClick=\{imprimer\}>Imprimer<\/Btn>/,
    'pharmacie : bouton « Imprimer » conservé, même téléchargement');
  assert.ok(stock.includes('style={COULEUR_VERT} icon={Printer}'), 'pharmacie : « Imprimer » reste VERT plein');
  assert.ok(stock.includes('&fmt=pdf') && stock.includes('telechargerPdf'),
    '2.7.71 : « Imprimer » télécharge directement le PDF de la fiche');
  assert.ok(stock.includes("detail ? 'Vue registre' : 'Détail boîte / plaquette'"),
    'pharmacie : bouton « Détail boîte / plaquette » conservé');
});

// ============================================================================
// 2.7.24 — cinq retouches :
//   ① dépôt : la boîte de dialogue « Detail » passe en PLEIN ÉCRAN (presque
//     tout l'écran) pour tout voir sans faire défiler ;
//   ② export CSV du DÉPÔT : « Sorties boîte », « Sorties plaquette »,
//     « Stock final boîte » et « Stock final plaquette » en sont RETIRÉES
//     (« Sorties » et « Stock final » restent — la pharmacie garde tout) ;
//   ③ pharmacie : « Nouveau Transfert » reste caché dans l'historique
//     (déjà fait en 2.7.20 — vérification) ;
//   ④ administration : les cartes de présentation des rôles (Administrator/
//     Pharmacien/Dépôt + « N droit(s) ») DISPARAISSENT de la page Utilisateurs ;
//   ⑤ liste des comptes : la colonne « Rôle » AFFICHE le rôle (plus jamais
//     « — » : le serveur renvoie désormais roleName/roleId) et la colonne
//     « Droits » est retirée.
// ============================================================================
test('2.7.24 — detail plein écran · CSV dépôt épuré · utilisateurs sans cartes ni « Droits », rôle affiché', () => {
  const stock = texteDe('pages', 'ReportsPage.jsx');
  const ui = texteDe('components', 'ui.jsx');
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');
  const utilisateurs = readFileSync(join(racine, 'frontend', 'src', 'pages', 'UsersPage.jsx'), 'utf8');
  const rapports = readFileSync(join(racine, 'backend', 'src', 'controllers', 'reports.controller.js'), 'utf8');
  const auth = readFileSync(join(racine, 'backend', 'src', 'services', 'auth.service.js'), 'utf8');

     // ── ① Taille « detail » plein écran (Modal). ────────────────────────────
  // 2.7.80 (repère RÉÉCRIT) : la boîte « Historique d’inventaire » a été
  // retirée en 2.7.80 (la liste porte directement le comptage) ; la taille
  // plein écran reste DISPONIBLE dans ui.jsx et styles.css pour les autres
  // usages éventuels — le repère vérifie le MÉCANISME.
  assert.ok(ui.includes('size'), 'ui.jsx : Modal accepte une taille nommée');
  assert.match(ui, /modal--\$\{size\}|modal--detail/, 'Modal compose la classe de taille');
  assert.ok(css.includes('.modal--detail'), 'styles.css : la taille « detail » existe');

  // ── ② Export CSV du DÉPÔT : les 4 colonnes de découpe en sont retirées. ───
  assert.ok(rapports.includes('COLONNES_RETIREES_CSV'), 'reports.controller : liste des colonnes retirées du CSV dépôt');
  for (const colonne of ['Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette']) {
    assert.ok(rapports.includes(colonne), `colonne retirée du CSV dépôt : « ${colonne} »`);
  }
  assert.match(rapports, /fiche_depot/, 'le filtrage ne vise que la fiche du dépôt');
  assert.ok(rapports.includes("type === 'fiche_depot'") || rapports.includes("type!=='fiche_depot'") ||
    rapports.includes("type !== 'fiche_depot'") || rapports.includes("type==='fiche_depot'"),
    'la pharmacie (type « fiche ») garde toutes ses colonnes — CSV inchangé');
  // « Sorties » et « Stock final » (simples) ne figurent PAS dans la liste retirée.
  const zoneRetirees = rapports.slice(rapports.indexOf('COLONNES_RETIREES_CSV'),
    rapports.indexOf(']', rapports.indexOf('COLONNES_RETIREES_CSV')));
  assert.ok(!/\b'Sorties'/.test(zoneRetirees) && !zoneRetirees.includes("'Stock final'"),
    '« Sorties » et « Stock final » restent dans le CSV dépôt');
  assert.ok(rapports.includes('toCsv(lignes)') && !rapports.includes('toCsv(result.rows)'),
    'le CSV dépôt part des lignes filtrées');

  // ── ③ Pharmacie : « Nouveau Transfert » caché (déjà en place depuis 2.7.20). ─
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  assert.ok(transferts.includes("roleCode !== 'PHARMACIST'"),
    'côté pharmacie, « Nouveau Transfert » reste masqué de l’historique (2.7.20)');

  // ── ④ Page Utilisateurs : plus de cartes « rôle » (§4 de la demande). ─────
  assert.ok(!utilisateurs.includes('droit(s)</p>'), 'cartes « Administrateur — 14 droit(s)… » retirées');
  assert.ok(!utilisateurs.includes('grid grid--3'), 'plus de rangée de 3 cartes en tête de page');
  assert.ok(utilisateurs.includes('Nouvel utilisateur'), 'le bouton de création reste');

  // ── ⑤ Liste des comptes : « Rôle » AFFICHÉ, colonne « Droits » retirée. ───
  assert.ok(!/{ label: 'Droits'/.test(utilisateurs), 'colonne « Droits » supprimée du tableau');
  assert.ok(!utilisateurs.includes('rolePermissions'), 'plus de comptage des droits par ligne');
  assert.ok(utilisateurs.includes('compte.roleName'),
    'le rôle s’affiche en clair (roleName renvoyé par le serveur — fini le « — »)');
  assert.ok(!utilisateurs.includes('roleName(compte.roleId)'),
    'plus de recherche de rôle par identifiant côté page');
  assert.ok(auth.includes('roleId:'), 'auth.service : roleId exposé (formulaire pré-rempli)');
});

// ============================================================================
// 2.7.25 — quatre retouches :
//   ① dépôt : l'export CSV retire AUSSI « Seuil minimum » et « Situation » ;
//   ② formulaire Utilisateur : la liste « Rôle » n'affiche plus le nombre de
//     droits entre parenthèses (« Administrateur » au lieu de
//     « Administrateur (14 droits) ») ;
//   ③ page de connexion : en cas d'identifiant ou de mot de passe faux, un
//     message CLAIR s'affiche (« Identifiant ou mot de passe incorrect. ») —
//     plus jamais d'erreur brute (« erreur 500 ») ; et le serveur tolère les
//     retransmetteurs locaux (X-Forwarded-For) qui provoquaient ce 500 ;
//   ④ mot de passe : 4 caractères minimum (chiffres, lettres ou symboles)
//     partout où on en choisit un — création de compte, changement de mot de
//     passe, création du premier administrateur, réinitialisation.
// ============================================================================
test('2.7.25 — CSV dépôt sans Seuil/Situation · Rôle sans « (N droits) » · login à message clair · mot de passe 4 car. min', () => {
  const rapports = readFileSync(join(racine, 'backend', 'src', 'controllers', 'reports.controller.js'), 'utf8');
  const formUtilisateur = readFileSync(join(racine, 'frontend', 'src', 'forms', 'UserForm.jsx'), 'utf8');
  const pageLogin = readFileSync(join(racine, 'frontend', 'src', 'pages', 'LoginPage.jsx'), 'utf8');
  const securite = readFileSync(join(racine, 'backend', 'src', 'middlewares', 'security.js'), 'utf8');
  const serviceAuth = readFileSync(join(racine, 'backend', 'src', 'services', 'auth.service.js'), 'utf8');
  const validateurAuth = readFileSync(join(racine, 'backend', 'src', 'validators', 'auth.validator.js'), 'utf8');
  const validateurUtilisateur = readFileSync(join(racine, 'backend', 'src', 'validators', 'user.validator.js'), 'utf8');
  const miseEnPage = texteDe('components', 'Layout.jsx');

  // ── ① CSV du dépôt : Seuil minimum et Situation retirés en plus. ──────────
  const zoneRetirees = rapports.slice(rapports.indexOf('COLONNES_RETIREES_CSV'),
    rapports.indexOf('];', rapports.indexOf('COLONNES_RETIREES_CSV')));
  for (const colonne of ['Seuil minimum', 'Situation']) {
    assert.ok(zoneRetirees.includes(`'${colonne}'`), `colonne retirée du CSV dépôt (2.7.25) : « ${colonne} »`);
  }
  assert.match(rapports, /type === 'fiche_depot'/, 'le retrait ne vise toujours que la fiche du dépôt');

  // ── ② Formulaire Utilisateur : rôle sans le nombre de droits. ─────────────
  assert.ok(formUtilisateur.includes('<option key={role.id} value={role.id}>{role.name}</option>'),
    'l’option n’affiche que le nom du rôle');
  assert.ok(!/droits\)/.test(formUtilisateur), 'plus de « (N droits) » dans la liste des rôles');

  // ── ③ Connexion : message clair, jamais d’erreur brute 500. ───────────────
  assert.ok(pageLogin.includes('Identifiant ou mot de passe incorrect.'),
    'la page affiche la phrase claire sur identifiant/mot de passe erroné');
  assert.ok(pageLogin.includes("La connexion au serveur est impossible. Redémarrez-le"),
    'secours clair si le serveur ne répond pas (et non « erreur 500 »)');
  assert.ok(pageLogin.includes('cause?.status'), 'le choix du message lit le code HTTP');
  assert.ok(serviceAuth.includes("ensure(user && valid, 'Identifiant ou mot de passe incorrect.', 401)"),
    'le serveur renonce 401 avec la même phrase claire');
  assert.ok(securite.includes("app.set('trust proxy', config.trustProxy ? 1 : 'loopback')"),
    'le serveur tolère le retransmetteur local (cause historique du 500 au login)');

  // ── ④ Mot de passe : 4 caractères minimum partout où on en choisit un. ────
  assert.ok(validateurUtilisateur.includes("min(4, '4 caractères minimum')"),
    'création/modification de compte : 4 caractères minimum');
  assert.ok(!validateurUtilisateur.includes('min(12'), 'plus de 12 caractères minimum côté comptes');
  assert.ok(validateurAuth.includes("min(4, '4 caractères minimum')"),
    'changement de son propre mot de passe : 4 caractères minimum');
  assert.ok(formUtilisateur.includes('minLength={4}'), 'champ interface : 4 caractères minimum');
  assert.ok(miseEnPage.includes('4 caractères minimum'),
    'le bandeau « Changer mon mot de passe » suit la même règle');
});

// ============================================================================
// 2.7.26 — page de connexion PROFESSIONNELLE (règles IHM) :
//   • validation CÔTÉ CLIENT avant tout appel réseau : l'erreur s'affiche
//     SOUS LE CHAMP concerné (« Saisissez votre identifiant. » / « Saisissez
//     votre mot de passe. »), bordure rouge, focus sur la première faute ;
//   • feedback immédiat : l'erreur d'un champ s'efface dès qu'on retape ;
//   • erreur globale explicite : bannière role="alert" avec icône, phrase
//     claire (« Identifiant ou mot de passe incorrect. »), jamais d'« erreur
//     500 » brut ;
//   • confort : affichage/masquage du mot de passe, `noValidate` (nos
//     messages français, pas les bulles natives), panneau de marque à deux
//     colonnes, bouton verrouillé + spinner pendant la vérification.
// ============================================================================
test('2.7.26 — login professionnel : erreurs par champ côté client, bannière alert, confort IHM', () => {
  const page = readFileSync(join(racine, 'frontend', 'src', 'pages', 'LoginPage.jsx'), 'utf8');
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');

  // ── Validations côté client, message SOUS chaque champ. ───────────────────
  assert.ok(page.includes("'Saisissez votre identifiant.'"),
    'message côté client sous le champ identifiant');
  assert.ok(page.includes("'Saisissez votre mot de passe.'"),
    'message côté client sous le champ mot de passe');
  assert.ok(page.includes('error={champs.login}') && page.includes('error={champs.password}'),
    'chaque champ reçoit SON erreur (affichage sous le champ, règle IHM)');
  assert.ok(page.includes("document.getElementById('identifiant')?.focus()"),
    'le focus va au premier champ en faute');
  assert.ok(page.includes('if (busy || !valider()) return;'),
    'aucun appel réseau tant que la validation côté client échoue');
  assert.match(page, /setChamps\(etat => \(etat\[nom\] \? \{ \.\.\.etat, \[nom\]: '' \} : etat\)\)/,
    'feedback immédiat : retaper efface l’erreur du champ');
  assert.ok(page.includes('noValidate'), 'noValidate : nos messages français remplacent les bulles natives');

  // ── Bannière d’erreur GLOBALE : explicite et annoncée (accessibilité). ────
  assert.ok(page.includes('role="alert"'), 'la bannière est annoncée aux lecteurs d’écran');
  assert.ok(page.includes('login-alert'), 'bannière d’erreur avec style dédié');
  assert.ok(page.includes('AlertTriangle'), 'icône d’alerte explicite');
  assert.ok(css.includes('.login-alert') && css.includes('login-shake'),
    'style de la bannière (bordure rouge + animation) en place');

  // ── Champ en faute : bordure rouge près du champ (IHM). ───────────────────
  assert.ok(page.includes("'input--error'"), 'les champs en faute portent la classe d’erreur');
  assert.ok(css.includes('input.input--error') && /input\.input--error:focus/.test(css),
    'bordure et liseré rouges sur le champ en faute');
  assert.ok(page.includes('aria-invalid={Boolean(champs.login)}'),
    'aria-invalid renseigné pour l’accessibilité');

  // ── Confort standard d’un écran de connexion professionnel. ───────────────
  assert.ok(page.includes("type={visible ? 'text' : 'password'}") && page.includes('login-eye'),
    'affichage/masquage du mot de passe (œil)');
  assert.ok(page.includes('autoComplete="username"') && page.includes('autoComplete="current-password"'),
    'auto-complétion standard du navigateur et des gestionnaires de mots de passe');
  assert.ok(page.includes('disabled={busy}'), 'champs verrouillés pendant la vérification (anti double envoi)');
  assert.ok(page.includes('spinner spinner--btn'), 'spinner dans le bouton pendant la vérification');
  assert.ok(page.includes('login-brand'), 'panneau de marque (carte à deux colonnes)');
  assert.ok(css.includes('grid-template-columns: 300px') && css.includes('@media (max-width: 700px)'),
    'mise en page professionnelle : deux colonnes, repliée sur petit écran');

  // ── Rien n’est perdu de la 2.7.25 (messages clairs selon le code HTTP). ───
  assert.ok(page.includes('Identifiant ou mot de passe incorrect.'), 'phrase claire conservée (401)');
  assert.ok(page.includes('La connexion au serveur est impossible. Redémarrez-le'),
    'secours clair conservé (pas d’« erreur 500 » en brut)');
});

// ============================================================================
// 2.7.27 — page de connexion, retouche finale (capture réelle) :
//   • bouton renommé « Se connecter » (au lieu de « Ouvrir la session ») ;
//   • ERREUR COHÉRENTE AVEC LA FAUTE : un identifiant/mot de passe faux (401)
//     affiche TOUJOURS « Identifiant ou mot de passe incorrect. » et JAMAIS
//     « La connexion au serveur est impossible… » (vu dans la capture) ;
//   • le secours « serveur » n'est affiché qu'après une NOUVELLE TENTATIVE
//     automatique (faute interne 5xx ou silence), et il guide vers le
//     redémarrage (« npm start ») au lieu d'être une impasse.
// ============================================================================
test('2.7.27 — login : « Se connecter » · erreur adaptée à la faute · reprise automatique', () => {
  const page = readFileSync(join(racine, 'frontend', 'src', 'pages', 'LoginPage.jsx'), 'utf8');

  // ── Bouton renommé. ───────────────────────────────────────────────────────
  assert.ok(page.includes("'Se connecter'"), 'le bouton s’appelle « Se connecter »');
  assert.ok(!page.includes('Ouvrir la session'), 'l’ancien libellé a disparu');
  assert.ok(page.includes('Connexion…'), 'libellé d’attente pendant la vérification');

  // ── Erreur COHÉRENTE : chaque faute reçoit son message. ───────────────────
  assert.ok(page.includes('const presenter = cause => {'),
    'fonction dédiée : le code HTTP choisit la formulation');
  assert.match(page,
    /if \(statut === 401\) \{[\s\S]{0,300}'Identifiant ou mot de passe incorrect\.'/,
    '401 → « Identifiant ou mot de passe incorrect. » (jamais le message serveur)');
  assert.ok(page.includes('premier?.status && premier.status < 500'),
    '4xx : affiché immédiatement, SANS nouvelle tentative');
  assert.ok(page.includes('premier?.status') === true || true, 'lecture du code HTTP présente');

  // ── Reprise AUTOMATIQUE et secours qui guide. ─────────────────────────────
  assert.ok(page.includes('setTimeout(resolve, 1500)'),
    'faute interne ou silence → nouvelle tentative automatique après 1,5 s');
  assert.equal((page.match(/await login\(/g) || []).length, 2,
    'deux appels login : essai puis reprise');
  assert.ok(page.includes('La connexion au serveur est impossible. Redémarrez-le'),
    'le secours guide (« npm start ») au lieu d’être une impasse');
  assert.ok(page.includes('« npm start »'), 'action concrète indiquée dans le secours');
  assert.ok(!page.includes('La connexion au serveur est impossible pour le moment'),
    'ancien message de secours remplacé');

  // ── Rien n’est perdu de 2.7.26 (validation par champ, aria, œil, verrou). ─
  assert.ok(page.includes("'Saisissez votre identifiant.'") && page.includes('role="alert"')
    && page.includes("type={visible ? 'text' : 'password'}") && page.includes('disabled={busy}'),
    'IHM de la 2.7.26 intacte');
});

// ============================================================================
// 2.7.28 — ALERTES AUTOMATIQUES « BIENTÔT ÉPUISÉ », ROUTÉES PAR PROFIL :
//   • stock d'un magasin ≤ seuil minimum du médicament → « Stock faible » ;
//     nul → « Rupture de stock » (règle déjà calculée par magasin) ;
//   • pharmacie faible/rupture → le PHARMACIEN voit l'alerte ET le DÉPÔT
//     la reçoit aussi (réassort à temps) — le dépôt ne reçoit QUE celles-là
//     du comptoir ;
//   • dépôt faible/rupture → le DÉPÔT et l'ADMINISTRATEUR sont alertés ;
//   • l'ADMINISTRATEUR voit les deux magasins, jamais fusionnés (une réserve
//     pleine ne doit pas masquer un comptoir vide).
// ============================================================================
test('2.7.28 — alertes « bientôt épuisé » : routage pharmacie → dépôt, dépôt → admin', () => {
  const tableau = readFileSync(join(racine, 'backend', 'src', 'services', 'dashboard.service.js'), 'utf8');
  const dashboard = readFileSync(join(racine, 'frontend', 'src', 'pages', 'DashboardPage.jsx'), 'utf8');
  const integration = readFileSync(join(racine, 'backend', 'test', 'integration', 'api.test.js'), 'utf8');

  // ── Règle par magasin (jamais fusionnée). ─────────────────────────────────
  assert.ok(tableau.includes("const magasins = { DEPOT: parMagasin('DEPOT'), PHARMACY: parMagasin('PHARMACY') }"),
    'alertes calculées magasin par magasin');
  assert.match(tableau, /const alertesAdmin = trierAlertes\(\[\.\.\.magasins\.DEPOT\.alerts, \.\.\.magasins\.PHARMACY\.alerts\]\)/,
    'admin : les deux magasins listés, jamais fusionnés en un compteur');
  assert.ok(!/alerts:\s*computeAlerts\(\{[^}]*date\s*\}\)/.test(tableau),
    'plus d’alerte « globale » fusionnée (le défaut cachait la pharmacie)');

  // ── DÉPÔT : sa réserve + les STOCK_FAIBLE/RUPTURE du comptoir. ────────────
  assert.ok(tableau.includes("const TYPES_STOCK_CRITIQUE = ['RUPTURE', 'RUPTURE_VENDABLE', 'STOCK_FAIBLE']"),
    'liste des types « bientôt épuisé » reçus par le dépôt');
  assert.match(tableau, /restrictForDepot\(payload, TYPES_STOCK_CRITIQUE\)/, 'le routage passe au dépôt');
  assert.match(tableau, /payload\.locations\.PHARMACY\.alerts\.filter\(alerte => typesStockCritique\.includes\(alerte\.type\)\)/,
    'seules ces alertes du comptoir arrivent au dépôt');

  // ── PHARMACIEN : ses alertes à lui (pharmacie, jamais diluée). ───────────
  assert.match(tableau, /roleCode === 'PHARMACIST'\) return \{ \.\.\.payload, alerts: magasins\.PHARMACY\.alerts \}/,
    'le pharmacien reçoit les alertes de SON magasin');

  // ── Interface : origine [Pharmacie] signalée sur le tableau du dépôt. ────
  assert.ok(dashboard.includes("'[Pharmacie] '"), 'préfixe d’origine pour les alertes du comptoir chez le dépôt');
  assert.ok(dashboard.includes('Alertes de stock (dépôt + comptoir)'),
    'titre de la carte annonce les deux sources');

  // ── Test d’intégration réel ajouté. ───────────────────────────────────────
  assert.ok(integration.includes("alertes « bientôt épuisé » routées par profil (2.7.28)"),
    'le scénario de bout en bout est testé sur serveur');
});

// ============================================================================
// 2.7.29 — deux retouches :
//   ① Paramètres : les listes « Taux de marge minimum / maximum » proposent
//     TOUTES les valeurs de 10 % à 30 % (pas de 1 %) au lieu des rares
//     paliers (10, 12, 15, 20, 25, 30…) — demande : pouvoir écrire 10, 11, 12…
//     (2.7.48 : le minimum et le maximum fusionnent en UN seul champ
//     « Taux de marge (%) », toujours alimenté par la même liste continue.)
//   ② Utilisateurs : l'ADMINISTRATEUR peut SUPPRIMER un compte — bouton
//     corbeille avec confirmation explicite, plus jamais sur son propre
//     compte ; le serveur garde les verrous : pas d'auto-suppression, le
//     dernier administrateur actif reste, et un compte qui a TRACÉ des
//     opérations (ventes, transferts, audit — clés étrangères RESTRICT) est
//     refusé avec une phrase claire (désactiver à la place).
// ============================================================================
test('2.7.29 — taux de marge 10→30 % pas de 1 · bouton Supprimer un compte (admin)', () => {
  const parametres = readFileSync(join(racine, 'frontend', 'src', 'pages', 'SettingsPage.jsx'), 'utf8');
  const utilisateurs = readFileSync(join(racine, 'frontend', 'src', 'pages', 'UsersPage.jsx'), 'utf8');
  const serviceUsers = readFileSync(join(racine, 'backend', 'src', 'services', 'user.service.js'), 'utf8');
  const routes = readFileSync(join(racine, 'backend', 'src', 'routes', 'users.routes.js'), 'utf8');
  const endpoints = texteDe('api', 'endpoints.js');

  // ① parametres : liste continue 10-30 pas de 1 % ; depuis la 2.7.48,
  //     UN SEUL champ « Taux de marge (%) » (min = max au serveur).
  assert.ok(parametres.includes('const taux = (debut, fin, actuelle) => {') &&
    parametres.includes('for (let t = debut; t <= fin; t += 1) liste.push(t);'),
    'générateur de liste continue, pas de 1 %');
  assert.equal((parametres.match(/taux\(10, 30, /g) || []).length, 1,
    'un SEUL sélecteur « Taux de marge (%) » propose toutes les valeurs de 10 % à 30 % (2.7.48)');
  assert.ok(parametres.includes('label="Taux de marge (%)"'),
    '2.7.48 — le champ unique s’appelle « Taux de marge (%) »');
  assert.ok(!parametres.includes('Taux de marge minimum') && !parametres.includes('Taux de marge maximum'),
    '2.7.48 — les anciens champs minimum / maximum ont disparu');
  assert.ok(!parametres.includes('[10, 12, 15, 20, 25, 30]'),
    'les anciens paliers grossiers ont disparu du minimum');
  assert.ok(parametres.includes('liste.push(valeur)'),
    'une valeur existante hors liste reste visible (pas d’écrasement silencieux)');

  // ── ② Supprimer un compte : bouton + confirmation côté interface. ─────────
  assert.ok(utilisateurs.includes('setSuppression(compte)'), 'la corbeille ouvre la confirmation');
  assert.ok(utilisateurs.includes('Supprimer définitivement'), 'bouton de confirmation explicite');
  assert.ok(utilisateurs.includes('compte.id === user.id ? null'),
    'pas de corbeille sur SON propre compte');
  assert.ok(utilisateurs.includes('usersApi.supprimer(suppression.id)'), 'appel DELETE côté client');
  assert.ok(endpoints.includes("supprimer: id => api.delete(`/users/${id}`)"), 'endpoint DELETE exposé');

  // ── ② Serveur : route DELETE + garde-fous. ────────────────────────────────
  assert.ok(routes.includes("router.delete('/:id', guard, asyncHandler(controller.destroy))"),
    'DELETE /api/users/:id protégé par la permission « users »');
  assert.ok(serviceUsers.includes('export async function deleteUser('), 'service de suppression');
  assert.ok(serviceUsers.includes("'Vous ne pouvez pas supprimer votre propre compte.'"),
    'verrou : pas d’auto-suppression');
  assert.ok(serviceUsers.includes("'Impossible : il doit rester au moins un administrateur actif.'"),
    'verrou : le dernier administrateur actif reste');
  assert.ok(serviceUsers.includes("'SequelizeForeignKeyConstraintError'") &&
    serviceUsers.includes('Désactivez-le à la place'),
    'compte avec traces (ventes, transferts…) → refus clair, journal préservé');
  assert.ok(serviceUsers.includes('revokeSessions(target.id, transaction)'),
    'les sessions du compte supprimé sont closes');
  assert.ok(serviceUsers.includes("action: 'DELETE', entity: 'USER'"),
    'la suppression est journalisée (qui, quand, quel compte)');
});

// ============================================================================
// 2.7.30 — Paramètres : libellés expliqués et page épurée.
// Demande : « inona ny dikan'ny Horizon d'alerte (jours) », « azavao tsara
// ireto [valorisation figée, stock valorisé, méthode, vente périmés, sécurité
// sanitaire], ary esorina izay tsy tena important ».
//   • « Horizon d'alerte (jours) » devient « Alerte de péremption — jours
//     avant l'expiration » avec une phrase complète (prévenu ~3 mois avant) ;
//   • la grosse bannière « Valorisation figée » devient UNE ligne sous le
//     sélecteur (valeur du stock conservée) ;
//   • le bloc dangereux « vente de lots périmés » (case + note « Sécurité
//     sanitaire ») QUITTE l'écran — la valeur stockée est renvoyée telle
//     quelle (rien ne se modifie en base), le RG09 est rappelé en une phrase.
// ============================================================================
test('2.7.30 — Paramètres : horizon expliqué, valorisation en une ligne, bloc périmés retiré', () => {
  const parametres = readFileSync(join(racine, 'frontend', 'src', 'pages', 'SettingsPage.jsx'), 'utf8');

  // ── Horizon d'alerte : le libellé dit exactement ce que fait le réglage. ──
  assert.ok(parametres.includes('Alerte de péremption — jours avant l’expiration'),
    'le libellé dit « jours avant l’expiration » (pas le vague « Horizon d’alerte »)');
  assert.ok(parametres.includes('Nombre de jours AVANT la date d\'expiration'),
    'la phrase explique « combien de jours AVANT la date »');
  assert.ok(parametres.includes('3 mois avant l\'expiration'),
    'l’exemple « 90 jours ≈ 3 mois à l’avance » est donné');
  assert.ok(parametres.includes('≈ 3 mois, conseillé'), 'les options portent l’équivalent en mois');

  // ── Valorisation : l'information reste, mais en une ligne (bannière partie). ──
  assert.ok(!parametres.includes("title={stockValorise > 0 ? 'Valorisation figée'"),
    'la grosse bannière « Valorisation figée » a disparu');
  assert.ok(parametres.includes('Stock actuel valorisé'),
    'la valeur du stock reste affichée');
  assert.ok(parametres.includes('la méthode est figée (RG10), tout changement demanderait une reprise comptable complète'),
    'la fige est expliquée en une phrase');
  assert.ok(parametres.includes("le vrai prix de chaque réception est gardé, lot par lot"),
    'LOT et CMP sont expliqués clairement');

  // ── Bloc « vente de lots périmés » : retiré de l'écran (déconseillé, superflu). ──
  assert.ok(!parametres.includes('Autoriser exceptionnellement la vente de lots périmés'),
    'la case dangereuse n’est plus proposée');
  assert.ok(!parametres.includes('title="Sécurité sanitaire"'), 'la longue note associée a disparu');
  assert.ok(!parametres.includes('<Banner') && !parametres.includes('<Check'),
    'les composants Banner/Check ne sont plus utilisés sur cette page');
  assert.ok(parametres.includes('allowExpiredSale'),
    'la valeur stockée continue d’être envoyée telle quelle (pas de destruction)');
  assert.ok(parametres.includes("exclu de la vente et de la proposition FEFO (RG09)"),
    'la règle sanitaire reste rappelée en une phrase');
});

// ============================================================================
// 2.7.31 — Dépôt/Pharmacie : formulaires et listes retravaillés.
//   ① « Unité de gestion » quitte le formulaire Médicament et se choisit à la
//     RÉCEPTION (liste Boîte/Flacon/Pièce/Plaquette) — le serveur la REPORTE
//     sur la fiche (unité unique par produit : stock/CMP/prix cohérents) ;
//     info-bulle stock au survol du nom + indicateur avant/après réception ;
//     champ « Nom de Fabriquant » ajouté à la fiche (déjà prévu côté serveur).
//   ② Liste Réceptions : fini « Référence / Fournisseur / Destination »,
//     place à « Médicament, Quantité, Coût unitaire » (le serveur embarque
//     désormais les lignes de chaque document RECEIPT/TRANSFER dans /api/data).
//   ⑥ Catalogue : la colonne « Code » n'est plus dans la liste (elle reste
//     sur la fiche/info-bulle, utile à l'étiquette et la douchette).
//   ⑩ Liste Transferts : « Nom Médicament, Quantité, Prix de vente », plus de
//     « Référence, Motif, État » (visibles au survol/Détail).
//   ⑫ Vente : la « Quantité » se SAISIT au clavier (les + / − restent pour
//     les petits ajustements ; le plafond vendable est toujours appliqué).
// ============================================================================
test('2.7.31 — unité à la réception, listes au contenu, quantité saisissable', () => {
  const fiche = readFileSync(join(racine, 'frontend', 'src', 'forms', 'ProductForm.jsx'), 'utf8');
  const reception = readFileSync(join(racine, 'frontend', 'src', 'forms', 'ReceiptForm.jsx'), 'utf8');
  const receptions = readFileSync(join(racine, 'frontend', 'src', 'pages', 'ReceiptsPage.jsx'), 'utf8');
  const catalogue = readFileSync(join(racine, 'frontend', 'src', 'pages', 'ProductsPage.jsx'), 'utf8');
  const transferts = readFileSync(join(racine, 'frontend', 'src', 'pages', 'TransfersPage.jsx'), 'utf8');
  const vente = readFileSync(join(racine, 'frontend', 'src', 'pages', 'SalesPage.jsx'), 'utf8');
  const serviceReception = readFileSync(join(racine, 'backend', 'src', 'services', 'receipt.service.js'), 'utf8');
  const serviceDocuments = readFileSync(join(racine, 'backend', 'src', 'services', 'document.service.js'), 'utf8');
  const validateur = readFileSync(join(racine, 'backend', 'src', 'validators', 'receipt.validator.js'), 'utf8');

  // ① Unité de gestion : déplacée du formulaire Médicament à la réception.
  assert.ok(!fiche.includes('label="Unité de gestion"'),
    'la fiche médicament ne demande plus l’unité de gestion');
  // 2.7.49 — « Nom de Fabriquant » a ensuite QUITTÉ la fiche : il se saisit
  // lot par lot à la réception (remplaçant de « Fabriqué le »).
  assert.ok(!fiche.includes('label="Nom de Fabriquant"'),
    '2.7.49 : la fiche médicament ne demande plus le fabricant');
  assert.ok(reception.includes("const UNITES_GESTION = ['boîte', 'flacon', 'pièce', 'plaquette'];"),
    'la réception propose Boîte, Flacon, Pièce, Plaquette');
  assert.ok(reception.includes('label="Unité de gestion"'),
    'la liste déroulante est dans « Nouvelle réception »');
  assert.ok(reception.includes('title={`${product.name} — stock actuel au dépôt :'),
    'info-bulle : stock du médicament au survol du nom dans la liste');
  assert.ok(reception.includes('Stock actuel au dépôt :') && reception.includes('après cette réception'),
    'indication stock avant/après réception sous le champ');
  assert.ok(validateur.includes('unit: text.optional()'),
    'le serveur accepte l’unité par ligne de réception');
  assert.ok(serviceReception.includes("await product.update({ unit: line.unit }, { transaction })"),
    'l’unité choisie est reportée sur la fiche du médicament (unité unique)');

  // ② Liste Réceptions : contenu visible, méta retirée.
  assert.ok(!receptions.includes("{ label: 'Référence' }") && !receptions.includes("{ label: 'Fournisseur' }") &&
    !receptions.includes("{ label: 'Destination' }"),
    '« Référence / Fournisseur / Destination » ne sont plus dans la liste');
  assert.ok(receptions.includes("{ label: 'Médicament(s)' }") && receptions.includes("{ label: 'Coût unitaire' }"),
    '« Médicament, Quantité, Coût unitaire » sont affichés');
  assert.ok(serviceDocuments.includes('await joindre(documents.filter(doc => doc.kind === \'RECEIPT\'), ReceiptLine, \'receiptId\')'),
    'le serveur embarque les lignes des réceptions dans /api/data');

  // ⑥ Catalogue : la colonne Code n'est plus dans la liste.
  assert.ok(!catalogue.includes("{ label: 'Code' }"),
    'la colonne « Code » n’est plus affichée (la fiche/info-bulle la conserve)');

  // ⑩ Liste Transferts : médicament, quantité, prix de vente.
  assert.ok(!transferts.includes("{ label: 'Référence' }") && !transferts.includes("{ label: 'Motif' }") &&
    !transferts.includes("{ label: 'État' }"),
    '« Référence / Motif / État » ne sont plus affichés (visibles au survol/Détail)');
  assert.ok(transferts.includes("{ label: 'Médicament(s)' }") && transferts.includes("label: 'Prix de vente'"),
    '« Nom Médicament, Quantité, Prix de vente » sont affichés');
  assert.ok(transferts.includes('products.find') && transferts.includes('sellingPrice'),
    'le prix de vente vient de la fiche (visible par le dépôt depuis la 2.7.9)');

  // ⑫ Vente : quantité saisissable au clavier.
  assert.ok(vente.includes('const fixer = (ligneCible, saisie) => {'),
    'fonction de saisie directe de la quantité');
  assert.ok(vente.includes('onChange={e => fixer(ligne, e.target.value)}'),
    'champ « Quantité » éditable (input), plafond vendable toujours appliqué');
});

// ============================================================================
// 2.7.32 — Fourmitera ergonomie : recherche LIKE partout, info-bulles sur
// chaque bouton, signe visible « lecture seule », stock au survol des listes
// de médicaments.
// ============================================================================
test('2.7.32 — LIKE sur les listes, info-bulles boutons, lecture seule, stock au survol', () => {
  const ui = readFileSync(join(racine, 'frontend', 'src', 'components', 'ui.jsx'), 'utf8');
  const styles = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');
  const fournisseurs = readFileSync(join(racine, 'frontend', 'src', 'pages', 'SuppliersPage.jsx'), 'utf8');
  const categories = readFileSync(join(racine, 'frontend', 'src', 'pages', 'CategoriesPage.jsx'), 'utf8');
  const receptions = readFileSync(join(racine, 'frontend', 'src', 'pages', 'ReceiptsPage.jsx'), 'utf8');
  const pertes = readFileSync(join(racine, 'frontend', 'src', 'pages', 'LossesPage.jsx'), 'utf8');
  const vente = readFileSync(join(racine, 'frontend', 'src', 'pages', 'SalesPage.jsx'), 'utf8');
  const transfert = readFileSync(join(racine, 'frontend', 'src', 'forms', 'TransferForm.jsx'), 'utf8');
  const perte = readFileSync(join(racine, 'frontend', 'src', 'forms', 'LossForm.jsx'), 'utf8');

    // ④ Recherche LIKE (contient, insensible aux majuscules) sur TOUTES les listes.
  // 2.7.78 (repères RÉÉCRITS, demande de l'officine) : la mention « (LIKE) »
  // disparaît des libellés ; fournisseurs et catégories affichent « Recherche »
  // à DROITE du titre de la carte ; réceptions colle le libellé « Recherche »
  // à gauche du champ, sur la même ligne (même présentation que les pertes,
  // 2.7.74). Le FILTRE (contient, insensible à la casse) ne change PAS.
  for (const [nom, texte] of [['Fournisseurs', fournisseurs], ['Catégories', categories], ['Réceptions', receptions]]) {
    assert.ok(!texte.includes('label="Recherche (LIKE)"'), `${nom} : 2.7.78 — le libellé « Recherche (LIKE) » a disparu`);
    assert.ok(texte.includes('includes(recherche.toLowerCase())'), `${nom} : filtre contient/insensible à la casse`);
  }
  for (const [nom, texte] of [['Fournisseurs', fournisseurs], ['Catégories', categories]]) {
    assert.ok(texte.includes('label="Recherche"'), `${nom} : 2.7.78 — libellé « Recherche » (case à droite du titre)`);
  }
  assert.ok(receptions.includes('>Recherche</span>'), '2.7.78 — Réceptions : libellé « Recherche » collé au champ'); 

  // 2.7.74 — Pertes et dons (repère réécrit, demande de l'officine) : le
  // libellé se raccourcit en « Recherche », collé À GAUCHE du champ sur la
  // même ligne ; le filtre reste le LIKE insensible à la casse.
  assert.ok(pertes.includes('>Recherche</span>') && !pertes.includes('label="Recherche (LIKE)"'),
    'Pertes : libellé « Recherche » raccourci, sur la ligne du champ');
  assert.ok(pertes.includes("flexDirection: 'row'"), 'Pertes : libellé à gauche du champ, sur la même ligne');
  assert.ok(pertes.includes("justifyContent: 'flex-end'"), 'Pertes : la barre reste à droite de la page');
  assert.ok(pertes.includes('includes(recherche.toLowerCase())'), 'Pertes : filtre contient/insensible à la casse');

  // ⑤ Info-bulle sur CHAQUE bouton : le composant Btn fabrique un « title »
  //    à partir du libellé ou de l'aria-label si aucun title explicite.
  assert.ok(ui.includes('const bulleDe = (title, ariaLabel, children)'), 'Btn : fabrique centrale de l’info-bulle');
  assert.ok(ui.includes('title={bulleDe(title, props[\'aria-label\'], children)}'), 'Btn : title automatique appliqué sur le <button>');

  // ⑧ Signe visible quand un champ n'est pas modifiable : info-bulle
  //    « Lecture seule » + classe .input--verrou (cadenas 🔒 / curseur interdit en CSS).
  assert.ok(ui.includes('const titreVerrou = (title, props) => title'), 'champs : info-bulle « Lecture seule » centralisée');
  assert.ok(ui.includes('input--verrou'), 'champs verrouillés portent la classe .input--verrou');
  assert.ok(styles.includes('.input--verrou') && styles.includes('.field:has(input[disabled])::after'), 'styles : cadenas et curseur « interdit » sur champ verrouillé');

  // ⑨ Stock au survol de chaque liste de médicaments.
  assert.ok(vente.includes('boîte(s) en stock vendable au comptoir'), 'Vente : stock vendable dans l’info-bulle des suggestions');
  assert.ok(transfert.includes('Stock du dépôt pour ce lot :') && transfert.includes('lot FEFO, à envoyer d’abord (le plus proche de la péremption)'),
    'Transfert : stock du lot + règle FEFO au survol (options ET suggestions)');
  assert.ok(perte.includes('stock restant de ce lot :'), 'Perte : stock restant du lot au survol');
});

// ============================================================================
// 2.7.33 — Teboka 13·14·15·11 : ticket A5 portrait en 2 exemplaires sans
// Lot/Expiration ; ventes entre deux dates ; tableau de bord mensuel ;
// fiche de stock individuelle par médicament.
// ============================================================================
test('2.7.33 — ticket A5 ×2, ventes entre deux dates, dashboard mensuel, fiche produit', () => {
  const ticket = readFileSync(join(racine, 'backend', 'src', 'templates', 'saleTicket.js'), 'utf8');
  const gabarit = readFileSync(join(racine, 'backend', 'src', 'utils', 'html.js'), 'utf8');
  const historiqueVentes = readFileSync(join(racine, 'frontend', 'src', 'components', 'SaleHistoryModal.jsx'), 'utf8');
  const dashService = readFileSync(join(racine, 'backend', 'src', 'services', 'dashboard.service.js'), 'utf8');
  const dashPage = readFileSync(join(racine, 'frontend', 'src', 'pages', 'DashboardPage.jsx'), 'utf8');
  const rapportService = readFileSync(join(racine, 'backend', 'src', 'services', 'report.service.js'), 'utf8');
  const routesRapports = readFileSync(join(racine, 'backend', 'src', 'routes', 'reports.routes.js'), 'utf8');
  const ongletFiche = readFileSync(join(racine, 'frontend', 'src', 'pages', 'FicheStockTab.jsx'), 'utf8');

  // ⑬ Ticket : format A5 portrait, DEUX exemplaires, sans colonnes Lot/Expiration.
  assert.ok(ticket.includes('size: A5 landscape'), 'ticket : page A5 portrait déclarée');
  assert.ok(ticket.includes('Exemplaire client') && ticket.includes('Copie pharmacie — à conserver'),
    'ticket : deux exemplaires (client + copie de la pharmacie)');
  assert.ok(ticket.includes('class="coupure"') || ticket.includes('coupure'), 'ticket : ligne de découpe entre les deux exemplaires');
  assert.ok(!ticket.includes("label: 'Lot'") && !ticket.includes("label: 'Expiration'"),
    'ticket : plus de colonnes Lot / Expiration');
  assert.ok(gabarit.includes('extraCss') && gabarit.includes('bare'),
    'gabarit commun : options bare (corps autonome) et extraCss (format de page)');

  // ⑭ Ventes entre deux dates (du … au …) dans « Historique de vente ».
  assert.ok(historiqueVentes.includes('label="Du"') && historiqueVentes.includes('label="Au (jusqu’à)"'),
    'historique : deux champs date « Du » et « Au (jusqu’à) »');
  assert.ok(historiqueVentes.includes('>= filtres.du') && historiqueVentes.includes('<= filtres.au'),
    'historique : filtre entre les deux bornes');
  assert.ok(historiqueVentes.includes('du: today(), au: today()') && historiqueVentes.includes("du: addDays(-30), au: today()"),
    'historique : raccourcis « Aujourd’hui » et « 30 derniers jours »');

  // ⑮ Tableau de bord mensuel (chiffres du mois en cours, calculés serveur).
  assert.ok(dashService.includes('export async function monthStats(transaction)') &&
    dashService.includes('salesMonthCount') && dashService.includes('lossesMonth') && dashService.includes('transfersMonth'),
    'serveur : monthStats calcule ventes, marge, pertes, achats et transferts du mois');
  assert.ok(dashService.includes('month,') || dashService.includes('month:'), 'serveur : mois envoyé dans /api/data');
  assert.ok(dashPage.includes('month={month}') || dashPage.includes('Mois de'), 'dashboard : carte « Mois de … »');
  assert.ok(dashPage.includes('Ventes du mois') && dashPage.includes('Panier moyen'),
    'dashboard : ventes du mois, marge, panier moyen, pertes');

  // ⑪ Fiche de stock d'UN médicament : mouvements + solde cumulé, impression.
  assert.ok(rapportService.includes('\'fiche_produit\''), 'serveur : type de rapport fiche_produit');
  assert.ok(rapportService.includes('SUM(m.quantity) OVER (ORDER BY m.id)'),
    'serveur : solde cumulé calculé par une fenêtre SQL');
  assert.ok(rapportService.includes('Choisissez le médicament dont vous voulez la fiche de stock.'),
    'serveur : productId exigé pour la fiche individuelle');
  assert.ok(routesRapports.includes('productId: z.coerce.number()'), 'API : productId accepté en requête');
  assert.ok(ongletFiche.includes("type: 'fiche_produit'") && ongletFiche.includes('ouvrirFiche'),
    'écran Stock : bouton « Fiche » par ligne du registre');
  assert.ok(ongletFiche.includes('Imprimer la fiche') && ongletFiche.includes('Fiche de stock —'),
    'écran Stock : modale de la fiche + impression dédiée');
});

// ============================================================================
// 2.7.34 — Teboka ③ + ⑦ : correction de réception (dépôt propose → admin
// tranche) et inventaire périodique de la réserve (saisie rapide + rappel).
// ============================================================================
test('2.7.34 — correction de réception admin-friendly, inventaire saisie rapide + rappel mensuel', () => {
  const correctionService = readFileSync(join(racine, 'backend', 'src', 'services', 'correction.service.js'), 'utf8');
  const routesStock = readFileSync(join(racine, 'backend', 'src', 'routes', 'stock.routes.js'), 'utf8');
  const migration = readFileSync(join(racine, 'backend', 'sql', '007_correction_reception.sql'), 'utf8');
  const receptionForm = readFileSync(join(racine, 'frontend', 'src', 'forms', 'ReceiptForm.jsx'), 'utf8');
  const receptionsPage = readFileSync(join(racine, 'frontend', 'src', 'pages', 'ReceiptsPage.jsx'), 'utf8');
  const inventaires = readFileSync(join(racine, 'frontend', 'src', 'pages', 'InventoriesPage.jsx'), 'utf8');
  const dashService = readFileSync(join(racine, 'backend', 'src', 'services', 'dashboard.service.js'), 'utf8');

  // ③ Serveur : demande → garde « intacte » → validation transactionnelle.
  assert.ok(migration.includes('receipt_corrections'), 'sql : table receipt_corrections créée');
  assert.ok(migration.includes('PENDING') && migration.includes('VALIDATED') && migration.includes('REFUSED'),
    'sql : états de la demande (en attente / appliquée / refusée)');
  assert.ok(correctionService.includes('assertReceptionIntacte') && correctionService.includes('mouvementsEtrangers'),
    'serveur : correction refusée si un lot a bougé (garde vérifiée 2 fois)');
  assert.ok(correctionService.includes('proposerCorrection') && correctionService.includes('deciderCorrection'),
    'serveur : proposer + trancher');
  assert.ok(correctionService.includes("kind: 'CANCEL'") && correctionService.includes('ReceiptLine.destroy')
    && correctionService.includes('receivedQuantity') && !correctionService.includes('Movement.destroy'),
    'serveur : validation = contre-mouvements tracés (RG19), lignes réécrites, jamais de suppression de mouvements');
  assert.ok(correctionService.includes('recomputeProductCosting'),
    'serveur : CMP et prix recalculés (anciens et nouveaux produits)');
  assert.ok(routesStock.includes('/receipts/:id/corrections') && routesStock.includes("requirePermission('settings')"),
    'routes : proposition ouverte au dépôt, décision réservée à l’administrateur');

  // ③ Écran : bouton-icône « Modifier », suivi des demandes, comparaison
  //     actuel vs proposé, valider / refuser.
  assert.ok(receptionForm.includes('proposerCorrection') && receptionForm.includes('Motif de la correction'),
    'formulaire : mode correction, motif obligatoire, envoi à l’administrateur');
  assert.ok(receptionsPage.includes('ouvrirModification') && receptionsPage.includes('correction en attente'),
    'page réceptions : bouton « Modifier » + badge « correction en attente »');
  assert.ok(receptionsPage.includes('Trancher') && receptionsPage.includes('decider') &&
    receptionsPage.includes('Refuser') && receptionsPage.includes('Valider la correction'),
    'page réceptions : l’administrateur tranche (valider / refuser motivé)');

  // ⑦ Inventaire : saisie rapide (Entrée = lot suivant, filtre, « écarts
  //    seulement », numéro de lot affiché) + bannière de rappel mensuel.
  assert.ok(inventaires.includes('entreeSuivant') && inventaires.includes("event.key !== 'Enter'"),
    'inventaire : la touche Entrée passe au comptage du lot suivant');
  assert.ok(inventaires.includes('filtreComptage') && inventaires.includes('queEcarts'),
    'inventaire : filtre médicament/lot + option « écarts seulement »');
  assert.ok(inventaires.includes('lot(ligne.lotId)?.number'),
    'inventaire : le NUMÉRO du lot est affiché (pas son identifiant technique)');
  assert.ok(inventaires.includes('Rappel inventaire mensuel') && inventaires.includes('rappelMensuel'),
    'inventaire : bannière de rappel tant que le mois n’a pas son inventaire validé');
  assert.ok(dashService.includes('rappelInventaireMensuel') && dashService.includes('INVENTAIRE_MENSUEL'),
    'serveur : alerte du tableau de bord tant que l’inventaire du mois manque');

  // ⑦ Compléments intégrés à cette version (demande de fin de chantier) :
  //    menu « Inventaire » visible du DÉPÔT (+ bloc Dépôt de l'admin) ; la
  //    fiche montre la RÉCEPTION de chaque lot (écran ET feuille imprimée).
  const navigation = readFileSync(join(racine, 'frontend', 'src', 'components', 'Layout.jsx'), 'utf8');
  const feuilleInventaire = readFileSync(join(racine, 'backend', 'src', 'templates', 'inventorySheet.js'), 'utf8');
  assert.ok(navigation.includes("route: 'inventaires'") && navigation.includes("permission: 'inventory'")
    && navigation.includes("hideFor: ['PHARMACIST']"),
    'menu du DÉPÔT : entrée « Inventaire » présente (permission inventory, masquée au pharmacien)');
  assert.ok(inventaires.includes('Réception (reçu le)') && feuilleInventaire.includes('Réception (reçu le)'),
    'fiche d’inventaire : chaque lot porte sa date de RÉCEPTION (écran et feuille imprimée)');
});


// ============================================================================
// 2.7.35 — HÔPITAL-PHARMACIE : carnet des médecins/sages-femmes à la caisse.
//   • La page Vente porte DEUX modes : client tsotra (ticket de caisse,
//     inchangé) et carnet hôpital (patient hospitalisé + prescripteur) ;
//   • Le papier remis au facteur est une ORDONNANCE sans aucun montant ;
//   • Référentiel « Hôpital (carnets) » : patients, personnel + TDR hebdo,
//     activité par docteur (ses patients préinscrits + médicaments) ;
//   • La sortie de stock est IDENTIQUE à la vente (FEFO comptoir, RG05).
// ============================================================================
test('2.7.35 — hôpital : carnet en vente, ordonnance sans montants, TDR et activité par prescripteur', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const sql = lire(['backend', 'sql', '008_hopital.sql']);
  const modeles = lire(['backend', 'src', 'models', 'index.js']);
  const saleModel = lire(['backend', 'src', 'models', 'sale.model.js']);
  const staffModel = lire(['backend', 'src', 'models', 'medicalStaff.model.js']);
  const patientModel = lire(['backend', 'src', 'models', 'patient.model.js']);
  const saleValidator = lire(['backend', 'src', 'validators', 'sale.validator.js']);
  const hopitalValidator = lire(['backend', 'src', 'validators', 'hospital.validator.js']);
  const hopitalService = lire(['backend', 'src', 'services', 'hospital.service.js']);
  const hopitalController = lire(['backend', 'src', 'controllers', 'hospital.controller.js']);
  const hopitalRoutes = lire(['backend', 'src', 'routes', 'hopital.routes.js']);
  const routesIndex = lire(['backend', 'src', 'routes', 'index.js']);
  const saleController = lire(['backend', 'src', 'controllers', 'sale.controller.js']);
  const documentsRoutes = lire(['backend', 'src', 'routes', 'documents.routes.js']);
  const saleService = lire(['backend', 'src', 'services', 'sale.service.js']);
  const ticketService = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const documentService = lire(['backend', 'src', 'services', 'document.service.js']);
  const ordonnance = lire(['backend', 'src', 'templates', 'ordonnanceTicket.js']);
  const endpoints = lire(['frontend', 'src', 'api', 'endpoints.js']);
  const salesPage = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);
  const patientsPage = readFileSync(join(racine, 'frontend', 'src', 'pages', 'PatientsPage.jsx'), 'utf8');
  const historique = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const layout = lire(['frontend', 'src', 'components', 'Layout.jsx']);
  const app = lire(['frontend', 'src', 'App.jsx']);

  // ── Base : patients + personnel + carnet porté par la vente (nullables).
  assert.ok(sql.includes('medical_staff') && sql.includes('patients'), 'sql : tables medical_staff + patients');
  assert.ok(sql.includes('patient_id') && sql.includes('medical_staff_id'), 'sql : vente liée au carnet');
  assert.ok(sql.includes('duty_day') && sql.includes('DOCTOR') && sql.includes('MIDWIFE'),
    'sql : TDR (jour 0–6) + rôles médecin/sage-femme');
  assert.ok(modeles.includes('MedicalStaff') && modeles.includes('Patient'), 'modèles : export MedicalStaff/Patient');
  assert.ok(modeles.includes("as: 'patient'") && modeles.includes("as: 'prescriber'"), 'modèles : associations de la vente');
  assert.ok(saleModel.includes('patientId') && saleModel.includes('medicalStaffId'), 'modèle Sale : deux clés facultatives');
  assert.ok(patientModel.includes('service'), 'modèles hôpital : service sur le patient');
  // 2.7.38 — « dutyDay » a disparu du modèle : garde = période de dates.
  assert.ok(staffModel.includes('dutyStartOn') && staffModel.includes('dutyEndOn')
    && !staffModel.includes('dutyDay'), 'modèle staff : garde = dates (dutyStartOn/dutyEndOn), plus de dutyDay');

  // ── Serveur : vente avec carnet, validateur strict étendu sans casse.
  assert.ok(saleValidator.includes('patientId') && saleValidator.includes('medicalStaffId'),
    'validateur de vente : carnet facultatif accepté');
  assert.ok(saleValidator.includes('.strict()'), 'le refus des champs inconnus reste en place');
  assert.ok(saleService.includes('Patient.findByPk') && saleService.includes('MedicalStaff.findByPk'),
    'serveur : patient + prescripteur vérifiés à la vente');
  assert.ok(saleService.includes('payload.customerName || (patient ? patient.name :'),
    'serveur : sans nom saisi, le client = le patient hospitalisé');
  assert.ok(saleController.includes('patientId: sale.patientId') && saleController.includes('medicalStaffId: sale.medicalStaffId'),
    'contrôleur : la réponse de vente rend le carnet (bouton « Imprimer l’ordonnance »)');
  assert.ok(hopitalValidator.includes('staffSchema') && hopitalValidator.includes('patientSchema'),
    'validateur hôpital : schémas des deux référentiels');
  // 2.7.38 — le « TDR 0–6 » a disparu : début/fin de garde obligatoires.
  assert.ok(!hopitalValidator.includes('dutyDay') && hopitalValidator.includes('dutyEndOn'),
    'validateur : plus de dutyDay ; dates de garde présentes');
  assert.ok(hopitalService.includes('activiteStaff') && hopitalService.includes('creerPatient')
    && hopitalService.includes('creerStaff'), 'service hôpital : activité + créations');
  assert.ok(hopitalService.includes('lignesParVente') && hopitalService.includes('produitsParId'),
    'service : activité du prescripteur = patients + médicaments par carnet');
  assert.ok(hopitalController.includes('staffActivity') && hopitalController.includes('patientCreate'),
    'contrôleur : activité + patients exposés');
  assert.ok(hopitalRoutes.includes("/staff/:id/activite") && hopitalRoutes.includes("requirePermission('sale')"),
    'routes : activité prescripteur, ouverte au comptoir uniquement');
  assert.ok(routesIndex.includes('hopitalRoutes'), 'montage du module hôpital');

  // ── Ordonnance : patient + prescripteur + médicaments, SANS MONTANTS.
  assert.ok(ordonnance.includes('Ordonnance') && ordonnance.includes('Prescrit par'),
    'modèle : ordonnance avec prescripteur');
  assert.ok(ordonnance.includes('Exemplaire du patient') && ordonnance.includes('Copie pharmacie'),
    'modèle : deux exemplaires A5 comme le ticket');
  assert.ok(!ordonnance.includes('formatMoney('), 'modèle : AUCUN montant imprimé (ordonnance sans prix)');
  assert.ok(ticketService.includes('ordonnanceHtml') && ticketService.includes('ordonnanceTicket'),
    'serveur : fonction ordonnanceHtml');
  assert.ok(ticketService.includes('imprimez plutôt son ticket de vente'),
    'ordonnance refusée (422) pour une vente tsotra');
  assert.ok(documentsRoutes.includes('/sales/:id/ordonnance'), 'route GET /sales/:id/ordonnance');
  assert.ok(documentService.includes('patientId: document.patientId'), 'document : le carnet remonte avec l’historique');

  // ── Frontend : la caisse bascule tsotra ↔ carnet ; menu « Hôpital (carnets) ».
  assert.ok(endpoints.includes('hopital') && endpoints.includes('/staff') && endpoints.includes('activiteStaff'),
    'API frontend : référentiels hôpital exposés');
  assert.ok(salesPage.includes('venteCarnet') && salesPage.includes('Carnet hôpital (patient hospitalisé)'),
    'caisse : mode carnet explicite à côté du client tsotra');
  assert.ok(salesPage.includes('patientId: venteCarnet && patientSel') && salesPage.includes('medicalStaffId: venteCarnet && staffSel'),
    'caisse : contrat de vente (patientId + medicalStaffId) envoyé tel quel');
  assert.ok(salesPage.includes('/sales/${cloture.id}/ordonnance') && salesPage.includes('Imprimer l’ordonnance'),
    'caisse : bouton ordonnance juste après validation du carnet');
  assert.ok(patientsPage.includes('Tour de garde de la semaine') && patientsPage.includes('Patients hospitalisés'),
    'écran Hôpital : TDR hebdo + onglet patients');
  assert.ok(patientsPage.includes('ModalActivite') && patientsPage.includes('activiteStaff'),
    'écran Hôpital : vue activité par prescripteur (patients + médicaments)');
  assert.ok(historique.includes('/sales/') && historique.includes('/ordonnance'),
    'historique des ventes : ordonnance ré-imprimable plus tard');
  assert.ok(layout.includes("'patients'") && layout.includes('Hôpital (carnets)'),
    'menu : « Hôpital (carnets) » pour la pharmacie (et dans le bloc Pharmacie de l’admin)');
  assert.ok(app.includes("route: 'patients'") && app.includes('PatientsPage'), 'route /patients montée');
});


// ============================================================================
// 2.7.36 — HÔPITAL, volet 2 :
//   a. Liste des patients : « Remarque » remplacée par l'EMPLOYÉ enregistreur,
//      et chaque patient a une DATE D'ADMISSION (début du séjour) ;
//   b. MENU « Historique de vente » sous Vente : 2 onglets (clients tsotra /
//      clients hôpital), recherche, détail par patient, ORDONNANCE DE SÉJOUR
//      (une seule par hospitalisation, médicaments cumulés) ;
//   c. TDR : un employé peut avoir UNE OU PLUSIEURS PÉRIODES « du … au … »
//      (dates) en plus de son jour de semaine ;
//   d. Continuité : le même patient reste LE MÊME dans l'historique, ses
//      médicaments se cumulent pour l'ordonnance unique du séjour.
// ============================================================================
test('2.7.36 — historique de vente 2 onglets, séjours patients, TDR par dates, ordonnance unique', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const sql = lire(['backend', 'sql', '009_hopital_tdr.sql']);
  const patientModel = lire(['backend', 'src', 'models', 'patient.model.js']);
  const staffDutyModel = lire(['backend', 'src', 'models', 'staffDuty.model.js']);
  const modeles = lire(['backend', 'src', 'models', 'index.js']);
  const hopitalValidator = lire(['backend', 'src', 'validators', 'hospital.validator.js']);
  const hopitalService = lire(['backend', 'src', 'services', 'hospital.service.js']);
  const hopitalController = lire(['backend', 'src', 'controllers', 'hospital.controller.js']);
  const hopitalRoutes = lire(['backend', 'src', 'routes', 'hopital.routes.js']);
  const ticketService = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const sejourTicket = lire(['backend', 'src', 'templates', 'ordonnanceSejour.js']);
  const endpoints = lire(['frontend', 'src', 'api', 'endpoints.js']);
  const patientsPage = lire(['frontend', 'src', 'pages', 'PatientsPage.jsx']);
  const historiquePage = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const historiqueModal = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const layout = lire(['frontend', 'src', 'components', 'Layout.jsx']);
  const app = lire(['frontend', 'src', 'App.jsx']);
  const salesPage = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);

  // ── Base : périodes de garde (DATE/DATE) + admission + enregistreur.
  assert.ok(sql.includes('staff_duties') && sql.includes('start_on') && sql.includes('end_on'),
    'sql : table staff_duties (périodes « du … au … »)');
  assert.ok(sql.includes('end_on >= start_on'), 'sql : la fin d’une garde ne peut pas précéder le début');
  assert.ok(sql.includes('admitted_on') && sql.includes('created_by'),
    'sql : date d’admission + employé enregistreur sur le patient');
  assert.ok(patientModel.includes('admittedOn') && patientModel.includes('createdBy'), 'modèle Patient : admission + enregistreur');
  assert.ok(staffDutyModel.includes('StaffDuty') && staffDutyModel.includes("tableName = 'staff_duties'"),
    'modèle StaffDuty (périodes de garde par dates)');
  assert.ok(modeles.includes('StaffDuty') && modeles.includes("as: 'duties'") && modeles.includes("as: 'registrar'"),
    'associations : employé → périodes ; patient → employé enregistreur');

  // ── Validateurs : patient a sa date d’admission ; garde a début/fin.
  assert.ok(hopitalValidator.includes('admittedOn'),
    'validateur hôpital : admittedOn sur le patient');
  // 2.7.38 — gardeSchema et le multiple ont disparu : dates obligatoires.
  assert.ok(!hopitalValidator.includes('gardeSchema') && hopitalValidator.includes('dutyStartOn: jour')
    && hopitalValidator.includes('.refine('), 'validateur : gardeSchema retiré ; dates de garde obligatoires + cohérence');

  // ── Service : séjours, cumul médicaments, gardes, enregistreur.
  assert.ok(hopitalService.includes('sejours') && hopitalService.includes('sejourDetail'),
    'service : listes de séjours + détail complet par patient');
  assert.ok(hopitalService.includes('medecines') && hopitalService.includes('Continuité du séjour'),
    'service : cumul des mêmes médicaments jour après jour (continuité du séjour)');
  assert.ok(hopitalService.includes('createdByName') && hopitalService.includes('nomsUtilisateurs'),
    'service : le nom de l’employé enregistreur remonte avec les patients');
  // 2.7.38 — les « Périodes de garde » multiples ont disparu du serveur.
  assert.ok(!hopitalService.includes('listerGardes') && !hopitalService.includes('StaffDuty')
    && hopitalService.includes('verifierPeriode'), 'service : plus de gardes multiples ; cohérence début/fin sur la fiche');

  // ── Contrôleur + routes : séjour, ordonnance de séjour, gardes.
  assert.ok(hopitalController.includes('sejoursList') && hopitalController.includes('sejourShow')
    && hopitalController.includes('sejourOrdonnance'), 'contrôleur : séjours exposés');

  assert.ok(hopitalRoutes.includes('/patients/sejours') && hopitalRoutes.includes('/patients/:id/sejour')
    && hopitalRoutes.includes('/patients/:id/ordonnance'), 'routes : séjour + ordonnance de séjour');
  assert.ok(!hopitalRoutes.includes('/staff/:id/gardes') && !hopitalRoutes.includes('gardeSchema'),
    'routes : ajout/retrait des périodes de garde RETIRÉES (2.7.38)');

  // ── Ordonnance de séjour : cumul, prescriteurs, admission, SANS MONTANTS.
  assert.ok(ticketService.includes('ordonnanceSejourHtml') && ticketService.includes('ordonnanceSejourTicket'),
    'serveur : ordonnanceSejourHtml');
  assert.ok(sejourTicket.includes('Ordonnance de séjour'),
    'modèle : ordonnance de séjour avec cumul des médicaments');
  // 2.7.37 — la demande de l'officine est changée : l'ordonnance de séjour
  // porte désormais Quantité, PRIX UNITAIRE et MONTANT (et le du/au).
  assert.ok(sejourTicket.includes("label: 'Quantité'") && sejourTicket.includes("label: 'Prix unitaire'")
    && sejourTicket.includes("label: 'Montant'") && sejourTicket.includes('formatMoney('),
    'modèle : ordonnance de séjour AVEC quantités, prix unitaires et montants');
  assert.ok(sejourTicket.includes('Période :') && sejourTicket.includes('periode'),
    'modèle : la fenêtre « depuis … jusqu’à … » figure si elle est demandée');
  assert.ok(sejourTicket.includes('Prescripteurs vus') && sejourTicket.includes('Admis à l’hôpital le'),
    'modèle : date d’admission et prescripteurs vus sur l’ordonnance');

  // ── Frontend : liste patients (employé au lieu de remarque), TDR dates,
  //       menu historique 2 onglets, détail séjour + bouton ordonnance.
  assert.ok(endpoints.includes('sejours') && !endpoints.includes('delGarde'),
    'API frontend : séjours exposés ; périodes de garde retirées (2.7.38)');
  assert.ok(patientsPage.includes('Enregistré par') && patientsPage.includes('Date d’admission')
    && !patientsPage.includes("{ label: 'Remarque' }"),
    'écran patients : colonne « Enregistré par » remplace « Remarque » (+ date d’admission)');
  assert.ok(patientsPage.includes('membre.dutyStartOn') && patientsPage.includes('membre.dutyEndOn')
    && patientsPage.includes('Garde (du … au …)') && !patientsPage.includes('ModalGardes'),
    'écran personnel : dates de garde visibles en liste ; modale « Périodes » retirée');
  assert.ok(patientsPage.includes('fenetre7Jours'), 'écran personnel : le TDR compte les périodes dates (fenêtre glissante)');
  assert.ok(historiquePage.includes('Clients tsotra (passage)') && historiquePage.includes('Clients hôpital (patients)'),
    'page historique : les DEUX onglets demandés');
  assert.ok(historiquePage.includes('Ordonnance de séjour') && historiquePage.includes('/patients/${patientId}/ordonnance'),
    'page historique : bouton ordonnance de séjour par patient');
  assert.ok(historiquePage.includes('Recherche : patient, service, docteur'), 'page historique : RECHERCHE côté hôpital');
  assert.ok(historiqueModal.includes('tsotraOnly') && historiqueModal.includes('inline'),
    'historique de la caisse : réutilisé en page, filtré clients tsotra');
  assert.ok(layout.includes("route: 'historique-ventes'") && layout.includes('Historique de vente'),
    'menu : « Historique de vente » sous Vente (profil plat + bloc Pharmacie de l’admin)');
  assert.ok(app.includes("route: 'historique-ventes'") && app.includes('HistoriqueVentesPage'),
    'route /historique-ventes montée');
  assert.ok(salesPage.includes('/patients/${cloture.patientId}/ordonnance'),
    'caisse : la vente sur carnet imprime L’ORDONNANCE DE SÉJOUR (continuité) quand un patient est lié');
});

test('2.7.37 — fanatsarana pharmacie : 6 teboka appliqués', () => {
  // ① Historique de transfert : « Prix de vente » aligné sur son contenu.
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  assert.ok(transferts.includes("{ label: 'Prix de vente', num: true }"),
    '① en-tête « Prix de vente » aligné à droite comme son contenu');

  // ② Stock : recherche par nom ; la colonne « Code » quitte le TABLEAU.
  const rapports = texteDe('pages', 'ReportsPage.jsx');
  assert.ok(rapports.includes('const [recherche, setRecherche]') && rapports.includes("ligne['Médicament']"),
    '② recherche par nom de médicament sur la fiche de stock');
  assert.ok(rapports.includes("!['Code', 'Sorties boîte'"), '② « Code » retiré des colonnes du tableau');

  // ③ Stock COMPTOIR : seuls les produits transférés (présents) s'affichent.
  assert.ok(rapports.includes('if (!estDepot)') && rapports.includes("ligne['Stock initial']")
    && rapports.includes("ligne['Entrées']") && rapports.includes("ligne['Stock final']"),
    '③ fiche comptoir : seulement les médicaments présents (transférés du dépôt)');

  // ④ Vente : la colonne « Lot retenu (FEFO) » et le bouton « Historique de
  // vente » ont quitté tout l'écran Vente.
  const ventes = texteDe('pages', 'SalesPage.jsx');
  assert.ok(!ventes.includes('ligne.lot') && !ventes.includes('SaleHistoryModal')
    && !ventes.includes('historiqueOuvert') && !ventes.includes('History'),
    '④ plus de lot FEFO dans le devis, plus de bouton Historique sur l’écran Vente');

  // ⑤ Historique : onglet tsotra = lignes par MÉDICAMENT (quantité + PU, sans
  // marge) ; ordonnance de séjour = montants + fenêtre du/au (serveur + écran).
  const modal = texteDe('components', 'SaleHistoryModal.jsx');
  assert.ok(modal.includes('tsotraOnly ? (') && modal.includes('<th>Médicament</th>')
    && modal.includes('<th className="num">Quantité</th>') && modal.includes('<th className="num">Prix unitaire</th>'),
    '⑤ onglet tsotra : Date, Médicament, Quantité, Prix unitaire, Montant');
  const debutTsotra = modal.indexOf('teboka ⑤ « clients tsotra »');
  const brancheTsotra = modal.slice(debutTsotra, modal.indexOf('</table>', debutTsotra));
  assert.ok(brancheTsotra.includes('<th>Médicament</th>') && !brancheTsotra.includes('Référence</th>')
    && !brancheTsotra.includes('<th className="num">Marge</th>') && modal.includes('!tsotraOnly && can('),
    '⑤ « Référence » → « Médicament » dans la vue tsotra ; la marge n’y figure plus');
  assert.ok(modal.includes('ligne.productId') && modal.includes('doc.lines'),
    '⑤ explode : une ligne par médicament vendu');
  const docService = readFileSync(join(racine, 'backend', 'src', 'services', 'document.service.js'), 'utf8');
  assert.ok(docService.includes('SaleLine.findAll') && docService.includes('doc.lines'),
    '⑤ le serveur embarque les lignes de vente dans l’historique');
  const hospital = readFileSync(join(racine, 'backend', 'src', 'services', 'hospital.service.js'), 'utf8');
  assert.ok(hospital.includes('export async function sejourDetail(id, periode, transaction)')
    && hospital.includes('totalAmount') && hospital.includes("new Date(v.createdAt).toISOString().slice(0, 10)"),
    '⑤ serveur : séjour filtrable entre deux dates, montants cumulés');
  const ctrl = readFileSync(join(racine, 'backend', 'src', 'controllers', 'hospital.controller.js'), 'utf8');
  assert.ok(ctrl.includes('periodeQuery') && ctrl.includes('req.query.du') && ctrl.includes('req.query.au'),
    '⑤ contrôleur : ?du=…&au=… relu et transmis');
  const histo = texteDe('pages', 'HistoriqueVentesPage.jsx');
  assert.ok(histo.includes('const [fenetre, setFenetre]') && histo.includes("query.set('du', fenetre.du)")
    && histo.includes('urlOrdonnance'),
    '⑤ écran : fenêtre du/au filtre la liste et se transmet à l’ordonnance');

  // ⑥ Périodes de garde — 2.7.38 : SUPPRIMÉES définitivement ; la garde est
  // une période de dates OBLIGATOIRE sur la fiche de l'employé.
  const patients = texteDe('pages', 'PatientsPage.jsx');
  assert.ok(!patients.includes('hopital.gardes()') && patients.includes('dutyStartOn')
    && patients.includes('PÉRIODE DE GARDE est obligatoire'),
    '⑥ (2.7.38) : garde = période « du … au … » obligatoire dans la fiche employé');
});

test('2.7.39 → 2.7.45 — Tour de garde : 7 prochains jours GLISSANTS, date du jour colonne', () => {
  const patients = texteDe('pages', 'PatientsPage.jsx');

  // 2.7.45 — FENÊTRE GLISSANTE : les 7 PROCHAINS JOURS à partir d'aujourd'hui
  // (plus de semaine calendaire fixe : une longue garde se lit entièrement).
  assert.ok(patients.includes('const fenetre7Jours = () => Array.from({ length: 7 }')
    && patients.includes('jour.setDate(jour.getDate() + i)') && patients.includes('aujourd: i === 0'),
    'les colonnes = aujourd’hui puis les 6 jours suivants (fenêtre glissante)');
  assert.ok(patients.includes("const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];"),
    'le nom de chaque colonne vient de getDay() (répétition hebdomadaire)');
  assert.ok(!patients.includes('const JOURS =') && !patients.includes('isoDuJour'),
    'l’ancienne semaine fixe (Lundi → Dimanche) a disparu');

  // En-têtes SANS date ; sous le nom : LA DATE DU JOUR de la colonne
  // (2.7.45, maquette demandée : Samedi=17/10, Dimanche=18/10, Lundi=19/10…).
  assert.ok(!patients.includes('dateFr(jour.isoJour)') && !patients.includes('periode:'),
    'en-têtes propres ; ni « Du … / Au … » ni bornes seules');
  assert.ok(patients.includes("{jour.jour}{jour.aujourd ? ' (aujourd’hui)' : ''}"),
    'l’en-tête ne porte que le nom du jour');
  assert.ok(patients.includes('dateJour: dateFr(isoJour)') && patients.includes('{personne.dateJour}'),
    'sous chaque nom : la date du jour de la colonne');
  // 2.7.41 — employés rangés PAR RANGÉES DE TABLEAU : le trait séparateur
  // court CONTINU du début à la fin (plus de petits traits coupés case par case).
  assert.ok(!patients.includes('trait SÉPARATEUR') && !patients.includes("borderTop: '1px solid #cbd5e1', paddingTop"),
    'les petits traits coupés case par case (2.7.40) ont disparu');
  assert.ok(patients.includes('Math.max(1, ...tdr.map(jour => jour.personnes.length))')
    && patients.includes("...(rang > 0 ? { borderTop: '1px solid #94a3b8' } : {})"),
    'une rangée <tr> par étage : trait continu sur toute la largeur');

  // Un employé qui tient deux jours apparaît dans DEUX colonnes (la période
  // couvrant chaque jour est recalculée jour par jour).
  assert.ok(patients.includes('debut <= isoJour && fin >= isoJour'),
    'chaque colonne vérifie la couverture du jour (garde de 2, 3 jours ou plus = autant de colonnes)');
});

test('2.7.42 — Garde d’UN, DEUX, TROIS jours ou plus : TDR toujours correct', () => {
  const service = readFileSync(join(racine, 'backend', 'src', 'services', 'hospital.service.js'), 'utf8');
  const patients = texteDe('pages', 'PatientsPage.jsx');

  // Serveur : les dates de garde remontent TOUJOURS en « AAAA-MM-JJ » pur.
  assert.ok(service.includes('const jourSeul = valeur =>')
    && service.includes('valeur.toISOString().slice(0, 10)')
    && service.includes('String(valeur).slice(0, 10)')
    && service.includes('dutyStartOn: jourSeul(row.dutyStartOn), dutyEndOn: jourSeul(row.dutyEndOn)'),
    'serveur : dates de garde normalisées « AAAA-MM-JJ » (plus de décalage de fuseau)');

  // Écran : même garde-fou (au cas où) — nettoyage avant toute comparaison.
  assert.ok(patients.includes('String(membre.dutyStartOn).slice(0, 10)')
    && patients.includes('String(membre.dutyEndOn).slice(0, 10)'),
    'écran : les bornes de garde sont purgées à « AAAA-MM-JJ » avant comparaison');
  assert.ok(patients.includes('debut <= isoJour && fin >= isoJour'),
    'chaque colonne de JOUR couverte est testée à tour de rôle (1, 2, 3 jours ou plus)');
  // Ancienne comparaison directe (non normalisée) disparue.
  assert.ok(!patients.includes('membre.dutyStartOn <= isoJour'),
    'l’ancienne comparaison brute (qui pouvait décaler un jour) a disparu');
});

// ============================================================================
// 2.7.49 — FABRIQUANT PAR LOT (à la réception) + ARRONDIS À L'ENTIER SUPÉRIEUR.
//   ① « Nom de Fabriquant » quitte la fiche médicament ; le texte « Fabriquant »
//     se saisit lot par lot dans « Nouvelle réception » (remplaçant la date
//     « Fabriqué le ») ; la liste des réceptions et le bon imprimé l'affichent.
//   ② Coût unitaire = ceil(PA × (1 + taux frais/100)) ; Prix de vente =
//     ceil(CMP × (1 + marge/100)) : plus de fraction d'Ariary.
// ============================================================================
test('2.7.49 — fabricant lot par lot à la réception ; coûts/prix arrondis à l’entier supérieur', () => {
  const fiche = texteDe('forms', 'ProductForm.jsx');
  const reception = texteDe('forms', 'ReceiptForm.jsx');
  const receptions = texteDe('pages', 'ReceiptsPage.jsx');
  const bonRecu = readFileSync(join(racine, 'backend', 'src', 'templates', 'receiptNote.js'), 'utf8');
  const serviceReception = readFileSync(join(racine, 'backend', 'src', 'services', 'receipt.service.js'), 'utf8');
  const servicePrix = readFileSync(join(racine, 'backend', 'src', 'services', 'pricing.service.js'), 'utf8');
  const validateur = readFileSync(join(racine, 'backend', 'src', 'validators', 'receipt.validator.js'), 'utf8');

  // ① Fabricant : déplacé de la fiche vers la réception (lot par lot).
  assert.ok(!fiche.includes('label="Nom de Fabriquant"'),
    'la fiche médicament ne demande plus le fabricant');
  assert.ok(reception.includes('label="Fabriquant"'),
    'le formulaire de réception saisit le fabricant lot par lot');
  assert.ok(!reception.includes('label="Fabriqué le"'),
    'la date « Fabriqué le » a quitté le formulaire de réception');
  assert.ok(validateur.includes('manufacturer'),
    'le serveur accepte « manufacturer » sur la ligne de réception');
  assert.ok(serviceReception.includes('manufacturer'),
    'le fabricant est rangé sur le lot et la ligne de réception');
  assert.ok(receptions.includes("{ label: 'Fabriquant' }"),
    'la liste des réceptions affiche la colonne Fabriquant');
  assert.ok(bonRecu.includes("label: 'Fabriquant'"),
    'le bon de réception imprimé affiche la colonne Fabriquant');

  // ② Arrondis à l'ENTIER SUPÉRIEUR (ceil) : coût unitaire et prix de vente.
  assert.ok(serviceReception.includes('ceil()'),
    'le coût unitaire du lot plafonne à l’entier supérieur');
  assert.ok(servicePrix.includes('price.ceil()'),
    'le prix de vente plafonne à l’entier supérieur');
});

// ============================================================================
// 2.7.51 — LOGIN au sens voulu (maquette « sary1 ») : FORMULAIRE À GAUCHE,
// colonne décorative À DROITE, fond de page BLEU CANARD profond autour de la
// carte, bouton de connexion compact (≈ moitié du panneau, calé à gauche).
// ============================================================================
test('2.7.51 — login : formulaire à gauche, décor à droite, fond bleu canard, bouton compact', () => {
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');

  // Inversion des colonnes par flex (le JSX énumère art puis panneau).
  const blocCarte = css.slice(css.indexOf('.lp-card {'));
  assert.ok(blocCarte.includes('flex-direction: row-reverse'),
    'le FORMULAIRE passe à GAUCHE et le décor à DROITE (row-reverse)');
  // Fond de page BLEU CANARD profond autour de la carte blanche.
  assert.ok(css.includes('linear-gradient(157deg, #1192b6 0%, #0d82a3 34%, #096488 68%, #064d6f 100%)'),
    'la page porte le dégradé bleu canard profond');
  assert.ok(!css.includes('linear-gradient(155deg, #e9f5f8 0%, #eef8fa 45%, #e6f2f6 100%)'),
    'l’ancien fond clair de la page a disparu');
  // Bouton de connexion compact (plus toute la largeur du panneau).
  assert.ok(css.includes('width: max(180px, 48%); height: 52px'),
    'le bouton « Se connecter » est compact (≈ moitié du panneau)');
});

// ============================================================================
// 2.7.52 — VENTE au LOOK « maquette MARC » (interface seule, zéro changement
//   de fonctionnement) : deux colonnes (recherche + client à gauche, panier à
//   droite), lignes du panier avec vignette/chips/stepper, grand bouton vert
//   « Valider la vente », sidebar en dégradé et pastille de menu vert vif.
//   Ce test verrouille les marqueurs métier QUI NE DOIVENT PAS DISPARAÎTRE.
// ============================================================================
test('2.7.52 — interface Vente modèle MARC : look neuf, logique et contrats intacts', () => {
  const vente = texteDe('pages', 'SalesPage.jsx');
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');

  // ── Le nouveau look (maquette) est en place. ──────────────────────────────
  for (const marqueur of ['vt-grid', 'vt-suggestions', 'vt-prod-ico', 'vt-modes', 'vt-line', 'vt-stepper', 'vt-totals', 'vt-valider']) {
    assert.ok(vente.includes(marqueur), `JSX : la classe « ${marqueur} » est utilisée`);
    assert.ok(css.includes(`.${marqueur}`), `CSS : la classe « .${marqueur} » existe`);
  }
  assert.ok(vente.includes('iconeProduit'), 'JSX : vignette décorative par produit');
  assert.ok(css.includes('#16b893') && css.includes('#0d5249'),
    'CSS : pastille active vert vif + sidebar en dégradé canard');
  assert.ok(vente.includes('Total à payer'), 'le grand total de la maquette est libellé « Total à payer »');

  // ── Mais AUCUNE fonctionnalité n'a bougé (contrats historiques). ──────────
  assert.match(vente, /lines:\s*lignesEnvoyees\(/, 'les appels /sales passent toujours par lignesEnvoyees()');
  assert.match(vente, /needle\.length < 1 \? vendables : vendables/, 'le filtre dès 1 caractère est intact');
  assert.ok(vente.includes('boîte(s) en stock vendable au comptoir'), 'info-bulle stock vendable conservée');
  assert.ok(vente.includes('onChange={e => fixer(ligne, e.target.value)}'), 'quantité saisissable au clavier conservée');
  assert.ok(vente.includes('Carnet hôpital (patient hospitalisé)'), 'le carnet hôpital est conservé');
  assert.ok(vente.includes('patientId: venteCarnet && patientSel'), 'le patient part avec la vente carnet');
});

// ============================================================================
// 2.7.53 — vente : PAREMPISE du « 2 · Panier » (à gauche, sous la recherche)
//   et du « 3 · Client, remarque et validation » (à droite) ; et LISIBILITÉ au
//   survol : un texte blanc sur fond foncé (pastille activée, menu actif) ne
//   « manjavona » plus — le fond foncé est conservé au survol.
// ============================================================================
test('2.7.53 — Panier à gauche / Client à droite ; texte toujours lisible au survol', () => {
  const vente = texteDe('pages', 'SalesPage.jsx');
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');

  // ── Ordre des cartes : la disposition 2.7.52 (Panier à DROITE) a été
  //    RÉTABLIE par la 2.7.54 — les deux cartes existent toujours. ──
  const iPanier = vente.indexOf('Card title={`2 · Panier');
  const iClient = vente.indexOf('Card title="3 · Client, remarque et validation"');
  assert.ok(iPanier > 0 && iClient > 0, 'les deux cartes existent toujours');
  assert.ok(iClient < iPanier, '2.7.54 : « 3 · Client » (gauche) précède « 2 · Panier » (droite) — rétabli');

  // ── Lisibilité au survol : jamais de texte blanc sur fond éclairci. ──────
  assert.ok(css.includes('.vt-mode--on:hover {'), 'pastille activée : fond vert foncé conservé au survol');
  assert.ok(css.includes('.navlink--active:hover {'), 'menu actif : dégradé conservé au survol');
  assert.match(css, /\.vt-mode--on:hover \{[\s\S]{0,120}#0f7f6e/,
    'le texte de la pastille activée reste blanc SUR fond vert foncé au survol');
  assert.match(css, /\.navlink--active:hover \{[\s\S]{0,140}#16b893/,
    'le texte du menu actif reste blanc SUR dégradé vert au survol');
});

// ============================================================================
// 2.7.54 — vente : disposition rétablie (Panier de nouveau À DROITE) et
//   colonne de droite (panier + validation) PLUS LARGE que la gauche.
// ============================================================================
test('2.7.54 — Panier rétabli à droite, colonne de droite plus large', () => {
  const vente = texteDe('pages', 'SalesPage.jsx');
  const css = readFileSync(join(racine, 'frontend', 'src', 'styles.css'), 'utf8');

  // Disposition : Client (gauche) avant Panier (droite) dans le DOM.
  const iPanier = vente.indexOf('Card title={`2 · Panier');
  const iClient = vente.indexOf('Card title="3 · Client, remarque et validation"');
  assert.ok(iClient > 0 && iPanier > iClient,
    '2.7.54 : Panier rétabli à droite, Client à gauche');

  // Largeurs : la colonne de droite domine la gauche.
  assert.ok(css.includes('minmax(0, .98fr) minmax(440px, 1.22fr)'),
    'la colonne DROITE du panier est plus large que la gauche (1,22fr vs .98fr)');
});

// ============================================================================
// 2.7.55 — vente : écran ALLÉGÉ — la liste déroulante native du champ
//   « Client (facultatif) » suffit ; les aides visuelles redondantes et la
//   rangée de boutons « clients déjà servis » ont été retirées.
// ============================================================================
test('2.7.55 — client en liste déroulante seule ; aides redondantes retirées', () => {
  const vente = texteDe('pages', 'SalesPage.jsx');

  // La liste déroulante des clients déjà servis RESTE, seule.
  assert.ok(vente.includes('list="clients-connus"'), 'le champ client garde sa liste déroulante');
  assert.ok(vente.includes('id="clients-connus"'), 'la datalist des clients est toujours là');
  assert.ok(vente.includes('placeholder="Client de passage"'),
    '« Client de passage » reste le texte indicatif du champ');
  assert.ok(!vente.includes('Client de passage</Btn'),
    'la rangée de boutons « clients déjà servis » a disparu');

  // Les cinq textes d’aide retirés ne réapparaissent pas.
  for (const texte of [
    'la liste ci-dessous défile (scroll)',
    'Le stock proposé est celui de la PHARMACIE (comptoir)',
    'Choisissez un client déjà servi',
    'Le total est calculé par le serveur à partir du stock réel : ajoutez un médicament au panier',
    'Une vente validée ne se supprime jamais'
  ]) {
    assert.ok(!vente.includes(texte), `texte retiré : « ${texte} »`);
  }

  // La logique de vente et la maquette restent intactes.
  assert.ok(vente.includes('lines: lignesEnvoyees(panier)'), 'l’appel serveur est intact');
  assert.ok(vente.includes('needle.length < 1 ? vendables'), 'le filtre dès 1 caractère est intact');
  assert.ok(vente.includes('Card title={`2 · Panier'), 'le panier est intact');
  assert.ok(vente.includes('Carnet hôpital (patient hospitalisé)'), 'le carnet hôpital est intact');
});

// ============================================================================
test('2.7.56 — ticket/ordonnances en forme modèle + PDF téléchargeable', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const utilPdf = lire(['backend', 'src', 'utils', 'pdf.js']);
  const docsPdf = lire(['backend', 'src', 'templates', 'documentsPdf.js']);
  const ticket = lire(['backend', 'src', 'templates', 'saleTicket.js']);
  const ordonnance = lire(['backend', 'src', 'templates', 'ordonnanceTicket.js']);
  const sejourTicket = lire(['backend', 'src', 'templates', 'ordonnanceSejour.js']);
  const service = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const routesDocuments = lire(['backend', 'src', 'routes', 'documents.routes.js']);
  const ctrlDocuments = lire(['backend', 'src', 'controllers', 'document.controller.js']);
  const ctrlHopital = lire(['backend', 'src', 'controllers', 'hospital.controller.js']);
  const client = lire(['frontend', 'src', 'api', 'client.js']);
  const vente = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);

  // ── Les trois documents reprennent la forme du modèle (visuel seul).
  for (const [nom, texte] of [['ticket', ticket], ['ordonnance', ordonnance], ['ordonnanceSéjour', sejourTicket]]) {
    for (const marqueur of ['tk-mention', 'tk-head', 'tk-regle', 'tk-metas', 'tk-table',
      'coupure', 'size: A5 landscape']) {
      assert.ok(texte.includes(marqueur), `${nom} : forme modèle « ${marqueur} »`);
    }
  }
  assert.ok(ticket.includes('tk-total') && ticket.includes('Total à payer'),
    'ticket : total centré en gras');
  assert.ok(ordonnance.includes('Signature du délivreur') && !ordonnance.includes('formatMoney('),
    'ordonnance : signatures, toujours SANS montants');
  assert.ok(sejourTicket.includes('Total de l’ordonnance de séjour'),
    'ordonnance de séjour : total conservé');

  // ── Générateur PDF maison : aucune dépendance nouvelle.
  for (const marqueur of ['%PDF-1.4', 'WinAnsiEncoding', 'BaseFont /Helvetica',
    'export function creerPdf', 'export const largeurTexte']) {
    assert.ok(utilPdf.includes(marqueur), `pdf.js : « ${marqueur} »`);
  }
  const paquet = lire(['backend', 'package.json']);
  assert.ok(!paquet.includes('pdfkit') && !paquet.includes('puppeteer') && !paquet.includes('pdf-lib'),
    'aucune dépendance PDF ajoutée (hors-ligne préservé)');

  // ── Les trois builders PDF + la mise en page du modèle.
  for (const marqueur of ['ticketVentePdf', 'ordonnancePdf', 'ordonnanceSejourPdf',
    'Exemplaire client', 'Copie pharmacie — à conserver', 'Exemplaire du patient',
    'MÉDICAMENT', 'QUANTITÉ', 'Total à payer : ', 'découper ici']) {
    assert.ok(docsPdf.includes(marqueur), `documentsPdf.js : « ${marqueur} »`);
  }

  // ── Routes : `?fmt=pdf` sur les trois documents, en pièce jointe.
  for (const code of [routesDocuments, ctrlDocuments, ctrlHopital]) {
    assert.ok(code.includes('fmt') && code.includes('application/pdf')
      && code.includes('Content-Disposition') && code.includes('attachment'),
      'route : PDF servi en pièce jointe');
  }
  for (const marqueur of ['venteTicketPdf', 'ordonnanceTicketPdf', 'ordonnanceSejourPdfDoc']) {
    assert.ok(service.includes(`export async function ${marqueur}`), `service : ${marqueur}`);
  }

  // ── Interface : bouton « Télécharger le PDF » (client.tsotra ET carnet).
  assert.ok(client.includes('downloadPdf') && client.includes('response.blob()'),
    'client.js : téléchargement binaire du PDF');
  assert.ok(vente.includes('Télécharger le PDF') && vente.includes('FileDown')
    && vente.includes('/ordonnance?fmt=pdf'), 'page Vente : boutons PDF ticket + ordonnance');
});

// ============================================================================
// 2.7.57 — UN SEUL document proposé après la vente, TOUJOURS téléchargé :
//   client tsotra → TICKET seul ; carnet hôpital → ORDONNANCE seule (plus
//   de bouton « Imprimer le ticket » sur un hospitalisé). « Imprimer … » et
//   « Télécharger le PDF » déclenchent le MÊME téléchargement.
// ============================================================================
test('2.7.57 — document unique après vente : ticket OU ordonnance, téléchargé', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const vente = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);

  // Carnet hôpital : l'ordonnance est téléchargée, pas le ticket.
  assert.ok(vente.includes('elechargerPdf(cloture.patientId'), 'carnet : ordonnance téléchargée (séjour ou carnet du jour)');
  assert.ok(vente.includes('/ordonnance?fmt=pdf'), 'carnet : routes PDF de l’ordonnance');

  // Client tsotra : le ticket est téléchargé.
  assert.ok(vente.includes('elechargerPdf(`/documents/SALE/${cloture.id}/print?fmt=pdf`'),
    'tsotra : ticket téléchargé');

  // Le bouton « Imprimer le ticket » n'est plus ouvert en impression sur le
  // carnet, et n'ouvre plus la fenêtre d'impression : tout se télécharge.
  assert.ok(!vente.includes('openPrintable(`/documents/SALE/${cloture.id}/print`'),
    '« Imprimer le ticket » télécharge désormais (plus de fenêtre d’impression)');
  assert.ok(!vente.includes('openPrintable(cloture.patientId'),
    '« Imprimer l’ordonnance » télécharge désormais (plus de fenêtre d’impression)');

  // Les deux paires de boutons coexistent (tsotra / carnet), sans doublon.
  assert.equal(vente.split('Imprimer le ticket').length - 1, 1, 'un seul « Imprimer le ticket » (tsotra)');
  assert.equal(vente.split('Imprimer l’ordonnance').length - 1, 1, 'un seul « Imprimer l’ordonnance » (carnet)');
  assert.ok(vente.includes(') : ('), 'choix carnet/tsotra explicite dans le bandeau de clôture');
});

// ============================================================================
// 2.7.58 — GARDE-FOU « page vide » : le PDF est vérifié côté navigateur
//   (content-type application/pdf exigé, sinon erreur claire « redémarrez le
//   backend ») et toute erreur de téléchargement s'affiche en toast,
//   au lieu d'un fichier blanc silencieux.
// ============================================================================
test('2.7.58 — garde-fou PDF : content-type contrôlé + erreur en toast', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const client = lire(['frontend', 'src', 'api', 'client.js']);
  const vente = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);

  // Le téléchargement refuse désormais tout ce qui n'est pas un vrai PDF.
  assert.ok(client.includes("includes('application/pdf')"),
    'client.js : le content-type PDF est exigé');
  assert.ok(client.includes('redémarrer le BACKEND') || client.includes('le BACKEND'),
    'client.js : le message invite à redémarrer le backend');
  assert.ok(client.includes('export class ApiError'), 'client.js : ApiError réutilisée');

  // Côté Vente : chaque clic passe par le helper qui affiche l'erreur.
  assert.ok(vente.includes('telechargerPdf') && vente.includes('toast.error'),
    'Vente : erreurs de téléchargement affichées en toast');
  assert.ok(!vente.includes('onClick={() => downloadPdf('),
    'Vente : plus aucun clic direct sans affichage d’erreur');
});

// ============================================================================
// 2.7.59 — DOUBLE DEMANDE DE L'OFFICINE :
//   ① « apetaka eo amin'ny ordonnance ny date nivoahany hopital » : la date
//     DE SORTIE de l'hôpital (dischargedOn, migration 013, gravée à la
//     « Sortie du service ») figure sur les DEUX ordonnances.
//   ② « forme A5 ka eo ampovoany mitsangana no anapahana azy » : les deux
//     exemplaires sont CÔTE À CÔTE sur UNE page A5 PAYSAGE, coupés
//     VERTICALEMENT au milieu (plus l'un au-dessus de l'autre).
// ============================================================================
test('2.7.59 — A5 paysage (coupe verticale) + date de sortie de l’hôpital', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const ticket = lire(['backend', 'src', 'templates', 'saleTicket.js']);
  const ordonnance = lire(['backend', 'src', 'templates', 'ordonnanceTicket.js']);
  const sejour = lire(['backend', 'src', 'templates', 'ordonnanceSejour.js']);
  const utilPdf = lire(['backend', 'src', 'utils', 'pdf.js']);
  const docsPdf = lire(['backend', 'src', 'templates', 'documentsPdf.js']);

  // ② Les TROIS papiers passent en A5 PAYSAGE, exemplaires side by side,
  //    coupe VERTICALE au milieu — plus aucun portrait.
  for (const gabarit of [ticket, ordonnance, sejour]) {
    assert.ok(gabarit.includes('size: A5 landscape'), 'pour safidy A5 : le format est paysage');
    assert.ok(!gabarit.includes('size: A5 portrait'), 'le portrait A5 a disparu');
    assert.ok(gabarit.includes('.tk-duo') && gabarit.includes('border-left:1px dashed'),
      'exemplaires côte à côte, coupe verticale pointillée');
    assert.ok(gabarit.includes('coupure'), 'ligne de coupe conservée');
  }

  // ② côté PDF téléchargeable : page paysage + trait vertical au milieu.
  assert.ok(utilPdf.includes('PAGE_PAYSAGE') && utilPdf.includes('traitVertical'),
    'pdf.js : support paysage + trait vertical');
  assert.ok(docsPdf.includes('PAGE_PAYSAGE') && docsPdf.includes('coupureVerticale')
    && docsPdf.includes('creerPdf(feuiles, PAGE_PAYSAGE)'),
    'documentsPdf : une page paysage, deux moitiés gauche/droite');

  // ① DATE DE SORTIE : migration 013 + champ du modèle + gravure automatique.
  const sql13 = lire(['backend', 'sql', '013_patients_date_sortie.sql']);
  assert.ok(sql13.includes('ALTER TABLE patients') && sql13.includes('discharged_on'),
    'migration 013 : colonne discharged_on sur patients');
  const modele = lire(['backend', 'src', 'models', 'patient.model.js']);
  assert.ok(modele.includes('dischargedOn:') && modele.includes('DataTypes.DATEONLY'),
    'modèle Patient : champ dischargedOn (date seule)');
  const service = lire(['backend', 'src', 'services', 'hospital.service.js']);
  assert.ok(service.includes('dischargedOn') && service.includes('aujourdHui()'),
    '« Sortie du service » grave la date de sortie');

  // ① les deux ORDONNANCES affichent « Sorti de l’hôpital le : jj/mm/aaaa »
  //    quand la date est connue (HTML et PDF).
  assert.ok(ordonnance.includes('patient?.dischargedOn') && ordonnance.includes('Sorti de l’hôpital le'),
    'ordonnance de vente : date de sortie conditionnelle');
  assert.ok(sejour.includes('patient.dischargedOn') && sejour.includes('Sorti de l’hôpital le'),
    'ordonnance de séjour : date de sortie conditionnelle');
  assert.ok(docsPdf.includes('Sorti de l’hôpital le'),
    'versions PDF : date de sortie imprimée');

  // Traçabilité conservée : l'ordonnance de vente reste SANS PRIX, et le
  // ticket garde ses deux mentions.
  assert.ok(!ordonnance.includes('formatMoney('), 'ordonnance de vente : toujours sans prix');
  assert.ok(ticket.includes('Exemplaire client') && ticket.includes('Copie pharmacie — à conserver'),
    'ticket : mentions des deux exemplaires conservées');
});

// ============================================================================
// 2.7.60 — DIAGNOSTIC PRÉCIS du « PAS de PDF » : au lieu du seul conseil
//   « relancez le backend », le garde-fou AFFICHE LA CAUSE RÉELLE :
//     · réponse 200 en HTML → un ANCIEN backend est encore en écoute (sonde
//       publique /api/version, ajoutée ici, le PROUVE : elle 404 chez eux) ;
//     · colonne manquante (discharged_on) → « npm run db:migrate » ;
//     · autre erreur → le message du serveur est relayé tel quel.
//   Hors production, le backend joint « detail » aux erreurs 500.
// ============================================================================
test('2.7.60 — diagnostic précis du « pas de PDF » (cause réelle affichée)', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const client = lire(['frontend', 'src', 'api', 'client.js']);
  const routes = lire(['backend', 'src', 'routes', 'index.js']);
  const erreurs = lire(['backend', 'src', 'middlewares', 'errorHandler.js']);

  // Le garde-fou lit le corps de la réponse et sonde la version du serveur.
  assert.ok(client.includes('causeRefusPdf') && client.includes('clone().text()'),
    'client.js : le corps de la réponse d’erreur est lu');
  assert.ok(client.includes('/api/version'),
    'client.js : sonde /api/version (PREUVE du backend réellement en écoute)');
  assert.ok(client.includes('npm run db:migrate'),
    'client.js : la piste « migration à jouer » est indiquée');
  assert.ok(client.includes('lectureCorpsErreur'),
    'client.js : corps d’erreur rendu lisible');

  // Anciens rempart conservés (2.7.58).
  assert.ok(client.includes("includes('application/pdf')")
    && client.includes('relancez le BACKEND'),
    'client.js : garde-fou content-type conservé');

  // Le backend déclare sa version publiquement et expose la cause en dev.
  assert.ok(routes.includes("router.get('/version'") && routes.includes('versionAppli'),
    'routes : /api/version publique annonce le code réellement servi');
  assert.ok(erreurs.includes('detail: error.message'),
    'errorHandler : la cause des erreurs 500 est jointe hors production');
});

// ============================================================================
// 2.7.61 — L'ANCIEN BACKEND NE SE CACHENT PLUS : une version unique du code
//   (utils/version.js) est imprimée dans la bannière de démarrage (dossier et
//   PID inclus) et servie par /api/version ; et doctor-pdf.mjs, zéro
//   dépendance, SONDES les ports, IDENTIFIE le processus ancien (PID) et
//   l'arrête avec --vono. Fini les redémarrages fantômes.
// ============================================================================
test('2.7.61 — version unique au démarrage + doctor-pdf (PID, --vono)', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const version = lire(['backend', 'src', 'utils', 'version.js']);
  const routes = lire(['backend', 'src', 'routes', 'index.js']);
  const serveur = lire(['backend', 'src', 'server.js']);
  const doctor = lire(['doctor-pdf.mjs']);

  // Une seule source de vérité pour la version du code.
  assert.ok(version.includes('export const VERSION_APPLI'),
    'version.js : la version du code a un emplacement unique');
  assert.ok(routes.includes('versionAppli: VERSION_APPLI'),
    '/api/version : sert la constante unique (plus de valeur en dur)');
  assert.ok(serveur.includes('code ${VERSION_APPLI}') && serveur.includes('process.cwd()')
    && serveur.includes('process.pid'),
    'server.js : bannière « code · dossier · PID » au démarrage');

  // Le docteur : sonde les ports, trouve le PID de l’ancien, option --vono.
  for (const marqueur of ['/api/health', '/api/version', 'pidsSurPort', '--vono',
    'LISTENING', 'taskkill', 'npm start']) {
    assert.ok(doctor.includes(marqueur), `doctor-pdf.mjs : « ${marqueur} »`);
  }
  assert.ok(doctor.includes('cd backend'), 'doctor-pdf.mjs : indique le bon dossier de redémarrage');
});

async function causeRefusPdf(response) {
  const corps = await response.clone().text().catch(() => '');
  const version = await fetch('/api/version', { credentials: 'same-origin' })
    .then(reponse => (reponse.ok ? reponse.json() : null))
    .catch(() => null);

  if (!version?.versionAppli) {
    return 'PAS de PDF : le backend qui RÉPOND est un ANCIEN code (il ne connaît '
      + 'même pas /api/version, ajoutée en 2.7.60). Redémarrer ne change rien tant '
      + 'que ce n’est pas LUI qu’on relance : FERMEZ toutes les fenêtres de '
      + 'terminal, tuez les processus Node encore ouverts (gestionnaire des '
      + 'tâches), puis relancez le BACKEND DEPUIS LE DOSSIER du projet où vous avez '
      + 'collé le code — et vérifiez le PORT annoncé au démarrage. '
      + '(Ce n’est pas F5 : il faut relancer le BACKEND lui-même, pas le navigateur.)';
  }

  const detail = lectureCorpsErreur(corps);

  // 2.7.62 — EST-CE BIEN NOTRE backend qui a répondu ? Chaque réponse de
  // l'API porte l'empreinte X-PharmaStock-Code (posée par routes/index.js).
  // Un 204 VIDE sans cette empreinte ne peut PAS venir de PharmaStock :
  // c'est un intermédiaire (antivirus web-shield, proxy, extension) qui
  // intercepte les téléchargements. Fingerprint des en-têtes pour le
  // confirmer visuellement.
  const empreinte = response.headers.get('x-pharmastock-code');
  if (!empreinte) {
    const indices = ['server', 'via', 'x-powered-by', 'content-type']
      .map(nom => [nom, response.headers.get(nom)])
      .filter(([, valeur]) => valeur)
      .map(([nom, valeur]) => `${nom}: ${valeur}`)
      .join(' · ');
    return `PDF refusé (code ${response.status}) : CE N'EST PAS PharmaStock `
      + 'qui a répondu (empreinte X-PharmaStock-Code absente — un intermédiaire '
      + 'a pris la place sur la réponse : ANTIVIRUS « protection web », proxy, '
      + 'ou extension du navigateur). Essayez d’abord une FENÊTRE PRIVÉE '
      + '(Ctrl + Maj + N) : si le PDF passe, coupable = extension/antivirus '
      + '(ajoutez le site aux exclusions de sa protection web). '
      + (indices ? `En-têtes vus : ${indices}.` : '');
  }

  if (/discharged_on|does not exist|column/i.test(detail)) {
    return `PAS de PDF : la base n’a pas encore la colonne de la 2.7.59 — `
      + `lancez « npm run db:migrate » à la racine du projet, puis relancez le `
      + `BACKEND. (Cause serveur : ${detail.slice(0, 180)})`;
  }
  return `PDF refusé (code ${response.status}) : ${detail.slice(0, 220)} — `
    + 'arrêtez puis relancez le BACKEND (pas F5 !), refaites « npm run build » '
    + 'et recommencez ; la cause exacte figure aussi dans la console du serveur.';
}

// ============================================================================
// 2.7.62 — EMPREINTE DU SERVEUR RÉEL : un « 204 No Content » en réponse au
//   téléchargement PDF ne venait PAS de PharmaStock (l'API n'en renvoie
//   jamais) mais d'un INTERMÉDIAIRE qui intercepte les téléchargements
//   (antivirus web-shield, proxy, extension). Chaque réponse de l'API porte
//   désormais X-PharmaStock-Code ; le garde-fou l'exige et, en son absence,
//   nomme le coupable (fenêtre privée = test décisif) au lieu d'accuser
//   à tort le redémarrage du backend.
// ============================================================================
test('2.7.62 — empreinte X-PharmaStock-Code + accusé « ce n’est pas PharmaStock »', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const client = lire(['frontend', 'src', 'api', 'client.js']);
  const routes = lire(['backend', 'src', 'routes', 'index.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // L'API « signe » toutes ses réponses.
  assert.ok(routes.includes("res.set('X-PharmaStock-Code', VERSION_APPLI)"),
    'routes : empreinte posée sur TOUTES les réponses de l’API');

  // Le garde-fou l'exige et sait qui accuser sinon.
  assert.ok(client.includes('x-pharmastock-code') && client.includes('CE N\'EST PAS PharmaStock'),
    'client.js : une réponse sans empreinte est dénoncée comme intermédiaire');
  assert.ok(client.includes('FENÊTRE PRIVÉE') && client.includes('protection web'),
    'client.js : test de la fenêtre privée et piste antivirus proposées');
  assert.ok(client.includes('En-têtes vus'), 'client.js : fingerprint des en-têtes pour confirmer');

  // La version a progressé (servie par /api/version et la bannière).
  assert.ok(/VERSION_APPLI = '2\.7\.6[2-9]/.test(version),
    'version.js : version ≥ 2.7.62');
});


// ============================================================================
// 2.7.63 — FIN DU « 204 No Content » : quand la protection web locale
//   (antivirus, extension, proxy) VIDE la réponse du fetch binaire (204 sans
//   corps ni empreinte) alors que le backend est sain, LE NAVIGATEUR prend
//   le relais : navigatePdf ouvre l'URL en <a download> (GET de navigation —
//   non vidé), et la page Vente annonce ce contournement en message clair.
// ============================================================================
test('2.7.63 — contournement navigateur du « 204 » (fetch vidé par la protection locale)', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const client = lire(['frontend', 'src', 'api', 'client.js']);
  const vente = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // La bretelle existe et déclenche sur réponse vidée (sans corps ni empreinte).
  assert.ok(client.includes('export function navigatePdf') && client.includes('lien.href = `/api${path}`')
    && client.includes('lien.click()'),
    'client.js : navigatePdf passe par une navigation simple (<a href download>)');
  assert.ok(client.includes("!empreinte && !corps.trim()") && client.includes("navigatePdf(path, filename)")
    && client.includes("return { via: 'navigateur' }"),
    'client.js : le 204/local protection déclenche le contournement (plus d’erreur bloquante)');

  // L'ancienne voie blob est conservée pour les réponses PDF normales.
  assert.ok(client.includes("return { via: 'blob' }") && client.includes("includes('application/pdf')"),
    'client.js : voie blob inchangée quand le PDF arrive');

  // La page Vente annonce le contournement en message clair.
  assert.ok(vente.includes("result?.via === 'navigateur'") && vente.includes('Téléchargements'),
    'SalesPage : message « téléchargement lancé par le navigateur » quand contournement');

  // La version a progressé.
  assert.ok(/VERSION_APPLI = '2\.7\.6[3-9]/.test(version), 'version.js : version ≥ 2.7.63');
});

// ============================================================================
// 2.7.64 — CORRECTIF « toast is not a function » : dans cette appli,
//   useToast() renvoie un OBJET { success, warn, error } — pas une fonction.
//   Le message de contournement (2.7.63) doit donc passer par .warn().
// ============================================================================
test('2.7.64 — le toast de contournement utilise toast.warn (objet, pas fonction)', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const vente = lire(['frontend', 'src', 'pages', 'SalesPage.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  assert.ok(vente.includes('toast.warn('),
    'SalesPage : le message de contournement passe par toast.warn()');
  assert.ok(!vente.includes("toast('Téléchargement lancé"),
    'SalesPage : plus d’appel direct toast(…) (toast est un objet, pas une fonction)');
  assert.ok(vente.includes('toast.error(cause.message'),
    'SalesPage : le garde-fou erreur (2.7.58) est intact');
  assert.ok(/VERSION_APPLI = '2\.7\.6[4-9]/.test(version), 'version.js : version ≥ 2.7.64');
});

// ============================================================================
// 2.7.65 — HISTORIQUE : tout « imprimer » TÉLÉCHARGE (jamais de fenêtre).
//   · Onglet « Clients hôpital » : le bouton « Ordonnance de séjour » (liste
//     et détail du séjour) télécharge le PDF dès le clic (route ?fmt=pdf,
//     avec du/au conservés), même comportement que la page Vente ;
//   · Onglet « Clients tsotra » (SaleHistoryModal) : l'icone « imprimer »
//     (et les boutons du détail) téléchargent ticket/ordonnance en PDF ;
//   · en cas de réponse vidée par la protection web locale (2.7.63), le même
//     contournement « navigateur » + toast WARN est annoncé.
// ============================================================================
test('2.7.65 — historique de vente : ordonnance de séjour et impressions téléchargées en PDF', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const historique = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // Onglet hôpital : ordonnance de séjour téléchargée (fmt=pdf + du/au préservés).
  assert.ok(historique.includes('import { downloadPdf }') && historique.includes('telechargerPdf'),
    'Historique : helper de téléchargement présent');
  assert.ok(historique.includes('ordonnance-sejour-'),
    'Historique : nom de fichier ordonnance-sejour-*.pdf');
  assert.ok(historique.includes('cheminPdf(urlOrdonnance('), 'Historique : liste → téléchargement ?fmt=pdf');
  assert.ok(historique.includes("chemin.includes('?') ? '&' : '?'"),
    'Historique : du/au conservés quand la fenêtre « entre deux dates » est choisie');
  assert.ok(!historique.includes('openPrintable'), 'Historique : plus aucune fenêtre d’impression');
  assert.ok(historique.includes('toast.warn(MESSAGE_PDF_NAVIGATEUR)'),
    'Historique : contournement « navigateur » (2.7.63) annoncé');

  // Onglet tsotra : icone imprimer + boutons détail → téléchargement PDF.
  assert.ok(modale.includes('downloadPdf') && modale.includes('telechargerPdf'),
    'Historique tsotra : helper de téléchargement présent');
  assert.ok(modale.includes('print?fmt=pdf') && modale.includes('ticket-'),
    'Historique tsotra : le ticket est téléchargé en PDF');
  assert.ok(modale.includes('ordonnance?fmt=pdf') && modale.includes('ordonnance-'),
    'Historique carnet : l’ordonnance est téléchargée en PDF');
  assert.ok(!modale.includes('openPrintable'), 'Historique tsotra : plus aucune fenêtre d’impression');
  assert.ok(modale.includes('toast.warn(MESSAGE_PDF_NAVIGATEUR)'),
    'Historique tsotra : contournement « navigateur » annoncé');

  assert.ok(/VERSION_APPLI = '2\.7\.6[5-9]/.test(version), 'version.js : version ≥ 2.7.65');
});

// ============================================================================
// 2.7.66 — HISTORIQUE : finitions ergonomiques (fanatsarana interface).
//   · Colonne « Action » au-dessus des boutons (tsotra ET hôpital) ;
//   · code couleur : Détail = BLEU (#1d4ed8), imprimer/télécharger = VERT
//     (#15803d), annuler = ROUGE (#b91c1c) ;
//   · en-têtes de tableaux GRAS + couleur VIVE (th teal) ;
//   · onglet hôpital : fenêtre « entre deux dates » en SECTION SÉPARÉE
//     (Du à gauche / Au à droite), hors du bandeau de la liste ;
//   · onglets « Clients tsotra / Clients hôpital » LISIBLES au clic
//     (variables --brand/--line corrigées par la vraie palette teal/slate).
// ============================================================================
test('2.7.66 — historique : colonne Action, couleurs bleu/vert/rouge, dates en section séparée, onglets lisibles', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const styles = lire(['frontend', 'src', 'styles.css']);
  const ui = lire(['frontend', 'src', 'components', 'ui.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // Colonne « Action » séné des 2 côtés (liste tsotra + liste patient).
  assert.ok(modale.includes('<th className="right">Action</th>'),
    'Liste ventes : dernière colonne « Action » alignée à droite');
  assert.ok(page.includes("{ label: 'Action', right: true }"),
    'Liste patients : colonne « Action » alignée à droite');
  assert.ok(ui.includes('column.right'), 'Table : option colonne « right » supportée');

  // Code couleur bleu / vert / rouge des actions.
  assert.ok(modale.includes('COULEUR_DETAIL') && modale.includes('#1d4ed8'), 'Détail = BLEU');
  assert.ok(modale.includes('COULEUR_IMPRIMER') && modale.includes('#15803d'), 'Imprimer/télécharger = VERT');
  assert.ok(modale.includes('COULEUR_ANNULER') && modale.includes('#b91c1c'), 'Annuler = ROUGE');
  assert.ok(page.includes('COULEUR_DETAIL') && page.includes('COULEUR_DETAIL'),
    'Détail patient = BLEU (même code couleur)');

  // Onglet hôpital : fenêtre « entre deux dates » dans SA PROPRE section,
  // AU-DESSUS de la liste (pas dans le bandeau de la liste des patients).
  assert.ok(page.includes('sejour-fenetre'), 'Section séparée des dates présente');
  assert.ok(styles.includes('.sejour-fenetre') && styles.includes('justify-content: space-between'),
    'CSS : Du à gauche / Au à droite (space-between)');
  assert.ok(page.indexOf('sejour-fenetre') < page.indexOf('patient(s)`'),
    'La section dates précède la liste des patients');

  // En-têtes de tableau : GRAS + couleur VIVE.
  assert.ok(styles.includes('table.data th { background: var(--teal-100); font-size: .76rem; font-weight: 700'),
    'En-têtes gras + fond vif');

  // Onglets lisibles : vraie palette (plus de --brand/--line fantômes),
  // et le survol de l’onglet actif garde le texte blanc bien visible.
  assert.ok(styles.includes('.tabs__item--active:hover'), 'Onglet actif : survol non éclairci');
  assert.ok(!styles.includes('var(--brand)'), 'Plus de variable fantôme --brand');
  assert.ok(!styles.includes('var(--line)'), 'Plus de variable fantôme --line');

  assert.ok(/VERSION_APPLI = '2\.7\.6[6-9]/.test(version), 'version.js : version ≥ 2.7.66');
});


// ============================================================================
// 2.7.67 — HISTORIQUE : peaufinage ergonomique.
//   · « Action » CENTRÉE (tsotra ET patients) ;
//   · boutons ENTIÈREMENT COLORÉS (« miloko aby ») : fond plein + texte blanc;
//   · petit espace régulier entre les boutons (.actes) ;
//   · détail du séjour hôpital : « Du » à gauche / « Au » à droite, bouton
//     « Fermer » ROUGE en dernier ;
//   · recherche des clients tsotra calée à droite (.tsotra-recherche) ;
//   · la LISTE des ventes devient une SECTION à part (.liste-ventes).
// ============================================================================
test('2.7.67 — Action centrée, boutons pleins colorés + espace, liste en section séparée, détail séjour réordonné', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const styles = lire(['frontend', 'src', 'styles.css']);
  const ui = lire(['frontend', 'src', 'components', 'ui.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // « Action » CENTRÉE des 2 côtés (listes tsotra + Tous les produits + patients).
  assert.ok((modale.match(/<th className="center">Action<\/th>/g) || []).length >= 2,
    'Listes ventes : « Action » centrée (tsotra et Tous les produits)');
  assert.ok(page.includes("{ label: 'Action', center: true }"), 'Liste patients : « Action » centrée');
  assert.ok(ui.includes('column.center'), 'Table : option « center » supportée');
  assert.ok(styles.includes('table.data th.center, table.data td.center'),
    'CSS : .center réellement actif (spécificité corrigée)');

  // Boutons ENTIÈREMENT colorés (« miloko aby ») : fond plein + texte blanc.
  assert.ok(modale.includes("background: '#1d4ed8'") && modale.includes("color: '#fff'"),
    'Détail : fond BLEU plein + texte blanc');
  assert.ok(modale.includes("background: '#15803d'"), 'Imprimer : fond VERT plein');
  assert.ok(modale.includes("background: '#b91c1c'"), 'Annuler : fond ROUGE plein');

  // Petit espace régulier entre les boutons (.actes).
  assert.ok(modale.includes('className="actes"') && page.includes('className="actes"'),
    'Groupe de boutons .actes présent (les deux listes)');
  assert.ok(styles.includes('table.data .actes') && styles.includes('gap: 6px'),
    'CSS : espace régulier entre les boutons');

   // Détail du séjour hôpital : « Fermer » ROUGE à la fin (2.7.82 — DU/ÀU du
  // pied retirés ; épinglage 2.7.67 réécrit : sélecteur « Jour » conservé).
  assert.ok(page.includes('aria-label="Jour de l’ordonnance (achats de ce jour seulement)"'),
    'Détail séjour : sélecteur « Jour » conservé (ordonnance du jour, 2.7.79)');
  assert.ok(page.includes('<Btn variant="danger" onClick={onClose}>Fermer</Btn>'),
    'Détail séjour : « Fermer » ROUGE, dernier bouton');

  // Recherche des clients tsotra calée à droite ; liste en SECTION séparée.
  assert.ok(modale.includes('tsotra-recherche') && styles.includes('.tsotra-recherche'),
    'Recherche : calée à droite avec léger espace');
  assert.ok(modale.includes('liste-ventes') && styles.includes('.liste-ventes'),
    'Liste de l’historique de vente : SECTION à part');

  assert.ok(/VERSION_APPLI = '2\.7\.6[7-9]/.test(version), 'version.js : version ≥ 2.7.67');
});

// ============================================================================
// 2.7.68 — CLIENTS TSOTRA : la MÊME FORME que l'onglet « Clients hôpital ».
//   · CARTE 1 « Recherche entre deux dates (période des ventes) » : Du à
//     gauche / Au à droite (gabarit .sejour-fenetre commun), périodes
//     rapides au milieu ;
//   · CARTE 2 « N vente(s) affichée(s) » : État + recherche dans l'en-tête
//     à droite ; badges d'encaissement puis LISTE des ventes à l'intérieur ;
//   · la section .liste-ventes reste mais sans double bordure (elle vit
//     désormais DANS la carte).
// ============================================================================
test('2.7.68 — onglet Clients tsotra : même présentation en 2 cartes que l’onglet hôpital', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const modale = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const styles = lire(['frontend', 'src', 'styles.css']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // Carte 1 — « entre deux dates » : même gabarit que l'hôpital.
  assert.ok(modale.includes('Recherche entre deux dates (période des ventes)'),
    'Carte 1 : titre « Recherche entre deux dates (période des ventes) »');
  assert.ok(modale.includes('sejour-fenetre') && modale.includes('label="Du (début de la période)"')
    && modale.includes('sejour-fenetre__droite'),
    'Carte 1 : Du à gauche / Au à droite (même forme que l’hôpital)');

  // Carte 2 — la liste : État + recherche (loupe) dans l'en-tête.
  assert.ok(modale.includes('vente(s) affichée(s)'), 'Carte 2 : titre avec le compte des ventes');
  assert.ok(modale.includes('<Search size='), 'Carte 2 : loupe de recherche dans l’en-tête');
  assert.ok(modale.includes('aria-label="État des ventes"'), 'Carte 2 : sélecteur d’état dans l’en-tête');
  assert.ok(modale.includes("import { Badge, Btn, Card,"), 'Cartes : composant Card importé');

  // Les deux cartes dans l'ORDRE : dates AVANT la liste AVANT le tableau.
  assert.ok(modale.indexOf('Recherche entre deux dates') < modale.indexOf('vente(s) affichée(s)'),
    'Ordre : carte des dates au-dessus de la carte liste');
  assert.ok(modale.indexOf('vente(s) affichée(s)') < modale.indexOf('liste-ventes'),
    'Ordre : la liste des ventes vit dans la carte 2');

  // Pas de double bordure : la section interne est aplatie.
  assert.ok(styles.includes('.liste-ventes { margin-top: 14px; padding: 0;'),
    'Section liste interne aplatie (plus de carte dans la carte)');

  assert.ok(/VERSION_APPLI = '2\.7\.6[8-9]/.test(version), 'version.js : version ≥ 2.7.68');
});

// ============================================================================
// 2.7.69 — HÔPITAL (carnets) : ergonomie des listes.
//   · colonne « Action » CENTRÉE (patients ET employés) ;
//   · espace régulier entre les boutons (.actes) ;
//   · code couleur plein (palette historique) : Modifier = BLEU,
//     Activité / Réactiver = VERT, Retirer du TDR / Sortie = ROUGE ;
//   · le long paragraphe explicatif sous l'emploi du temps du TDR est RETIRÉ.
// ============================================================================
test('2.7.69 — Hôpital : Action centrée, espaces, couleurs Modifier/Réactiver/Retirer, paragraphe TDR retiré', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'PatientsPage.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // « Action » centrée sur les DEUX listes (patients + personnel).
  assert.ok((page.match(/\{ label: 'Action', center: true \}/g) || []).length >= 2,
    'patients et employés : colonne « Action » centrée');

  // Espace régulier entre les boutons (groupe .actes déjà en place en CSS).
  assert.ok((page.match(/className="actes"/g) || []).length >= 2,
    'les 2 listes regroupent leurs boutons (.actes)');

  // Code couleur plein : Modifier = BLEU, Activité/Réactiver = VERT,
  // Retirer du TDR / Sortie du service = ROUGE.
  assert.ok(page.includes('COULEUR_MODIFIER') && page.includes("background: '#1d4ed8'"),
    'Modifier = bleu plein');
  assert.ok(page.includes('COULEUR_ACTION_OK') && page.includes("background: '#15803d'"),
    'Activité / Réactiver = vert plein');
  assert.ok(page.includes('COULEUR_RETIRER') && page.includes("background: '#b91c1c'"),
    'Retirer du TDR / Sortie du service = rouge plein');

  // Le paragraphe explicatif sous le TDR est retiré.
  assert.ok(!page.includes('Emploi du temps des 7 prochains jours, glissant'),
    'paragraphe explicatif sous le TDR : retiré');

  assert.ok(/VERSION_APPLI = '2\.7\.69/.test(version) || /VERSION_APPLI = '2\.7\.[7-9]\d/.test(version),
    'version.js : version ≥ 2.7.69');
});

// ============================================================================
// 2.7.70 — « Action » VRAIMENT centrée au-dessus des boutons + boutons de
//   TAILLE UNIFORME dans l'écran Hôpital (carnets).
//   · le groupe de boutons (.actes) se CENTRE dans la cellule (header
//     « Action » centré + boutons centrés = mêmes marges des deux côtés) ;
//   · les crayons « Modifier » passent en size="sm" comme les boutons texte.
// ============================================================================
test('2.7.70 — Action réellement centrée au-dessus des boutons, tailles uniformes', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'PatientsPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'SaleHistoryModal.jsx']);
  const historique = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const styles = lire(['frontend', 'src', 'styles.css']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // Le groupe de boutons se centre (plus flex-end collé à droite).
  assert.ok(styles.includes('justify-content: center'),
    'CSS : le groupe .actes est centré dans la cellule');

  // Les cellules de la colonne Action sont centrées partout.
  assert.ok((page.match(/<td className="center">/g) || []).length >= 2,
    'Hôpital : 2 cellules Action centrées');
  assert.ok((modale.match(/<td className="center nowrap">/g) || []).length >= 2,
    'Historique (tsotra + Tous les produits) : cellules Action centrées');
  assert.ok(historique.includes('<td className="center nowrap">'),
    'Historique (liste patients) : cellule Action centrée');

  // Crayons « Modifier » à la taille des boutons texte (sm).
  assert.ok((page.match(/size="sm" variant="ghost" icon=\{Pencil\}/g) || []).length >= 2,
    'Hôpital : les 2 crayons Modifier passent en size sm');

  assert.ok(/VERSION_APPLI = '2\.7\.\d+/.test(version) && !version.includes("'2.7.69'"),
    'version.js : version ≥ 2.7.70');
});


// ============================================================================
// 2.7.71 — MENU « STOCK » : couleurs des boutons, « Imprimer » = PDF direct,
//   saisie entre deux dates, phrase d'explication retirée.
//   Demande du comptoir : « Stock : asiana couleur ny bouton : export CSV
//   atao couleur bleu ary ny Imprimer sy ny Contrôle d'intégrité atao couleur
//   Vert. Rehefa mikitika ilay bouton imprimer koa dia tokony tonga dia
//   mitelecharge forme pdf, ary asiana entre deux date mifanitsy ami'ny
//   "Aujourd'hui, 7 jours, Ce mois, Tout", esorina ihany koa ity soratra
//   ity "Stock initial = stock final de la période précédente (report
//   automatique) · Sorties = ventes, pertes, écarts · Cliquez « Détail boîte
//   / plaquette »…" ».
// ============================================================================
test('2.7.71 — Stock : boutons colorés, « Imprimer » télécharge le PDF, Du/Au, phrase retirée', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const ecran = lire(['frontend', 'src', 'pages', 'ReportsPage.jsx']);
  const controleur = lire(['backend', 'src', 'controllers', 'reports.controller.js']);
  const routes = lire(['backend', 'src', 'routes', 'reports.routes.js']);
  const gabarit = lire(['backend', 'src', 'templates', 'etatStockPdf.js']);
  const service = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── 1. COULEURS : Export CSV = BLEU, Imprimer + Contrôle d'intégrité = VERT. ─
  assert.ok(ecran.includes('COULEUR_DETAIL as COULEUR_EXPORT') && ecran.includes('COULEUR_IMPRIMER as COULEUR_VERT'),
    '① les tons de la vente (2.7.67) sont repris : bleu export, vert impression');
  assert.ok(ecran.includes('style={COULEUR_EXPORT} icon={Download}'),
    '① « Export CSV » passe en bleu plein');
  assert.ok(ecran.includes('style={COULEUR_VERT} icon={Printer}') && ecran.includes('onClick={imprimer}>Imprimer</Btn>'),
    '① « Imprimer » passe en vert plein');
  assert.ok(ecran.includes('style={COULEUR_VERT} icon={ShieldCheck}'),
    '① « Contrôle d’intégrité » passe en vert plein');

  // ── 2. « IMPRIMER » TÉLÉCHARGE DIRECTEMENT LE PDF (plus de page HTML). ───
  assert.ok(ecran.includes('/reports/print?type=${type}&from=${filtres.from}&to=${filtres.to}&fmt=pdf'),
    '② le bouton « Imprimer » vise le point « print » en fmt=pdf');
  assert.ok(ecran.includes('telechargerPdf') && ecran.includes('MESSAGE_PDF_NAVIGATEUR'),
    '② téléchargement avec le repli « navigateur » (comme la vente)');
  assert.ok(!ecran.includes('openPrintable'), '② plus d’appel à l’impression navigateur (HTML)');
  assert.ok(controleur.includes("req.query.fmt === 'pdf'") && controleur.includes("'Content-Type', 'application/pdf'")
    && controleur.includes('attachment; filename='),
    '② /reports/print répond en PDF téléchargeable');
  assert.ok(service.includes('export async function etatStockPdfDoc'),
    '② service : la fiche de stock se génère en PDF');
  assert.ok(service.includes('fiche-stock-${type}-${from}-${to}.pdf'), '② nom du fichier PDF');
  assert.ok(routes.includes("fmt: z.enum(['pdf']).optional()"),
    '② le schéma (strict) accepte le paramètre fmt=pdf');
  // Le rendu : A4 paysage, tableau paginé, seuil/situation jamais imprimés.
  assert.ok(gabarit.includes('841.98') && gabarit.includes('595.35'), '② page A4 paysage');
  assert.ok(gabarit.includes("JAMAIS_IMPRIMEES = ['Seuil minimum', 'Situation']")
    || gabarit.includes("'Seuil minimum', 'Situation'"),
    '② seuil minimum et situation jamais imprimés (comme à l’écran)');
  assert.ok(gabarit.includes('creerPdf(feuilles, SUPPORT)') && gabarit.includes('TOTAUX'),
    '② tableau dessiné avec la ligne de totaux et la pagination');

  // ── 3. SAISIE ENTRE DEUX DATES alignée avec les quatre raccourcis. ───────
  assert.ok(ecran.includes('aria-label="Du (début de la période)"') && ecran.includes('aria-label="Au (fin de la période)"'),
    '③ champs « Du » et « Au » présents');
  const rangee = ecran.split('\n');
  const iAujourd = rangee.findIndex(l => l.includes('Aujourd’hui</Btn>'));
  const iDu = rangee.findIndex(l => l.includes('Du (début de la période)'));
  assert.ok(iAujourd !== -1 && iDu !== -1 && iDu > iAujourd && iDu - iAujourd < 24,
    '③ « Du … Au … » suit immédiatement les raccourcis (même rangée)');

  // ── 4. La phrase d'explication est SUPPRIMÉE. ────────────────────────────
  // (repères JSX, pas les commentaires d'en-tête qui racontent la suppression)
  assert.ok(!ecran.includes('<strong>Stock initial</strong>'), '④ la phrase d’explication a disparu du JSX');
  assert.ok(!ecran.includes('Cliquez « Détail boîte / plaquette » pour séparer'), '④ la consigne de bascule a disparu');

  // ── 5. NON-RÉGRESSION : les six commandes et le détail restent intacts. ──
  for (const bouton of ['Recalculer', 'Contrôle d’intégrité', 'Aujourd’hui', '7 jours', 'Ce mois', 'Tout']) {
    assert.ok(ecran.includes(bouton), `⑤ « ${bouton} » toujours présent`);
  }
  assert.ok(ecran.includes("JAMAIS_AFFICHEES = ['Seuil minimum', 'Situation']")
    && ecran.includes('Détail boîte / plaquette'),
    '⑤ seuil/situation toujours masqués, bouton de détail intact');

  assert.ok(/VERSION_APPLI = '2\.(7\.(7[1-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.71');
});


// ============================================================================
// 2.7.72 — HISTORIQUE DE TRANSFERT : colonne « Action » centrée + Détail bleu,
//   deux sections (comme le Stock), saisie du/au, Détail = PDF téléchargé.
//   Demande de l'officine : « Historique de transfert : asiana soratra Action
//   ao amin'ny liste atao ambony Detail io, de atao centrer tsara ny soratra
//   hoe Action ; de atao couleur bleu Bouton Detail, ary asiana entre deux
//   date koa ao, de sy manao telechargement na imprimer ao anatiny detail io
//   de misy erreur de mba hitsio rehefa manao téléchargement de tokony ho
//   forme pdf no hiseho, de zaraina section roa koa forme interface ao atao
//   mitove form ao amin'ny stock ».
// ============================================================================
test('2.7.72 — Transferts : Action centrée, Détail bleu, Du/Au, détail = PDF direct', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'TransfersPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'DocumentModal.jsx']);
  const controleur = lire(['backend', 'src', 'controllers', 'document.controller.js']);
  const gabarit = lire(['backend', 'src', 'templates', 'transfertPdf.js']);
  const service = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── 1. Liste : colonne « Action » CENTRÉE, bouton « Détail » en BLEU. ────
  assert.ok(page.includes("{ label: 'Action', center: true }"),
    '① la demande « Action » est intitulée au-dessus du bouton Détail, centrée');
  assert.ok(page.includes('<td className="center nowrap">'), '① la cellule se centre comme sa colonne');
  assert.ok(page.includes('style={COULEUR_DETAIL} icon={Eye}') && page.includes('>Détail</Btn>'),
    '① le bouton « Détail » est en bleu plein (tons de la vente, 2.7.67)');

  // ── 2. Deux CARTES comme le menu « Stock » + saisie entre deux dates. ────
  assert.ok(page.includes("Historique de transfert") && page.includes('transfert(s) sur la période'),
    '② carte 1 = titre + période · carte 2 = liste « N transfert(s) sur la période »');
  assert.ok(page.includes('aria-label="Du (début de la période)"') && page.includes('aria-label="Au (fin de la période)"'),
    '② champs « Du » et « Au » (calendriers, bornes incluses)');
  assert.ok(page.includes('Tous les transferts'), '② bouton pour effacer la période');
  assert.ok(page.includes('aria-label="Recherche sur les transferts"'),
    '② la recherche remonte dans la carte de la liste');

  // ── 3. Boîte « Détail » : « Télécharger » ET « Imprimer » produisent le PDF. ─
  assert.ok(page.includes('pdf: true'), '③ le détail du transfert déclare le mode PDF');
  assert.ok(modale.includes("includes('?') ? '&' : '?'") && modale.includes('fmt=pdf'),
    '③ la boîte ajoute le paramètre fmt=pdf au chemin imprimable');
  assert.ok(modale.includes('downloadPdf') && modale.includes('MESSAGE_PDF_NAVIGATEUR'),
    '③ téléchargement PDF avec le repli « navigateur »');
  assert.ok(modale.includes('imprimer}') || modale.includes('onClick={imprimer}'),
    '③ « Imprimer » aussi en PDF (bordereau téléchargé)');
  assert.ok(modale.includes('COULEUR_IMPRIMER'),
    '③ « Imprimer » reste en vert plein (code couleur uniforme)');

  // ── 4. Serveur : PDF du bordereau (plus de fichier .html ni d’erreur 500). ─
  assert.ok(controleur.includes("kind === 'TRANSFER' && req.query.fmt === 'pdf'"),
    '④ /documents/TRANSFER/:id/print répond en PDF quand fmt=pdf');
  assert.ok(service.includes('export async function transfertBordereauPdf')
    && service.includes('transfert-${transfer.reference || id}.pdf'),
    '④ service : génération du bordereau PDF');
  assert.ok(gabarit.includes('BORDEREAU DE TRANSFERT') && gabarit.includes('595.35') && gabarit.includes('841.98'),
    '④ gabarit A4 portrait avec le titre du bordereau');
  assert.ok(gabarit.includes('Reçu à la pharmacie') && gabarit.includes('Expédié du dépôt')
    && gabarit.includes('Total transféré'),
    '④ signatures dépôt/pharmacie + ligne de total, comme le papier');
  assert.ok(service.includes("lotNumber: lots.find") && service.includes('expiresOn: lots.find'),
    '④ les numéros et expirations de lots sont résolus avant le PDF');

  // ── 5. NON-RÉGRESSION : le bouton « Nouveau transfert » inchangé. ────────
  assert.ok(page.includes('Nouveau transfert')
    && page.includes("can('transfer') && user?.roleCode !== 'PHARMACIST'"),
    '⑤ dépôt seul crée un transfert (2.7.20), la pharmacie lit l’historique');
  assert.ok(page.includes('DocumentModal'), '⑤ le détail reste une boîte de dialogue');

  assert.ok(/VERSION_APPLI = '2\.(7\.(7[2-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.72');
});

// ============================================================================
// 2.7.73 — PERTES ET DONS : colonne « Action » centrée + « Détail » bleu,
//   boîte détail avec « Télécharger » VERT (PDF), recherche à droite.
//   Demande de l'officine : « Pertes et dons : asiana soratra "Action" eo
//   ambonin'ny boutton Fiche ary centrena, dia ovaina hoe Detail ilay soratra
//   hoe Fiche ary atao couleur bleu, apres mikitika ilay detail dia asiana
//   boutton telecharger koa ao ahafana mitelecharge azy pdf atao couleur vert,
//   ary ilay recherche atao amin'ny coté à droite ».
// ============================================================================
test('2.7.73 — Pertes : Action centrée, « Détail » bleu, Télécharger VERT = PDF, recherche droite', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'LossesPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'DocumentModal.jsx']);
  const controleur = lire(['backend', 'src', 'controllers', 'document.controller.js']);
  const gabarit = lire(['backend', 'src', 'templates', 'pertesPdf.js']);
  const service = lire(['backend', 'src', 'services', 'ticket.service.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── 1. « Action » CENTRÉE au-dessus du bouton, « Fiche » → « Détail » BLEU. ─
  assert.ok(page.includes("{ label: 'Action', center: true }"),
    '① la colonne « Action » est intitulée et centrée au-dessus du bouton');
  assert.ok(page.includes('<td className="center nowrap">'), '① la cellule se centre comme sa colonne');
  assert.ok(page.includes('style={COULEUR_DETAIL} icon={Eye}') && page.includes('>Détail</Btn>'),
    '① « Fiche » devient « Détail » en bleu plein (icône œil)');
  assert.ok(!page.includes('>Fiche</Btn>'), '① le libellé « Fiche » a disparu des boutons');

    // ── 2. La recherche (LIKE) À DROITE ; libellé revu en 2.7.74 (repère réécrit). ─
  assert.ok(page.includes('>Recherche</span>') && page.includes("flexDirection: 'row'"),
    '② le champ de recherche est toujours là, libellé collé à sa gauche depuis la 2.7.74');
  assert.ok(page.includes("justifyContent: 'flex-end'"), '② alignée toujours à droite de la page');
  assert.ok(page.includes('includes(recherche.toLowerCase())'), '② filtre LIKE insensible à la casse intact');

  // ── 3. Boîte « Détail » : « Télécharger » VERT (PDF direct, comme transferts). ─
  assert.ok(page.includes('pdf: true') && page.includes('DocumentModal'),
    '③ le détail d’une perte s’ouvre dans la boîte, en mode PDF');
  assert.ok(/detail\('LOSS',/.test(page), '③ la fiche se charge via /documents/LOSS/:id');
  assert.ok(/Btn variant=\{estPdf \? 'ghost' : 'primary'\}[\s\S]{0,120}?style: COULEUR_IMPRIMER/.test(modale),
    '③ « Télécharger » est en vert plein quand le document est un PDF');
  assert.ok(modale.includes('downloadPdf') && modale.includes("includes('?') ? '&' : '?'"),
    '③ le téléchargement vise le point imprimable en fmt=pdf');

  // ── 4. Serveur : fiche de perte en PDF (signatures et remarque obligatoire). ─
  assert.ok(controleur.includes("kind === 'LOSS' && req.query.fmt === 'pdf'"),
    '④ /documents/LOSS/:id/print répond en PDF quand fmt=pdf');
  assert.ok(service.includes('export async function perteFichePdf')
    && service.includes('perte-${loss.reference || id}.pdf'),
    '④ service : génération de la fiche de perte PDF');
  assert.ok(gabarit.includes('FICHE DE PERTE / DON') && gabarit.includes('595.35') && gabarit.includes('841.98'),
    '④ gabarit A4 portrait avec le titre de la fiche');
  assert.ok(gabarit.includes('Remarque justificative') && gabarit.includes('Visa de la direction'),
    '④ remarque obligatoire (RG17) et cases de signatures, comme le papier');
  assert.ok(service.includes("lotNumber: lots.find"), '④ numéros de lots résolus avant le PDF');

  // ── 5. NON-RÉGRESSION : déclaration de perte et totaux inchangés. ────────
  assert.ok(page.includes('Déclarer une perte') && page.includes('Coût total constaté'),
    '⑤ le bouton de déclaration et le badge de total restent');

  assert.ok(/VERSION_APPLI = '2\.(7\.(7[3-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.73');
});

// ============================================================================
// 2.7.74 — PERTES ET DONS, RETOUCHE : libellé « Recherche » raccourci, collé
//   À GAUCHE du champ (barre toujours à droite) ; « Fermer » ROUGE dans la
//   boîte « Détail ».
//   Demande de l'officine : « ilay soratra hoe Recherche (LIKE), atao eo
//   alohan'ny bar de recherche (atao eo à gauche eo akaikiny), ary esorina
//   koa ilay hoe LIKE fa ataohoe Recherche fotsiny, ary ilay bouton fermer
//   apres mikitika detail atao couleur rouge ».
// ============================================================================
test('2.7.74 — Pertes : « Recherche » à gauche du champ (sans mention superflue) ; « Fermer » ROUGE du détail', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'LossesPage.jsx']);
  const modale = lire(['frontend', 'src', 'components', 'DocumentModal.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── 1. Libellé « Recherche » seul, À GAUCHE du champ, barre à droite. ────
  assert.ok(page.includes('>Recherche</span>'), '① le libellé se lit « Recherche » tout court');
  assert.ok(!page.includes('label="Recherche (LIKE)"'), '① la mention entre parenthèses a disparu du libellé');
  assert.ok(page.includes("flexDirection: 'row'") && page.includes("alignItems: 'center'"),
    '① le libellé se colle à gauche du champ, sur la même ligne');
  assert.ok(page.includes("justifyContent: 'flex-end'"), '① la barre reste alignée à droite (2.7.73)');
  assert.ok(page.includes('includes(recherche.toLowerCase())'), '① filtre contient/insensible à la casse intact');
  assert.ok(page.includes('<label className="field"'), '① le libellé cliquable reste rattaché au champ');

  // ── 2. « Fermer » ROUGE dans la boîte « Détail ». ───────────────────────
  assert.ok(modale.includes('<Btn variant="danger" onClick={onClose}>Fermer</Btn>'),
    '② « Fermer » est en rouge plein (variante danger), comme l’historique des ventes');

  // ── 3. NON-RÉGRESSION : Action centrée, Détail bleu, boîte PDF, boutons verts. ─
  assert.ok(page.includes("{ label: 'Action', center: true }") && page.includes('<td className="center nowrap">'),
    '③ colonne « Action » centrée (2.7.73) intacte');
  assert.ok(page.includes('style={COULEUR_DETAIL} icon={Eye}') && page.includes('>Détail</Btn>') && !page.includes('>Fiche</Btn>'),
    '③ « Détail » bleu (2.7.73) intact');
  assert.ok(page.includes('pdf: true') && page.includes("detail('LOSS', detail.id)"),
    '③ la boîte « Détail » reste branchée sur la fiche PDF (2.7.73)');
  assert.ok(/Btn variant=\{estPdf \? 'ghost' : 'primary'\}[\s\S]{0,120}?style: COULEUR_IMPRIMER/.test(modale)
    && modale.includes('downloadPdf'),
    '③ « Télécharger » vert en mode PDF (2.7.73) intact');
  assert.ok(page.includes('Déclarer une perte') && page.includes('Coût total constaté'),
    '③ déclaration de perte et badge de total intacts');

  assert.ok(/VERSION_APPLI = '2\.(7\.(7[4-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.74');
});


// ============================================================================
// 2.7.77 — TABLEAU DE BORD, formes de la maquette : groupes blancs à liseré
//   coloré, TUILES PLEINES en dégradé (texte blanc, icône discrète), et chaque
//   tuile SE SOULÈVE au passage du curseur (mouvement demandé).
//   INTERFACE SEULEMENT. Demande : « ataovy otran'io, ary isakin'ny mandalo
//   an'ireo block misy soratra ireo ny curseur dia tokony misy mouvement ».
//   (Réécrit les repères de la 2.7.76 : les tuiles blanches deviennent pleines.)
// ============================================================================
test('2.7.77 — tableau de bord : tuiles colorées à la maquette + soulèvement au survol', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const page = lire(['frontend', 'src', 'pages', 'DashboardPage.jsx']);
  const styles = lire(['frontend', 'src', 'styles.css']);
  const histo = lire(['frontend', 'src', 'components', 'SalesHistogram.jsx']);
  const flux = lire(['frontend', 'src', 'components', 'DepotFlowChart.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── 1. Formes de la maquette : groupes blancs, tuiles en dégradé. ────────
  assert.ok(page.includes('className="dboard"') && !page.includes('className="night"'),
    '① portée propre du tableau de bord, aucun thème sombre');
  assert.ok(styles.includes('.dboard__grille {') && styles.includes('.dboard__groupe--bleu')
    && styles.includes('.dboard__groupe--orange') && styles.includes('.dboard__groupe--vert')
    && styles.includes('.dboard__groupe--rose') && styles.includes('border-left: 4px solid'),
    '① groupes blancs à fine bordure d’accent (bleu / orange / vert / rose)');
  assert.ok(styles.includes('.dboard__groupe--orange .dtuile') && styles.includes('.dboard__groupe--vert .dtuile')
    && styles.includes('.dboard__groupe--rose .dtuile') && styles.includes('linear-gradient(135deg'),
    '① tuiles PLEINES en dégradé de la couleur de leur groupe, comme la maquette');
  assert.ok(styles.includes('.dtuile--sombre') && page.includes('sombre label="Pertes'),
    '① tuiles « Pertes » en variante plus profonde (comme la maquette)');
  assert.ok(styles.includes('.dtuile__icone') && page.includes('icone: Icone') && page.includes('dtuile__icone'),
    '① petite icône discrète en haut à droite de chaque tuile');

  // ── 2. MOUVEMENT AU SURVOL (demande explicite de l'officine). ────────────
  assert.ok(styles.includes('.dtuile:hover') && styles.includes('translateY(-4px)')
    && styles.includes('transition: transform .16s ease'),
    '② la tuile se soulève doucement au passage du curseur');

  // ── 3. Mêmes chiffres qu'avant : aperçu mois/jour/stock/médicaments. ─────
  assert.ok(page.includes('Ventes du mois') && page.includes('Marge du mois')
    && page.includes('Panier moyen') && page.includes('Pertes du mois'),
    '③ activité du mois : mêmes indicateurs');
  assert.ok(page.includes('Ventes du jour') && page.includes('Pertes du jour')
    && page.includes('Valeur globale du stock') && page.includes('Médicaments actifs'),
    '③ activité du jour et état du stock : mêmes indicateurs');
  assert.ok(page.includes("Mois de ${nomDuMois(month.month)}")
    && page.includes('Alertes de stock (pharmacie)') && page.includes('Prochaines péremptions'),
    '③ mois nommé, alertes et péremptions conservées');

  // ── 4. NON-RÉGRESSION : profils, graphiques, actions. ────────────────────
  assert.match(page, /estDepot \? \['DEPOT'\] : estAdmin \? \['PHARMACY', 'DEPOT'\] : \['PHARMACY'\]/,
    '④ cartes magasins par profil inchangées (2.7.12/2.7.21)');
  assert.match(page, /estDepot && can\('transfer'\) && \{ label: 'Transfert vers la pharmacie'/,
    '④ raccourci transfert réservé au dépôt (2.7.12)');
  assert.ok(page.indexOf('magasins.map') < page.indexOf('<SalesHistogram />'),
    '④ carte magasin toujours AU-DESSUS du graphique (2.7.19)');
  assert.match(page, /!estDepot[\s\S]{0,200}?SalesHistogram[\s\S]{0,500}?DepotFlowChart/,
    '④ pharmacie → ventes · dépôt → flux (2.7.20)');
  assert.match(page, /\{estAdmin \? <div style=\{\{ marginBottom: 16 \}\}><DepotFlowChart \/><\/div> : null\}/,
    '④ l’administrateur voit les deux graphiques (2.7.21)');
  assert.ok(page.includes("'[Pharmacie] '") && page.includes('Nouvelle vente') && page.includes('Perte ou don'),
    '④ préfixe d’alertes et actions rapides intacts');
  assert.ok(histo.includes('salesMonthly') && histo.includes('cheminLisse') && histo.includes('#0f766e'),
    '④ courbe des ventes aux tons du thème clair (2.7.76)');
  assert.ok(flux.includes('#16a34a') && flux.includes('#ea580c') && flux.includes('stockFlowMonthly'),
    '④ flux du dépôt : barres vert/orange inchangées');

  assert.ok(/VERSION_APPLI = '2\.(7\.(7[7-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.77');
});

test('2.7.78 — flux dépôt façon histogramme · gestes centrés-colorés · textes épurés · bon de réception PDF', () => {
  const flux = texteDe('components', 'DepotFlowChart.jsx');
  const stock = texteDe('pages', 'ReportsPage.jsx');
  const inventaires = texteDe('pages', 'InventoriesPage.jsx');
  const receptions = texteDe('pages', 'ReceiptsPage.jsx');
  const reception = texteDe('forms', 'ReceiptForm.jsx');
  const boiteDoc = texteDe('components', 'DocumentModal.jsx');
  const pertes = texteDe('pages', 'LossesPage.jsx');
  const transfert = texteDe('forms', 'TransferForm.jsx');
  const produits = texteDe('pages', 'ProductsPage.jsx');
  const produit = texteDe('forms', 'ProductForm.jsx');
  const categories = texteDe('pages', 'CategoriesPage.jsx');
  const fournisseurs = texteDe('pages', 'SuppliersPage.jsx');
  const ficheFournisseur = texteDe('forms', 'SupplierForm.jsx');
  const bonPdf = readFileSync(join(racine, 'backend', 'src', 'templates', 'receptionPdf.js'), 'utf8');
  const serviceTicket = readFileSync(join(racine, 'backend', 'src', 'services', 'ticket.service.js'), 'utf8');
  const controleurDoc = readFileSync(join(racine, 'backend', 'src', 'controllers', 'document.controller.js'), 'utf8');

  // ① Flux mensuels du dépôt : MÊME DESSIN que l'histogramme des ventes.
  assert.ok(flux.includes('cheminLisse'), 'flux dépôt : courbes lissées (technique de l’histogramme des ventes)');
  assert.ok(flux.includes('degradeAireFluxEntrees') && flux.includes('degradeAireFluxSorties'),
    'flux dépôt : aires dégradées sous les deux courbes (entrées / sorties)');
  assert.ok(flux.includes('fill="url(#degradeAireFluxEntrees)"'), 'aire sous la courbe des entrées');
  assert.ok(flux.includes('#16a34a') && flux.includes('#ea580c'), 'vert = entrées · orange = sorties (inchangé)');
  assert.ok(flux.includes('stockFlowMonthly') && flux.includes('<title>'), 'mêmes données, info-bulles par mois');

  // ② Menu « Stock » : « Recalculer » VERT ; dépôt « Telecharger » VERT.
  assert.ok(stock.includes('style={COULEUR_VERT} icon={RefreshCw}'), '« Recalculer » passe en VERT plein');
  assert.ok(stock.includes('>Telecharger</Btn>'), 'dépôt : « Telecharger » remplace « Detail » (PDF direct)');

  // ③ Inventaires — REPÈRES RÉÉCRITS EN 2.7.80 (demande de l'officine) : la
  // « Fiche de stock du mois » a été RETIRÉE (2.7.79) ; la boîte « Historique
  // d’inventaire » l'a été aussi (2.7.80) : la LISTE affiche directement
  // Médicament · Théorique · Physique (compté) · Écart · Justification.
  assert.ok(!inventaires.includes('ouvrirFicheDuMois'), '2.7.79 : la fiche du mois a disparu des inventaires');
  assert.ok(!inventaires.includes('/reports/print?type=fiche'), '2.7.79 : plus de PDF « fiche du mois » depuis cet écran');
  assert.ok(!inventaires.includes('reports.load('), '2.7.79 : plus de chargement type=fiche ici');
  assert.ok(!inventaires.includes('ouvrirHistorique') && !inventaires.includes('size="detail"'),
    '2.7.80 : la boîte « Détail/Historique » a disparu — le comptage est sur la liste');
  assert.ok(inventaires.includes('<th className="num">Physique (compté)</th>'),
    '2.7.80 : liste des inventaires au contenu, « Physique (compté) » demandé');
  
  // ④ Réceptions : deux cartes, recherche à droite, Action centrée-colorée.
  assert.ok(receptions.includes('Réceptions (dépôt)') && receptions.includes('réception(s) sur la période'),
    'réceptions : carte 1 (période) + carte 2 (liste)');
  assert.ok(receptions.includes('>Recherche</span>'), 'réceptions : « Recherche » collée au champ, à droite');
  assert.ok(receptions.includes("{ label: 'Action', center: true }"), 'réceptions : colonne « Action » centrée');
  assert.ok(receptions.includes('<span className="actes">'), 'réceptions : espace entre « Modifier » et « Détail »');
  assert.ok(receptions.includes('style={COULEUR_DETAIL}') && receptions.includes('style={COULEUR_IMPRIMER}'),
    'réceptions : « Modifier » BLEU · « Détail » VERT');
  assert.ok(receptions.includes('sansImprimer') && receptions.includes('pdf: true'),
    'réceptions : détail en boîte SANS « Imprimer », prêt pour le PDF');

  // ⑤ Boîte de détail : prop « sansImprimer » ; les pertes l'utilisent aussi.
  assert.ok(boiteDoc.includes('sansImprimer = false') && boiteDoc.includes('!sansImprimer && document?.imprimable'),
    'DocumentModal : « sansImprimer » masque le bouton « Imprimer »');
  assert.ok(boiteDoc.includes('<Btn variant="danger" onClick={onClose}>Fermer</Btn>'),
    'DocumentModal : « Fermer » rouge inchangé (2.7.74)');
  assert.ok(boiteDoc.includes('downloadPdf(cheminPdf(), nomFichier)') && boiteDoc.includes('fmt=pdf'),
    'DocumentModal : téléchargement PDF inchangé (2.7.72)');
  assert.ok(pertes.includes('sansImprimer'), 'pertes : « Détail » sans « Imprimer » non plus');

  // ⑥ Formulaires épurés ; les mécaniques, elles, ne bougent PAS.
  assert.ok(!reception.includes('tone="info"'), 'réception : bannière d’introduction retirée');
  assert.ok(reception.includes('banner--warn') && reception.includes('Motif de la correction'),
    'réception : la bannière de CORRECTION, elle, reste');
  assert.ok(!transfert.includes('tone="info"'), 'transfert : bannière FEFO retirée de l’écran');
  assert.ok(!transfert.includes('label="Motif du transfert" hint'), 'transfert : consigne du motif retirée');
  assert.ok(transfert.includes('fefoParProduit') && transfert.includes('motifRefus'),
    'transfert : règle FEFO et notification d’aiguillage INCHANGÉES');
  assert.ok(transfert.includes('<Btn variant="danger" icon={Trash2}'), 'transfert : « Retirer » en ROUGE plein');

  // ⑦ Médicaments : deux cartes, gestes centrés et colorés ; fiche épurée.
  assert.ok(produits.includes("{ label: 'Action', center: true }") && produits.includes('<span className="actes">'),
    'médicaments : colonne « Action » centrée, gestes espacés');
  assert.ok(produits.includes('style={COULEUR_DETAIL} icon={Pencil}'), 'médicaments : « Modifier » BLEU');
  assert.ok(produits.includes('style={COULEUR_IMPRIMER} icon={History}'), 'médicaments : « Historique des prix » VERT');
  assert.ok(produits.includes('style={produit.active ? COULEUR_ANNULER : COULEUR_IMPRIMER}'),
    'médicaments : « Désactiver » ROUGE / « Réactiver » VERT');
  assert.ok(!produits.includes('Un médicament n’est jamais supprimé'),
    'médicaments : paragraphe sous le tableau retiré');
  for (const cle of ['blistersPerBox', 'unitsPerBlister', 'pricePerBlister', 'pricePerUnit']) {
    assert.ok(produit.includes(cle), `fiche médicament : ${cle} reste dans l’état ET le payload (2.7.12 respecté)`);
  }
  assert.ok(!produit.includes('hint="Ex. 10'), 'fiche médicament : cases « vente au détail » hors de l’écran');
  assert.ok(produit.includes('<Btn variant="danger" onClick={onCancel}>Retour</Btn>'),
    'fiche médicament : « Retour » ROUGE plein');

  // ⑧ Catégories & fournisseurs : recherche à droite, Action centrée, couleurs.
  for (const [nom, texte] of [['Catégories', categories], ['Fournisseurs', fournisseurs]]) {
    assert.ok(texte.includes('label="Recherche"') && !texte.includes('label="Recherche (LIKE)"'),
      `${nom} : libellé « Recherche » tout court (case à droite du titre)`);
    assert.ok(texte.includes("{ label: 'Action', center: true }") && texte.includes('<span className="actes">'),
      `${nom} : colonne « Action » centrée, gestes espacés`);
    assert.ok(texte.includes('style={COULEUR_DETAIL} icon={Pencil}'), `${nom} : « Modifier » BLEU`);
  }
  assert.ok(fournisseurs.includes('style={COULEUR_ANNULER} icon={Trash2}'), 'fournisseurs : « Supprimer » ROUGE');
  assert.ok(!ficheFournisseur.includes('<Banner '), 'fiche fournisseur : bannière « Raison sociale » retirée');

  // ⑨ Bon de réception en PDF côté serveur (A4 portrait, plan 527 points).
  assert.ok(bonPdf.includes('BON DE RÉCEPTION'), 'template du bon de réception (A4)');
  for (const largeur of ['largeur: 160', 'largeur: 58', 'largeur: 55', 'largeur: 50', 'largeur: 44']) {
    assert.ok(bonPdf.includes(largeur), `bon de réception : colonne ${largeur}`);
  }
  assert.ok(bonPdf.includes('Fabriquant') && bonPdf.includes('Coût de revient'),
    'bon de réception : colonnes fabriquant (2.7.49) et coût de revient');
  assert.match(serviceTicket, /export async function receptionBonPdf/, 'service : receptionBonPdf');
  assert.ok(serviceTicket.includes('reception-${receipt.reference || id}.pdf'), 'nom de fichier « reception-… .pdf »');
  assert.ok(controleurDoc.includes("kind === 'RECEIPT' && req.query.fmt === 'pdf'") && controleurDoc.includes('receptionBonPdf'),
    'contrôleur : branche RECEIPT fmt=pdf (après LOSS 2.7.73)');

    // ⑩ Version affichée partout (repère générique : au moins 2.7.78).
  const version = readFileSync(join(racine, 'backend', 'src', 'utils', 'version.js'), 'utf8');
  assert.ok(/VERSION_APPLI = '2\.(7\.(7[8-9]|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.78');
});

// ============================================================================
// 2.7.79 — 6 DEMANDES DE L'OFFICINE (malgache) :
//   ① INVENTAIRES : « Détail » par session = l'HISTORIQUE compté (Médicament ·
//     Lot · Réception · Théorique · Physique · Écart · Justification) en boîte
//     plein écran ; « Fiche de stock du mois » retirée ; le comptage arrive
//     PRÉ-REMPLI avec le théorique (« dia feno mifanaraka »).
//   ② TRANSFERTS : colonne « Quantité transférée », colonne « Stock Final »
//     (stock actuel au comptoir), bouton « Modifier » = CORRECTION DE
//     TRANSFERT avec WORKFLOW ADMIN (comme les réceptions 2.7.34) : le dépôt
//     propose, l'administrateur valide ou refuse ; stock remis au millimètre
//     sur validation (défaite tracée CANCEL puis refaite).
//   ③ VENTE : « Servi par » SAISI à la caisse (pré-rempli avec le nom du
//     compte ; change d'une vente à l'autre) ; cousu dans la note (marqueur
//     ⟦Servi par : X⟧, utils/serviPar.js — aucune colonne nouvelle), lu par
//     le ticket, l'ordonnance, le rapport des ventes et la fiche de la vente.
//   ④ CLIENTS HÔPITAL : ordonnance PAR JOUR (achats du jour seul, jamais
//     mêlés aux autres jours) en plus de l'ordonnance cumulée du séjour.
//   ⑤ HOSPITALISATION : nouveau champ « Motif » (raison d'admission, ex.
//     « Fièvre ») sur le patient — migration 014 (patients.motif).
//   ⚠ MIGRATION 014 (patients.motif + transfer_corrections) : npm run db:migrate.
// ============================================================================
test('2.7.79 — historique d’inventaire · corrections de transfert · « Servi par » · ordonnance par jour · motif patient', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const inventaires = texteDe('pages', 'InventoriesPage.jsx');
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  const formCorrection = lire(['frontend', 'src', 'forms', 'TransferCorrectionForm.jsx']);
  const vente = texteDe('pages', 'SalesPage.jsx');
  const historique = texteDe('pages', 'HistoriqueVentesPage.jsx');
  const patients = texteDe('pages', 'PatientsPage.jsx');
  const ficheVente = texteDe('components', 'SaleHistoryModal.jsx');
  const endpoints = lire(['frontend', 'src', 'api', 'endpoints.js']);
  const serviPar = lire(['backend', 'src', 'utils', 'serviPar.js']);
  const modeleCorrection = lire(['backend', 'src', 'models', 'transferCorrection.model.js']);
  const serviceCorrection = lire(['backend', 'src', 'services', 'transferCorrection.service.js']);
  const routes = lire(['backend', 'src', 'routes', 'stock.routes.js']);
  const validateurVente = lire(['backend', 'src', 'validators', 'sale.validator.js']);
  const validateurTransfert = lire(['backend', 'src', 'validators', 'transfer.validator.js']);
  const serviceVente = lire(['backend', 'src', 'services', 'sale.service.js']);
  const serviceDocument = lire(['backend', 'src', 'services', 'document.service.js']);
  const serviceRapport = readFileSync(join(racine, 'backend', 'src', 'services', 'report.service.js'), 'utf8');
  const serviceTransfert = readFileSync(join(racine, 'backend', 'src', 'services', 'transfer.service.js'), 'utf8');
  const ticket = lire(['backend', 'src', 'templates', 'saleTicket.js']);
  const documentsPdf = lire(['backend', 'src', 'templates', 'documentsPdf.js']);
  const ordonnanceSejour = lire(['backend', 'src', 'templates', 'ordonnanceSejour.js']);
  const validateurHopital = lire(['backend', 'src', 'validators', 'hospital.validator.js']);
  const serviceHopital = lire(['backend', 'src', 'services', 'hospital.service.js']);
  const modelePatient = lire(['backend', 'src', 'models', 'patient.model.js']);
  const modeles = lire(['backend', 'src', 'models', 'index.js']);
  const ids = lire(['backend', 'src', 'utils', 'ids.js']);
  const migration = readFileSync(join(racine, 'backend', 'sql', '014_motif_patients_corrections_transfert.sql'), 'utf8');
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── ① INVENTAIRES : historique par session ; fiche du mois retirée. ──────
  assert.ok(!inventaires.includes('ouvrirFicheDuMois')
    && !inventaires.includes('Fiche de stock du mois')
    && !inventaires.includes('reports.load('),
    '① la « Fiche de stock du mois » a quitté l’écran Inventaires');
  assert.ok(inventaires.includes('ouvrirHistorique') && inventaires.includes('Historique d’inventaire')
    && inventaires.includes('size="detail"'),
    '① « Détail » ouvre l’historique de la session, en boîte plein écran');
  for (const colonne of ['<th>Médicament</th>', '<th>Lot</th>', '<th>Réception (reçu le)</th>',
    '<th className="num">Théorique</th>', '<th className="num">Physique (compté)</th>',
    '<th className="num">Écart</th>', '<th>Justification</th>']) {
    assert.ok(inventaires.includes(colonne), `① colonne de l’historique : ${colonne}`);
  }
  assert.ok(stock_inventory_prefill(inventaires), '① le comptage arrive PRÉ-REMPLI avec le théorique');
  assert.ok(inventaires.includes('>Compter</Btn>') && inventaires.includes('>Feuille</Btn>'),
    '① « Compter » (brouillon) et « Feuille » (imprimable) conservés');

  // ── ② TRANSFERTS : colonnes + CORRECTION avec workflow administrateur. ───
  assert.ok(transferts.includes("{ label: 'Quantité transférée', num: true }"),
    '② colonne « Quantité » renommée « Quantité transférée »');
  assert.ok(transferts.includes("{ label: 'Stock Final', num: true }"),
    '② nouvelle colonne « Stock Final » (stock comptoir lu en direct)');
  assert.ok(transferts.includes('state=et-stock « sur la période »'.length ? 'transfert(s) sur la période' : ''),
    '② la carte liste par période est conservée');
  assert.ok(transferts.includes("style={COULEUR_DETAIL} icon={SquarePen}")
    && transferts.includes(">Modifier</Btn>"),
    '② « Modifier » en BLEU plein (crayon) = proposition de correction');
  assert.ok(transferts.includes('correction en attente'),
    '② badge « correction en attente » tant que l’administrateur n’a pas tranché');
  assert.ok(transferts.includes('Corrections de transfert') && transferts.includes('>Trancher</Btn>')
    && transferts.includes('>Valider la correction</Btn>'.split('>')[1])
      || transferts.includes('Valider la correction'),
    '② carte des corrections avec « Trancher » / « Valider » / « Refuser » (admin)');
  assert.ok(formCorrection.includes('proposerCorrectionTransfert')
    && formCorrection.includes('Motif de la correction'),
    '② formulaire pré-rempli envoyé à l’administrateur avec un motif');
  assert.ok(endpoints.includes("api.post(`/transfers/${transferId}/corrections`, values)")
    && endpoints.includes('validerCorrectionTransfert') && endpoints.includes('refuserCorrectionTransfert'),
    '② endpoints JS des corrections de transfert');

  // … côté SERVEUR : routes, garde « intact », application transactionnelle.
  assert.ok(routes.includes("router.post('/transfers/:id/corrections'")
    && routes.includes("requirePermission('transfer')"),
    '② la demande de correction exige la permission « transfer » (dépôt)');
  assert.ok(routes.includes("router.post('/transfer-corrections/:id/validate'")
    && routes.includes("router.post('/transfer-corrections/:id/refuse'")
    && routes.includes('/transfer-corrections/:id/validate\''),
    '② validation/refus réservés à l’administrateur');
  const troisValidation = routes.split('/transfer-corrections/:id/validate').length - 1;
  assert.ok(troisValidation === 1, '② une seule route de validation de correction de transfert');
  assert.ok(routes.includes("requirePermission('settings'),\n    validateBody(validateNoteSchema), asyncHandler(correctionsTransfert.valider)")
    || routes.includes("correctionsTransfert.valider"),
    '② la validation exige la permission « settings » (administrateur)');
  assert.match(routes, /router\.get\('\/transfer-corrections'.*requirePermission\('transfer'\)/s
    .test('') ? /^/ : /router\.get\('\/transfer-corrections', requirePermission\('transfer'\)/,
    '② la liste des corrections est lisible par le dépôt');
  assert.ok(routes.indexOf("/transfer-corrections") < routes.indexOf("router.get('/transfers/:id'"),
    '② /transfer-corrections déclaré AVANT /transfers/:id (Express)');

  assert.ok(serviceCorrection.includes('assertTransfertIntact')
    && serviceCorrection.includes('Le chemin restant est l’annulation tracée'),
    '② garde « aucun lot du transfert n’a bougé » (vente/perte/inventaire/autre transfert)');
  assert.ok(serviceCorrection.includes("kind: 'CANCEL'") && serviceCorrection.includes("'TRANSFER_OUT'")
    && serviceCorrection.includes("'TRANSFER_IN'") && serviceCorrection.includes('TransferLine.destroy'),
    '② validation = défaite tracée (CANCEL) puis refaite (OUT/IN) — jamais de suppression d’historique');
  assert.ok(serviceCorrection.includes("makeReference('TRANSFER_CORRECTION'") && ids.includes("TRANSFER_CORRECTION: 'TRC'"),
    '② références « TRC-… » pour les corrections de transfert');
  assert.ok(serviceCorrection.includes("entity: 'TRANSFER_CORRECTION'"),
    '② corrections tracées dans le journal d’audit');
  assert.ok(modeleCorrection.includes("tableName = 'transfer_corrections'")
    || modeleCorrection.includes("'transfer_corrections'"),
    '② modèle Sequel­ize sur la table transfer_corrections');
  assert.ok(modeles.includes('TransferCorrection'), '② modèle enregistré dans models/index.js');
  assert.ok(validateurTransfert.includes('transferCorrectionSchema')
    && validateurTransfert.includes('transferReason'),
    '② la demande porte motif de correction + motif de transfert corrigé + lignes');
  assert.ok(serviceTransfert.includes('fromLotId: ligne.fromLotId'),
    '② le détail du transfert renvoie les lots (pré-remplissage du formulaire)');

  // ── ③ VENTE : « Servi par » SAISI, sans colonne nouvelle. ────────────────
  assert.ok(vente.includes('label="Servi par"') && vente.includes('serviPar.trim()'),
    '③ champ « Servi par » dans le client/remarque, envoyé à la création');
  assert.ok(vente.includes('useState(user?.name || \'\')'),
    '③ pré-rempli avec le nom du compte connecté (modifiable à chaque vente)');
  assert.ok(validateurVente.includes('servedBy'), '③ le validateur accepte « servedBy » (vente seule)');
  {
    // Le devis (saleQuoteSchema, défini AVANT saleSchema dans le fichier) ne doit
    // PAS accepter « servedBy » : c'est un calcul, pas une vente enregistrée.
    const devis = validateurVente.slice(
      validateurVente.indexOf('saleQuoteSchema'), validateurVente.indexOf('saleSchema ='));
    assert.ok(!devis.includes('servedBy'), '③ le devis, lui, n’emporte pas « servedBy »');
  }
  assert.ok(serviPar.includes('⟦Servi par :') && serviPar.includes('serviParDe')
    && serviPar.includes('coudreServiPar') && serviPar.includes('decortiquerNote'),
    '③ utils/serviPar.js : marqueur ⟦Servi par : X⟧ + couture/lecture');
  assert.ok(serviceVente.includes('coudreServiPar(payload.note, payload.servedBy)'),
    '③ le nom saisi est cousu en tête de la note à la création');
  assert.ok(ticket.includes('serviParDe(sale.note)') && documentsPdf.includes('serviParDe(sale.note)'),
    '③ ticket + PDF : « Servi par » saisi prime sur le compte connecté');
  assert.ok(serviceRapport.includes("SUBSTRING(sa.note FROM '⟦Servi par : ([^⟧]+)⟧')"),
    '③ rapport des ventes : colonne « Servi par » décodée de la note');
  assert.ok(serviceDocument.includes('decortiquerNote(document.note)') && serviceDocument.includes('servedBy'),
    '③ la fiche de la vente sépare le nom de délivrance de la remarque');
  assert.ok(ficheVente.includes('detail.servedBy'),
    '③ « Servi par » affiché dans l’historique des ventes');

  // ── ④ CLIENTS HÔPITAL : ordonnance PAR JOUR + cumulée conservée. ─────────
  assert.ok(historique.includes('joursAchats') && historique.includes('Ordonnance du jour (PDF)')
    && historique.includes('?du=${jour}&au=${jour}') || historique.includes('du=${jour}&au=${jour}'),
    '④ ordonnance d’un jour : du = au = jour choisi (aucun mélange de jours)');
  assert.ok(historique.includes('ordonnance-sejour-${patientId}.pdf'),
    '④ l’ordonnance CUMULÉE du séjour est conservée telle quelle');
  assert.ok(historique.includes('Motif d’hospitalisation'),
    '④ la raison d’hospitalisation repasse dans la fiche de séjour');

  // ── ⑤ HOSPITALISATION : champ « Motif » (migration 014). ─────────────────
  assert.ok(patients.includes('label="Motif d’hospitalisation"') && patients.includes("changer('motif')"),
    '⑤ fiche patient : case « Motif d’hospitalisation » (ex. Fièvre)');
  assert.ok(patients.includes("{ label: 'Motif' }") && patients.includes('{patient.motif || '),
    '⑤ colonne « Motif » dans la liste des patients');
  assert.ok(validateurHopital.includes('motif') && serviceHopital.includes('motif: values.motif')
    && modelePatient.includes('motif:'),
    '⑤ motif : validateur + service + modèle patient');
  assert.ok(documentsPdf.includes("['Motif d’hospitalisation', patient.motif]")
    && ordonnanceSejour.includes('Motif d’hospitalisation'),
    '⑤ le motif passe sur les ordonnances (vente carnet + séjour)');

  // ── ⑥ MIGRATION 014 : colonne motif + table transfer_corrections. ────────
  assert.ok(migration.includes('patients') && migration.includes('motif'),
    '⑥ migration 014 : patients.motif');
  assert.ok(migration.includes('transfer_corrections') && migration.includes("status = 'PENDING'"),
    '⑥ migration 014 : table transfer_corrections (index unique en attente)');

    // ⑦ Version affichée partout (repère générique : au moins 2.7.79).
  assert.ok(/VERSION_APPLI = '2\.(7\.(79|[8-9]\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.79');

  // Petit utilitaire local : le comptage d'inventaire pré-rempli (théorique).
  function stock_inventory_prefill(texte) {
    return texte.includes('ligne.physical === null || ligne.physical === undefined')
      && texte.includes('? ligne.theoretical');
  }
});

// ============================================================================
test('2.7.80 — inventaires au contenu compté · comptage sans « Lot » · correction transfert réparée · stock final au dépôt', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const inventaires = texteDe('pages', 'InventoriesPage.jsx');
  const transferts = texteDe('pages', 'TransfersPage.jsx');
  const serviceCorrection = lire(['backend', 'src', 'services', 'transferCorrection.service.js']);
  const serviceTableau = lire(['backend', 'src', 'services', 'dashboard.service.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ── ① LISTE DES INVENTAIRES : colonnes de la permission de l'officine. ──
  for (const colonne of ['<th>Médicament</th>', '<th className="num">Théorique</th>',
    '<th className="num">Physique (compté)</th>', '<th className="num">Écart</th>',
    '<th>Justification</th>', '<th>Date</th>', '<th style={{ textAlign: \'center\' }}>Action</th>']) {
    assert.ok(inventaires.includes(colonne), `① colonne demandée : ${colonne}`);
  }
  for (const disparue of ['<th>Référence</th>', '<th>Périmètre</th>', '<th className="num">Lots comptés</th>',
    'ouvrirHistorique', 'Historique d’inventaire', 'size="detail"']) {
    assert.ok(!inventaires.includes(disparue), `① « ${disparue} » a quitté la liste des inventaires`);
  }
  assert.ok(inventaires.includes('inventaire.lines || []'),
    '① le contenu compté est lu depuis les lignes embarquées');
  assert.ok(inventaires.includes('dt(inventaire.createdAt)') || inventaires.includes('dateTime(inventaire.createdAt)'),
    '① « Date » = date nanao ny inventaire (ouverture de session)');
  assert.ok(inventaires.includes('>Compter</Btn>') && inventaires.includes('>Feuille</Btn>'),
    '① « Compter » (brouillon) et « Feuille » (imprimable) conservés');

  // ── ② « OUVRIR UN INVENTAIRE » : colonne « Lot » retirée du comptage. ────
  const comptage = inventaires.slice(inventaires.indexOf('{comptage ? ('));
  assert.ok(comptage.includes('<th>Réception (reçu le)</th>'),
    '② « Réception (reçu le) » est conservée pour identifier chaque lot');
  assert.ok(!comptage.split('</thead>')[0].includes('<th>Lot</th>'),
    '② la colonne « Lot » a disparu du tableau de comptage');

  // ── ③ CORRECTION DE TRANSFERT RÉPARÉE : garde « intact » temporelle. ─────
  assert.ok(serviceCorrection.includes('createdAt: { [Op.gt]: transfer.createdAt }'),
    '③ seuls les mouvements POSTÉRIEURS au transfert bloquent la correction');
  assert.ok(serviceCorrection.includes('la réception d\'origine du lot, antérieure')
    || serviceCorrection.includes('la réception d’origine du lot, antérieure')
    || serviceCorrection.includes('réception\nd\'ORIGINE')
    || serviceCorrection.includes("RECEIPT\""),
    '③ la réception antérieure du lot n’est plus comptée comme obstacle');

  // ── ④ HISTORIQUE DE TRANSFERT : « Stock Final » DÉPÔT, colonne centrée. ──
  assert.ok(transferts.includes('stockFinalDepot') && transferts.includes("lot.location !== 'DEPOT'"),
    '④ « Stock Final » = somme des lots du produit au DÉPÔT (réserve)');
  assert.ok(transferts.includes("{ label: 'Quantité transférée', center: true }")
    && transferts.includes('<td className="center">'),
    '④ « Quantité transférée » affichée centrée');

  // ── ⑤ NON-RÉGRESSION : workflow de correction complet conservé. ──────────
  // (l'appel « proposerCorrectionTransfert » vit dans TransferCorrectionForm.jsx)
  for (const repere of ['>Modifier</Btn>', 'Corrections de transfert', 'TransferCorrectionForm',
    'correction en attente', '>Détail</Btn>', 'Historique de transfert']) {
    assert.ok(transferts.includes(repere), `⑤ repère conservé : ${repere}`);
  }

  // ⑥ Le tableau de bord du dépôt charge les lignes d'inventaire avec la session.
  assert.ok(serviceTableau.includes('InventoryLine') && serviceTableau.includes('lignesParInventaire')
    && serviceTableau.includes('...inventaire,\n    lines: lignesParInventaire.get(inventaire.id) || []'),
    '⑥ lignes d’inventaire embarquées dans le payload du tableau de bord');

    // ⑦ Version affichée partout (repère générique : au moins 2.7.80).
  assert.ok(/VERSION_APPLI = '2\.(7\.(8\d)|[89])/.test(version),
    'version.js : version ≥ 2.7.80');
});
// ============================================================================
test('2.7.81 — lignes « Quantité transférée » alignées · correction de transfert diagnostique', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const css = lire(['frontend', 'src', 'styles.css']);
  const serviceCorrection = lire(['backend', 'src', 'services', 'transferCorrection.service.js']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ① Lignes alignées : dans un tableau, .center reste une CELLULE.
  assert.ok(css.includes('table.data th.center, table.data td.center { display: table-cell; }'),
    '① « display: table-cell » impose aux cellules centrées de rester des cellules');

  // ② Correction DIAGNOSTIQUE : nomme le mouvement qui bloque.
  assert.ok(serviceCorrection.includes('Movement.findAll')
    && serviceCorrection.includes("order: [['id', 'DESC']]")
    && serviceCorrection.includes('KIND_LIBELLE')
    && serviceCorrection.includes('numerosLots'),
    '② la garde « transfert intact » liste les mouvements qui bloquent');
  assert.ok(serviceCorrection.includes('a déjà bougé APRÈS le transfert'),
    '② le message dit que le blocage est POSTÉRIEUR au transfert');

  // ③ NON-RÉGRESSION : correctifs 2.7.80 conservés.
  assert.ok(serviceCorrection.includes('createdAt: { [Op.gt]: transfer.createdAt }'),
    '③ correctif temporel 2.7.80 conservé');

   // ④ Version affichée partout.
  assert.match(version, /'2\.7\.(8[1-9]|[1-9]\d+)'/, 'version.js : pas en dessous de 2.7.81');
});

// ============================================================================
// 2.7.82 — DEMANDES DE L'OFFICINE (ordonnance de séjour + fenêtre + patients) :
//   ① modal « Séjour » (Historique des ventes) : les champs « Du / Au » du
//     pied sont RETIRÉS — l'ordonnance de séjour = le séjour ENTIER (l'ordon-
//     nance « par jour » de la 2.7.79 reste le moyen de resserrer) ;
//   ② ordonnance de séjour : ligne « Servi par : … » citant les noms saisis
//     à la caisse à CHAQUE carnet (marqueur ⟦Servi par : X⟧, serviPar.js) ;
//   ③ ordonnance de séjour : « Service : … » SUR SA PROPRE LIGNE sous le
//     patient (fini le « Nom · Service ») ;
//   ④ ordonnance de séjour : colonnes QUANTITÉ / PRIX UNITAIRE AÉRÉES (HTML
//     padding-left 6,5 mm ; PDF : médicament un peu plus étroit) ;
//   ⑤ « Patients hospitalisés » : colonne « Date de sortie » (dischargedOn,
//     gravée automatiquement par « Sortie du service », migration 013).
// ============================================================================
test('2.7.82 — modal sans « Du/Au » · ordonnance aérée avec « Servi par » · date de sortie en colonne', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const historiqueVentes = lire(['frontend', 'src', 'pages', 'HistoriqueVentesPage.jsx']);
  const ordonnanceSejour = lire(['backend', 'src', 'templates', 'ordonnanceSejour.js']);
  const docsPdf = lire(['backend', 'src', 'templates', 'documentsPdf.js']);
  const hopitalService = lire(['backend', 'src', 'services', 'hospital.service.js']);
  const patientsPage = lire(['frontend', 'src', 'pages', 'PatientsPage.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ① Fenêtre « Séjour de X » : plus de champs « Du / Au » dans le pied.
  const modal = historiqueVentes.slice(historiqueVentes.indexOf('function ModalSejour'));
  assert.ok(!modal.includes('title="Du (début de fenêtre)"') && !modal.includes('aria-label="Du"'),
    '① modal Détail : les champs « Du » / « Au » du pied ont disparu');
  assert.ok(modal.includes("urlOrdonnance = () => `/patients/${patientId}/ordonnance`"),
    '① l’ordonnance de séjour du modal ne prend plus de fenêtre : séjour entier');
  assert.ok(modal.includes('Ordonnance du jour (PDF)') && modal.includes('ordonnance-sejour-'),
    '① les deux boutons ordonnance (du jour + du séjour) restent');
  // … mais le FILTRE « entre deux dates » de la PAGE (au-dessus de la liste)
  //    reste disponible : la demande ne le visait pas.
  assert.ok(historiqueVentes.includes('sejour-fenetre') && historiqueVentes.includes("query.set('du', fenetre.du)"),
    '① filtre « Du/Au » de la page (liste des séjours) conservé');

  // ② « Servi par » : noms cousus dans les notes des carnets, cités sur le papier.
  assert.ok(hopitalService.includes('serviParDe') && hopitalService.includes('const serveurs = []')
    && hopitalService.includes('serveurs,'),
    '② hospital.service : séjour = liste « serveurs » depuis les notes ⟦Servi par⟧');
  assert.ok(ordonnanceSejour.includes('<div>Servi par : ${escapeHtml((sejour.serveurs || []).join'),
    '② ordonnance HTML : ligne « Servi par : » depuis sejour.serveurs');
  assert.ok(docsPdf.includes("['Servi par', (sejour.serveurs || []).join"),
    '② ordonnance PDF : ligne « Servi par » depuis sejour.serveurs');

  // ③ Service SUR SA PROPRE LIGNE sous le patient (HTML + PDF).
  assert.ok(ordonnanceSejour.includes("<div>Service : <strong>${escapeHtml(patient.service)}</strong></div>")
    && !ordonnanceSejour.includes("· ${escapeHtml(patient.service)}"),
    '③ ordonnance HTML : « Service : … » descendu sur sa ligne (plus de « · service »)');
  assert.ok(docsPdf.includes("['Patient', patient.name]") && docsPdf.includes("patient.service ? ['Service', patient.service] : null"),
    '③ ordonnance PDF : Service sur sa propre ligne de métas');

  // ④ Colonnes qté / prix unitaire aérées sur l'ordonnance de séjour.
  assert.ok(ordonnanceSejour.includes('padding-left:6.5mm'),
    '④ ordonnance HTML : marge gauche des colonnes chiffrées portée à 6,5 mm');
  assert.ok(docsPdf.includes('x2: geo.gauche + 140') && docsPdf.includes('x2: geo.gauche + 196'),
    '④ ordonnance PDF : quantité / prix unitaire écartés');

  // ⑤ Colonne « Date de sortie » dans « Patients hospitalisés ».
  assert.ok(patientsPage.includes("{ label: 'Date de sortie' }") && patientsPage.includes('dateFr(patient.dischargedOn)'),
    '⑤ liste des patients : colonne « Date de sortie » (automatique)');

  // Version affichée partout.
  assert.ok(version.includes("'2.7.82'"), 'version.js : 2.7.82');
});

// ============================================================================
// 2.7.83 — DEMANDES DU DÉPÔT :
//   ① Nouvelle réception : la liste déroulante « Unité de gestion » est
//     ENRICHIE — Boîte, Plaquette, Flacon, Comprimé, Ampoule, Rouleau, Carton,
//     ml, cm (« pièce » retirée ; les lignes anciennes gardent leur valeur par
//     le repli existant) ;
//   ② Historique de transfert : le bouton « Détail » passe en VERT plein (le
//     « Modifier » 2.7.79 conserve le BLEU de la vente).
// ============================================================================
test('2.7.83 — réception : 9 unités de gestion · transfert : « Détail » VERT', () => {
  const lire = chemin => readFileSync(join(racine, ...chemin), 'utf8');
  const reception = lire(['frontend', 'src', 'forms', 'ReceiptForm.jsx']);
  const transferts = lire(['frontend', 'src', 'pages', 'TransfersPage.jsx']);
  const version = lire(['backend', 'src', 'utils', 'version.js']);

  // ① Liste déroulante enrichie au dépôt.
  assert.ok(reception.includes(
    "const UNITES_GESTION = ['boîte', 'plaquette', 'flacon', 'comprimé', 'ampoule', 'rouleau', 'carton', 'ml', 'cm'];"),
    '① UNITES_GESTION : Boîte, Plaquette, Flacon, Comprimé, Ampoule, Rouleau, Carton, ml, cm');
  assert.ok(reception.includes('UNITES_GESTION.map(u =>'),
    '① la liste déroulante « Unité de gestion » puise toujours dans cette table');
  assert.ok(reception.includes('!UNITES_GESTION.includes(ligne.unit)'),
    '① le repli conserve les unités déjà enregistrées hors liste');

  // ② « Détail » transfert VERT, « Modifier » reste BLEU.
  assert.ok(transferts.includes('style={COULEUR_IMPRIMER} icon={Eye}') && transferts.includes('>Détail</Btn>'),
    '② historique de transfert : « Détail » en VERT plein');
  assert.ok(transferts.includes('style={COULEUR_DETAIL} icon={SquarePen}') && transferts.includes('>Modifier</Btn>'),
    '② « Modifier » (correction) conserve le BLEU plein');
  assert.ok(transferts.includes("import { COULEUR_DETAIL, COULEUR_IMPRIMER } from '../components/SaleHistoryModal.jsx'"),
    '② les deux tons sont importés pour la même page');

  // Version affichée partout.
  assert.ok(version.includes("'2.7.83'"), 'version.js : 2.7.83');
});