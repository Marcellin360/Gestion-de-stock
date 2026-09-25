# 14. FAMPIASANA TENA IZY — fanazavana feno, ohatra tena izy isaky ny rôle

> **Vaovao tamin’ity kinova ity (v2.7) : ny rafitra dia miasa amin’ny MAGASIN ROA.**
>
> | Teo aloha | Amin’izao | Antony |
> |---|---|---|
> | Mpiasa 4 : admin, pharmacien, **gestionnaire de stock**, **vendeur** | Mpiasa 3 : **administrateur, pharmacien, dépôt** | Ny dépôt no mitantana ny stock ; ny pharmacie no mivarotra |
> | **Commande fournisseur** | **Tsy misy intsony** | Rehefa tonga ny entana dia soratana mivantana ao amin’ny *Réception* |
> | **Retour fournisseur** | **Tsy misy intsony** | Ny entana tsy mety dia *Perte* ao amin’ny magasin misy azy |
> | **Transfert (dépôt → pharmacie)** | **Vaovao** | Ny fanafody rehetra tonga dia **mivantana ao amin’ny dépôt aloha**, avy eo mifindra any amin’ny pharmacie araka ny ilain’ny comptoir |
> | Stock iray ihany | **Stock roa mitovy endrika fa tsy mitovy isa** : ny an’ny dépôt sy ny an’ny pharmacie | Samy manana ny *stock initial / entrée / sortie / stock final* ny tsirairay |
> | Alerte tsy voazara | **Alerte sy notification isaky ny magasin** (lany, ho lany daty, be loatra…) | Ny dépôt sy ny pharmacie samy manana ny laharam-pahamehany |
> | — | **Historique de vente** (pharmacie) sy **Historique du dépôt** | Tsy afangaro ny varotra sy ny fifindran’entana |

Rindranasa iray, mpampiasa telo, magasin roa : **DÉPÔT (réserve)** sy **PHARMACIE (officine/comptoir)**.
Ny fanafody rehetra dia **tonga ao amin’ny dépôt**, avy eo **mifindra** any amin’ny pharmacie
amin’ny alalan’ny **Transfert**. Ny **vente** dia ao amin’ny pharmacie ihany. Ny **sortie** rehetra
(vente, perte, transfert) dia voasoratra ao amin’ny *Mouvements* sy ao amin’ny *Documents*.

---

# PARTIE 1 — NY ATAO VOALOHANY (indray mandeha, ~2 ora)

## Dingana 0 — Fanapahan-kevitra 30 segondra (tadiavo alohan’ny manomboka)

| Fanontaniana | Valiny | Ahoana amin’ny rindranasa |
|---|---|---|
| Firy ny olona hampiasa azy ? | 1 kaonty = 1 olona (tsia 1 kaonty iombonana) | `Utilisateurs` |
| Iza no mitantana ny **dépôt** ? | Ilay miandraikitra ny fandraisana entana sy ny fitahirizana | Rôle **DEPOT** |
| Iza no mivarotra ? | Ny pharmacien (na ny admin raha toa kely ny ekipa) | Rôle **PHARMACIST** / **ADMIN** |
| Manao **commande** ve isika ? | Tsia : tonga mivantana ny entana → *Réception* | `Réceptions` |
| Hanao **inventaire** amin’ny magasin roa ve ? | Eny, misaraka : dépôt sy pharmacie | `Inventaires` → `Magasin à compter` |

## Dingana 1 — Base madio + rindranasa mandeha

```powershell
cd C:\pharmastock
npm install
npm run setup -- --full      # rôle PostgreSQL + base + migrations + administrateur
```

Any amin’ny terminal faharoa :

```powershell
cd C:\pharmastock
npm run dev                  # API (3001) + interface (5173) ; sokafy http://localhost:5173
```

> Tsy mampiasa `--demo` amin’ny tena izy : tsy tokony hisy angona noforonina ao amin’ny rejistra.

