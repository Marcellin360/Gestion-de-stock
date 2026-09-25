# 13. Fanaovana DEMONSTRATION — fomba feno (Malagasy)

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



> Ho an’ny **fampiasana tena izy** (angona marina, vidiny marina, mpiasa marina), dia ny
> `docs/14-FAMPIASANA-TENA-IZY.md` no vakio — misy ny atao voalohany sy ny ohatra isaky ny rôle.
> Ho an’ny **parcours efijery isaky ny efijery** (sanda fenoina sy isa tokony ho hita) :
> `docs/15-GUIDE-FENO-ECRAN-ISAKY-NY-EFIJERY.md`.

Ity no toro-lalana hamakafakana ny rindranasa **manontolo** amin’ny olona iray (tompon’ny officine,
mpampianatra, mpanjifa…). Ny tanjona : **tsy misy manao an-tanana** — ny rindranasa ihany no manao
ny kajy, ny fiche de stock, ny ticket, ny alertes.

---

## 1. Fanomanana (indray mandeha, ~15 minitra)

### 1.1 Ny fametrahana (raha vao voalohany)

```powershell
cd C:\pharmastock
npm install
npm run setup -- --demo --full   # rôle + base « pharmacie_stock » (UTF8) + backend\.env
                                 # + ALLOW_DEMO=true + tables + compte admin
```

*(Raha efa vita ny fametrahana ianao : tsy ilaina afa-tsy ny `--demo` hampandehanana ny angona
fanandramana. Raha tsy izany dia `npm run setup` tsotra, ary `ALLOW_DEMO=true` ampidirina an-tanana
ao amin’ny `backend\.env`.)*

(Samihafa amin’ny antsipiriany : `docs/12-FAMPIANARANA-INSTALLATION.md`.)

### 1.2 Ny angona fanandramana — baiko telo

```powershell
npm run demo:seed        # 5 catégories, 2 fournisseurs, 6 fanafody (catalogue)
npm run demo:users       # comptes : pharmacien (`pharmacien`) / dépôt (`depot`)
npm run demo:scenario    # ⚠️ manao « andro iray » feno amin’ny MAGASIN ROA :
                         #    réception ao amin’ny DÉPÔT → transfert ho any amin’ny PHARMACIE
                         #    → 2 ventes (comptoir) → perte comptoir → perte réserve
```

Ilaina ny **`ALLOW_DEMO=true`** ao amin’ny `backend\.env` — izay ataon’ny `npm run setup -- --demo`
ho azy. Averinao ho `false` izany rehefa hampiasa tena izy (na désactiver-nao ny comptes andrana).

### 1.3 Izay noforonin’ny `demo:scenario` (izay aseho ao amin’ny démo)

| # | Zavatra natao | Reference | Vokany |
|---|---|---|---|
| 1 | Réception + frais transport 100 000 Ar (kaonty **dépôt**) | `REC-2026-000001` | 3 lots **ao amin’ny dépôt**, coût de revient sy prix de vente kajy ho azy |
| 2 | Transfert 40 + 30 + 20 (kaonty **dépôt**) | `TRF-2026-000001` | ny réserve dia mijanona 58/70/80, ny comptoir mahazo 37/27/16 (**lot jumeau**) |
| 3 | Vente 1 (3 × MED-001, 2 × MED-002) | `VTE-2026-000001` | 60 313,85 Ar — marge 10 467,69 Ar |
| 4 | Vente 2 (4 × MED-003) | `VTE-2026-000002` | 30 406,15 Ar — marge 5 483,08 Ar |
| 5 | Perte « Casse » 1 × MED-002 **ao amin’ny pharmacie** | `PRT-2026-000001` | sortie an’ny comptoir, tsy nisy vola miditra |
| 6 | Perte « Casse » 2 × MED-001 **ao amin’ny dépôt** | `PRT-2026-000002` | sortie an’ny réserve — samy manana ny historique-ny ny magasin roa |

