# 15. GUIDE FENO — ny zavatra atao rehetra, efijery isaky ny efijery, misy ohatra tena izy
### (kinova v2.7 : MAGSIN ROA — DÉPÔT + PHARMACIE, tsy misy commande, tsy misy retour fournisseur)

Ity boky ity no **fanazavana amin’ny antsipiriany indrindra** : ny efijery tsirairay,
ny saha tsirairay, ary **ny isa tokony ho hita** amin’ny farany. Ny isa rehetra eto
dia nalaina tamin’ny **simulation ofisialy** (base madio, 6 fanafody, 3 fournisseur) —
raha manaraka tsara ianao dia ho hitanao **mitovy** amin’izay ny valiny.

> **Fitsipika fototra v2.7**
> 1. Ny fanafody rehetra tonga dia **RÉCEPTION → DÉPÔT**.
> 2. Ny pharmacie dia mahazo entana amin’ny **TRANSFERT** ihany (`Transferts dépôt → pharmacie`).
> 3. Ny **vente** dia ao amin’ny pharmacie ; ny *sortie* ao amin’ny pharmacie = ny vente.
> 4. Samy manana ny *stock initial / entrée / sortie / stock final* ny magasin roa.
> 5. **Tsy misy commande**, **tsy misy retour fournisseur** : *réception*, *transfert*,
>    *vente*, *perte*, *inventaire* — izay ihany.
> 6. Alerte sy notification **isaky ny magasin** (lany, ho lany daty, lot bloqué, surstock…).

---

## PARTIE 0 — Fanomanana (5 minitra)

```powershell
# 1) Esory ao amin’ny C:\ ny archive
#    (izay tsara indrindra : C:\pharmastock)
Expand-Archive -Path "$HOME\Downloads\PharmaStock-v2.7.zip" -DestinationPath "C:\" -Force

# 2) Fametrahana
cd C:\pharmastock
npm install
npm run setup -- --full      # rôle PostgreSQL + base + migrations + admin

# 3) Fandehanana (terminal faharoa)
npm run dev                  # API 3001 + interface 5173
```

Sokafy ny navigateur : **http://localhost:5173**

Kaonty ampiasaina amin’ity boky ity :

| Anarana | Identifiant | Teny miafina | Rôle | Magasin |
|---|---|---|---|---|
| Administrateur | `admin` | (voaforona tamin’ny `setup`) | ADMIN | roa |
| Rasoanaivo Hery | `hery` | `Hery-Ambo-2026!` | PHARMACIST | Pharmacie |
| Rakoto Naina | `naina` | `Naina-Depot-2026!` | DEPOT | Dépôt |

---

# SÉANCE 1 — ADMINISTRATEUR (`admin`)

## 1.1 Fidirana

| Tsy | Asa | Vokatra tokony ho hita |
|---|---|---|
| 1 | `http://localhost:5173` | Écran `Connexion` |
| 2 | `admin` + teny miafina → `Se connecter` | `Tableau de bord` ; eo ambony havanana : **Administrateur** |

## 1.2 Tableau de bord (`Tableau de bord`)

**Vaovao** : misy **carte roa** (Dépôt / Pharmacie) mialoha ny olana.

| Saha / carte | Izay aseho | Amin’ity simulation ity |
|---|---|---|
| Bandeau ambony | Alerte mena (raha misy) | `1 point(s) à traiter aujourd’hui` (Sérum : rupture) |
| **Carte Dépôt (réserve)** | Valeur du stock · Médicaments · En rupture | 0 Ar (mbola tsy misy stock) |
| **Carte Pharmacie (comptoir)** | Valeur du stock · Médicaments · Ventes du jour | 0 Ar |
| `Alertes de stock (magasin du profil)` | Alerte isaky ny magasin | tsy misy raha mbola madio |
| `Prochaines péremptions` | Lot akaiky lany daty | tsy misy |
| `Derniers transferts dépôt → pharmacie` | Lisitry ny transfert | tsy misy |

## 1.3 Paramètres (`Pilotage → Paramètres`)