## Dingana 2 — Hamarino fa madio ny base (`ALLOW_DEMO=false`)

```powershell
cd C:\pharmastock
npm run db:status                     # migrations 1, 2, 3 voatahiry
```

Ao amin’ny `backend\.env` : `ALLOW_DEMO=false`. Avy eo, ao amin’ny rindranasa :
midira amin’ny `admin` → `Tableau de bord` → tokony **0** ny vente, **0** ny lot.

## Dingana 3 — Paramètres (5 minitra)

`Pilotage → Paramètres`

| Saha | Ohatra Ambohipo | Fanazavana |
|---|---|---|
| Nom de la pharmacie | Pharmacie Ambohipo | Miseho amin’ny fanontana rehetra |
| Devise | Ar | Ariary |
| Base de calcul du prix | Marge sur coût d’achat | `COST` = coût × (1 + taux) |
| Marge minimum / maximum | 10 % / 30 % | Fiarovana : tsy azo hihoatra |
| Méthode de valorisation | Coût réel du lot | Azo ovaina ho CMP raha mbola tsy misy mouvement |
| Jours d’alerte péremption | 90 | Alerte « ho lany daty » 90 andro mialoha |

## Dingana 4 — Utilisateurs : kaonty iray isaky ny mpiasa

`Utilisateurs → Nouvel utilisateur`

| Anarana | Identifiant | Rôle | Teny miafina (ohatra) | Zavatra tokony ho fantatra |
|---|---|---|---|---|
| Rasoanaivo Hery | `hery` | **Pharmacien / responsable** | `Hery-Ambo-2026!` | Mivarotra, mitantana ny stock pharmacie, manao perte, mitazona ny vidiny |
| Rakoto Naina | `naina` | **Gestionnaire du dépôt** | `Naina-Depot-2026!` | Mandray entana, mamindra entana any amin’ny pharmacie, manao perte ao amin’ny dépôt |
| Administrateur | `admin` | **Administrateur** | (voaforon’ny `setup`) | Mahita sy manao ny zava-drehetra, mitantana ny kaonty |

> **Zava-dehibe** : ny **dépôt dia mpampiasa hafa mihitsy** (kaonty `naina`). Tsy
> afaka mivarotra izy, ary tsy mahita ny vidin’ny varotra : ny asany dia ny réserve.
> Ny pharmacien kosa tsy mahita ny *stock du dépôt* afa-tsy amin’ny alalan’ny écran
> `Transferts` sy `Stock → onglet Lots & stock` (fisafidianana `Magasin`).

## Dingana 5 — Fournisseurs

`Catalogue → onglet Fournisseurs → Nouveau fournisseur`

| Nom | Téléphone | Adresse |
|---|---|---|
| SALAMA | +261 20 22 000 01 | Antananarivo |
| PHARMALAGY | +261 20 22 000 02 | Antsirabe |
| Laboratoire IPM | +261 20 22 000 03 | Antananarivo |

## Dingana 6 — Catalogue : import CSV (izay tena ilaina amin’ny tena izy)

```powershell
# 1) simulation aloha : tsy misy voasoratra, ho hitanao izay ho foronina
npm run import:products -- "backend\samples\catalogue-exemple.csv" --dry-run

# 2) import tena izy
npm run import:products -- "backend\samples\catalogue-exemple.csv"

# 3) any aoriana, hanitsiana seuil ao amin’Excel dia averina :
npm run import:products -- "backend\samples\catalogue-exemple.csv" --update
```

Ny tsanganana ilaina : `code, nom, categorie, forme, unite, min, max, marge`.
Ny `min` (seuil minimum) no mamoaka ny alerte **Stock faible / Rupture**, ary izy
no misy fiantraikany amin’ny fanapahan-kevitry ny **dépôt** sy ny **pharmacie**.

## Dingana 7 — Stock de départ (ny fomba marina : Réception → Transfert)

