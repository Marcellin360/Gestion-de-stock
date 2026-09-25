# NOUVEAUTÉS — version 2.7 (DÉPÔT + PHARMACIE)

Ity rakitra ity no **fitanisana ny zava-niova** teo amin’ny kinova 2.6 mankany amin’ny 2.7.
Raha vao voalohany ianao dia vakio mivantana ny **`docs/14`** (fampiasana tena izy) sy ny
**`docs/15`** (efijery isaky ny efijery) — ireo no boky feno amin’ny rafitra vaovao.

---

## 1. Ny niova (tabilao fampitahana)

| Teo aloha (2.6) | Amin’izao (2.7) | Antony |
|---|---|---|
| Mpiasa 4 : administrateur, pharmacien, **gestionnaire de stock**, **vendeur** | Mpiasa 3 : **administrateur**, **pharmacien**, **dépôt** | Ny dépôt no mitantana ny tahiry, ny comptoir no mivarotra |
| **Commande fournisseur** (`Commandes`) | **Tsy misy** : soratana mivantana ao amin’ny `Réceptions` ny entana tonga | Tsy misy taratasy « commande » tehirizina ; ny faktiora/BA no porofo |
| **Retour fournisseur** (`Retours fournisseur` + statut) | **Tsy misy** : atao `Pertes et dons` (motif `Rappel` raha raisin’ny laboratoire), na `Transfert` raha miverina any amin’ny réserve | Nihena ny taratasy samihafa ; ny lalan’ny fanafody dia transfert ihany |
| Stock iray ihany | **Magasin roa** : `DEPOT` (réserve) sy `PHARMACY` (comptoir) | Ny banque/stock du dépôt dia tsy amidy mivantana |
| Vente amin’ny stock iray | Ny **vente dia maka ao amin’ny pharmacie ihany** (rajely ny dépôt) | Fanavahana ny tahiry sy ny toeram-pivarotana |
| — | **`Transferts dépôt → pharmacie`** (motif, quantité voafetra, **lot jumeau**, bordereau, annulation) | Ny fanafody rehetra dia mandalo ny dépôt aloha |
| Fiche de stock iray | **Fiche roa** : `Fiche de stock — PHARMACIE` sy `Fiche de stock — DÉPÔT` (samy manana initial / entrées / sorties / final) | Ny vente no sortie amin’ny comptoir, ny transfert ny an’ny réserve |
| Alerte tsy voazara | **Alerte sy notification isaky ny magasin** (rupture, stock faible, péremption, lot bloqué, surstock) | Ny dépôt sy ny pharmacie samy manana ny laharam-pahamehany |
| `Ventes` | **`Historique de vente`** (comptoir) + **historique du dépôt** amin’ny alalan’ny `Réceptions`, `Transferts`, `Documents`, `Mouvements` | Takiana ny tantara voasoratra ho an’ny tsirairay |
| Interface ordinatera | **Responsive web + finday/tablette** (menio ambany, tabilao azo sidinina, bokotra lehibe) | Ilaina amin’ny fivarotana (@finday) |
| 10 rapports | **12 rapports** (nasiana ny fiche roa sy ny transferts) | Mifanaraka amin’ny rafitra vaovao |

## 2. Ny lalan’ny fanafody (lalàna fototra)

```
Fournisseur ──► RÉCEPTION ──► DÉPÔT (réserve) ──► TRANSFERT ──► PHARMACIE (comptoir) ──► VENTE
   faktiora       (kaonty dépôt)     initial/entrée/sortie/final     lot jumeau        initial/entrée/
                                    alerte rupture/péremption                   sortie (=vente)/final
```

1. **Réception** : ny entana rehetra dia miditra **ao amin’ny dépôt** (na iza na iza no manao azy).
2. **Transfert** : alefa any amin’ny comptoir izay ilainy — ny sisa dia mijanona ao amin’ny réserve.
   Miforona **lot jumeau** (mitovy `n° de lot`, mitovy `expire le`, mitovy `coût retenu`).
3. **Vente** : ao amin’ny comptoir ihany ; ny lot akaiky indrindra ny daty no mivoaka aloha (FEFO).
4. **Perte** : misy `Magasin concerné` — na ny réserve na ny comptoir, samy manana ny taratasy.
5. **Inventaire** : atao **isaky ny magasin** (tokana isaky ny magasin amin’ny fotoana iray).