**Ny isa azo antoka rehefa vita** (izay tokony ho hita ao amin’ny *Fiche de stock*, période « Ce mois ») :

**Fiche de stock — PHARMACIE** (entrées = transferts, sorties = ventes + perte) :

| Code | Médicament | Stock initial | Entrées | Sorties | **Stock final** | Coût unitaire | Prix de vente |
|---|---|---|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | 0 | 40 | 3 | **37** | 8 307,69 Ar | 9 969,23 Ar |
| MED-002 | Amoxicilline 500 mg | 0 | 30 | 3 | **27** | 12 461,54 Ar | 15 203,08 Ar |
| MED-003 | Ibuprofène 400 mg | 0 | 20 | 4 | **16** | 6 230,77 Ar | 7 601,54 Ar |
| MED-004/005/006 | Vitamine C, Sérum, Povidone | 0 | 0 | 0 | **0** | — | — |
| — | **TOTAL** | **0** | **90** | **10** | **80** | | |

**Fiche de stock — DÉPÔT** (entrées = réceptions, sorties = transferts + pertes) :

| Code | Médicament | Stock initial | Entrées | Sorties | **Stock final** |
|---|---|---|---|---|---|
| MED-001 | Paracétamol 500 mg | 0 | 100 | 42 | **58** |
| MED-002 | Amoxicilline 500 mg | 0 | 100 | 30 | **70** |
| MED-003 | Ibuprofène 400 mg | 0 | 100 | 20 | **80** |
| MED-004/005/006 | Vitamine C, Sérum, Povidone | 0 | 0 | 0 | **0** |
| — | **TOTAL** | **0** | **300** | **92** | **208** |

> Ny **stock initial dia miverina ho azy** avy amin’ny stock final ny fe-potoana teo aloha —
> tsy misy manao kopie an-tanana. Ny alerte « expiration proche » dia miseho ao amin’ny
> magasin roa (LOT-MED-003-A, 45 andro).

> Voamarina amin’ny fitsapana : ny « Coût unitaire » dia ny prix d’achat **+ ny anjara-bolan’ny
> frais de transport** (8000 + 307,69 = 8 307,69 Ar), ary ny « Prix de vente » = coût × 1,20
> (marge 20 % eo anelanelan’ny 10 % sy 30 % omen’ny Paramètres).

### 1.4 Lisitry ny compte hanaovana démo

| Compte | Mot de passe | Rôle | Amin’ny démo |
|---|---|---|---|
| `admin` | (*izay noforoninao tamin’ny `setup`*) | Administrateur | ny magasin roa, Paramètres, Utilisateurs, Journal |
| `pharmacien` | `Pharmacien-2026!` | Pharmacien (comptoir) | **Historique de vente**, stock comptoir, perte comptoir, rapports |
| `depot` | `Depot-2026!` | Gestionnaire du dépôt | **Réceptions**, **Transferts**, stock réserve, perte réserve |

### 1.5 Checklist 5 minitra alohan’ny démo

- [ ] `npm run dev` mandeha : hita ny andalana `[API]` sy `[WEB]` (aza katona ny terminal !)
- [ ] Sokafy <http://localhost:5173> → midira amin’ny `admin` → jereo ny Tableau de bord
- [ ] Jereo ny **Fiche de stock** (période « Ce mois ») : tokony hifanaraka amin’ny tabilao §1.3
- [ ] Manonta (na *Print → Save as PDF*) ny fiche de stock ho **antoka** raha tapaka ny solosaina
- [ ] Manokatra fenêtre roa : iray ny navigateur (démo), iray ny terminal (raha misy olana hita avy hatrany)
- [ ] `Ctrl + +` amin’ny navigateur (zoom 125 %) mba ho hita tsara ny isa raha projecteur no ampiasaina
- [ ] Manafoana ny fanairana (notification) sy ny fanavaozana Windows mandritra ny démo
- [ ] Manana an-tsoratra ny mot de passe rehetra eo akaiky (tsy manoratra azy eo anatrehan’ny olona)

