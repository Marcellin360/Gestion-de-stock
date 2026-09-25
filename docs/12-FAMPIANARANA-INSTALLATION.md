# 12. Fampianarana FAMETRAHANA — dingana tsirairay (Malagasy)

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Ity no toro-lalana feno : **avy amin’ny ZIP ka hatramin’ny fidirana ao amin’ny rindranasa**.
Tsy misy SQL hatao amin’ny tanana intsony : `npm run setup` ihany no mamorona ny rôle, ny base
ary ny `backend\.env`.

---

## 0. Fanafohezana : ireo baiko rehetra (raha maika ianao)

```powershell
# ao amin’ny cmd / PowerShell, ao anatin’ny dossier C:\pharmastock
npm install
npm run setup            # → mamorona rôle + base « pharmacie_stock » (UTF8) + backend\.env
npm run db:migrate       # → mamorona ny 27 tables
npm run admin:create     # → mamorona ny compte admin
npm run dev              # → http://localhost:5173
```

Izay no rehetra. Ny antsipiriany isaky ny dingana : etsy ambany.

---

## 1. Fitaovana ilaina

| Fitaovana | Aiza no alaina | Fanamarihana |
|---|---|---|
| **Node.js 20 LTS** | <https://nodejs.org> → *LTS* | tsindrio *Next* hatramin’ny farany ; ny `npm` dia miaraka aminy |
| **PostgreSQL** | <https://www.postgresql.org/download/windows/> → *Download the installer* (16 na 17) | tsindrio ny **mot de passe an’ny `postgres`** — ilaina izy io any aoriana |
| **PharmaStock-v2.6.zip** | ny rakitra nalefako | tsy asiana elanelana na tendron-teny ny anaran’ny dossier |

Ampidino tsara ireo roa voalohany mandritra ny installation (aza adino ny **Command Line Tools** sy
**pgAdmin 4** raha asaina misafidy composants).

---

## 2. Esory amin’ny ZIP ary atao ao amin’ny `C:\pharmastock`

1. Avereno amin’ny `C:\dev` na `C:\` ny ZIP : `Clic droit → Extraire tout…` → `C:\pharmastock`.
2. Jereo fa ao anatin’io no misy ny `package.json`, `backend\` sy `frontend\`
   (tsy tokony hisy dossier miforitra indray : `C:\pharmastock\pharmastock\…`).
3. Sokafy **PowerShell** na **cmd**, dia :
   ```powershell
   cd C:\pharmastock
   node -v      # tokony hanisy v20.x
   npm -v
   ```
   Raha `'node' n’est pas reconnu` → mbola tsy voapetraka Node.js, na mila averina ny terminal
   (na ny PC) aorian’ny fametrahana azy.

---

## 3. Andrasana : PostgreSQL dia mandeha

1. `Menu Démarrer` → **Services** → tadiavo `postgresql-x64-16` (na `-17`) → tokony **En cours d’exécution**.
   Raha tsy mandeha : tsindrio `Démarrer` (na amin’ny cmd admin : `net start postgresql-x64-16`).
2. `Menu Démarrer` → **SQL Shell (psql)** → `Entrée` in-efatra → ampidiro ny mot de passe an’ny
   `postgres` → tokony hiseho `postgres=#`. Dia atao `\q` hialana. *(Fanamarinana fotsiny ity; tsy
   ilaina ny manoratra SQL.)*

---

## 4. `npm install` (indray mandeha)

```powershell
cd C:\pharmastock
npm install
```

Maharitra 1–3 minitra, ary mametraka ny dépendances rehetra (API + interface). Tsy maintsy
**eo amin’ny fakany** (`C:\pharmastock`) no anaovana azy, fa tsy ao `backend\`.

---

## 5. `npm run setup` — ny rôle, ny base **`pharmacie_stock`** sy ny `backend\.env`

> **Ity no mamaly ny fanontanianao** : ny `backend\.env` dia **foronina avy amin’ny script**, ary ny
> anaran’ny base dia **`pharmacie_stock`** (fa tsy `pharmastock` intsony). Raha hanova anarana ianao,
> dia ampidiro fotsiny rehefa angatahina (ohatra `pharmacie_stock_2026`) — ny script no manoratra
> izany ao amin’ny `.env`, ka tsy misy disadisa eo amin’izy roa.

```powershell
npm run setup
```

Izay miseho sy izay valiana (tsindrio **Entrée** raha ekena ny soso-kevitra) :

| Fanontaniana eo amin’ny efijery | Valiana |
|---|---|
| `Nom de la base de données [pharmacie_stock]` | **Entrée** |
| `Nom du rôle PostgreSQL de l’application [pharmastock]` | **Entrée** |
| `Hôte PostgreSQL [127.0.0.1]` | **Entrée** |
| `Port PostgreSQL [5432]` | **Entrée** |
| `Mot de passe du superutilisateur « postgres » (masqué)` | ny mot de passe noforoninao tamin’ny fametrahana PostgreSQL — **tsy hita eo am-panoratana azy**, ara-dalàna izany |
| `Mot de passe du premier administrateur …` | 12 litera farafahakeliny — **tadidio**: izy no hidiranao amin’ny `admin` ao amin’ny rindranasa |

Rehefa vita dia hafatra toy izao no miseho :

```
 ✔ Rôle « pharmastock » créé.
 ✔ Base « pharmacie_stock » créée (encodage UTF8, propriétaire « pharmastock »).
 ✔ Connexion vérifiée : base « pharmacie_stock », rôle « pharmastock », encodage UTF8.
 ✔ Fichier backend/.env créé (DATABASE_URL et ADMIN_PASSWORD remplis).
