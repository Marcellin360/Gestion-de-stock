# Remplir `backend\.env` — chaque ligne expliquée

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Ce fichier est le seul endroit à compléter avant la première utilisation.
Il ne doit **jamais** être partagé ni envoyé par e-mail (il contient des mots de passe).

Pour le créer, **méthode automatique (recommandée)** — depuis la racine du projet :

```powershell
npm run setup
```

La commande crée le rôle PostgreSQL, la base **`pharmacie_stock`** (UTF8) et ce fichier `.env`
avec `DATABASE_URL` et `ADMIN_PASSWORD` déjà remplis.

**Méthode manuelle** : copier `backend\.env.example` → renommer en `backend\.env` → ouvrir avec le Bloc-notes.

---

## 1. Tableau des variables

| Ligne | Obligatoire | Valeur attendue | À quoi ça sert |
|---|---|---|---|
| `NODE_ENV` | oui | `development` (ou `production` sur le serveur) | mode de fonctionnement |
| `PORT` | oui | `3001` | port de l’API |
| `APP_ORIGIN` | oui | `http://localhost:5173` | adresse de l’interface autorisée à appeler l’API |
| `APP_ORIGIN_EXTRA` | non | vide, ou `http://192.168.1.25:5173` | adresses supplémentaires (téléphone/tablette) |
| `TRUST_PROXY` | non | `0` | mettre `1` seulement derrière un reverse proxy HTTPS |
| `SESSION_HOURS` | non | `8` | durée d’une connexion avant re-demande du mot de passe |
| `DATABASE_URL` | oui | `postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock` | accès à PostgreSQL (`pharmastock` = rôle, `pharmacie_stock` = base) |
| `DATABASE_SSL` | non | `false` | `true` uniquement pour une base distante sécurisée |
| `ADMIN_LOGIN` | oui | `admin` | identifiant du premier compte |
| `ADMIN_NAME` | non | `Administrateur` | nom affiché du premier compte |
| `ADMIN_PASSWORD` | **pour la première fois** | 12 caractères minimum | mot de passe du premier compte (créé par `npm run admin:create`) |
| `ALLOW_DEMO` | oui | `true` pour les essais, `false` en réel | autorise le catalogue fictif de démonstration |

---

## 2. `SESSION_SECRET` : cette ligne n’existe pas (inutile)

**Réponse : rien à écrire, et vous pouvez supprimer complètement la ligne.**

Pourquoi : PharmaStock ne signe pas ses sessions avec un secret. À chaque connexion réussie,
le serveur tire **64 caractères aléatoires** (`crypto.randomBytes(32)`), n’en conserve que
l’empreinte dans la table `sessions` de PostgreSQL, et le navigateur ne reçoit qu’un cookie
`HttpOnly` impossible à lire par un script. Il n’y a donc **aucune variable `SESSION_SECRET`
à renseigner** : le programme ne la lit jamais, avec ou sans elle le comportement est identique.

> Les documents `docs/1` et `docs/2` la mentionnaient par excès de prudence : ils ont été corrigés.
> Si votre `.env` contient `SESSION_SECRET=...`, ce n’est pas une erreur et cela ne provoque
> aucun plantage — mais vous pouvez l’effacer sans conséquence.

---

## 3. `ADMIN_PASSWORD` : la seule ligne vraiment sensible

- **12 caractères minimum**, sinon le message :
  `ADMIN_PASSWORD doit contenir au moins 12 caractères.`
- Elle sert **une seule fois**, à la commande `npm run admin:create` : le mot de passe est
  transformé en empreinte (bcrypt) et enregistré dans la base.
- **Après la création du compte, effacez la ligne** : elle n’a plus d’utilité, et la garder
  constitue un mot de passe en clair sur le disque.
- Le mot de passe choisi est celui que vous taperez ensuite sur l’écran de connexion, avec
  `ADMIN_LOGIN` (par défaut `admin`).

Modèles possibles (à personnaliser, n’utilisez pas cet exemple tel quel) :

```
ADMIN_PASSWORD=Pharma-Officine-2026!
ADMIN_PASSWORD=Ravaka-Betsileo-2026
ADMIN_PASSWORD=MaPharmacie!1234
```

Le mot de passe des **autres utilisateurs** (pharmacien, gestionnaire du dépôt) ne passe pas par ce fichier :
il se crée dans l’application, écran **Utilisateurs** — et chacun le change lui-même ensuite.

**Mot de passe oublié** (même pour le seul administrateur) : depuis la racine du projet,
`npm run reset:password` avec `RESET_LOGIN` et `RESET_PASSWORD` (12 caractères minimum).
L’opération ferme les sessions du compte et laisse une trace dans le journal d’audit.

---