## 3. Kaonty vaovao

| Identifiant | Rôle | Asa |
|---|---|---|
| `admin` | ADMIN | Ny zavatra rehetra : comptes, paramètres, magasin roa, sauvegarde |
| `pharmacien` | PHARMACIST | Vente, prix/marge, perte & inventaire comptoir, rapports, journal |
| `depot` | DEPOT | Réception, transfert, perte & inventaire réserve, rapports an’ny dépôt |

*(Angona fanandramana : `npm run demo:users` dia mamorona `pharmacien` / `Pharmacien-2026!` sy
`depot` / `Depot-2026!`. Amin’ny fampiasana tena izy dia ataovy amin’ny écran `Utilisateurs`.)*

## 4. Ny atao rehefa mifindra amin’ny 2.7

1. **Sauvegarde** aloha : `pg_dump -U pharmastock -f sauvegarde-2.6.sql pharmacie_stock`.
2. Ny migration `003_magasins.sql` dia mipetraka ho azy amin’ny `npm run db:migrate`
   (nasiana ny **magasin** amin’ny lot, vente, perte, inventaire sy ny tabilao `transfers`).
3. Ny stock efa misy dia **ampidirina ao amin’ny dépôt** avao; dia manao **transfert** ianao
   hampidirana izay ilain’ny comptoir („Stock initial” ny fitambaran’izy roa).
4. Ny rôle `SELLER` sy `STOCK` dia tsy ampiasaina intsony : ny mpampiasa teo aloha dia
   **ovay rôle** ho `PHARMACIST` (ilay mivarotra) na `DEPOT` (ilay mitantana ny réserve).
5. Avereno jerena : `npm test`, `npm run test:integration` (mila base misy anarana miafara amin’ny
   `_test`) ary `ADMIN_PASSWORD=… node backend/scripts/verifier-scenario.mjs` (fanamarinana feno
   amin’ny alalan’ny API).

## 5. Fanamarinana atao amin’ity kinova ity

| Fanamarinana | Baiko | Vokatra |
|---|---|---|
| Fitsapana unitaire (kajy, FEFO, frais, alerte isaky ny magasin) | `npm test` | **21 / 21** |
| Fitsapana intégration (API feno, rôle, transfert, inventaire, rapports) | `npm run test:integration` | **29 / 29** |
| Fanamarinana « andro iray » amin’ny alalan’ny API | `node backend/scripts/verifier-scenario.mjs` | réception → transfert → 3 ventes → pertes → inventaires → fiche roa |
| Fanandramana angona | `npm run demo:seed && npm run demo:users && npm run demo:scenario` | 1 réception, 1 transfert, **2 ventes**, 2 pertes, 14 mouvements |

## 6. Ny rakitra niova (top 10)

| Rakitra | Inona no niova |
|---|---|
| `backend/sql/003_magasins.sql` | **vaovao** : magasin amin’ny lot/documents, tabilao `transfers` + `transfer_lines`, rôle 3 |
| `backend/src/services/transfer.service.js` | **vaovao** : lot jumeau, motif, quantité voafetra, annulation |
| `backend/src/services/report.service.js` | fiche roa (`fiche`, `fiche_depot`), rapport `transfers`, stock initial miverina ho azy |
| `backend/src/services/alert.service.js` | alerte sy statistiques **isaky ny magasin** |
| `backend/src/services/{sale,loss,inventory}.service.js` | vente → PHARMACY ihany ; perte/inventaire misy `location` |
| `backend/src/services/{order,supplierReturn}.service.js` | **voafafa** |
| `frontend/src/pages/TransfersPage.jsx` + `forms/TransferForm.jsx` | **vaovao** : écran transfert + bordereau |
| `frontend/src/pages/{OrdersPage,ReturnsPage}.jsx` | **voafafa** |
| `frontend/src/pages/DashboardPage.jsx` | carte roa (Dépôt / Pharmacie) + derniers transferts |
| `frontend/src/styles.css` + `components/Layout.jsx` | responsive/finday : menio ambany, tiroir, tabilao |