| Saha | Ohatra Ambohipo | Fanamarihana |
|---|---|---|
| Nom de la pharmacie | `Pharmacie Ambohipo` | Miseho amin’ny fanontana |
| Devise | `Ar` | Ariary |
| Base de calcul du prix | `Marge sur coût d’achat` | `COST` |
| Marge minimum | `10` | Tsy azo hihoatra |
| Marge maximum | `30` | Tsy azo hihoatra |
| Valorisation | `Coût réel du lot` | Azo ovaina ho `CMP` raha mbola tsy nisy mouvement |
| Alerte péremption (jours) | `90` | Fotoana fampitandremana |

→ `Enregistrer les paramètres` → `Paramètres enregistrés`.

## 1.4 Catégories (`Catalogue → onglet Catégories`)

Ataovy ireto efatra ireto : `Antalgiques`, `Antibiotiques`, `Antitussifs`, `Vitamines`.
(Samy misy `Description` fohy ; ny `Nom` ihany no tsy maintsy fenoina.)

## 1.5 Fournisseurs (`Catalogue → onglet Fournisseurs`)

| Nom | Téléphone | Adresse |
|---|---|---|
| SALAMA | +261 20 22 000 01 | Antananarivo |
| PHARMALAGY | +261 20 22 000 02 | Antsirabe |
| Laboratoire IPM | +261 20 22 000 03 | Antananarivo |

## 1.6 Utilisateurs (`Utilisateurs → Nouvel utilisateur`) — kaonty 2

| Saha | Kaonty 1 (`hery`) | Kaonty 2 (`naina`) |
|---|---|---|
| Nom complet | `Rasoanaivo Hery` | `Rakoto Naina (dépôt)` |
| Identifiant de connexion | `hery` | `naina` |
| Rôle | **Pharmacien / responsable** | **Gestionnaire du dépôt** |
| Téléphone | +261 34 00 000 01 | +261 34 00 000 02 |
| Mot de passe | `Hery-Ambo-2026!` | `Naina-Depot-2026!` |
| Confirmation | mitovy | mitovy |

> **Izay tsy misy intsony** : ny rôle « Gestionnaire de stock » sy « Vendeur habilité ».
> Ny dépôt (`naina`) no mitantana ny réserve ; ny pharmacien (`hery`) no mivarotra.
> Ny rôle efa voafafa dia tsy hita intsony ao amin’ny lisitra.

## 1.7 Catalogue : import CSV (6 fanafody, na 20+ raha tena izy)

```powershell
npm run import:products -- "backend\samples\catalogue-exemple.csv" --dry-run
npm run import:products -- "backend\samples\catalogue-exemple.csv"
```

Endrika fohy (raha atao an-tanana ny fanafody rehetra ao amin’ity simulation ity) :

| Code | Nom | Catégorie | Min | Marge % |
|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | Antalgiques | 20 | 10 |
| MED-002 | Amoxicilline 500 mg | Antibiotiques | 10 | 20 |
| MED-003 | Ibuprofène 400 mg | Antalgiques | 10 | 20 |
| MED-004 | Vitamine C 500 mg | Vitamines | 12 | 25 |
| MED-021 | Sirop antitussif enfant 120 ml | Antitussifs | 6 | 25 |
| MED-005 | Sérum physiologique | Antalgiques | 12 | 20 |

## 1.8 Fanamarinana sy fivoahana

* `Rapports` → `Stock` : tsy misy lot (mbola tsy nisy réception).
* `Journal d’audit` : hita ao ny `CREATE` natao teo aloha.
* `⏻` (eo ambony havanana) → mivoaka.

---

# SÉANCE 2 — GESTIONNAIRE DU DÉPÔT (`naina`)

## 2.1 Fidirana sy ny menio

Midira amin’ny `naina` / `Naina-Depot-2026!`.

| Menio hita | Tsy hita (fa misy amin’ny pharmacien) |
|---|---|
| Tableau de bord · Documents | — |
| **Stock** (Lots & stock · Mouvements) | — |
| **Réceptions (dépôt)** | — |
| **Transferts dépôt → pharmacie** | — |
| Inventaires · Pertes et dons | — |
| Catalogue · Rapports | — |
| — | **Historique de vente** (`sale` tsy omena) |
| — | Utilisateurs, Paramètres, Journal d’audit |

