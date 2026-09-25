# 3. Manuel d’utilisation quotidienne

> ⚠️ **Vaovao amin’ny kinova 2.7 — mamaky ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : ny **DÉPÔT (réserve)** sy ny **PHARMACIE (comptoir)**.
> * Ny fanafody rehetra tonga dia **réception → DÉPÔT**, avy eo **transfert → PHARMACIE** araka ny ilain’ny comptoir.
> * Ny **vente** dia ao amin’ny pharmacie ihany ; ny *sortie* ao amin’ny dépôt dia ny transfert sy ny perte.
> * **Tsy misy commande fournisseur** ary **tsy misy retour fournisseur** intsony.
> * Ny rôle dia **3** ihany : **ADMIN**, **PHARMACIST**, **DEPOT** (ny « Vendeur » sy « Gestionnaire de stock » dia nesorina).
> * Ny boky feno sy vaovao : **`docs/14-FAMPIASANA-TENA-IZY.md`** sy **`docs/15-GUIDE-FENO-ECRAN-ISAKY-NY-EFIJERY.md`**.
>


## 1. Se connecter

Ouvrir l’adresse du poste (ex. `http://192.168.1.25:3001`) puis saisir identifiant et mot de passe.
La session reste ouverte 8 heures ; le bouton 🔑 en haut à droite permet de changer son mot de passe
(12 caractères minimum). Après 20 tentatives erronées en 15 minutes, la connexion est momentanément bloquée.

> Guide complet en malgache, écran par écran : `docs/8-TORO-LALANA-MALAGASY.md`.

## 2. Les trois profils (RG18)

| Profil | Magasin | Peut faire | Ne voit jamais |
|---|---|---|---|
| **Gestionnaire du dépôt** (`DEPOT`) | Dépôt (réserve) | réceptionner (toute entrée), transférer vers la pharmacie, déclarer une perte au dépôt, inventorier la réserve, rapports du dépôt | ventes au comptoir, prix de vente et marges, comptes utilisateurs, paramètres |
| **Pharmacien / responsable** (`PHARMACIST`) | Pharmacie (comptoir) | vendre, annuler une vente, fixer les prix et marges, gérer le stock du comptoir, pertes et inventaires de la pharmacie, rapports, journal d’audit | gestion des comptes et paramètres |
| **Administrateur** (`ADMIN`) | Les deux | tout, y compris comptes, paramètres, plage de marge | — |

> Ny **dépôt dia mpampiasa hafa mihitsy** : samy manana ny kaontiny ny réserve sy ny comptoir.
> Ny rôle « Gestionnaire de stock » sy « Vendeur habilité » dia **nesorina** tamin’ny kinova 2.7.

## 2 bis. Organisation du menu

| Entrée | Contenu |
|---|---|
| **Historique de vente** | le comptoir (POS) de la pharmacie : recherche, panier, ticket |
| **Stock** | deux onglets : *Lots & stock* (avec le choix du **magasin**) et *Mouvements* |
| **Réceptions** | les entrées : **toutes se déposent au dépôt** |
| **Transferts dépôt → pharmacie** | les mouvements entre les deux magasins, avec bordereau imprimable |
| **Catalogue** | trois onglets : *Médicaments*, *Catégories*, *Fournisseurs* |

Il n’existe plus d’entrée **Commandes** ni **Retours fournisseur** : une livraison se saisit
directement en *Réception*, et un lot à renvoyer au laboratoire se traite en *Perte* (motif « Rappel »).

Tout ce qui peut être choisi l’est : médicament, fournisseur, **magasin**, lot, client,
durée de conservation (la date de péremption se calcule), taux de marge, motif.
Ne restent à saisir que les chiffres et les numéros que vous seul connaissez (n° de lot, frais,
justifications) — voir `docs/8`, section 8 bis, pour la liste complète.

## 3. Vendre au comptoir (Pharmacien, Administrateur) — magasin « Pharmacie »

1. **Ventes** → taper au moins 2 lettres du nom, du code ou du principe actif.
   Le client se choisit dans la liste (clients déjà servis) ou reste « Client de passage ».
2. Cliquer sur le médicament : il s’ajoute au panier. Ajuster la quantité avec **− / +**.
3. *(Facultatif)* « Client de passage » ou nom du client, remarque (ordonnance…).
4. **Recalculer le total** : le serveur choisit les lots (le plus proche de la péremption d’abord)
   et affiche le prix unitaire, le total, et pour les profils autorisés la marge.
5. **Valider la vente** → message « Vente VTE-AAAA-NNNNNN enregistrée ».
6. **Imprimer le ticket**.

Cas particuliers :