```

Ny ataon’io script io :

1. mamorona (na manavao) ny rôle `pharmastock` miaraka amin’ny mot de passe (avy amin’ny `.env` na
   noforonina 20 litera raha tsy misy) ;
2. mamorona ny base **`pharmacie_stock`** amin’ny **`ENCODING 'UTF8'`** — tsy maintsy UTF8 mba tsy
   ho simba ny tendron-teny frantsay sy malagasy ;
3. manamarina ny fifandraisana amin’ny rôle ;
4. manoratra ny **`backend\.env`** : `DATABASE_URL` sy `ADMIN_PASSWORD` efa feno (tsy mila `copy`
   `na fanovana an-tanana intsony).

Fanampiny :

- `npm run setup -- --full` → manampy avy hatrany ny `db:migrate` sy ny `admin:create`
  (dia ny dingana 6 sy 7 etsy ambany no vita tao anatiny).
- `npm run setup -- --demo` → mametraka `ALLOW_DEMO=true` (angona fanandramana) ; azo atambatra :
  `--demo --full`. Averinao ho `false` izany alohan’ny fampiasana tena izy.
- `npm run db:create` → mamorona ny rôle sy ny base **ihany**, tsy mikitika ny `.env`.
- Azo averina tsy misy atahorana : tsy mamafa ny base efa misy izy, manavao ny mot de passe fotsiny.

### 5 bis. Raha tianao ny manao azy amin’ny tanana (psql)

```sql
CREATE ROLE pharmastock LOGIN PASSWORD 'Changez-Moi-2026';
CREATE DATABASE pharmacie_stock      OWNER pharmastock ENCODING 'UTF8';
CREATE DATABASE pharmacie_stock_test OWNER pharmastock ENCODING 'UTF8';   -- fitsapana
\q
```

Avy eo dia foronina amin’ny tanana ny `.env` :

```powershell
copy backend\.env.example backend\.env
notepad backend\.env
```

Ary fenoy :

```ini
DATABASE_URL=postgres://pharmastock:Changez-Moi-2026@127.0.0.1:5432/pharmacie_stock
ADMIN_PASSWORD=MotDePasse-Admin-2026
```

> Ny `postgres://pharmastock:` dia ny **rôle**, ary ny `/pharmacie_stock` any amin’ny farany dia ny
> **base**. Raha misy `@ : / ? & # %` ao amin’ny mot de passe dia ampifanaraho amin’ny URL
> (`p@ss` → `p%40ss`). Tsy misy `SESSION_SECRET` amin’ity projet ity.

---

## 6. `npm run db:migrate` — ny tabilao

```powershell
npm run db:migrate
```

Tokony hamoaka : `2 migration(s) appliquée(s).` ary `Schéma vérifié : tables et colonnes attendues
présentes.` (`Base déjà à jour` koa dia ara-dalàna raha efa nandeha indray mandeha.)

---

## 7. `npm run admin:create` — ny compte administrateur

```powershell
npm run admin:create
```

Tokony hamoaka `Administrateur « admin » créé.` — ny mot de passe dia ilay nampidirinao tao
amin’ny `ADMIN_PASSWORD`.

Raha asiana **données andrana** (tsy voatery) :

Ilaina ny `ALLOW_DEMO=true` : ny `npm run setup -- --demo` dia mametraka izany ho azy.

```powershell
npm run demo:seed       # 5 catégories, 2 fournisseurs, 6 fanafody
npm run demo:users      # pharmacien (`pharmacien`) / dépôt (`depot`)
npm run demo:scenario   # « andro iray » feno amin’ny magasin roa : réception ao amin’ny dépôt,
                        #  transfert ho any amin’ny pharmacie, 2 ventes, perte comptoir,
                        #  perte réserve (hiomana amin’ny démonstration)
```

> Ny fomba fanaovana démonstration manontolo (filaharana 30 min, izay lazaina, plan B) dia ao amin’ny
> `docs/13-FANAOVANA-DEMONSTRATION.md`.

> Ilaina ny mametraka `ALLOW_DEMO=true` ao amin’ny `backend\.env` vao mandeha ny `demo:seed`
> (fiarovana mba tsy hiditra amin’ny données tena izy ny données fictives). Rehefa hampiasa tena izy
> ianao dia averinao ho `false` izany.

Avy eo, fafao (na avelao ho zary raha mbola andrana) ny andalana `ADMIN_PASSWORD` ao amin’ny
`backend\.env`.

---

## 8. `npm run dev` — alefa ny rindranasa

```powershell
npm run dev
```