## 4. `PHARMACY_NAME` : à mettre dans l’application, pas dans le fichier

**Réponse : rien à écrire dans `backend\.env`.** Le nom de la pharmacie est un paramètre
*de l’application*, stocké en base et modifiable sans toucher au fichier :

- au premier démarrage la valeur est **`Ma pharmacie`** ;
- pour la changer : se connecter → **Pilotage → Paramètres** → champ *Nom de la pharmacie*
  → *Enregistrer* ;
- ce nom apparaît en haut des **tickets, bons de réception, bordereaux de transfert et rapports imprimés**.

Laisser une ligne `PHARMACY_NAME=...` dans le `.env` ne provoque pas d’erreur, mais elle est
**sans effet** : l’application ne la lit pas. Les documents `docs/1`, `docs/2` et
`DEMARRAGE-PC-WINDOWS.md` ont été corrigés en conséquence.

---

## 5. Modèle complet à copier pour votre PC

Vous avez déjà créé la base et l’utilisateur avec le mot de passe `Officine-2026` :
le fichier ci-dessous est directement utilisable (vous pouvez changer uniquement
`ADMIN_PASSWORD`).

```ini
NODE_ENV=development
PORT=3001
APP_ORIGIN=http://localhost:5173
APP_ORIGIN_EXTRA=
TRUST_PROXY=0
SESSION_HOURS=8

DATABASE_URL=postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock
DATABASE_SSL=false

ADMIN_LOGIN=admin
ADMIN_NAME=Administrateur
ADMIN_PASSWORD=Pharma-Officine-2026!

ALLOW_DEMO=true
```

**Règles d’écriture du fichier :**

- une variable par ligne, `NOM=valeur`, **sans espace** autour du `=` ;
- **pas d’espace** après la valeur en fin de ligne ;
- pas de guillemets autour des valeurs ;
- commentaires possibles avec `#` en début de ligne ;
- encodage : UTF-8 **sans BOM** (le Bloc-notes convient ; avec VS Code, choisir UTF-8) ;
- si le mot de passe PostgreSQL contient `@ : / ? & # %`, il faut l’encoder :
  `p@ss/moi` → `p%40ss%2Fmoi`.

---

## 6. Vérification en trois commandes

Dans `C:\pharmastock` — **la racine du projet, pas le dossier `backend`** (les raccourcis de la
racine savent quel sous-projet lancer : `npm run db:migrate` → `npm run db:migrate -w backend`) :

```
npm run db:status        :: doit lister les migrations 1 et 2
npm run admin:create     :: doit répondre : Administrateur « admin » créé.
npm run dev              :: doit afficher API (3001) puis l’interface (5173)
```

Puis ouvrir <http://localhost:5173> et se connecter avec `admin` + `ADMIN_PASSWORD`.

Erreurs fréquentes au démarrage :

| Message | Cause | Correction |
|---|---|---|
| `DATABASE_URL manquant.` | ligne absente ou vide | reprendre la section 5 |
| `ADMIN_PASSWORD doit contenir au moins 12 caractères.` | mot de passe trop court | allonger la valeur |
| `password authentication failed for user "pharmastock"` | mot de passe différent de celui créé dans PostgreSQL | refaire `ALTER ROLE pharmastock PASSWORD 'Officine-2026';` |
| `database "pharmacie_stock" does not exist` | base non créée | reprendre la création des bases |
| `Initialisation refusée : des utilisateurs existent déjà.` | `admin:create` lancé deux fois | sans conséquence : le compte existe déjà, utilisez-le |
| Mot de passe administrateur oublié | — | `npm run reset:password` (voir ci-dessus) |

---

## Fanazavana amin’ny teny malagasy

- **`SESSION_SECRET`** : tsy misy io ao amin’ny programme. Aza manahirana — afaka foanana ny andalana.
  Ny fisoratana anarana dia tsipika 64 litera kisendrasendra tazonina ao amin’ny base, ka tsy mila « secret ».
- **`ADMIN_PASSWORD`** : io **no tena ilaina** — 12 litera farafahakeliny. Ampiasaina indray mandeha
  amin’ny `npm run admin:create`, avy eo **fafao** ilay andalana.
- **`PHARMACY_NAME`** : tsy atao ao amin’ny `.env`. Ao anatin’ny rindranasa no ampiasaina :
  **Pilotage → Paramètres** → anarana ny fivarotana (default : *Ma pharmacie*). Izany no miposaka
  amin’ny tapakila sy ny taratasy fanontana.
- Ny `DATABASE_URL` dia tsy maintsy mifanaraka amin’izay noforoninao :
  `postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock`.
- Zava-dehibe : ny `=` dia tsy asiana elanelana, ary tsy asiana guillemets ny sanda.
