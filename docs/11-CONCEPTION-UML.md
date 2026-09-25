# 11. Conception UML — application de gestion de stock pour pharmacie

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Ce document présente la conception du logiciel sous forme **UML** (cas d’utilisation, classes,
séquences, états, activité), puis la correspondance avec le code livré. Les schémas sont écrits
en texte : ils s’affichent partout (VS Code, GitHub, papier) sans outil supplémentaire.

---

## 1. Diagramme de cas d’utilisation

**Acteurs (v2.7)** : **Administrateur**, **Pharmacien / responsable** (comptoir), **Gestionnaire du dépôt**
(réserve). Les acteurs « Vendeur habilité » et « Gestionnaire de stock » ont été **fusionnés/disparus** :
le dépôt est devenu un **utilisateur à part entière** (rôle `DEPOT`), la vente se fait au comptoir (rôle
`PHARMACIST`). RG18 impose que les droits soient vérifiés côté serveur.

```
                    ┌──────────────────────────────────────────────────────────────┐
                    │     APPLICATION DE GESTION DE STOCK (dépôt + pharmacie)      │
                    │                                                              │
   Administrateur ──┤  ● S’authentifier                    ● Consulter le tableau  │
   (système)        │  ● Gérer les utilisateurs et rôles        de bord / alertes │
                    │  ● Paramétrer l’officine             ● Rechercher un produit │
   Pharmacien ──────┤    (nom, marge 10–30 %, valorisation) ● Enregistrer une vente│
   (comptoir)       │  ● Sauvegarder / restaurer les       ● Enregistrer une perte │
                    │    données                               ou un don           │
   Dépôt ───────────┤  ● Consulter le journal d’audit      ● Transférer vers la   │
   (réserve)        │  ● Contrôler l’intégrité du stock        pharmacie          │
                    │  ● (dés)activer un médicament        ● Réceptionner au dépôt│
                    │  ● Modifier le taux de marge         ● Ouvrir / compter /   │
                    │    (motif obligatoire)                   valider un        │
                    │  ● Annuler un document validé            inventaire       │
                    │    (avec motif)                      ● Bloquer / débloquer  │
                    │  ● Imprimer ticket / bons / rapports     un lot            │
                    │    (dont le bordereau de transfert)  ● Importer-Exporter CSV│
                    └──────────────────────────────────────────────────────────────┘
```

**Qui déclenche quoi (résumé des inclusions)**

| Cas d’utilisation | Administrateur | Pharmacien (comptoir) | Dépôt (réserve) | Règles |
|---|:--:|:--:|:--:|---|
| S’authentifier | ● | ● | ● | §9.1, RG18 |
| Réceptionner (entrée au **dépôt**) | ● | ● | ● | §9.4 |
| **Transférer dépôt → pharmacie** | ● | ● | ● | nouvelle règle 2.7 |
| Vendre (FEFO, ticket) — **pharmacie seulement** | ● | ● | — | RG08, RG09, §9.10 |
| Perte, don (magasin au choix) | ● | ● | ● | RG06, RG07, §9.11 |
| Inventaire par magasin (écarts justifiés) | ● | ● | ● | RG16, RG17, §9.13 |
| Bloquer un lot | ● | ● | ● | §9.14 « lot à retirer » |
| Annuler un document (dont un transfert) | ● | ● | ● (transfert) | RG19 |
| Modifier marge / prix | ● | ● | — | RG21–RG24 |
| Rapports, exports (dont les **deux fiches de stock**) | ● | ● | ● (réserve) | §9.16 |
| Journal d’audit, intégrité | ● | ● | — | §9.18 |
| Utilisateurs, paramètres | ● | — | — | §9.1, RG22 |
| Sauvegardes | ● | — | — | §14 |

*(Teo aloha : « Commander / réceptionner » sy « Retour fournisseur » — nesorina miaraka amin’ny
`order.service.js` sy `return.service.js`.)*

---

## 2. Diagramme de classes (modèle de données)

27 tables en base ; les classes ci-dessous sont les entités du domaine (§11 du cahier des charges).