| Situation | Ce que fait l’application |
|---|---|
| Total affiché différent au moment de valider (changement de prix ou de stock) | la vente est refusée, le nouveau total est recalculé : vérifiez puis validez à nouveau |
| Stock vendable insuffisant (lots périmés ou bloqués exclus) | message d’erreur précisant le médicament : le stock du dépôt n’est **jamais** vendable, il faut d’abord un **transfert** |
| Double clic sur « Valider » (réseau lent) | une seule vente est créée : la seconde requête est reconnue comme un doublon |
| Client non servi / erreur de saisie | **Documents** → retrouver la vente → **Annuler** avec motif (stock remis en place, trace conservée) |

## 4. Recevoir une livraison — **dépôt** (Gestionnaire du dépôt, Pharmacien, Administrateur)

1. **Réceptions → Nouvelle réception** : fournisseur, numéro de facture ou de bordereau,
   frais de livraison.
2. Pour chaque lot : **médicament**, **numéro de lot**, quantité reçue, prix d’achat unitaire,
   date de réception, **durée de conservation** (la date de péremption se calcule), date de fabrication.
3. **Valider la réception** → le bon de réception s’imprime, le coût de revient réel (frais répartis)
   et le CMP sont recalculés, ainsi que le prix de vente selon la marge paramétrée.
4. **Tout entre au dépôt** : la pharmacie n’est servie que par un **transfert** (§ 5).

**Interdictions appliquées par l’application** : réceptionner un lot dont la date de péremption est
déjà passée, une date de fabrication postérieure à la réception, une date de réception future,
ou deux fois le même numéro de lot pour le même médicament **dans le même magasin**.

## 4 bis. Transférer vers la pharmacie (Gestionnaire du dépôt, Pharmacien, Administrateur)

1. **Transferts dépôt → pharmacie → Nouveau transfert**.
2. Choix du **motif** (réassort, produit très demandé, retour du surplus, contrôle qualité…)
   et, si besoin, d’une remarque.
3. Sélection des **lots du dépôt** (quantité limitée au stock disponible du dépôt) et des quantités.
4. **Valider le transfert** → référence `TRF-AAAA-NNNNNN`, bordereau imprimable.
   Le dépôt diminue, la pharmacie augmente : il se crée un **lot jumeau** (même numéro, même
   péremption, même coût) au nom de la pharmacie.
5. Erreur de saisie : **Annuler** le transfert avec un motif — le stock revient au dépôt, la trace reste.

## 5. Sorties non commerciales

### Perte ou don (**Pertes et dons**)
Motif imposé (Casse, Détérioration, Expiration, Perte, Don, Rappel), **remarque justificative obligatoire**,
lot et quantité. La sortie se fait au **coût retenu**, jamais au prix de vente, et la fiche reste consultable.

### Magasin concerné
Chaque perte porte un **magasin** (*Dépôt* ou *Pharmacie*) : la sortie est faite dans ce magasin,
au coût retenu du lot, jamais au prix de vente. L’écran refuse un lot qui n’appartient pas au
magasin choisi (par exemple un lot du comptoir déclaré en perte au dépôt).

> Il n’existe plus de **retour fournisseur** : un lot rappelé par le laboratoire se saisit en
> *Perte* (motif « Rappel ») dans le magasin où il se trouve.

### Lot bloqué (**Lots et stock**)
Le bouton 🛡 met un lot en quarantaine (contrôle qualité, rappel) : il reste compté dans le stock mais
n’est plus jamais proposé à la vente. Le déblocage demande aussi une justification.

## 6. Inventaire physique (**Inventaires**)

1. **Ouvrir un inventaire** : on choisit le **magasin à compter** (*Dépôt* ou *Pharmacie*) ;
   le stock théorique de chaque lot de ce magasin est figé à cet instant.
   Un seul inventaire peut être ouvert par magasin.
2. Saisir la quantité comptée pour chaque lot. Les écarts s’affichent en orange.
3. Chaque écart **doit** être justifié (3 caractères minimum) : « Tout conforme » remplit les comptages identiques au théorique.
4. **Valider l’inventaire** → un document d’ajustement est créé, lot par lot, avec les justifications.
5. Erreur de comptage : **Abandonner** avec un motif — aucun mouvement n’est alors créé.
6. La **feuille d’inventaire** peut être imprimée pour compter sur papier.

## 7. Suivre les alertes et les rapports

- **Tableau de bord** : deux cartes (Dépôt / Pharmacie) puis bandeau rouge (rupture, lot périmé,
  lot bloqué, rupture de stock vendable au comptoir), bandeau orange (stock faible, surstock,
  expiration proche, lot sans date), et la liste des **derniers transferts dépôt → pharmacie**.
- **Rapports** : fiche de stock **PHARMACIE**, fiche de stock **DÉPÔT**, état du stock, mouvements,
  **transferts dépôt → pharmacie**, ventes (pharmacie), réceptions (dépôt), pertes, lots à surveiller,
  inventaires et écarts, historique des prix, achats par fournisseur. Boutons **Export CSV** (ouvrable dans Excel)
  et **Imprimer** ; **Contrôle d’intégrité** vérifie que chaque lot égale la somme de ses mouvements.