Tsy misy « fanisana stock » mivantana : ny stock dia teraka avy amin’ny **réception**
(faktiora/bon de livraison tena izy), avy eo mifindra amin’ny alalan’ny **transfert**.

1. `Réceptions → Nouvelle réception` (midira amin’ny kaonty **naina**, ny dépôt) :
   fournisseur, numéro de facture, frais de livraison, ary ny andalana rehetra
   (médicament, **numéro de lot**, quantité, prix d’achat, durée de conservation).
   → Ny lot rehetra dia **miditra ao amin’ny dépôt**.
2. `Transferts dépôt → pharmacie → Nouveau transfert` : safidio izay ilain’ny comptoir
   amin’izao (afa-tsy ny fanafody rehetra). → Ny pharmacie dia manana ny stock-ny.
3. `Stock → onglet Lots & stock` : ny tsanganana **Magasin** no mampiseho ny fizarana.

> Ohatra Ambohipo (izay ampiasain’ity boky ity) : 100 Paracétamol, 60 Amoxicilline,
> 80 Ibuprofène tonga tao amin’ny dépôt ; 40 + 20 + 80 dia nafindra tany amin’ny
> pharmacie tamin’ny andro voalohany (jereo ny PARTIE 4).

## Dingana 8 — Fanamarinana sy sauvegarde (tsy azo dinganina)

```powershell
cd C:\pharmastock
npm run diagnose                    # jereo ny fifandraisana, ny migrations, ny .env
node backend\scripts\check-integrity.mjs   # lot = totalin’ny mouvements
```

Sauvegarde: `scripts\backup-database.sh` (na `pg_dump` amin’ny Windows). Ataovy
isan’andro, ary tehirizo any ivelan’ny solosaina (clé USB na cloud).

## Dingana 9 — Ny fitsipika 7 tsy azo dinganina

1. **Kaonty iray isaky ny olona** : ny traceability dia mitaky izany (izao no mahafantatra hoe iza no nanao).
2. **Tsy misy manova stock an-tanana** : réception, transfert, vente, perte, inventaire ihany.
3. **Réception → Dépôt foana** ; ny pharmacie dia mahazo entana amin’ny **transfert** ihany.
4. **Ny vente dia ao amin’ny pharmacie ihany** : raha tsy ampy ny stock ao amin’ny comptoir,
   dia **transfert** aloha, fa tsy mivarotra amin’ny stock du dépôt.
5. **Tsy misy fanafody miala tsy misy taratasy** : transfert, perte, ajustement — samy manana ny reference-ny.
6. **Ataovy ny inventaire isam-bolana, magasin tsirairay** (fanisana tena izy, an-tanana).
7. **Sauvegarde isan’andro** ary **fanontana** ny fiche de stock isam-bolana (taratasy ho an’ny mpiara-miombon’antoka).

---

# PARTIE 2 — NY ANDRO IRAY AO AMIN’NY OFFICINE (routines)

## 2.1 Fanokafana (07:30, 5 minitra) — Pharmacien sy Dépôt

1. `Tableau de bord` : jereo ny **deux cartes magasin** : *Valeur du stock*, *Médicaments*,
   *En rupture* (dépôt) / *Ventes du jour* (pharmacie).
2. Jereo ny **alertes** : mena = rupture sy tranga mivantana ; volom-boasary = stock faible, péremption.
3. Ny **dépôt** dia manomboka amin’ny `Réceptions` raha nisy livraison, ary `Transferts` raha
   mila fanampiny ny comptoir.

## 2.2 Mandritra ny andro