```
   ROLE 1 ──── * UTILISATEUR 1 ──── * SESSION
     │  (code, permissions)              (token haché, csrf, expiration)
     │
     │            ┌──────────────────────────────────────────────────────────┐
     │            │                     CATEGORIE                            │
     │            └───────────────┬──────────────────────────────────────────┘
     │                            │ 1
     │                            * 
     │  UTILISATEUR 1 ── * PRODUIT (MEDICAMENT) 1 ── * LOT * ── 1 FOURNISSEUR
     │      │            code, nom, principe actif,      numéro, dates,
     │      │            dosage, forme, présentation,     quantité reçue/restante,
     │      │            catégorie, laboratoire, unité,   prix d’achat, frais
     │      │            seuil min/max, conservation,     attribués, coût de revient,
     │      │            statut, taux de marge, CMP,      statut (disponible/bloqué/…)
     │      │            prix de vente, version           │
     │      │                                            │ 1
     │      │                                            *
     │      │                                   MOUVEMENT DE STOCK  (§9.9)
     │      │                                   document (type,id), quantité signée,
     │      │                                   coût unitaire, nature, motif, date, user
     │      │                                            ▲  (immuable : ni UPDATE ni DELETE)
     │      │                                            │
     │      │        ┌───────────────┬───────────────┬───┴──────────┬───────────────┐
     │      │        │               │               │              │               │
     │      │   RECEPTION       VENTE            PERTE        RETOUR FOURN.    AJUSTEMENT
     │      │   (+lignes)       (+lignes)        (+lignes)    (+lignes, statut)  (issu d’inventaire)
     │      │        │               │               │              │               │
     │      │        │               │               │              │               │
     │      │        └────── COMMANDE (+lignes) ────┘              │               │
     │      │              (fournisseur, statut, reliquat)         │               │
     │      │                                                     │               │
     │      │                             INVENTAIRE 1 ── * LIGNE D’INVENTAIRE ──────┘
     │      │                             (périmètre, statut)      théorique, physique,
     │      *                                                    écart, justification
     │  JOURNAL D’AUDIT (immuable)        HISTORIQUE DES PRIX (immuable)
     │  action, entité, avant/après       coût, taux, prix, mode, motif (RG23)
     │  PARAMETRES (1 ligne)  : nom officine, devise, valorisation (LOT/CMP),
     │                          mode de marge, plage 10–30 %, horizon de péremption
     └──────────────────────────────────────────────────────────────────────────
```

**Cardinalités clés**

| Relation | Cardinalité | Règle |
|---|---|---|
| Médicament – Lot | 1 → 0..* | RG01 |
| Lot – Fournisseur | * → 1 | §9.3 |
| Lot – Mouvement | 1 → 0..* | RG04 ; lot.quantité = Σ mouvements |
| Document – Lignes | 1 → 1..* | §9.10–9.12 |
| Lot – Magasin | * → 1 | `DEPOT` na `PHARMACY` : unicité (médicament, fournisseur, numéro de lot, magasin) |
| Transfert – Lignes | 1 → 1..* | un lot jumeau est créé dans le magasin d’arrivée |
| Inventaire – Ajustement | 1 → 0..1 | RG15, RG17 |
| Utilisateur – Session | 1 → 0..* | §9.1 |

---

## 3. Diagramme de séquence — **Vente au comptoir (FEFO)**

```
Pharmacien Interface        API (Express)              Service vente           PostgreSQL
   │           │                   │                        │                     │
   │ saisit    │                   │                        │                     │
   │ médecine  ├─ GET /api/data ──►│  lit produits/lots     │                     │
   │           │◄── liste + stock vendable ─────────────────┤                     │
   │ compose   │                   │                        │                     │
   │ panier    ├─ POST /api/sales/quote ──► quoteSale() ───►│ SELECT … FOR UPDATE │
   │           │                   │                        │ FEFO : expires_on ↑ │
   │           │◄── lignes, prix, lot retenu, (marge) ──────┤                     │
   │ confirme  ├─ POST /api/sales (requestKey) ─► createSale()                    │
   │           │                   │  1 transaction :      │                     │
   │           │                   │   • re-contrôle stock │                     │
   │           │                   │   • mouvements(−q)    │ INSERT movements    │
   │           │                   │   • lots.quantité −= q│ UPDATE lots         │
   │           │                   │   • marge + prix vente│ (RG21, RG23)        │
   │           │                   │   • journal d’audit   │ INSERT audit_logs   │
   │           │◄── 201 VTE-2026-000123 ──────────────────┤                     │
   │ ticket    ├─ GET /api/documents/SALE/123/print ─► HTML ticket ──► imprimante │
```