Eo ambony havanana dia misy ny badge **Dépôt** : fantatrao hatrany ny magasin iasanao.
Ny Tableau de bord dia mampiseho **ny an’ny dépôt ihany** (ny « Ventes du jour » dia 0 Ar).

## 2.2 Réception n°1 — `Réceptions (dépôt) → Nouvelle réception`

| Saha | Izay ampidirina | Fanazavana |
|---|---|---|
| Fournisseur | `SALAMA` | Tsy maintsy safidiana |
| Numéro de facture / bordereau | `FA-SALAMA-2026-101` | Facultatif |
| Frais de livraison | `40000` | Zaraina amin’ny unités rehetra |
| Ligne 1 | MED-001 · lot `PARA-24A` · 100 · 800 Ar · durée `18 mois` | Expire le = 17/03/2028 |
| Ligne 2 | MED-002 · lot `AMOX-24B` · 60 · 1 500 Ar · `18 mois` | Expire le = 29/10/2027 |
| Ligne 3 | MED-003 · lot `IBU-24C` · 80 · 900 Ar · `18 mois` | Expire le = 21/07/2027 |
| Remarque | `Livraison du matin — déposée au dépôt` | |

→ `Valider la réception`

**Vokatra tokony ho hita :**

| Zavatra | Isa |
|---|---|
| Référence | **REC-2026-000001** |
| Coût total (achats + frais) | **282 000,00 Ar** |
| Coût de revient PARA-24A | **932,23 Ar** (800 + ny anjara frais) |
| Coût de revient AMOX-24B | **1 747,93 Ar** |
| Coût de revient IBU-24C | **1 048,76 Ar** |
| Prix de vente MED-001 | **1 025,45 Ar** (coût + 10 %) |
| Prix de vente MED-002 | **2 097,52 Ar** (+ 20 %) |
| Prix de vente MED-003 | **1 258,51 Ar** (+ 20 %) |
| Toerana | **Dépôt (réserve)** — 0 any amin’ny pharmacie |

> Ny rohy `Imprimer le bon` dia mamoaka ny *Bon de réception* misy ny teny **Dépôt**.

## 2.3 Réception n°2 — `Réceptions → Nouvelle réception`

| Saha | Izolanao |
|---|---|
| Fournisseur | `Laboratoire IPM` |
| Facture | `FA-IPM-2026-77` |
| Frais | `15000` |
| Ligne 1 | MED-021 · lot `SIROP-24A` · 24 · 4 000 Ar · durée `aut` → `2026-11-08` |
| Ligne 2 | MED-004 · lot `VITC-24A` · 50 · 1 200 Ar · `18 mois` |

→ `Valider`

| Zavatra | Isa |
|---|---|
| Référence | **REC-2026-000002** |
| Coût total | **171 000,00 Ar** |
| Coût de revient SIROP-24A | **4 384,62 Ar** |
| Coût de revient VITC-24A | **1 315,38 Ar** |
| Prix de vente MED-021 | **5 480,77 Ar** (+ 25 %) |
| Prix de vente MED-004 | **1 644,23 Ar** (+ 25 %) |

**Fanamarinana** : `Stock → onglet Lots & stock` → `Magasin = Dépôt (réserve)` →
hita ny lot 5, ny total dia 240 + 74 = **314 unités** ao amin’ny dépôt, **0** ao amin’ny pharmacie.

## 2.4 Fanandramana : réception diso (ampian’ny rindranasa)

| Andrana | Vokatra |
|---|---|
| Lot lany daty (`expiresOn` andro lasa) | Refusé : *« Le lot … est déjà expiré … (RG09) »* |
| `Date de fabrication` aorian’ny `Date de réception` | Refusé (dates incohérentes) |
| Date de réception andro ho avy | Refusé : *« La date de réception ne peut pas être future. »* |

## 2.5 Transfert n°1 — `Transferts dépôt → pharmacie → Nouveau transfert`