---

## 2. Fandaharam-potoana — 30 minitra (ny filaharana tsara indrindra)

| Min | Écran | Izay atao | Izay lazaina (hevitra fototra) |
|---|---|---|---|
| 0–2 | **Connexion** | Miditra amin’ny `admin` | « Ny compte tsirairay dia manokana ; ny fahefana dia voasivana avy amin’ny serveur » (RG18) |
| 2–4 | **Tableau de bord** | Jereo ny KPI sy ny alertes (rupture, seuil, expiration) | « Tsy manao kajy amin’ny tanana intsony : ny rindranasa no mampitandrina » |
| 4–7 | **Pilotage → Paramètres** | Ovay ny anaran’ny officine, jereo ny plage de marge | « Ny anaran’ny officine sy ny marge (10–30 %) dia voafetra — tsy azo atao ny marge diso » |
| 7–10 | **Catalogue** | Sokafy ny onglet *Médicaments* (fiche feno, seuil minimum, unité, catégorie) sy *Fournisseurs* | « Ny liste midina (dropdown) no mameno ny ankamaroan’ny saha : tsy manoratra an-tanana » |
| 10–12 | **Réceptions (dépôt)** | Midira amin’ny `depot` → `Réceptions` → manokatra ny `REC-2026-000001` : jereo ny **coût de revient**, ny **prix de vente** kajy ho azy, ary ny CMP | « Ny entana rehetra dia tonga ao amin’ny dépôt ; ny frais de transport dia zaraina ho azy amin’ny vidiny » |
| 12–14 | **Transferts dépôt → pharmacie** | `Nouveau transfert` misy **motif** → 40 + 30 + 20 → `Bordereau` | « Ny comptoir dia mahazo izay ilainy ihany ; miforona **lot jumeau** mitovy n° sy daty — ny dépôt sy ny pharmacie samy manana ny stock-ny » |
| 14–18 | **Historique de vente** (kaonty `pharmacien`) | Fikarohana fanafody → isa → **Recalculer le total** → **Valider la vente** → **Ticket** | « Ny vente dia mivoaka amin’ny stock an’ny **pharmacie** ihany ; ny stock du dépôt tsy mihetsika » |
| 18–20 | **Pertes et dons** | Perte « Casse » → `Magasin concerné` (Dépôt na Pharmacie) + motif | « Ny fahaverezana dia voarakitra misy antony **sy magasin** — ny lot an’ny magasin hafa dia lavina (RG07) » |
| 20–23 | **Inventaires** | *Ouvrir un inventaire* → **`Magasin à compter`** → isa tena izy → écart + motif → **Valider** | « Ny théorique vs physique, **isaky ny magasin** ; ny écart tsy misy motif dia lavina » |
| 23–26 | **Rapports** → `Fiche de stock — PHARMACIE` sy `— DÉPÔT` | Période « Ce mois » → **Recalculer** → **Imprimer** (na **Export CSV**) | « ⭐ Ity no rejistrao : `Stock Initial · Entrée · Sortie · Stock Final` — fa **mivoaka ho azy**, ary ny `Stock initial` ny `Stock final` ny fe-potoana teo aloha » |
| 26–28 | **Stock → Lots & stock** | Bloqua lot iray (motif « lot à retirer ») → jereo fa tsy atolotra amin’ny vente intsony | « Ny lot voasakana dia tsy mivoaka : fiarovana ny marary » (RG09) |
| 28–29 | **Journal d’audit** | Sivano ny asa (VALIDATE, CANCEL, UPDATE) | « Tsy misy mamafa ny tantara : na iza na iza, na inona nataony, voarakitra » (RG14, §9.18) |
| 29–30 | **Sauvegarde** | Asehoy ny `docs/5-SAUVEGARDE-MAINTENANCE.md` / ny script `backup-pharmastock` | « Isan’andro ny sauvegarde ; ny angona dia ao amin’ny PostgreSQL ihany, tsy miankina aminao » |

