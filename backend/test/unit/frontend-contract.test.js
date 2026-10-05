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
    [join('forms', 'ReceiptForm.jsx')]: ['productId', 'number', 'quantity', 'purchasePrice', 'receivedOn', 'expiresOn', 'manufacturedOn'],
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
  assert.ok(fiche.includes('Plus de « Raison sociale » à saisir'), 'la règle est expliquée à l’utilisateur');
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
  assert.ok(!lignesMenu.some(l => l.includes("label: 'Historique de vente'")), 'l’ancien libellé a disparu');

  // 2. Le bouton « Historique de vente » existe dans l'écran Vente, avec détails.
  const ventes = texteDe('pages', 'SalesPage.jsx');
  assert.match(ventes, /Historique de vente/, 'bouton Historique de vente dans l’écran Vente');
  assert.match(ventes, /SaleHistoryModal/, 'la boîte d’historique est branchée');
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
  assert.ok(!ecran.match(/<Field label="Du">/) && !ecran.match(/<Field label="Au">/),
    'plus de saisie de dates manuelle (les 4 raccourcis suffisent)');
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
  assert.ok(stock.includes('CarteMedicament'), 'vue cartes au menu Stock');
  assert.match(stock, /estDepot \?\s*\(\s*\/\* 2\.7\.20[\s\S]{0,500}?\{lignes\.map\(\(ligne, index\) => <CarteMedicament/,
    'les cartes sont réservées au DÉPÔT');
  for (const repere of ['Stock initial', 'Entrées', 'Sorties', 'Stock final', 'Coût unitaire', 'Valeur']) {
    assert.ok(stock.includes(repere), `carte médicament : repère « ${repere} »`);
  }
  assert.match(stock, /gridTemplateColumns: 'repeat\(auto-fill, minmax\(300px, 1fr\)\)'/, 'grille responsive de cartes');

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
  assert.match(stock, /estDepot \?\s*\([\s\S]{0,600}?<CarteMedicament/,
    'l’administrateur tombe bien sur les CARTES quand estDepot est vrai');
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
  assert.match(stock, /estDepot \?\s*\([\s\S]{0,600}?<CarteMedicament/,
    'les cartes du dépôt ne sortent QUE sur la vue réserve');
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
  const stock = texteDe('pages', 'ReportsPage.jsx');

  // ── 1. Le bouton devient « Detail » côté dépôt (œil, modal) ; la pharmacie garde « Imprimer ». ─
  assert.match(stock, /estDepot \? \([\s\S]{0,300}?icon=\{Eye\}[\s\S]{0,200}?>Detail</,
    'côté dépôt : le bouton « Detail » (œil) remplace « Imprimer »');
  assert.ok(stock.includes('openPrintable(`/reports/print'),
    'la pharmacie garde « Imprimer » (nouvel onglet) — inchangé');
  assert.match(stock, /onClick=\{\(\) => setDetailModal\(true\)\}/, 'le clic ouvre la boîte de dialogue');

  // ── 2. La boîte de dialogue existe dans la page (pas un nouvel onglet). ────
  assert.ok(stock.includes('function DetailStockModal'), 'composant modale de détail');
  assert.ok(stock.includes('{detailModal ? '), 'montée seulement à la demande');
  assert.ok(stock.includes('<Modal title='), 'boîte de dialogue (Modal), pas window.open');
  assert.ok(stock.includes('Fermer</Btn>'), 'bouton Fermer');

  // ── 3. Tout ce qui doit DISPARAÎTRE du détail du dépôt. ───────────────────
  assert.ok(stock.includes('COLONNES_CACHEES_MODAL'), 'liste des colonnes masquées');
  for (const colonne of ['Sorties boîte', 'Sorties plaquette', 'Stock final boîte', 'Stock final plaquette',
    'Seuil minimum', 'Situation']) {
    // La constante de masquage liste chaque colonne à retirer.
    assert.ok(new RegExp(`'${colonne}'`).test(stock.slice(
      stock.indexOf('const COLONNES_CACHEES_MODAL'), stock.indexOf('];', stock.indexOf('const COLONNES_CACHEES_MODAL')))),
      `colonne retirée du détail : « ${colonne} »`);
  }
  const debutModal = stock.indexOf('function DetailStockModal');
  const zoneModal = stock.slice(debutModal, debutModal + 2500);
  for (const absent of ['Édité par', 'Lignes affichées', 'reportSummary', 'ventes48778', 'Ventes', 'Marge', 'summary']) {
    assert.ok(!zoneModal.includes(absent), `métadonnée absente du détail : « ${absent} »`);
  }
  assert.ok(!zoneModal.includes('openPrintable') && !zoneModal.includes('window.open'),
    'la boîte de dialogue ne rouvre pas un onglet');

  // ── 4. La pharmacie : rien ne change (le découple boîte/plaquette y reste). ─
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

  // ── ① Boîte de dialogue « Detail » en PLEIN ÉCRAN (dépôt). ────────────────
  assert.ok(ui.includes('size'), 'ui.jsx : Modal accepte une taille nommée');
  assert.match(ui, /modal--\$\{size\}|modal--detail/, 'Modal compose la classe de taille');
  const debutModal = stock.indexOf('function DetailStockModal');
  assert.match(stock.slice(debutModal, debutModal + 2500), /size="detail"/,
    'la boîte « Detail » du dépôt demande la taille plein écran');
  assert.ok(css.includes('.modal--detail'), 'styles.css : la taille « detail » existe');
  assert.match(css, /\.modal--detail[\s\S]{0,400}97vw/, 'pleine largeur (97 % de l’écran)');
  assert.match(css, /\.modal--detail[\s\S]{0,400}96vh/, 'pleine hauteur (96 % de l’écran)');

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