- **Journal d’audit** : toutes les actions avec leur auteur, leur horodatage et les valeurs avant/après.

## 8. Catalogue et paramètres (Administrateur)

- **Médicaments** : code, désignation, dosage, forme, présentation, catégorie, unité de gestion,
  seuil d’alerte et stock maximum, taux de marge (**10 % à 30 % par défaut, ajustable dans les paramètres**).
  Un médicament ne se supprime pas : il se **désactive**.
- **Fournisseurs / Catégories** : même logique de désactivation.
- **Paramètres** : nom de l’officine, adresse, téléphone, devise, méthode de valorisation
  (**coût de revient du lot** ou **CMP** — figée dès le premier mouvement), mode de calcul de la marge
  (sur coût d’achat ou sur prix de vente), plage de marge autorisée, horizon d’alerte de péremption.
- **Utilisateurs** : créer un compte par personne, choisir le rôle, réinitialiser un mot de passe.
  Le dernier administrateur actif ne peut être ni rétrogradé ni désactivé.
  Un compte ne se **supprime pas** : il se **désactive** (l’historique des documents doit rester
  signé par son auteur). Aucun compte partagé : chaque action est tracée avec son auteur.

### Comptes d’essai (avant l’ouverture réelle)

Pour tester les quatre profils sans attendre que l’équipe soit là :

```
npm run demo:users     # crée : pharmacien / gestionnaire / vendeur (mot de passe provisoire affiché)
```

Ces trois comptes sont réservés aux essais : après la mise en service, désactivez-les dans
**Utilisateurs** — et un compte réel n’est créé qu’une fois, au nom de la personne.

## 8 bis. Fiche de stock : le registre de l’officine, en automatique

Les registres papier ou tableurs tiennent habituellement, pour chaque période :
*Date · Médicament · Stock initial · Entrée · Sortie · Stock final*. L’application produit ce tableau
elle-même : **Rapports → *Fiche de stock (initial · entrées · sorties · final)***, période au choix,
colonnes *Stock initial, Entrées, Sorties, Stock final, Seuil minimum, Situation, Coût unitaire, Valeur*,
avec **Imprimer** et **Export CSV**. Le bouton **Fiche de stock du mois** est aussi présent sur l’écran
**Inventaires**, pour préparer un comptage.

Rien à reporter à la main : le stock initial d’une période est le stock final de la précédente,
recalculé depuis les mouvements validés (RG14). La colonne *Situation* signale immédiatement
les ruptures et les produits sous le seuil (RG10, RG11).

## 9. Questions fréquentes

| Question | Réponse |
|---|---|
| Peut-on vendre un médicament sans date de péremption ? | Oui, il est signalé « sans date » et à surveiller. |
| Peut-on corriger une vente ? | Non : elle s’annule (motif obligatoire) et le stock revient au lot d’origine. |
| Peut-on modifier un bon de réception ? | Non : il s’annule uniquement si la marchandise est encore en stock. |
| Qui a changé un prix ? | **Médicaments → 🕘 historique** ou **Rapports → Historique des prix**, et le journal d’audit. |
| Comment retrouver un document ? | **Documents** : filtre par type, état, date ou recherche texte. |
| Le stock affiché diffère du comptoir ? | Ouvrir un inventaire : les écarts justifiés réalignent le stock et restent tracés. |

---

## Fanazavana fohy amin’ny teny malagasy (résumé)

- **Fidirana** : asio ny anarana sy ny teny miafina. Ny teny miafina dia azo ovaina amin’ny bokotra 🔑.
- **Varotra** : *Ventes* → karohy ny anaran’ny fanafody (2 litera farafahakeliny) → tsindrio hampidirana
  anaty harona → ovay ny isa → *Recalculer le total* → *Valider la vente* → *Imprimer le ticket*.
  Ny lotaka akaiky indrindra ny daty lany andro no mivoaka aloha (FEFO).
- **Fandraisana entana** : *Achats → Réceptions* → asio ny laharana lot, ny isa, ny vidiny, ny daty lany andro,
  ny sara fitaterana → *Valider la réception*. Kajy ho azy ny vidin’ny entana sy ny vidin’ny varotra.
- **Fahaverezana (perte) sy fanomezana (don)** : *Pertes et dons* → safidio ny antony, tsy maintsy
  asiana fanamarihana, ary ny lot. Ny vidiny alaina dia ny vidin’ny entana, fa tsy ny vidin’ny varotra.
- **Fanisana (inventaire)** : *Inventaires* → *Ouvrir un inventaire* → asio ny isa tena misy →
  tsy maintsy asiana fanazavana ny tsy fitoviana → *Valider*. Voatahiry ao amin’ny *Journal d’audit* ny zavatra rehetra.
- **Fiarovana ny angona** : tsy misy fafana mihitsy ny antontan-taratasy efa voamarina — *annulation* tsy
  maintsy misy antony ihany no atao, ka mitovy foana ny tantara sy ny stock.
