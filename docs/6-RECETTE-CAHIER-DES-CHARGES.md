# 6. Recette du cahier des charges — règles générales et exemples

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Ce document sert de **fiche de recette** : chaque règle attendue est associée à l’endroit de
l’application qui l’applique et au moyen de la vérifier (écran ou test automatisé).
La colonne « Vérification » indique où contrôler ; les tests automatisés se lancent avec
`npm run test:integration` (27 scénarios) et `npm test` (20 tests unitaires de calcul).

## A. Règles générales

| Réf. | Règle appliquée | Où elle est appliquée | Vérification |
|---|---|---|---|
| RG01 | Un médicament n’existe qu’avec un code unique, une unité de gestion et un seuil d’alerte | `validators/reference.validator.js`, table `products` | Catalogue → Médicaments ; test « référentiels » |
| RG02 | Aucune donnée de référence n’est supprimée : désactivation uniquement | `reference.controller.js` (pas de `DELETE`), journal d’audit | Catalogue → bouton 🚫 |
| RG03 | Toute quantité reçue crée un **lot** identifié (numéro, dates, coût) | `receipt.service.js` | Réceptions → détail du document ; test « réception » |
| RG04 | Le stock ne bouge **qu’à la validation** d’un document | `stock.service.js` (mouvements créés à la validation) | Ventes : un panier ne déstocke rien avant validation |
| RG05 | Le prix de vente n’est jamais saisi : il découle du **coût retenu** et du **taux de marge** | `pricing.service.js` (`salePrice`) | Médicaments : colonnes CMP / Taux / Prix ; test « marge » |
| RG06 | Une perte sort du stock **au coût retenu** (jamais au prix de vente) | `loss.service.js` | Pertes et dons → fiche ; test « perte » |
| RG07 | Une perte exige un motif imposé **et** une remarque justificative | `removal.validator.js` | Pertes : validation bloquée sans remarque ; test « motif inventé refusé » |
| RG08 | Les sorties de stock sont **cumulées par lot** et tracées par mouvement | tables `movements`, `movement_lines` via `stock.service.js` | Stock → Mouvements ; Rapports → Mouvements |
| RG09 | Un lot périmé, bloqué ou vide **n’est jamais vendable** | `stock.service.js` (`pickLots` + FEFO), `allowExpiredSale` désactivé par défaut | Ventes : stock vendable exclut les lots périmés ; tests « lot bloqué », « lot expiré refusé » |
| RG10 | La méthode de valorisation (coût du lot / CMP) est **choisie une fois** puis figée | `settings.service.js` (409 après le premier mouvement) | Paramètres : bandeau « valorisation figée » ; test « paramètres » |
| RG11 | Le **CMP** est recalculé à chaque réception (coût total ÷ quantités) | `pricing.service.js` (`recomputeProductCosting`) | Réceptions → coût unitaire ; test « CMP 9 333,33 » |
| RG12 | Les frais d’achat (transport, douane) sont **répartis au prorata de la valeur d’achat** (repli sur les quantités si les prix sont nuls), sans perte d’arrondi | `utils/money.js` (`distributeFees`) | Réception avec frais → coût de revient par unité ; test « frais répartis » |
| RG13 | Toute écriture est **atomique** : soit tout passe, soit rien | `utils/transaction.js` (transaction + verrou global) | Journal du serveur ; test « idempotence de la vente » |
| RG14 | Chaque action est **tracée** : qui, quand, quoi, valeurs avant/après | `audit.service.js` + table `audit_logs` immuable | Journal d’audit ; test « journal d’audit » |
| RG15 | La sortie de stock suit **FEFO** (premier périmé, premier sorti) par défaut | `stock.service.js` (`LOT_PICKING.FEFO`) | Ventes : lot le plus proche de la péremption proposé ; test « FEFO » |
| RG16 | Le stock est consultable **par produit et par lot**, avec dates et valeurs | `dashboard.service.js`, écrans Lots / Mouvements | Stock → Lots et stock |
| RG17 | Un **écart d’inventaire** doit être justifié pour être appliqué | `inventory.service.js` | Inventaires : validation refusée sans motif ; tests « écart justifié » |
| RG18 | Les droits sont contrôlés **côté serveur** ; le **dépôt** ne voit ni vente, ni prix de vente, ni chiffre d’affaires | `middlewares/authenticate.js`, `dashboard.service.js` (`restrictForDepot`) | Connexion avec le compte dépôt ; test « profil dépôt » ; `POST /api/sales` → 403 |
| RG19 | **Aucune suppression silencieuse** : un document validé s’annule avec motif, le stock revient | `document.service.js` + déclencheurs PostgreSQL | Documents → Annuler ; test « annulation » |
| RG20 | L’annulation est **refusée** si la marchandise n’est plus en stock sur le lot d’origine | `stock.service.js` (`ensureReversalPossible`) | Documents → annulation d’une réception déjà vendue |
| RG21 | Les seuils (minimum, maximum) génèrent des **alertes** exploitables | `alert.service.js` | Tableau de bord : bandeaux rouge et orange ; test « alertes » |
| RG22 | Le taux de marge reste dans la **plage autorisée** (10 % – 30 % par défaut, ajustable dans les Paramètres) | `validators/settings.validator.js`, `pricing.service.js` | Paramètres → plage ; Médicaments → taux ; test « taux 45 % refusé » |
| RG23 | Tout changement de prix ou de taux est **historique et justifié** | `price_history` + `PUT /products/:id/margin` | Médicaments → 🕘 ; test « traçabilité des prix » |
| RG24 | Seuls les profils autorisés (`prices`) modifient un prix ou une marge | `routes/reference.routes.js` | Compte dépôt : colonnes de prix masquées ; test « profil dépôt » |