| Saha | Izolanao | Fanazavana |
|---|---|---|
| Motif du transfert | `Réassort du comptoir` | Lisitra misy motif 5 |
| Sens | Dépôt (réserve) → Pharmacie (comptoir) | Voafaritra |
| Ligne 1 | lot `PARA-24A` · **40** | Stock dépôt 100 |
| Ligne 2 | lot `AMOX-24B` · **20** | Stock dépôt 60 |
| Ligne 3 | lot `SIROP-24A` · **12** | Stock dépôt 24 |
| Ligne 4 | lot `VITC-24A` · **20** | Stock dépôt 50 |
| Remarque | `Le comptoir garde une partie, la réserve le reste` | |

→ `Valider le transfert`

| Zavatra | Isa |
|---|---|
| Référence | **TRF-2026-000001** |
| Valeur transférée | **151 171,01 Ar** |
| Dépôt | −92 unités (PARA 60 · AMOX 40 · SIROP 12 · VITC 30) |
| Pharmacie | +92 unités, **lot jumeau** mitovy numéro, mitovy daty, mitovy coût |

## 2.6 Transfert n°2 — `Nouveau transfert`

| Saha | Izolanao |
|---|---|
| Motif | `Produit très demandé` |
| Ligne | lot `IBU-24C` · **20** |
| Remarque | `Ibuprofène : demande forte cette semaine` |

→ **TRF-2026-000002** — **20 975,21 Ar** ; dépôt 60, pharmacie 20.

## 2.7 Fanamarinana ny stock (écran `Stock`)

`Stock → onglet Lots & stock` → `Magasin = Dépôt (réserve)`

| Lot | Quantité (dépôt) | Coût retenu | Expiration |
|---|---|---|---|
| PARA-24A | 58 | 932,23 Ar | 17/03/2028 |
| AMOX-24B | 40 | 1 747,93 Ar | 29/10/2027 |
| IBU-24C | 60 | 1 048,76 Ar | 21/07/2027 |
| SIROP-24A | 12 | 4 384,62 Ar | 08/11/2026 (⚠️ alerte) |
| VITC-24A | 30 | 1 315,38 Ar | 06/02/2028 |
| **Total dépôt** | **200** | | |

`Magasin = Pharmacie (comptoir)` → **100 unités** (PARA 36 · AMOX 18 · IBU 20 · SIROP 10 · VITC 16).

`Stock → onglet Mouvements` : ny `TRANSFER_OUT` (dépôt, −) sy `TRANSFER_IN` (pharmacie, +)
dia samy voasoratra, misy ny **magasin** sy ny **motif**.

## 2.8 Perte ao amin’ny dépôt — `Pertes et dons → Déclarer une perte ou un don`

| Saha | Izolanao |
|---|---|
| Magasin concerné | **Dépôt (réserve)** |
| Motif | `Détérioration` |
| Lot | `PARA-24A` · **2** |
| Remarque justificative | `Carton de paracétamol écrasé dans la réserve` |

→ **PRT-2026-000002** — **1 864,46 Ar** ; ny dépôt 58 → **58** (efa nisy ny perte tao amin’ny simulation).
Ao amin’ny lisitra dia hita ny tsanganana **Magasin = Dépôt**.

## 2.9 Alerte sy notification

`Tableau de bord` (amin’ny `naina`) :

| Alerte | Antony |
|---|---|
| 🔴 Rupture de stock — Sérum physiologique | 0 unité ao amin’ny dépôt, seuil 12 |
| 🟠 Expiration proche — SIROP-24A (08/11/2026) | 12 unités ao amin’ny dépôt |

→ `Transferts` na `Réceptions` no atao avy amin’ny bokotra `Transférer`.

`⏻` → mivoaka ny kaonty `naina`.

---

# SÉANCE 3 — PHARMACIEN (`hery`)

## 3.1 Fidirana sy ny menio

Midira amin’ny `hery` / `Hery-Ambo-2026!`. Badge **Pharmacie** eo ambony.

Menio feno : `Tableau de bord`, **Historique de vente**, `Documents`, `Stock`,
`Réceptions` (tsy fenoina matetika), `Transferts`, `Inventaires`, `Pertes et dons`,
`Catalogue`, `Rapports`, `Journal d’audit`.

## 3.2 Vente n°1 — `Historique de vente`