---

## 3. Fizarana isaky ny rôle (raha fohy ny fotoana : 3 min isaky ny iray)

| Rôle | Écrans aseho | Hafatra tokony ho tsarovy |
|---|---|---|
| **Gestionnaire du dépôt** (`depot`) | Réceptions, Transferts, Stock (réserve), Pertes, Inventaires | Mandray entana sy mamindra ; **tsy mahita** ny vente na ny vidin’ny varotra |
| **Pharmacien** (`pharmacien`) | Historique de vente, Transferts, Stock (comptoir), Pertes, Rapports | Mivarotra sy mitantana ny comptoir ; tsy mikitika ny comptes |
| **Administrateur** (`admin`) | Utilisateurs, Paramètres, Journal d’audit, ny magasin roa | Tompon’ny fahefana sy ny fanaraha-maso |

Fomba haingana : `Clic amin’ny anarana → Déconnexion → miditra amin’ny compte hafa`. Jereo fa
**miova ny menu** isaky ny rôle — izany no RG18.

---

## 4. Fanontaniana mety hapetraky ny olona (sy ny valiny)

| Fanontaniana | Valiny |
|---|---|
| « Aiza ny rejistra `Stock Initial / Entrée / Sortie / Stock Final` ? » | `Rapports` → **Fiche de stock** (misy impression sy Export CSV) ; ny stock initial dia mandroso ho azy |
| « Tsy maintsy manoratra isa amin’ny tanana ve ? » | Tsy misy : ny stock dia avy amin’ny mouvements (réception, vente, perte, retour, inventaire) |
| « Afaka manova ny anaran’ny officine ve ? » | Eny : `Pilotage → Paramètres` (miseho amin’ny ticket sy documents) |
| « Afaka mampiasa solosaina maro ve ? » | Eny : `APP_ORIGIN_EXTRA` ao amin’ny `.env` (ohatra `http://192.168.1.25:5173`) → telefaona/tablette amin’ny réseau iray |
| « Firy ny compte azo foronina ? » | Tsy misy fetra — iray isaky ny mpiasa (aza mampiasa compte iombonana) |
| « Ahoana raha tapaka ny courant ? » | Ny angona dia ao amin’ny PostgreSQL (voatahiry amin’ny disk) ; misy sauvegarde isan’andro (`docs/5`) |
| « Azo ovaina ny marge ? » | Eny, ao anatin’ny 10 %–30 % (Paramètres), misy **motif** ary voarakitra ao amin’ny *Historique des prix* (RG23) |
| « Azo alaina ho Excel ve ny tableau ? » | Eny : **Export CSV** (misy séparateur `;` sy UTF-8 — misokatra tsara amin’ny Excel) |
| « Ny données andrana ve no ho ao ? » | Tsia : `ALLOW_DEMO=false` + désactivation ny comptes andrana + base vaovao alohan’ny fampiasana tena izy |
| « Aiza no ahitana ny hadisoana ? » | Terminal `[API]` ; na `npm run diagnose` (fanamarinana ny base sy ny `.env`) |

---

## 5. Ny version fohy (5 minitra) — raha maika

1. `Connexion` amin’ny `admin` → **Tableau de bord** (alertes : 2 segondra).
2. **Ventes** : vente iray → **Valider** → **Ticket** (2 min).
3. **Rapports → Fiche de stock** : période « Ce mois » → **Imprimer** (1 min).
4. **Journal d’audit** : ny vente vao natao dia hita ao (1 min).
5. Farany : « ny rejistra tsy atao an-tanana intsony, fa mivoaka avy amin’ny rindranasa ».

---

## 6. Famerina amin’ny laoniny (reset) alohan’ny démo manaraka

Raha te-hanomboka amin’ny isa mitovy hatrany ianao (ohatra : démo fanindroany) :