## B. Scénarios de bout en bout vérifiés automatiquement

1. Réception de 100 unités à 8 000 Ar + 100 000 Ar de frais → **coût de revient 9 000 Ar**, prix de vente 10 800 Ar (marge 20 %).
2. Deuxième lot à expiration plus proche → **CMP 9 333,33 Ar** et **vente en FEFO** sur ce lot.
3. Vente de 3 unités : total 36 000 Ar, marge brute 6 000 Ar, stock du lot décrémenté de 47.
4. Total de vente modifié entre le devis et la validation → **refus 409**, devis rejoué.
5. Double envoi de la même vente (clé identique) → **une seule** sortie de stock.
6. Perte de 3 unités au coût retenu (27 000 Ar) et **aucun chiffre d’affaires créé**.
7. Transfert refusé si le magasin de départ et d’arrivée sont identiques, si la quantité dépasse le stock du départ, ou si le lot n’appartient pas à ce magasin.
8. Lot bloqué exclu de la vente, puis débloqué avec justification.
9. Réception au dépôt → stock du dépôt ; transfert de 20 unités → **lot jumeau** en pharmacie, les deux stocks restent cohérents ; vente impossible depuis le dépôt (403).
10. Annulation refusée quand la marchandise n’est plus en stock ; annulation d’une vente remet le lot en place.
11. Inventaire : écart non justifié refusé ; écart justifié → ajustement tracé ; abandon motivé.
12. Plage de marge incohérente refusée ; valorisation figée après mouvement (409).
13. Les **11 rapports** répondent (dont la *Fiche de stock* §9.13) ; export CSV avec BOM UTF-8 ; route inconnue → 404 avec session.
14. Dernier administrateur : impossible à rétrograder ou désactiver ; changement de mot de passe → sessions fermées.
15. Journal d’audit : aucune trace de mot de passe ni de jeton ; présence des actions LOGIN / VALIDATE / CANCEL / UPDATE.

## B bis. Spécifications détaillées du cahier des charges (§9) — où les vérifier