| Tsy | Asa | Vokatra |
|---|---|---|
| 1 | Soraty `para` ao amin’ny fikarohana | MED-001 Paracétamol 500 mg · badge `36 en stock vendable` |
| 2 | `Ajouter` → panier | Panier 1 ligne |
| 3 | `+` 2 heny (total 3) | Quantité 3 |
| 4 | `Recalculer le total` | Lot retenu **PARA-24A** (FEFO) · PU **1 025,45 Ar** |
| 5 | Client : `Randria Soa` | — |
| 6 | `Ajouter` MED-002 ×2 | PU **2 097,52 Ar** |
| 7 | `Valider la vente` | **VTE-2026-000001** — **7 271,40 Ar** — marge **978,84 Ar** |

Aorian’izay : `Imprimer le ticket` → miseho ny ticket amin’ny fanontana.

## 3.3 Vente n°2 sy n°3

| Vente | Client | Andalana | Reference | Total | Marge |
|---|---|---|---|---|---|
| 2 | `Client de passage` | MED-021 ×1 | VTE-2026-000002 | 5 480,77 Ar | 1 096,15 Ar |
| 3 | `École primaire Ambohipo` | MED-004 ×4 | VTE-2026-000003 | 6 576,92 Ar | 1 315,38 Ar |

**Vokatra** : `Tableau de bord` → carte **Pharmacie** → `Ventes du jour` = **19 329,10 Ar**
(3 ventes) ; carte **Dépôt** → `Ventes du jour` = **0,00 Ar** (ny dépôt tsy mivarotra).

## 3.4 Fanandramana : fiarovana (stock tsy ampy)

Andramo mivarotra **100 Paracétamol** :

> ❌ Refusé — *« Stock vendable insuffisant dans la pharmacie pour « Paracétamol 500 mg » :
> seuls les lots non expirés et non bloqués du comptoir sont proposés.
> Transférer depuis le dépôt si besoin. »*

Na dia 58 ny isa ao amin’ny dépôt aza, **tsy azo amidy** izy ireo : ny transfert no
fomba hanaovana izany. Izany no miaro ny kaonty sy ny stock.

## 3.5 Lot bloqué (contrôle qualité)

`Stock → Lots & stock` → safidio ny lot → `Bloquer` + justification (≥ 3 litera).
→ Ilay lot dia **tsy hita** intsony ao amin’ny fikarohana vente (FEFO),
fa mbola voaisa ao amin’ny stock. `Remettre en vente` vao miverina.

## 3.6 Perte ao amin’ny comptoir — `Pertes et dons`

| Saha | Izolanao |
|---|---|
| Magasin concerné | **Pharmacie (comptoir)** |
| Motif | `Casse` |
| Lot | `SIROP-24A` (pharmacie) · **1** |
| Remarque | `Flacon de sirop renversé au comptoir` |

→ **PRT-2026-000001** — **4 384,62 Ar** ; ny pharmacie 11 → **10**.
(Fanamarihana : raha safidina `Dépôt` dia **refusé** ny lot an’ny pharmacie — izany no
manamarina fa samy manana ny stock-ny ny magasin roa.)

## 3.7 Vente diso → annulation

`Documents` → tadiavo `VTE-2026-000002` → `Annuler` → motif ≥ 3 litera
(`Client non servi, vente annulée`).

| Vokatra | Isa |
|---|---|
| État | `Annulé` (CANCELLED) |
| Stock | Ny 1 Sirop dia niverina tao amin’ny lot (mouvement `CANCEL`) |
| Ventes du jour | Mihena ho **13 848,33 Ar** (2 ventes) |

## 3.8 Fanovana marge — `Catalogue → Médicaments → %`

| Saha | Izolanao |
|---|---|
| Taux (%) | `25` |
| Motif | `Ajustement validé par le pharmacien` |

→ `Historique des prix` : hita ny daty, ny coût, ny taux, ny prix vaovao, ary ny **iza** no nanao.

## 3.9 Raporo isan’andro — `Rapports`

| Rapport | Valiny tamin’ny simulation |
|---|---|
| `Ventes et marges (pharmacie)` | Andalana 4 (ny vente voafafa tsy hita) |
| `Fiche de stock — PHARMACIE` | initial 0 · entrées 122 · sorties 22 · final **100** |