Points de contrôle : stock non négatif (§16), lot non expiré (RG09), total attendu comparé
(protection contre un panier modifié entre-temps), `requestKey` = une seule vente même si
le bouton est cliqué deux fois.

---

## 4. Diagramme de séquence — **Réception (coût de revient & CMP)**

```
Gestionnaire  Interface         API                Service réception        PostgreSQL
     │           │               │                       │                     │
     │ choisit   ├─ GET /api/orders/:id ─►│  lignes restantes, prix commandés   │
     │ commande  │◄── lignes pré-remplies (médicament, qté, prix) ──────────────┤
     │ saisit lot│               │                       │                     │
     │ + durée   ├─ POST /api/receipts (lignes) ─► createReceipt()            │
     │           │               │  1 transaction :      │                     │
     │           │               │   • coût unitaire = prix + frais répartis   │
     │           │               │     (au prorata de la valeur d’achat)  RG12 │
     │           │               │   • création/mise à jour des LOTS           │
     │           │               │   • mouvements(+q)   │ INSERT movements    │
     │           │               │   • CMP recalculé    │ UPDATE products     │
     │           │               │   • prix de vente = coût × (1+taux) RG21    │
     │           │               │   • journal d’audit  │ INSERT audit_logs   │
     │           │◄── 201 REC-2026-000045 + coût total ────────────────────────┤
     │ bon de    ├─ GET /api/documents/RECEIPT/45/print ─► bon de réception   │
     │ réception │               │                       │                     │
```

---

## 5. Diagrammes d’états-transitions

**Lot**

```
        réception validée            blocage (motif obligatoire)
   ● ───────────────────────► DISPONIBLE ─────────────────────► BLOQUÉ
                                 │   ▲                              │
              sortie totale      │   │ déblocage (motif)            │
                                 ▼   │                              │
                             ÉPUISÉ (quantité = 0)                  │
                                                                   ▼
   date dépassée : le lot n’est plus proposé à la vente (RG09) → signalé « expiré »
```

**Document porteur de mouvements** (vente, réception, **transfert**, perte, ajustement)

```
   ● ── création ──► VALIDÉ ── annulation motivée (RG19) ──► ANNULÉ
                        │                                     (mouvements inversés,
                        │                                      trace au journal)
                        └── inventaire : EN COURS ──► VALIDÉ ou ABANDONNÉ (sans mouvement)
```

**Transfert dépôt → pharmacie** (remplace l’ancien retour fournisseur)

```
Dépôt (réserve)   Transfert        Pharmacie (comptoir)
   lot L               │                    lot L (jumeau : même n°, même péremption, même coût)
   100 u  ─── 40 u ────┼──── 40 u ────►      40 u
    60 u  ◄── reste ───┤
   mouvement TRANSFER_OUT (dépôt, −40)  ↔  mouvement TRANSFER_IN (pharmacie, +40)
```

**Retour fournisseur** *(supprimé en 2.7)*

```
   EN ATTENTE ──► ACCEPTÉ ──► REMPLACÉ
        │            │
        │            └──────► REMBOURSÉ (référence d’avoir)
        └────► REFUSÉ
```

---

## 6. Diagramme d’activité — processus métier (§10 du cahier des charges)

```
 (Catégories, médicaments, fournisseurs, seuils, paramètres)
                     │
                     ▼
            Fournisseur ──► Réception au DÉPÔT (lots, dates, prix, frais) ──► Transfert ──► PHARMACIE
                     │                        │
                     │                        ▼
                     │            Coût de revient + CMP + prix de vente (RG12, RG21–23)
                     │                        │
                     │                        ▼
                     │               Stock augmenté (mouvements)
                     ▼                        │
              Contrôle des alertes ◄──────────┘
                     │
     ┌───────────────┼────────────────┬──────────────────┐
     ▼               ▼                ▼                  ▼
   Vente (PHARMACIE)   Perte/don (magasin)   Transfert (dépôt → pharmacie)   Inventaire (magasin)
 (FEFO, ticket)  (motif+RQ)      (fournisseur)      (théorique vs physique,
     │               │            statut suivi      écarts justifiés, ajustement)
     └───────────────┴────────────────┴──────────────────┘
                     │
                     ▼
      Rapports (stock, ventes, achats, pertes, expirations, marges, inventaires)
                     │
                     ▼
        Sauvegardes périodiques + contrôle du journal d’audit
```

