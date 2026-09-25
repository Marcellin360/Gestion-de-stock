# 10. Ny etape manomboka amin’ny pg (PostgreSQL) ka hatramin’ny VS Code

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Ity no toro-lalana **araka ny filaharana tokony hatao** rehefa vita ny extraction sy ny fanokafana
ny projet ao VS Code. Eto ny projet vaovao : ny hany asa dia **ny `.env`, ny installation, ny migration
sy ny fanombohana** — tsy misy na inona na inona ovaina amin’ny code.

> Fizarana roa ny lalana : ny **A** raha mbola ao amin’ny base taloha ny données (haingana indrindra),
> ny **B** raha tianao hanomboka amin’ny base vaovao madio. Samy voasoratra avokoa.

---

## Etape 1 — Hamarino ny PostgreSQL (SQL Shell / psql)

1. Menu Démarrer → **SQL Shell (psql)**.
2. Tsindrio **Entrée** inefatra (Server `localhost`, Database `postgres`, Port `5432`, Username `postgres`).
3. Ampidiro ny **mot de passe an’ny `postgres`** (ilay noforoninao tamin’ny installation).
4. Rehefa tonga eo amin’ny `postgres=#` dia ampidiro ity mba hanamarinana fa mbola ao avokoa ny base sy ny rôle :

```sql
\du pharmastock
\l pharmastock*
```

Tokony hiseho : ny rôle `pharmastock` (miaraka amin’ny `Login + Create DB`) sy ny base
`pharmastock` (ho an’ny tena fampiasana) ary `pharmacie_stock_test` (ho an’ny fitsapana).

Raha tsy ao (na raha vao voalohany) dia foronina :

```sql
CREATE ROLE pharmastock LOGIN PASSWORD 'Officine-2026';
CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';
CREATE DATABASE pharmacie_stock_test OWNER pharmastock ENCODING 'UTF8';
\q
```

> Soraty **an-tsoratra** ny mot de passe (eto : `Officine-2026`) : izy io no hatao ao amin’ny `.env`.
> Raha misy `@ : / ? & # %` ao anatiny dia ampifanaraho amin’ny URL (`p@ss` → `p%40ss`).

---

## Etape 1 bis — Ny fomba haingana : `npm run setup` (tsy mila psql)

Raha tsy te-hanoratra SQL ianao dia ity commande iray ity no manao ny asa rehetra : mamorona ny
rôle `pharmastock`, ny base **`pharmacie_stock`** (UTF8) ary ny `backend\.env`.

```powershell
npm install          # indray mandeha, ao amin’ny fakany (C:\pharmastock)
npm run setup        # mamorona rôle + base + backend\.env  (izay noforonina tamin’ny Etape 1 dia tsy simba)
```

Izay angatahina :
1. ny mot de passe an’ny superutilisateur `postgres` (tsy hita eo am-panoratana azy) ;
2. ny anaran’ny base — **Entrée** → `pharmacie_stock` ;
3. ny mot de passe ho an’ny compte `admin` — 12 litera farafahakeliny, **tadidio izy io** (izany no
   hidiranao ao amin’ny rindranasa).

`npm run setup -- --full` dia manampy avy hatrany ny `db:migrate` sy ny `admin:create`.
Azo averina tsy misy atahorana izy io : tsy mamafa base efa misy, fa manavao ny mot de passe fotsiny.

Avy eo : mivantana amin’ny **Etape 3** (ny `.env` dia efa voasoratry ny script).

---

## Fizarana A — Mbola hampiasa ny base efa misy (izay efa nataonao)

**Tsy misy SQL hatao.** Ny données (médicaments, ventes, réceptions…) sy ny compte `admin`
dia mbola ao avokoa. Dia mandehana mivantana amin’ny **Etape 2**.

Fanamarihana : rehefa manao `npm run db:migrate` ianao dia hafatra toy izao no miseho —
`2 migration(s) appliquée(s).` na `déjà appliquée(s)` : samy ara-dalàna avokoa (idempotent).
Ary ny `npm run admin:create` dia mety hamerina :
*« Initialisation refusée : des utilisateurs existent déjà. »* → **ara-dalàna izany** :
efa misy ny compte, tsy manao dika mitovy izy.