`⏻` → mivoaka.

---

# SÉANCE 4 — INVENTAIRE (magasin roa, misaraka)

## 4.1 Inventaire de la pharmacie (`hery`)

| Tsy | Asa | Vokatra |
|---|---|---|
| 1 | `Inventaires → Ouvrir un inventaire` | Modale |
| 2 | `Magasin à compter` : **Pharmacie (comptoir)** | Tsy azo atao miaraka amin’ny inventaire dépôt |
| 3 | `Périmètre compté` : `Rayon comptoir` | |
| 4 | `Ouvrir et compter` | **INV-2026-000001** — 5 lot hita |
| 5 | Fenoy ny `Compté` (isa tena hita) | Ny `Théorique` no omen’ny rindranasa |
| 6 | Andalana iray : `Compté = Théorique − 1`, `Justification` foana | `Valider` **refusé** (RG17) |
| 7 | `Justification` : `Un comprimé manquant constaté au comptage (boîte ouverte)` | |
| 8 | `Valider l’inventaire (1 écart)` | Écart **−1 unité**, ajustement **−932,23 Ar** |

## 4.2 Inventaire du dépôt (`naina`, na `admin`)

`Inventaires → Ouvrir un inventaire` → `Magasin à compter : Dépôt (réserve)` →
`Ouvrir et compter` → **INV-2026-000002** → `Compté = Théorique` amin’ny andalana rehetra
→ `Valider l’inventaire (0 écart)` → *« aucun mouvement de stock créé »*.

> Ny écart voamarina ihany no manao **ajustement** ; samy voasoratra ao amin’ny
> `Mouvements` (misy ny magasin) sy ao amin’ny `Journal d’audit`.

---

# SÉANCE 5 — FINALE (`admin`) : fiches, alertes, journal, sauvegarde

## 5.1 Fiche de stock — PHARMACIE (`Rapports → Fiche de stock — PHARMACIE`)

Période : `Ce mois` (na `Du`/`Au`). Totaux hita eo ambony : *initial · entrées · sorties · final · valeur*.

| Code | Médicament | Stock initial | Entrées | Sorties | Stock final | Situation | Valeur (Ar) |
|---|---|---|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | 0 | 40 | 4 | **36** | Correct | 33 560,33 |
| MED-002 | Amoxicilline 500 mg | 0 | 30 | 12 | **18** | Correct | 31 462,81 |
| MED-003 | Ibuprofène 400 mg | 0 | 20 | 0 | **20** | Correct | 20 975,21 |
| MED-004 | Vitamine C 500 mg | 0 | 20 | 4 | **16** | Correct | 21 046,15 |
| MED-005 | Sérum physiologique | 0 | 0 | 0 | **0** | Rupture | 0,00 |
| MED-021 | Sirop antitussif enfant 120 ml | 0 | 12 | 2 | **10** | Correct | 43 846,15 |
| — | **TOTAUX** | **0** | **122** | **22** | **100** | | **150 890,65** |

> Ao amin’ny pharmacie : **entrées = transferts**, **sorties = ventes** (+ pertes).

## 5.2 Fiche de stock — DÉPÔT (`Rapports → Fiche de stock — DÉPÔT`)

| Code | Médicament | Stock initial | Entrées | Sorties | Stock final | Valeur (Ar) |
|---|---|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | 0 | 100 | 42 | **58** | 54 069,42 |
| MED-002 | Amoxicilline 500 mg | 0 | 70 | 30 | **40** | 69 917,36 |
| MED-003 | Ibuprofène 400 mg | 0 | 80 | 20 | **60** | 62 925,62 |
| MED-004 | Vitamine C 500 mg | 0 | 50 | 20 | **30** | 39 461,54 |
| MED-005 | Sérum physiologique | 0 | 0 | 0 | **0** | 0,00 |
| MED-021 | Sirop antitussif enfant 120 ml | 0 | 24 | 12 | **12** | 52 615,38 |
| — | **TOTAUX** | **0** | **324** | **124** | **200** | **278 989,32** |

> Ao amin’ny dépôt : **entrées = réceptions** (+ les retours de transfert), **sorties = transferts + pertes**.