Hiseho andalana roa : `[API]` (port 3001) sy `[WEB]` (port 5173). Sokafy
**<http://localhost:5173>** → midira amin’ny `admin` sy ny mot de passe voatahiry.

### Ireo asa voalohany ao anatin’ny rindranasa (10 minitra)

1. **Pilotage → Paramètres** : ny anaran’ny officine (miseho amin’ny ticket sy documents), devise,
   fomba fanombanana, plage de marge (10–30 %).
2. **Utilisateurs** : mamoroa **compte iray isaky ny mpiasa** (aza mampiasa compte iombonana).
3. **Catalogue** : ny tena fanafody, seuil minimum, catégorie, fournisseurs. Raha maro ny
   fanafody (200–800), dia ataovy amin’ny **Excel** ny lisitra dia ampidirina amin’ny
   `npm run import:products -- "C:\pharmastock\mes-produits.csv"` (zohavy : `backend\samples\catalogue-exemple.csv`) ;
   ny antsipiriany amin’ny fampiasana tena izy dia ao amin’ny `docs/14-FAMPIASANA-TENA-IZY.md`.
4. **Réceptions** : ny entana tafiditra (lot, daty, prix, frais) → kajy ho azy ny coût de revient
   sy ny prix de vente.
5. **Fiche de stock** : `Rapports` → `Fiche de stock (initial · entrées · sorties · final)` →
   ny rejistrao (`Stock Initial / Entrée / Sortie / Stock Final`) dia mivoaka ho azy, misy impression
   sy Export CSV. Misy koa bokotra `Fiche de stock du mois` ao amin’ny `Inventaires`.

---

## 9. Fanamboarana rehefa misy olana

| Hafatra | Antony | Vahaolana |
|---|---|---|
| `'node' n’est pas reconnu` | Node.js tsy voapetraka na tsy voavaky ny PATH | avereno ny terminal na ny PC |
| `'npm' n’est pas reconnu` | toy izany koa | avereno ny terminal |
| `npm error Missing script: setup` | ZIP taloha (v2.1 / v2.2) no ampiasaina | alao ny `PharmaStock-v2.6.zip` |
| `Le serveur PostgreSQL ne répond pas` | tsy mandeha ny service | Services → `postgresql-x64-16` → Démarrer |
| `Mot de passe refusé` (amin’ny `setup`) | diso ny mot de passe an’ny **superutilisateur `postgres`** | ny an’ny `postgres` no angatahina eto, fa tsy an’ny rôle |
| `password authentication failed for user "pharmastock"` | tsy mifanaraka ny mot de passe | avereno `npm run setup` |
| `database "pharmacie_stock" does not exist` | tsy mbola foronina ny base | `npm run setup` |
| `EADDRINUSE : port 3001` | misy programa hafa mampiasa ny port | `netstat -ano \| findstr :3001` → `taskkill /PID <isa> /F` |
| Page fotsy amin’ny `5173` | tsy niakatra ny interface | jereo fa misy `[API]` sy `[WEB]` amin’ny terminal |
| `Origine non autorisée` | tsy mifanaraka amin’`APP_ORIGIN` ny adiresy | ampifanaraho ny `APP_ORIGIN` ao amin’ny `.env` |
| `DROP DATABASE … en cours d’utilisation` | mbola misy `npm run dev` mihazona connexion | `Ctrl + C` aloha dia avereno ny `DROP` |
| Manomboka amin’ny base madio indray | rehefa simba ny rafitra na base v1 ny base | atao `npm run setup`, avy eo `db:migrate` sy `admin:create` |

Fanamarihana : rehefa averinao amin’ny madio ny base dia : `DROP DATABASE pharmacie_stock;` ao
amin’ny psql (aorian’ny `Ctrl + C` amin’ny `npm run dev`), dia `npm run setup` → `npm run db:migrate`
→ `npm run admin:create`.

---

## 10. Fanamarinana haingana (tsy voatery)

```powershell
npm test                                        # 20 fitsapana unitaires
npm run qa:render -w frontend                   # 20 écrans
set DATABASE_URL=postgres://pharmastock:Changez-Moi-2026@127.0.0.1:5432/pharmacie_stock_test
npm run test:integration                        # 28 fitsapana intégration (amin’ny base _test)
npm run diagnose                                # fanamarinana ny base sy ny .env (lecture seule)
```

> Ny `test:integration` dia **mamafa** ny base resahiny — koa tsy azo ampiasana ny base
> `pharmacie_stock` (izay misy ny données tena izy). Ny programa dia mandà raha tsy mifarana amin’ny
> `_test` ny anaran’ny base.

---

## Fanafohezana farany

| Zavatra | Sanda |
|---|---|
| Anaran’ny base | **`pharmacie_stock`** (`pharmacie_stock_test` ho an’ny fitsapana) |
| Rôle PostgreSQL | `pharmastock` |
| Fichier configuration | `backend\.env` — foronin’ny `npm run setup` |
| Adiresy ny rindranasa | <http://localhost:5173> (API : <http://localhost:3001>) |
| Baiko fototra | `npm install` → `npm run setup` → `npm run db:migrate` → `npm run admin:create` → `npm run dev` |