| Ora | Iza | Inona | Ecran |
|---|---|---|---|
| Maraina | Dépôt (`naina`) | Mandray livraison : lot, prix, frais, péremption | `Réceptions` |
| Maraina | Dépôt | Mamindra izay ilain’ny comptoir | `Transferts dépôt → pharmacie` |
| Andro manontolo | Pharmacien (`hery`) | Mivarotra, manonta ticket | `Historique de vente` (écran POS) |
| Raha misy olana | Pharmacien | Perte ao amin’ny comptoir (casse, don) | `Pertes et dons` (magasin = Pharmacie) |
| Raha misy olana | Dépôt | Perte ao amin’ny réserve (casse, péremption) | `Pertes et dons` (magasin = Dépôt) |

## 2.3 Fanidiana (18:00, 10 minitra)

1. `Historique de vente` : totalin’ny andro (isa sy Ariary) → soraty ao amin’ny kahie raha ilaina.
2. `Tableau de bord` → carte **Pharmacie** : *Ventes du jour*, sy carte **Dépôt** : *Pertes du jour*.
3. Jereo ny alerte **ho lany daty** : raha misy lot ao amin’ny pharmacie saika ho lany daty,
   dia alefa any amin’ny dépôt amin’ny *transfert* misy motif (« Retour du surplus au dépôt ») —
   tsy maintsy atao alohan’ny daty.
4. `Documents` : jereo raha nisy transfert voasoratra tsy araka ny tena izy (isy dia *annuler* misy motif).

## 2.4 Isam-bolana (1–2 ora)

1. **Inventaire** : atao **amin’ny magasin roa misaraka** (`Inventaires → Ouvrir un inventaire` →
   `Magasin à compter`). Ny écart tsirairay dia mila *justification* (≥ 3 litera).
2. **Fiche de stock** : `Rapports` → `Fiche de stock — PHARMACIE` ary `Fiche de stock — DÉPÔT`
   → `Imprimer` na `Export CSV`. Ny *stock initial* dia miverina ho azy avy amin’ny volana lasa.
3. **Reports hafa** : `Transferts dépôt → pharmacie`, `Ventes et marges (pharmacie)`,
   `Achats et réceptions (dépôt)`, `Pertes et dons`, `Lots à surveiller`, `Historique des prix`.
4. **Sauvegarde** + arsiva ny PDF/CSV.
5. **Fanamarinana** : `Journal d’audit` (iza nanao inona) sy `Contrôle d’intégrité` (ao amin’ny `Rapports`).

---

# PARTIE 3 — OHATRA TENA IZY ISAKY NY RÔLE

## 3.1 PHARMACIEN / RESPONSABLE (`hery`) — 5 ohatra tena izy

| # | Tranga | Ahoana (dingana) | Vokatra |
|---|---|---|---|
| 1 | **Vente tsotra** (Paracétamol × 3) | `Historique de vente` → soraty « para » → `Ajouter` → `Recalculer le total` → `Valider la vente` | VTE-2026-000001, 3 076,36 Ar, marge 279,68 Ar, stock pharmacie −3 |
| 2 | **Tsy ampy ny stock ao amin’ny comptoir** | Manandrama mivarotra 100 Paracétamol | Refusé : *« Stock vendable insuffisant dans la pharmacie … Transférer depuis le dépôt si besoin. »* — ny stock du dépôt (58) tsy azon’ny vente mivantana |
| 3 | **Lot ho lany daty** (Sirop, 45 andro sisa) | `Tableau de bord` → alerte *Expiration proche* → `Lots` → safidio ny lot → `Retour du surplus au dépôt` | Transfert TRF-… misy motif ; ny dépôt no mitantana azy any aoriana |
| 4 | **Vente diso** (nanome fanafody diso) | `Documents` → tadiavo ny `VTE-…` → `Annuler` → `Motif` (≥ 3 litera) | Voasoratra ho `CANCELLED`, ny stock dia niverina tao amin’ny lot, ny marge very |
| 5 | **Fanovana ny tahan’ny marge** (olana amin’ny vidiny) | `Catalogue → Médicaments` → `%` → `Taux` 25 % + `Motif` | Vidiny vaovao, voatahiry ao amin’ny `Historique des prix` (iza, oviana, nahoana) |