**Ny stock initial dia miverina ho azy** : ovay ny période ho `Du 25/09` → ny `Stock initial`
dia mitovy amin’ny `Stock final` teo aloha (36, 18, 20, 16, 0, 10 ho an’ny pharmacie ;
58, 40, 60, 30, 0, 12 ho an’ny dépôt). **Tsy misy manao kopie an-tanana intsony.**

## 5.3 Reports hafa

| Rapport | Izay aseho |
|---|---|
| `Transferts dépôt → pharmacie` | TRF-2026-000001 (4 andalana), TRF-…-000002, TRF-…-000003 `CANCELLED` |
| `Ventes et marges (pharmacie)` | VTE-…-000001, VTE-…-000003 (ny voafafa tsy hita) |
| `Achats et réceptions (dépôt)` | REC-…-000001, REC-…-000002 misy frais sy coût de revient |
| `Pertes et dons` | PRT-…-000001 (pharmacie) sy PRT-…-000002 (dépôt) |
| `Lots à surveiller` | SIROP-24A (08/11/2026) ho an’ny magasin roa |
| `Inventaires et écarts` | INV-…-000001 (1 écart) sy INV-…-000002 (0 écart) |
| `Historique des prix` | Ny fanovana marge nataon’ny pharmacien |

`Export CSV` → ho an’Excel (misy BOM, mizara `;`, azo ovaina mora).
`Imprimer` → ho PDF (Ctrl + P → *Enregistrer au format PDF*).

## 5.4 Tableau de bord farany

| Carte | Dépôt | Pharmacie |
|---|---|---|
| Valeur du stock | **278 989,32 Ar** | **150 890,65 Ar** |
| Lots en stock | 5 | 5 |
| Ventes du jour | 0,00 Ar | **19 329,10 Ar** (na 13 848,33 Ar raha voafafa ny vente iray) |
| Pertes du jour | 1 864,46 Ar | 4 384,62 Ar |
| Alertes | 2 (1 mena) | 2 (1 mena) |

## 5.5 Journal d’audit sy intégrité

* `Journal d’audit` : `LOGIN`, `CREATE`, `VALIDATE` (réceptions, transferts, ventes, inventaires),
  `CANCEL` (transfert annulé), `UPDATE` (marge). Tsy misy teny miafina voatahiry.
* `Rapports → Contrôle d’intégrité` : *« Stock cohérent : lot = somme des mouvements »*.

## 5.6 Sauvegarde (tsy azo dinganina)

```powershell
cd C:\pharmastock
bash scripts\backup-database.sh          # na: pg_dump -U pharmastock -f sauvegarde.sql pharmacie_stock
```

Tehirizo any ivelan’ny solosaina (clé USB, disque ivelany, cloud). Isam-bolana dia
ataovy tahiry ny **CSV/PDF** amin’ny fiche de stock.

---

# ANNEXE A — Tabilao famintinana (isa farany rehetra)

| Raikitra | Dépôt | Pharmacie |
|---|---|---|
| Stock initial (période) | 0 | 0 |
| Entrées | 324 | 122 |
| Sorties | 124 | 22 |
| **Stock final** | **200** | **100** |
| Valeur du stock | 278 989,32 Ar | 150 890,65 Ar |
| Ventes du mois | 0 Ar | 19 329,10 Ar (marge 3 390,38 Ar) |
| Pertes | 1 864,46 Ar | 4 384,62 Ar |
| Documents | réceptions 2 · transferts 3 · pertes 1 · inventaires 1 | ventes 3 · pertes 1 · inventaires 1 |

| Lot | Dépôt | Pharmacie | Expiration |
|---|---|---|---|
| PARA-24A | 58 | 36 | 17/03/2028 |
| AMOX-24B | 40 | 18 | 29/10/2027 |
| IBU-24C | 60 | 20 | 21/07/2027 |
| SIROP-24A | 12 | 10 | 08/11/2026 |
| VITC-24A | 30 | 16 | 06/02/2028 |
| **Total** | **200** | **100** | |

Mouvements : **26** (immuables). Dokument total : 12.

---

# ANNEXE B — Iza no mahita inona (fahefana, RG18)