---

## Fizarana B — Hanomboka amin’ny base vaovao madio (recommandé alohan’ny fampiasana tena izy)

Ao amin’ny psql ihany (ilay fenêtre mbola misokatra) :

```sql
DROP DATABASE pharmacie_stock;
CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';
\q
```

Izany dia mamafa ny fanafody d’andrana rehetra — tsara izany alohan’ny fampidirana ny tena
catalogue. Avy eo, ao VS Code, averinao ny `npm run db:migrate` + `npm run admin:create`
(noho ny base vaovao foana) ary **tsy manao** `demo:seed`.

---

## Etape 2 — VS Code : sokafy ny terminal

1. Amin’ny VS Code : **Fichier → Ouvrir le dossier…** → safidio ilay dossier **misy `package.json`**
   (ohatra `E:\Projet réel\gestion de stock1\pharmastock` — io no fakan’ny projet).
2. Sokafy ny terminal intégré : **Terminal → Nouveau terminal** (na `Ctrl + ù`, na `` Ctrl + ` ``).
3. Hamarino fa milamina :

```powershell
node -v
npm -v
```

Tokony : `v20.x.x` sy `10.x.x`. Raha tsy izany → apetraho aloha Node.js 20 LTS (nodejs.org).

4. Ataovy ao amin’ny **fakan’ny projet** ny baiko rehetra (tsy ao `backend`) :

```powershell
cd "E:\Projet réel\gestion de stock1\pharmastock"
```

> Ilaina ny guillemets `"` satria misy elanelana sy accent ny lalana. Rehefa eo ianao dia hita
> amin’ny terminal ny anaran’ny dossier farany — izay no hanaovana ny baiko manaraka rehetra.

---

## Etape 3 — Foronina ny `backend\.env`

Ao amin’ny terminal (na amin’ny explorateur de fichiers) :

```powershell
copy backend\.env.example backend\.env
```

Ao amin’ny VS Code dia hita eo amin’ny lisitra havia ny `backend/.env` → tsindrio izy → fenoy
ireto andalana ireto (izay voamarika `[A REMPLIR]`) :

```ini
DATABASE_URL=postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock
ADMIN_LOGIN=admin
ADMIN_NAME=Administrateur
ADMIN_PASSWORD=Pharma-Officine-2026!
ALLOW_DEMO=true
```

Avelao ny sisa (`NODE_ENV`, `PORT=3001`, `APP_ORIGIN=http://localhost:5173`, `SESSION_HOURS`…).
`Ctrl + S` hanoratana.

| Tsy asiana | Antony |
|---|---|
| `SESSION_SECRET` | tsy ampiasain’ny programme mihitsy (jetons aléatoires ao amin’ny base) |
| `PHARMACY_NAME` | ao amin’ny **Paramètres** ao amin’ny rindranasa no ampiasaina azy |

---

## Etape 4 — Installation, migration, compte admin

Ao amin’ny terminal, amin’ny fakany, araka ny filaharana :

```powershell
npm install          # 1 à 3 min (mametraka ny dépendances roa: API + interface)
npm run db:migrate   # mamorona ny 27 tables, vues sy déclencheurs
npm run db:status    # manamarina: migrations 1 sy 2 = [appliquée]
npm run admin:create # manao ny compte admin (avy amin'ADMIN_PASSWORD)
```

Raha te hanandrana amin’ny données fictives (Fizarana A ihany, na base vaovao) :

```powershell
npm run demo:seed    # 5 catégories, 2 fournisseurs, 6 fanafody fictifs
npm run demo:users   # pharmacien (`pharmacien`) / dépôt (`depot`) — comptes d'essai
```

Avy eo : **fafao ny andalana `ADMIN_PASSWORD`** ao amin’ny `backend\.env` (`Ctrl + S`).

Hafatra ara-dalàna (tsy misy olana amin’izy ireo) :
- `Base déjà à jour.` (ny `db:migrate`) → efa nisy ny tables, tsy naverina intsony.
- `Administrateur « admin » créé.` → vita; tadidio ny mot de passe.
- `Échec : Initialisation refusée : des utilisateurs existent déjà.` (ny `admin:create`) → **ara-dalàna** :
  efa misy ny compte `admin` tao amin’ny base (izay noforoninao tamin’ny voalohany) ary **afaka
  mampiasa izany ihany ianao**. Tsy misy tokony hatao — tohizana amin’ny Etape 5.
- `Déjà présents, non modifiés : pharmacien, …` (ny `demo:users`) → ara-dalàna (tsy manao dika mitovy).

### Raha hadinonao ny mot de passe admin

Ao amin’ny terminal, amin’ny fakany (mila ny version vaovao — ny rakitra `backend/scripts/reset-password.mjs`) :

```powershell
$env:RESET_LOGIN = "admin"
$env:RESET_PASSWORD = "Pharma-Officine-2026!"
npm run reset:password
Remove-Item Env:\RESET_PASSWORD
```

Mipoitra : `Mot de passe réinitialisé pour « admin » (Administrateur).` — ary tapaka ny session rehetra
an’io compte io. Voarakitra ao amin’ny **Journal d’audit** ny fanovana (`PASSWORD`, origem
« réinitialisation locale »). Azonao atao koa ny mamerina izay compte hafa (`RESET_LOGIN = "pharmacien"`…).

> Fiarovana : ny mot de passe vaovao dia tsy maintsy **12 litera farafahakeliny**, ary raha diso ny
> identifiant dia asehon’ny programme ny lisitry ny identifiant misy — tsy misy fanovana tsy nahy.

---

## Etape 5 — Alefa ary ampiasao

```powershell
npm run dev
```

Hita ao amin’ny terminal :

```
[API] PharmaStock — API et interface sur le port 3001 (development)
[API] Migrations appliquées : 1, 2
[WEB] ➜  Local:   http://localhost:5173/
```

1. **Aza mikatona io terminal io** (izany no mampandeha ny rindranasa).
2. Sokafy amin’ny navigateur : **<http://localhost:5173>**
3. Midira : `admin` + ilay `ADMIN_PASSWORD` nosoratanao.
4. Andramo haingana : `Tableau de bord` (tokony tsy misy `undefined` intsony ny alerts),
   `Ventes` (client amin’ny boutons), `Stock` / `Catalogue` (onglets eo ambony),
   `Réceptions` (durée de conservation → ny péremption mivoaka ho azy).

**Hijanona** : `Ctrl + C` ao amin’ny terminal.
**Hamerenana** : `npm run dev` ihany (tsy mila `npm install` sy `db:migrate` intsony).

---

## Etape 6 — Fanamarinana (tsy voatery, fa tsara)

```powershell
npm test                                         # 20 fitsapana (marge, FEFO, frais, CMP…)
npm run qa:render -w frontend                    # 20 écrans + 9 formulaires

$env:DATABASE_URL = "postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock_test"
npm run test:integration                         # 27 scénarios (base de TEST ihany)
Remove-Item Env:\DATABASE_URL                    # averina amin'ny normal
```

> Ny `test:integration` dia mandrava ny base kendrena : ny rindranasa dia **mandà** tsy hanao
> raha tsy mifarana amin’ny `_test` ny anaran’ny base — tsy ho voafafa mihitsy ny base tena izy.

---

## Etape 6 bis — Raha misy hadisoana 500 amin’ny fidirana (login)

**Ny 401 amin’ny `/api/auth/me` dia ara-dalàna** : izany ny pejy manontany hoe « iza ianao? » alohan’ny
hidirana — tsy misy tokony hatao amin’izany.

Ny **500 amin’ny `/api/auth/login`** kosa tena hadisoana : misy tsy mety eo amin’ny serveur na ny base.
Ny fomba hamantarana azy :

1. **Jereo ny terminal misy `npm run dev`** → ny andalana tian’i `[API]` izay manomboka amin’ny daty
   (ohatra `[2026-09-19T14:21:30.123Z] POST /api/auth/login …`) sy ny `stack` eo ambaniny :
   io no milaza ny tena antony (ohatra `relation "sessions" does not exist`).
2. Na **atao ny diagnostic automatique** (tsy manova na inona na inona izy, mamerina ny zava-drehetra
   amin’ny farany) :

```powershell
npm run diagnose
```

   Hamoaka izy : ny base ampiasaina, ny tables sy colonnes tsy ampy, ny fahafahana **manoratra**
   (session, journal, dernière connexion), ny lisitry ny comptes sy ny rôle-ny, ary raha azo vakiana
   ny empreinte (hash) ny mot de passe. `TEST_PASSWORD` no ampiasaina raha tianao hamarinina ny
   mot de passe :

```powershell
$env:TEST_PASSWORD = "Pharma-Officine-2026!"
npm run diagnose
Remove-Item Env:\TEST_PASSWORD
```

### Raha ny base `pharmastock` dia avy amin’ny version taloha (v1)

Izany no tena antony mahazatra amin’ny 500 amin’ny fidirana : ny base efa nisy taloha dia **tsy mitovy
rafitra** amin’ity version ity. Tsy mitovy ny tabilao :

| V1 (base taloha) | V2 (izay ilain’ny code) |
|---|---|
| tsy misy `roles` | `roles` (fahefana RG18) |
| `users.role` (texte) | `users.role_id` (avy amin’ny `roles`) |
| tsy misy `last_login_at`, `phone`, `note` | misy ireo |
| `settings.values` (JSONB tokana) | `pharmacy_name`, `currency`, `valuation`… |
| tsy misy `sales`, `losses`, `supplier_returns`, `receipts`… | 27 tabilao |

Koa ny fidirana dia tsy mahita izay ilainy → **500**. Ary ny `npm run db:migrate` dia nilaza
`Base déjà à jour.` noho ny laharana `1` tao amin’ny registre taloha izay noheverin’ny rindranasa ho
`001_schema.sql` — **izany fahadisoana izany dia efa voasakana ankehitriny** : ny `db:migrate` dia
manamarina ny rafitra ary mandà mafy miaraka amin’ny toro-lalana raha tsy mifanaraka (jereo
`Échec de la migration : … recreez la base`).

**Vahaolana azo antoka rehefa mbola tsy misy angona tena izy** (izay ihany koa ny fototry ny
fanamboarana ny 500 vokatry ny base taloha) : averina amin’ny madio ny base. Ny mora indrindra —
tsy mila psql — dia ny `npm run setup` **aorian’ny namafana ny base** :

```sql
-- ao amin’ny psql (ajo ny « npm run dev » aloha raha tsy izany : « base en cours d’utilisation »)
DROP DATABASE pharmacie_stock;
\q
```

```powershell
npm run setup            # mamorona indray ny base pharmacie_stock (UTF8) sy ny .env
```

Na, raha tianao ny manao ny zava-drehetra amin’ny psql :

```sql
DROP DATABASE pharmacie_stock;
CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';
\q
```

avy eo, ao VS Code (amin’ny fakany) :

```powershell
npm run db:migrate
npm run admin:create
npm run demo:seed
npm run demo:users
npm run dev
```

## Etape 7 — Fanamboarana haingana rehefa misy olana

| Hafatra | Vahaolana |
|---|---|
| `'npm' n’est pas reconnu` | apetraho Node.js 20 LTS dia averinao ny VS Code (na ny terminal) |
| `npm error Missing script: setup` | ZIP taloha (v2.1 na v2.2) no ampiasainao → alaina ny `PharmaStock-v2.6.zip` |
| `npm run setup` : « Mot de passe refusé » | ny mot de passe an’ny **superutilisateur `postgres`** no angatahina, fa tsy an’ny rôle |
| `password authentication failed for user "pharmastock"` | tsy mifanaraka ny mot de passe : ao amin’ny psql → `ALTER ROLE pharmastock PASSWORD 'Officine-2026';` dia averinao ny `.env` |
| `database "pharmacie_stock" does not exist` | tsy mbola foronina : jereo ny Etape 1 |
| `ECONNREFUSED 127.0.0.1:5432` | tsy mandeha ny service PostgreSQL → `Services` (Windows) → `postgresql-x64-16` → **Démarrer** |
| `DATABASE_URL manquant` | tsy ao ny `backend\.env` na diso ny anarany (`env` fa tsy `.env`) |
| `EADDRINUSE : port 3001` | misy programme hafa mampiasa ny port : `netstat -ano \| findstr :3001` dia `taskkill /PID <isa> /F` |
| Page blanche amin’ny `5173` | jereo ny terminal : tokony hisy `[API]` sy `[WEB]` samy mandeha |
| `Initialisation refusée : des utilisateurs existent déjà.` | ara-dalàna : efa misy ny compte — mivantana amin’ny `npm run dev` |
| `500` amin’ny `/api/auth/login` | jereo ny `[API]` ao amin’ny terminal, na `npm run diagnose` (Etape 6 bis) |
| `Base créée par une version ANTÉRIEURE…` (migrate) | ny base dia avy amin’ny v1 → Etape 6 bis : averinao amin’ny madio ny base |
| Hadino ny mot de passe amin’ny `admin` | `$env:RESET_LOGIN="admin"; $env:RESET_PASSWORD="…"; npm run reset:password` |
| `Origine non autorisée` | tsy mifanaraka amin’ny `APP_ORIGIN` ny adiresy ampiasainao |
| Port hafa no nisafidian’i Vite (ohatra 5174) | ny `APP_ORIGIN` koa dia ovay ho `http://localhost:5174` |
| `npm audit fix --force` | **aza atao mihitsy** (manapaka ny projet) |

---

## Etape 8 — Hydradroa amin’ny finday / tablette (ho an’ny officine)

1. `ipconfig` → alao ny **Adresse IPv4** an’ny Wi-Fi (ohatra `192.168.1.25`).
2. Ao VS Code, amin’ny `backend\.env` :

```ini
APP_ORIGIN_EXTRA=http://192.168.1.25:5173
```

3. Averinao `npm run dev`, dia ampidiro ao amin’ny finday : `http://192.168.1.25:5173`.
4. Raha tsy tafiditra : alalano amin’ny pare-feu ny ports (terminal **Administrateur**) :

```powershell
netsh advfirewall firewall add rule name="PharmaStock 5173" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="PharmaStock 3001" dir=in action=allow protocol=TCP localport=3001
```

---

## Etape 9 — Rehefa hampiasa tena izy

1. `ALLOW_DEMO=false` ao amin’ny `backend\.env`.
2. `npm run dev` → `Paramètres` : anaran’ny officine, adresse, téléphone, devise, plage de marge,
   horizon de péremption. `Enregistrer les paramètres`.
3. `Utilisateurs` : mamoroa **compte iray isaky ny mpiasa** (iray ihany, tsy iombonana) ;
   raha nampiasa comptes d’essai ianao dia tsindrio **`Désactiver`**.
4. `Catalogue` : ny tena fanafody (na `Réceptions` raha efa misy ny entana).
5. Sauvegarde : `docs/5-SAUVEGARDE-MAINTENANCE.md` (na ny cron amin’ny Debian amin’ny `docs/2`).

---

## Fanazavana fohy (résumé malagasy)

1. **psql** : jereo ny rôle sy ny base (`\du pharmastock`, `\l pharmastock*`) — raha efa ao, tsy misy hatao.
2. **VS Code** : sokafy ny dossier misy `package.json` → `Ctrl + ù` ho an’ny terminal → `cd` amin’io dossier io.
3. Ny mora indrindra : `npm install` → **`npm run setup`** (mamorona rôle + base `pharmacie_stock` +
   `backend\.env`) — izay no solon’ny `copy .env.example` sy ny SQL rehetra.
4. `npm run db:migrate` → `npm run admin:create` (+ `npm run demo:seed` sy `demo:users` raha andrana).
5. Fafao ny `ADMIN_PASSWORD` ao amin’ny `.env`.
   Raha hadino ny mot de passe dia : `npm run reset:password` (misy `RESET_LOGIN` sy `RESET_PASSWORD`).
6. `npm run dev` → <http://localhost:5173> → midira amin’ny `admin`.
7. Hijanona : `Ctrl + C`. Hamerina : `npm run dev`.
8. Rehefa hampiasa tena izy : `ALLOW_DEMO=false`, mamoroa compte tena izy, desactive ny comptes d’essai,
   asio ny anaran’ny officine ao amin’ny `Paramètres`.