| § | Exigence | Écran / fichier |
|---|---|---|
| 9.1 | Connexion, déconnexion, comptes actifs/inactifs, rôles, permissions, journalisation, hachage | Connexion ; Utilisateurs ; `auth.service.js` (bcrypt 12 tours) |
| 9.2 | Fiche médicament complète (code, nom, principe actif, dosage, forme, présentation, code-barres, catégorie, laboratoire, unité, seuils, conservation, statut, remarque) | Catalogue → onglet Médicaments |
| 9.3 | Fournisseurs : créer, modifier, désactiver, coordonnées, historique, lots associés | Catalogue → onglet Fournisseurs (détail : achats récents) |
| 9.4 | Réception, prix réel, frais, création/mise à jour des lots, validation, **entrée au dépôt** puis **transfert vers la pharmacie** | Réceptions ; Transferts dépôt → pharmacie |
| 9.5 | Lots : numéro, dates, quantités reçue/restante, prix, frais, coût de revient, fournisseur, statut, historique | Stock → onglet Lots & stock (détail = mouvements du lot) |
| 9.6 | Prix d’achat, frais, coût de revient, prix de vente, marge brute unitaire et totale | Réceptions (calcul) ; Rapports → Ventes et marges |
| 9.7 | CMP pondéré par les quantités, prix réel des lots conservé | Paramètres (valorisation) ; `pricing.service.js` |
| 9.8 | FEFO privilégié (FIFO/LIFO documentés) | `stock.service.js` (`pickLots`) ; Ventes (lot retenu affiché) |
| 9.9 | Types de mouvements (réception, **transfert sortant/entrant**, vente, casse, détérioration, expiration, perte, don, ajustements) — chacun avec son **magasin** | Stock → onglet Mouvements ; `movements.kind` |
| 9.10 | Vente : lot FEFO, calcul des lignes et du total, décrément après validation, date/utilisateur, marge | Ventes |
| 9.11 | Pertes : date, utilisateur, médicament/lot, quantité, motif, remarque, valeur au coût retenu | Pertes et dons |
| 9.12 | *(retour fournisseur supprimé en 2.7)* — remplacé par le **transfert** (dépôt ↔ pharmacie) et la **perte motivée** | Transferts dépôt → pharmacie ; Pertes et dons |
| 9.13 | Inventaire : **stock initial, entrées, sorties, stock final**, physique, écart, motif, validation — **magasin par magasin** | **Rapports → Fiche de stock — PHARMACIE / DÉPÔT** ; Inventaires (`Magasin à compter`) |
| 9.14 | Alertes : stock faible, rupture, expiration proche, produit expiré, surstock, écart, réception partielle, lot à retirer | Tableau de bord ; `alert.service.js` |
| 9.15 | Tableau de bord : médicaments actifs, lots, valeur du stock, ruptures, seuils, expirations, ventes, marge, pertes, derniers mouvements | Tableau de bord |
| 9.16 | Rapports : les **deux fiches de stock**, stock, mouvements, **transferts**, ventes, réceptions, pertes, expirations, inventaires, prix, fournisseurs | Rapports (12 choix) + CSV + impression |
| 9.17 | Recherche par nom, code, principe actif, catégorie, code-barres, numéro de lot ; douchette | Ventes (recherche) ; `GET /api/search` |
| 9.18 | Audit : utilisateur, date, créations/modifications/validations/annulations, avant/après, pas d’effacement | Journal d’audit ; déclencheurs d’immuabilité |

> La conception UML (cas d’utilisation, classes, séquences, états, activité) est décrite dans
> `docs/11-CONCEPTION-UML.md`.

## C. Exemples de calcul (contrôlés par les tests unitaires)

| Situation | Formule | Résultat attendu |
|---|---|---|
| Marge sur coût, taux 20 %, coût 9 000 Ar | 9 000 × (1 + 0,20) | **10 800 Ar** |
| Marge sur prix de vente, taux 20 %, coût 8 000 Ar | 8 000 ÷ (1 − 0,20) | **10 000 Ar** |
| Frais 1 000 Ar sur 100 u à 8 000 Ar + 50 u à 10 000 Ar | au prorata de la **valeur d’achat** (800 000 / 1 300 000, le solde pour la dernière ligne) | 615,384615 Ar et 384,615385 Ar, total exactement 1 000 Ar |
| Frais 400 Ar sur des lignes à prix d’achat nul | repli sur le prorata des **quantités** (1 et 3 unités) | 100 Ar et 300 Ar |
| Coût de revient unitaire d’un lot à 8 000 Ar avec 1 000 Ar de frais | prix d’achat + frais attribués ÷ quantité | **9 000 Ar** |
| CMP après 100 u à 9 000 Ar et 50 u à 10 000 Ar | (900 000 + 500 000) ÷ 150 | **9 333,333333 Ar** (test unitaire : 100 u à 8 000 + 50 u à 10 000 → 8 666,666667 Ar) |
| Montants en base | `decimal(20,6)`, calculs en Decimal.js (jamais en flottant) | aucun écart d’arrondi ; affichage arrondi par l’interface |

## D. Ce qui reste volontairement hors périmètre (V1)

Patients et ordonnances, vente à l’unité fractionnaire, encaissement multi-moyens et rendu de monnaie,
retours clients et remboursements, gestion des médecins, dossier médical partagé, application mobile native
(l’interface web est déjà utilisable sur téléphone et tablette).