| Zavatra | ADMIN | PHARMACIST | DEPOT |
|---|---|---|---|
| Réceptions (entrée au dépôt) | ✔ | ✔ | **✔** |
| Transferts dépôt → pharmacie | ✔ | ✔ | **✔** |
| Ventes | ✔ | **✔** | ✘ (écran tsy hita) |
| Historique de vente | ✔ | **✔** | ✘ |
| Pertes / dons | ✔ | ✔ | ✔ |
| Inventaires (magasin tsirairay) | ✔ | ✔ | ✔ |
| Prix de vente sy marge | ✔ | ✔ | ✘ (tsy alefa mihitsy) |
| Coût d’achat, valeur du stock | ✔ | ✔ | ✔ |
| Clients, comptes, paramètres | ✔ | ✘ | ✘ |
| Journal d’audit | ✔ | ✔ (vakiana) | ✘ |
| Rapports | ✔ | ✔ | ✔ (ny an’ny dépôt) |

Tsy ny interface ihany no miaro : **ny serveur ihany koa** mandà (izany no
voamarina amin’ny fanandramana : `POST /api/sales` amin’ny kaonty dépôt → **403**).

---

# ANNEXE C — Hamerenana amin’ny laoniny (fanandramana vaovao)

```powershell
# 1. Ajanony ny rindranasa (Ctrl + C ao amin’ny terminal)

# 2. Ao amin’ny SQL Shell (psql), compte postgres :
DROP DATABASE pharmacie_stock;
CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING UTF8;

# 3. Ao amin’ny C:\pharmastock :
npm run db:migrate
npm run admin:create
# avy eo dia avereno ny SÉANCE 1 (paramètres, kaonty, catalogue)
```

Raha mbola mila ny angona taloha : `pg_restore` amin’ny sauvegarde farany.

---

# ANNEXE D — Hadisoana mety hiseho sy ny heviny

| Haforana hita | Antony | Vahaolana |
|---|---|---|
| *« Stock vendable insuffisant dans la pharmacie… »* | Ny stock dia ao amin’ny dépôt | Manaova **Transfert** aloha |
| *« Le lot … n’est pas dans le magasin « Dépôt » »* | Transfert avy amin’ny lot an’ny pharmacie | Safidio lot avy amin’ny dépôt |
| *« Le lot … se trouve dans « Pharmacie » : choisir ce magasin… »* | Perte natao tamin’ny magasin diso | Ovay ny `Magasin concerné` |
| *« Un inventaire est déjà en cours dans « Pharmacie » »* | Inventaire tsy mbola voavaha | `Valider` na `Abandonner` aloha |
| *« De nouveaux lots ont été créés dans ce magasin… »* | Nisy réception/transfert nandritra ny comptage | `Abandonner` dia manomboka vaovao |
| *« Document déjà annulé ou non validé »* | Efa voafafa ilay document | Jereo ny `Documents` |
| *« Motif obligatoire (3 caractères minimum) »* | Tsy feno ny motif | Fenoy ny antony |
| Tsy hita ny `Historique de vente` | Kaonty `DEPOT` no ampiasaina | Miverena amin’ny `hery` (PHARMACIST) na `admin` |

---

## Fanazavana fohy (résumé)

* **RÉCEPTION → DÉPÔT → TRANSFERT → PHARMACIE → VENTE** : izay ny lalan’ny fanafody rehetra.
* Ny **dépôt** dia mpampiasa misaraka (`naina`) ; ny **pharmacie** no mivarotra (`hery`).
* Samy manana ny **stock initial / entrées / sorties / stock final** ny magasin roa —
  ny fiche de stock dia miverina ho azy, tsy misy kopie an-tanana.
* **Alerte sy notification** isaky ny magasin : rupture, stock faible, péremption, lot bloqué.
* **Historique de vente** ao amin’ny pharmacie, **historique** (réceptions, transferts, pertes)
  ao amin’ny dépôt ; ny `Documents` sy `Mouvements` no mitahiry ny zava-drehetra.
* **Responsive** : finday, takelaka, ordinatera — menio ambany amin’ny finday, tabilao
  azo sidinina, bokotra lehibe ho an’ny rantsan-tànana.
