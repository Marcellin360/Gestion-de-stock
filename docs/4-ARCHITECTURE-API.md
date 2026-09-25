# 4. Architecture, base de données et API

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



## 1. Pile technique

| Couche | Technologie | Rôle |
|---|---|---|
| Interface | React 19 + Vite (aucune bibliothèque d’interface externe) | 18 écrans, responsive téléphone / tablette / comptoir |
| API | Node.js 20 + Express 4 | routes REST, session, permissions, validation |
| Accès aux données | Sequelize 6 (accès paramétré, transactions) | 27 modèles |
| Base | PostgreSQL 16 | contraintes, déclencheurs d’immuabilité, vues |
| Validation | zod | tous les corps de requête |
| Sécurité | helmet, cookie HttpOnly, jeton CSRF, rate-limit, bcrypt | — |
| Impression | gabarits HTML du serveur (`src/templates/`) | tickets, bons, feuilles d’inventaire, rapports |

## 2. Modèle de données (27 tables)

**Référentiels** : `roles`, `users`, `sessions`, `settings`, `categories`, `suppliers`, `products`
(+ `product_forms`, `units_of_measure`).

**Achats** : `orders`, `order_lines`, `receipts`, `receipt_lines`, `lots`.

**Ventes et sorties** : `sales`, `sale_lines`, `losses`, `loss_lines`, `supplier_returns`, `supplier_return_lines`.

**Inventaire et traçabilité** : `inventories`, `inventory_lines`, `adjustments`, `adjustment_lines`,
`movements`, `price_history`, `audit_logs`.

Invariants garantis par la base :

- `movements`, `audit_logs` et `price_history` sont **append-only** (déclencheurs PostgreSQL : ni `UPDATE`, ni `DELETE`) ;
- un document validé (`VALIDATED`) ne peut pas être supprimé (déclencheur) : seule l’annulation tracée est possible ;
- `products.search_text` (colonne générée + index GIN) accélère la recherche au comptoir ;
- la vue `v_lot_state` expose l’état de chaque lot (quantité, statut, péremption, valeur).

## 3. Règles métier centrales (services)

| Service | Responsabilité |
|---|---|
| `pricing.service.js` | coût retenu (lot ou CMP), prix de vente, marge, contrôle de la plage autorisée, historique |
| `stock.service.js` | FEFO/FIFO/LIFO, mouvements, contrôle d’intégrité, réversibilité d’une annulation |
| `sale.service.js` | devis puis validation, idempotence par clé de requête, contrôle du total |
| `receipt.service.js` | création des lots, répartition des frais, recalcul du CMP et des prix |
| `transfer.service.js` | transferts dépôt → pharmacie : lot jumeau, motif, quantité bornée, bordereau |
| `loss.service.js` | sorties non commerciales justifiées, **magasin obligatoire** (dépôt ou pharmacie) |
| `inventory.service.js` | ouverture, comptage, écart justifié, ajustement, abandon motivé |
| `document.service.js` | registre commun des documents, détail, annulation tracée, impression |
| `alert.service.js` | ruptures, seuils, péremptions, lots bloqués — **calculés magasin par magasin** |
| `report.service.js` | 12 rapports paramétrés (dont les deux fiches de stock et les transferts), export CSV, synthèses |
| `audit.service.js` | journal d’audit (rien de sensible), instantanés avant/après |

Toute écriture passe par `utils/transaction.js` : transaction PostgreSQL + **verrou consultatif global**,
ce qui interdit à deux postes de valider simultanément des mouvements calculés sur la même quantité.

## 4. API REST (préfixe `/api`)

| Méthode et chemin | Permission | Description |
|---|---|---|
| `POST /auth/login` | — | ouvre la session, renvoie l’utilisateur et le jeton CSRF |
| `GET /auth/me` · `POST /auth/logout` · `POST /auth/password` | session | profil, fermeture, changement de mot de passe |
| `GET /health` | — | supervision |
| `GET /data` | session | tout le poste de travail en une requête (filtré par rôle) |
| `GET /search?q=` | session | recherche rapide (nom, code, principe actif, code-barres) |
| `POST|PUT /categories|/suppliers|/products` | `reference` | référentiels |
| `PUT /products/:id/margin` | `prices` | taux de marge + trace |
| `GET /products/:id/prices` | `reports` | historique des prix |
| `POST /receipts` | `receipt` | réception de lots — **toute entrée se fait au dépôt** |
| `GET|POST /transfers`, `GET /transfers/lots`, `GET /transfers/:id` | `transfer` | transferts dépôt → pharmacie |
| `POST /sales/quote` · `POST /sales` | `sale` | devis et validation de vente |
| `POST /losses` | `loss` | pertes et dons |
| `GET /lots` · `GET /lots/:id/movements` · `PUT /lots/:id/status` | session / `inventory` | lots, mouvements, quarantaine |
| `GET|POST /inventories`, `GET /inventories/:id`, `POST /inventories/:id/validate`, `POST /inventories/:id/abandon`, `GET /inventories/:id/print` | `inventory` | inventaires |
| `GET /documents` · `GET /documents/:kind/:id` · `POST /documents/:kind/:id/cancel` · `GET /documents/:kind/:id/print` | session / `cancel` | registre, détail, annulation, impression |
| `GET /reports` · `GET /reports/print` | `reports` | rapports (JSON, CSV `format=csv`, impression) |
| `GET /audit` · `GET /audit/integrity` | `audit` | journal et contrôle d’intégrité |
| `GET|PUT /settings` | `settings` | paramètres de l’officine |
| `GET|POST /users`, `GET /users/roles`, `PUT /users/:id` | `users` | comptes et rôles |

Codes de retour : `200/201` succès · `401` session absente ou expirée · `403` droit insuffisant ou jeton CSRF invalide ·
`404` élément ou route inconnus · `409` conflit (total de vente modifié, stock insuffisant pour annuler, valorisation figée,
clé de requête déjà utilisée) · `422` donnée invalide (règle métier ou validation).

## 5. Idempotence et sécurité des écritures

- Chaque écriture sensible porte une **clé de requête** (`requestKey`, UUID) : un rejeu réseau ne crée jamais
  de doublon (vente, réception, transfert, perte, inventaire).
- La vente est validée deux fois : le total proposé est renvoyé par le client (`expectedTotal`) ; s’il a changé
  entre-temps, la requête est refusée (`409`) et le devis est rejoué.
- La réponse d’une vente rejouée renvoie la vente existante, sans nouveau mouvement de stock.
- Les erreurs renvoient un message en français, éventuellement une liste de détails par champ.

## 6. Arborescence de l’interface React

```
frontend/src/
├── api/client.js         fetch + CSRF + gestion d’erreurs, clé de requête, exports CSV
├── api/endpoints.js      toutes les routes de l’API regroupées par module
├── context/AuthContext   session, droits (can('reports')…)
├── context/DataContext   /api/data + refresh() après chaque écriture
├── context/ToastContext  messages de confirmation et d’erreur
├── components/Layout.jsx navigation par métier, alertes, menu utilisateur
├── components/ui.jsx     boutons, champs, cartes, tableaux, modale, badges
├── pages/                18 écrans (un fichier par module fonctionnel)
├── forms/                9 formulaires métier réutilisables
└── utils/                formatage (montants, dates, pourcentages), routeur à ancre
```

Le routeur utilise le fragment d’URL (`#/ventes`) : aucune dépendance supplémentaire, historique du
navigateur fonctionnel, et le serveur peut servir l’application en une seule page.