```powershell
# 1. Ajanony ny rindranasa : Ctrl + C ao amin’ny terminal
# 2. Ao amin’ny SQL Shell (psql), amin’ny compte postgres :
DROP DATABASE pharmacie_stock;
\q
# 3. Ao amin’ny C:\pharmastock :
npm run setup -- --demo --full   # base vaovao + tables + admin + ALLOW_DEMO=true
npm run demo:seed
npm run demo:users
npm run demo:scenario
```

Maharitra ~2 minitra izany, ary miverina amin’ny isa voasoratra ao amin’ny §1.3 foana ny vokatra.

> Ny `npm run demo:scenario` dia **mandà** mihazakazaka raha efa misy réception (fiarovana mba tsy
> hampifangaro ny données). Raha tsy te-hamafa ny base ianao dia aza mamerina azy — manorata
> documents vaovao amin’ny tanana fotsiny mandritra ny démo.

---

## 7. Raha misy olana mandritra ny démo (plan B)

| Olana hita | Vahaolana haingana |
|---|---|
| `EADDRINUSE` na tsy misokatra ny pejy | Ajanony (`Ctrl + C`) dia avereno `npm run dev` ; jereo fa tsy misy programa hafa mampiasa ny port 3001 |
| Page fotsy amin’ny `5173` | Jereo ny terminal : tokony hisy `[API]` sy `[WEB]` samy mandeha ; havaozy ny pejy (`F5`) |
| `ECONNREFUSED 5432` | Services Windows → `postgresql-x64-16` → **Démarrer** |
| Tsy tianao ny manohy ny démo amin’ny solosaina | Asehoy ilay **fiche de stock PDF** natao pirinty tamin’ny fanomanana (§1.5) sy ny ticket efa natonta |
| Diso ny isa hitanao | `Rapports → Fiche de stock` : ny `Stock initial + Entrées − Sorties = Stock final` — raha tsy mitovy dia miantso aho |
| Very ny mot de passe | `$env:RESET_LOGIN="admin"; $env:RESET_PASSWORD="Vaovao-2026!"; npm run reset:password` |

---

## 8. Aorian’ny démo — raha hampiasa tena izy

1. `backend\.env` : `ALLOW_DEMO=false`.
2. Écran **Utilisateurs** : **Désactiver** ny comptes `pharmacien` / `depot` (andrana).
3. **Base vaovao madio** : `DROP DATABASE pharmacie_stock;` → `npm run setup` → `db:migrate` →
   `admin:create` (compte tena izy).
4. **Paramètres** : anaran’ny officine, devise, plage de marge.
5. **Catalogue** : ny tena fanafody — aloha ny **Import CSV** (`npm run import:products -- "…\mes-produits.csv"`,
   zohavy amin’ny `backend\samples\catalogue-exemple.csv`) dia amboarina ao amin’ny écran ny fiche sasany.
6. **Utilisateurs** : compte iray isaky ny mpiasa.
7. **Sauvegarde** : `docs/5-SAUVEGARDE-MAINTENANCE.md`.

---

## Fanazavana fohy (résumé)

- Ny démo dia mifototra amin’ny baiko **telo** : `demo:seed`, `demo:users`, **`demo:scenario`**.
- Ny `demo:scenario` dia mamorona tantara feno (réception dépôt → transfert → ventes → pertes) ka
  ny isa rehetra dia voafaritra (§1.3) : tsy misy « surprise » mandritra ny démo.
- Ny filaharana tsara indrindra : **Connexion → Tableau de bord → Paramètres → Catalogue →
  Réception → Vente → Perte → Inventaire → Fiche de stock → Lots → Journal d’audit**.
- Ny foto-kevitra hita amin’ny démo : **tsy misy kajy an-tanana** ; ny **Fiche de stock** mivoaka
  ho azy (misy impression + Excel) ; ny **fahefana** isaky ny rôle ; ny **tantara tsy fafana**
  (audit) ; ny **sauvegarde**.