---

## 7. Correspondance conception ↔ réalisation

| Élément UML | Réalisation dans le projet |
|---|---|
| Cas d’utilisation | Routes de l’API protégées par `requirePermission` ; menu filtré par rôle (RG18) |
| Classes | 27 tables `backend/sql/001_schema.sql` + modèles Sequelize `backend/src/models/` |
| Contraintes d’intégrité | Clés étrangères, `CHECK` quantités ≥ 0, index d’unicité (lot/médicament/fournisseur) |
| Immuabilité | Déclencheurs PostgreSQL sur `movements`, `audit_logs`, `price_history` (RG14, RG19) |
| Séquences | Services métier transactionnels (`sale`, `receipt`, `loss`, `return`, `inventory`) |
| États | Colonnes `status` (documents, lots, transferts, inventaires) + transitions contrôlées |
| Cas « vente » | `sale.service.js` (FEFO, marge, idempotence par `requestKey`) |
| Cas « inventaire » | `inventory.service.js` (ouverture, comptage, justification, ajustement tracé) |
| Rapports | `report.service.js` (11 rapports, dont la **fiche de stock** §9.13) + export CSV + impression |
| Journal d’audit | `audit.service.js` + écran dédié + contrôle d’intégrité des lots |

---

## 8. Fiche de stock — le registre de l’officine, en automatique (§9.13)

Le cahier des charges demande, à l’inventaire : *stock initial de la période, entrées, sorties,
stock final théorique, écart, justification*. La plupart des officines tiennent ce tableau à la
main dans un cahier ou un tableur (Date · Médicament · Stock initial · Entrée · Sortie · Stock final).

L’application le produit seule : **Rapports → « Fiche de stock (initial · entrées · sorties ·
final) »**, période au choix, puis *Imprimer* ou *Export CSV*. Rien n’est reporté à la main :
le stock initial d’une période est exactement le stock final de la précédente, calculé depuis les
mouvements validés.

```
   Période du 01/09/2026 au 30/09/2026                Pharmacie X
   ┌────────┬─────────────────────┬─────────┬────────┬─────────┬────────┬──────────┬──────────┐
   │ Code   │ Médicament          │ Initial │ Entrées│ Sorties │ Final  │ Situation│ Valeur   │
   ├────────┼─────────────────────┼─────────┼────────┼─────────┼────────┼──────────┼──────────┤
   │ MED-001│ Paracétamol 500 mg  │      96 │    100 │       4 │     96 │ Correct  │ 794 033  │
   │ MED-002│ Amoxicilline 500 mg │      95 │    100 │       5 │     95 │ Correct  │ 1 178 644│
   │ MED-004│ Vitamine C 500 mg   │       0 │      0 │       0 │      0 │ Rupture  │       0  │
   └────────┴─────────────────────┴─────────┴────────┴─────────┴────────┴──────────┴──────────┘
```

---

## Fanazavana fohy (résumé malagasy)

- **Cas d’utilisation** : isaky ny rôle dia voafaritra mazava izay azony atao (jereo ny tabilao) ;
  ny fahefana dia **voasivana avy amin’ny serveur**, fa tsy ao amin’ny efijery ihany.
- **Classes** : 27 tabilao, izay mitovy amin’ny entité ao amin’ny cahier des charges
  (Utilisateur, Rôle, Médicament, Catégorie, Fournisseur, Réception, **Transfert**, Lot, Mouvement,
  Vente, Perte, Inventaire, Audit…).
- **Séquences** : ny vente (FEFO) sy ny réception (coût de revient, CMP, prix de vente) dia
  atao **amin’ny transaction iray** — raha misy kilema dia tsy misy na inona na inona voatahiry.
- **États** : lot (DISPONIBLE / BLOQUÉ / ÉPUISÉ), document (VALIDÉ / ANNULÉ), transfert (VALIDÉ / ANNULÉ), inventaire
  (EN ATTENTE / ACCEPTÉ / REMPLACÉ / REMBOURSÉ / REFUSÉ).
- **Fiche de stock** : ny rejistra « Stock Initial · Entrée · Sortie · Stock Final » izay
  soratanao amin’ny cahier na Excel dia **mivoaka ho azy** ao amin’ny *Rapports* (misy impression
  sy export CSV) — tsy mila mandroso isa amin’ny tanana intsony.