**Ohatra 1 amin’ny antsipiriany — Vente 3 Paracétamol :**

```
Écran            : Historique de vente (POS comptoir)
Fikarohana        : « para » → MED-001 Paracétamol 500 mg → badge 36 en stock vendable
Panier            : 3 boîte
Recalculer        : total 3 076,36 Ar (PU 1 025,45 Ar ; FEFO : lot PARA-24A exp. 17/03/2028)
Valider la vente  : VTE-2026-000001 — client « Randria Soa » (facultatif)
Vokatra           : stock pharmacie 36 → 33 ; ny stock du dépôt tsy nihetsika (58)
```

## 3.2 GESTIONNAIRE DU DÉPÔT (`naina`) — 5 ohatra tena izy

| # | Tranga | Ahoana (dingana) | Vokatra |
|---|---|---|---|
| 1 | **Fandraisana livraison** (faktiora SALAMA) | `Réceptions → Nouvelle réception` → fournisseur, facture, frais 40 000 Ar, andalana 3 (lot, quantité, prix, durée) | REC-2026-000001, lot rehetra **ao amin’ny dépôt**, coût de revient kajy ho azy, CMP vaovao |
| 2 | **Fandefasana any amin’ny pharmacie** | `Transferts dépôt → pharmacie → Nouveau transfert` → safidio ny lot sy ny quantité (ohatra 40 Paracétamol) → `Motif` + `Remarque` | TRF-2026-000001 : dépôt 100 → 60, pharmacie 0 → 40 (lot jumeau mitovy numéro sy daty) |
| 3 | **Diso ny transfert** | `Transferts` → `Annuler` → `Motif` | Ny quantité dia niverina tao amin’ny dépôt ; ny document dia voasoratra `CANCELLED` |
| 4 | **Fahavoazana ao amin’ny réserve** (carton torotoro) | `Pertes et dons → Déclarer une perte` → `Magasin concerné : Dépôt (réserve)` → lot + quantité + `Remarque` | PRT-…, ny stock du dépôt −2, ny dépôt no tompon’ny taratasy |
| 5 | **Inventaire de la réserve** | `Inventaires → Ouvrir un inventaire` → `Magasin à compter : Dépôt` → isa tena hita → `Valider` | INV-… ; ny écart voamarina dia manao ajustement ao amin’ny dépôt ihany |

**Ohatra 1 amin’ny antsipiriany — Réception SALAMA :**

```
Écran                 : Réceptions → Nouvelle réception
Fournisseur           : SALAMA
Facture               : FA-SALAMA-2026-101
Frais de livraison    : 40 000 Ar (zaraina amin’ny unités rehetra)
Ligne 1 : MED-001 Paracétamol 500 mg · lot PARA-24A · 100 boîte · 800 Ar · 18 mois
Ligne 2 : MED-002 Amoxicilline 500 mg · lot AMOX-24B · 60 boîte · 1 500 Ar · 18 mois
Ligne 3 : MED-003 Ibuprofène 400 mg · lot IBU-24C · 80 boîte · 900 Ar · 18 mois
Valider la réception  → REC-2026-000001, coût total 282 000 Ar, valeur 320 000 Ar d’achats
Vokatra               : coût de revient PARA-24A = 932,23 Ar ; AMOX-24B = 1 747,93 Ar ;
                        IBU-24C = 1 048,76 Ar ; CMP sy prix de vente kajy avy amin’izay
```

> **Tsy misy commande intsony** : rehefa tonga ny kamiao dia ampiana mivantana. Raha
> mila taratasy fanamarinana alohan’ny livraison ianao, dia atao amin’ny mailaka na
> téléphone ; ny rindranasa dia tsy mitazona « commande ».

## 3.3 ADMINISTRATEUR (`admin`) — 4 ohatra tena izy

| # | Tranga | Ahoana | Fanamarihana |
|---|---|---|---|
| 1 | **Mpiasa vaovao** | `Utilisateurs → Nouvel utilisateur` → anarana, identifiant, rôle, teny miafina | Ny rôle no mamaritra ny écran hita |
| 2 | **Very ny teny miafina** | `Utilisateurs` → `Modifier` → teny miafina vaovao (na `npm run reset:password`) | Ny session rehetra an’ilay olona dia mikatona |
| 3 | **Fanaraha-maso** | `Journal d’audit` (LOGIN, VALIDATE, CANCEL…) sy `Rapports → Contrôle d’intégrité` | Tsy misy mamafa document : *annuler* ihany |
| 4 | **Sauvegarde sy famerenana** | `scripts\backup-database.sh` → `pg_restore` raha ilaina | Atokana ny fitehirizana ivelany |

## 3.4 Ny fizarana fahefana (RG18) — tabilao fohy

| Zavatra | ADMIN | PHARMACIST | DEPOT |
|---|---|---|---|
| Réception (entrée au dépôt) | ✔ | ✘ | **✔** |
| Transfert dépôt → pharmacie | ✔ | ✔ | **✔** |
| Vente (comptoir) | ✔ | **✔** | ✘ |
| Perte / don | ✔ | ✔ (pharmacie) | ✔ (dépôt) |
| Inventaire | ✔ | ✔ (pharmacie) | ✔ (dépôt) |
| Prix de vente / marge | ✔ | ✔ | ✘ (tsy aseho) |
| Coût d’achat / valeur du stock | ✔ | ✔ | ✔ (ilaina amin’ny réception) |
| Clients, comptes, paramètres | ✔ | ✘ | ✘ |
| Journal d’audit | ✔ | ✔ (vakiana) | ✘ |
| Rapports | ✔ | ✔ | ✔ (ny an’ny dépôt) |

---

# PARTIE 4 — OHATRA FENO : ANDRO IRAY (isa marina, nadika tamin’ny simulation)

Ity no natao tamin’ny simulation ofisialy (base madio, 6 fanafody, 3 fournisseur) :

| Ora | Iza | Asa | Reference | Vokatra isa |
|---|---|---|---|---|
| 08:00 | Dépôt | Réception SALAMA (frais 40 000 Ar) | REC-2026-000001 | dépôt +240 unités |
| 09:00 | Dépôt | Réception Laboratoire IPM (frais 15 000 Ar) | REC-2026-000002 | dépôt +74 unités |
| 10:00 | Dépôt | Transfert 1 (4 lot : 40 + 20 + 12 + 20) | TRF-2026-000001 | 151 171,01 Ar ; dépôt −92, pharmacie +92 |
| 10:30 | Dépôt | Transfert 2 (Ibuprofène 20) | TRF-2026-000002 | 20 975,21 Ar |
| 11:00 | Pharmacien | Vente 3 Paracétamol + 2 Amoxicilline | VTE-2026-000001 | 7 271,40 Ar (marge 978,84) |
| 14:00 | Pharmacien | Vente 1 Sirop antitussif | VTE-2026-000002 | 5 480,77 Ar (marge 1 096,15) |
| 16:00 | Pharmacien | Vente 4 Vitamine C (école) | VTE-2026-000003 | 6 576,92 Ar (marge 1 315,38) |
| 16:30 | Pharmacien | Perte : flacon renversé | PRT-2026-000001 | 4 384,62 Ar (pharmacie) |
| 17:00 | Dépôt | Perte : carton écrasé | PRT-2026-000002 | 1 864,46 Ar (dépôt) |
| 17:30 | Pharmacien | Transfert erroné (10 Amoxicilline) → **annulé** | TRF-2026-000003 | stock niverina tao amin’ny dépôt |
| 18:00 | Pharmacien | Inventaire pharmacie, 1 écart (−1) | INV-2026-000001 | ajustement −932,23 Ar |
| 18:15 | Dépôt | Inventaire réserve, aucun écart | INV-2026-000002 | ajustement 0 |

### Ny isa farany (izay tokony ho hitanao)

| CODE | Fanafody | DÉPÔT | PHARMACIE | Total | CMP (Ar) | Prix de vente (Ar) |
|---|---|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | 58 | 36 | 94 | 932,23 | 1 025,45 |
| MED-002 | Amoxicilline 500 mg | 40 | 18 | 58 | 1 747,93 | 2 097,52 |
| MED-003 | Ibuprofène 400 mg | 60 | 20 | 80 | 1 048,76 | 1 258,51 |
| MED-004 | Vitamine C 500 mg | 30 | 16 | 46 | 1 315,38 | 1 644,23 |
| MED-021 | Sirop antitussif enfant 120 ml | 12 | 10 | 22 | 4 384,62 | 5 480,77 |
| MED-005 | Sérum physiologique | 0 | 0 | 0 | 0,00 | 0,00 |
| — | **TOTAL UNITÉS** | **200** | **100** | **300** | — | — |

* Valeur du stock : **dépôt 278 989,32 Ar**, **pharmacie 150 890,65 Ar** (total 429 879,97 Ar).
* Ventes du jour (pharmacie) : **19 329,10 Ar**, marge **3 390,38 Ar** — ny dépôt dia **0 Ar** (tsy mivarotra).
* Pertes du jour : pharmacie **4 384,62 Ar**, dépôt **1 864,46 Ar**.
* Achats (réceptions) : **453 000 Ar** (frais 55 000 Ar ao anatiny) ; transferts : **172 146,22 Ar**.
* Fiche pharmacie : initial 0 · entrées 122 · sorties 22 · **final 100**.
* Fiche dépôt : initial 0 · entrées 324 · sorties 124 · **final 200**.
* Mouvements : **26** (immuables) ; documents : 2 réceptions, 3 transferts, 3 ventes, 2 pertes, 2 inventaires.

### Ny alerte niseho tamin’io andro io

| Magasin | Alerte | Antony |
|---|---|---|
| Dépôt | 🔴 Rupture de stock (Sérum physiologique) | 0 unité, seuil 12 → tokony haka entana ny dépôt |
| Dépôt | 🟠 Expiration proche (SIROP-24A, 08/11/2026) | 12 unités, latsaka amin’ny 90 andro |
| Pharmacie | 🔴 Rupture de stock (Sérum physiologique) | 0 unité amin’ny comptoir |
| Pharmacie | 🟠 Expiration proche (SIROP-24A) | 10 unités → alefa miverina any amin’ny dépôt raha tsy mety lany |

---

# PARTIE 5 — KASUS 12 METY HITRANGA (sy izay atao)

| # | Kasus | Valiny amin’ny rindranasa |
|---|---|---|
| 1 | Tonga ny entana nefa tsy misy ny faktiora | *Réception* amin’ny `Numéro de facture` foana, fenoy any aoriana raha tonga |
| 2 | Diso ny numéro de lot nandritra ny réception | Averina ny réception (annuler misy motif) dia atao indray ny tena lot |
| 3 | Tsy ampy ny stock ao amin’ny pharmacie | *Transfert* avy amin’ny dépôt (tsy mivarotra amin’ny stock du dépôt) |
| 4 | Be loatra ny stock ao amin’ny pharmacie | *Transfert* miverina any amin’ny dépôt : motif « Retour du surplus au dépôt » |
| 5 | Lany daty ny lot ao amin’ny comptoir | `Pertes et dons` (magasin = Pharmacie, motif = Expiration) |
| 6 | Lany daty ny lot ao amin’ny dépôt | `Pertes et dons` (magasin = Dépôt, motif = Expiration) |
| 7 | Diso ny vente (nanome fanafody diso) | `Documents` → `Annuler` (misy motif) ; ny stock dia miverina |
| 8 | Very ny herinaratra nandritra ny vente | Ny vente tsy voasoratra dia tsy nisy ; averina ny vente (idempotence : tsy hitan’ny double) |
| 9 | Tsy mitovy ny isa amin’ny comptoir (écart inventaire) | `Inventaires` (magasin = Pharmacie) → écart + justification → ajustement tracé |
| 10 | Misy mpiasa miala | `Utilisateurs` → **Désactiver** (tsy mafafa, mba hitazonana ny historique) |
| 11 | Misy fanafody averina any amin’ny mpanjifa | `Documents` → `Annuler` ny vente (raha ny andro ihany) na `Perte` raha tsy azo amidy intsony |
| 12 | Mila taratasy ho an’ny mpiara-miombon’antoka | `Rapports` → `Fiche de stock — PHARMACIE` / `— DÉPÔT` → `Imprimer` na `Export CSV` |

---

# PARTIE 6 — NY HERINANDRO VOALOHANY (plan 7 andro)

| Andro | Asa |
|---|---|
| 1 | Fametrahana (`setup --full`), paramètres, kaonty 3, fournisseur 3 |
| 2 | Import catalogue (CSV) + fanitsiana `min/max` sy ny marge |
| 3 | Réception ny stock tena izy rehetra (dépôt), fanamarinana ny CMP sy ny vidiny |
| 4–5 | Transfert ho an’ny pharmacie araka izay ilaina + fanombohana ny vente tena izy |
| 6 | Inventaire fanombohana amin’ny magasin roa (fanisana tena izy) + ajustement |
| 7 | Fiche de stock roa + sauvegarde + fampiofanana ny mpiasa (ity boky ity) |

---

# PARTIE 7 — CHECKLIST AZO PIRINTY (isam-bolana)

```
[ ] Nanao réception ve ny livraison rehetra ?           Réceptions
[ ] Ny CMP sy ny prix de vente dia mifanaraka amin’ny tena izy ?   Catalogue
[ ] Nisy transfert ve tamin’ity volana ity ?            Transferts
[ ] Inventaire natao tamin’ny DÉPÔT ?                   Inventaires (magasin = Dépôt)
[ ] Inventaire natao tamin’ny PHARMACIE ?               Inventaires (magasin = Pharmacie)
[ ] Fiche de stock PHARMACIE (initial/entrée/sortie/final) pirinty ?   Rapports
[ ] Fiche de stock DÉPÔT pirinty ?                      Rapports
[ ] Alerte péremption voamarina (lot ho lany daty) ?    Tableau de bord / Lots
[ ] Alerte rupture / stock faible voamarina ?           Tableau de bord
[ ] Journal d’audit sy intégrité voamarina ?            Audit / Rapports
[ ] Sauvegarde natao ary tehirizina ivelany ?           scripts\backup-database.sh
```

## Fanazavana fohy (résumé malagasy)

* **Magasin roa** : ny **dépôt** no mitantana ny tahiry (fandraisana entana sy fandefasana),
  ny **pharmacie** no mivarotra. Samy manana ny stock-ny, ny fiche-ny, ny alerte-ny.
* **Tsy misy commande na retour fournisseur** : tonga mivantana ny entana (*Réception*),
  ary ny fifindran’entana dia *Transfert* misy motif sy taratasy (bordereau).
* **Ny pharmacie ihany no mivarotra** ; ny *sortie* ao aminy dia ny vente, ny ao amin’ny
  dépôt dia ny transfert sy ny perte. Samy voasoratra ao amin’ny *Historique*.
* **Alerte sy notification** isaky ny magasin raha lany ny stock na saika lany daty.
* **Responsive** ny rindranasa : azo ampiasaina amin’ny finday (menio ambany), takelaka,
  na ordinatera, tsy misy fanovana.
