# Démarrage complet sur votre PC (Windows 11)

Ce document reprend **toutes** les étapes, du fichier ZIP téléchargé jusqu’à l’application
ouverte dans le navigateur. Comptez 30 à 45 minutes la première fois ; les fois suivantes,
un seul double-clic suffit.

> **Raccourci** : si vous préférez, après avoir installé Node.js et PostgreSQL (étapes 2 et 3),
> double-cliquez sur **`demarrer-pharmastock.bat`** à la racine du projet : il crée le fichier de
> configuration, installe les dépendances, prépare la base, crée l’administrateur et démarre
> l’application. Les étapes 4 à 8 ci-dessous expliquent exactement ce qu’il fait.

---

## 0. Ce qu’il faut avoir

| Élément | Minimum |
|---|---|
| Windows | 11 (ou 10) 64 bits |
| Mémoire | 4 Go (8 Go conseillés) |
| Disque | 2 Go libres |
| Compte | droits administrateur pour installer Node.js et PostgreSQL |
| Internet | uniquement pour l’installation (l’application fonctionne ensuite hors ligne) |

---

## 1. Récupérer et extraire le fichier ZIP

1. Télécharger **`PharmaStock-v2.6.zip`**.
2. Clic droit sur le fichier → **Extraire tout…**
3. Choisir un dossier **simple**, sans espace ni accent, par exemple :
   `C:\pharmastock`
   (évitez `Bureau`, `Téléchargements` et `C:\Program Files` : les espaces et les droits d’écriture posent problème).
4. Ouvrir le dossier : vous devez voir `backend`, `frontend`, `deploy`, `docs`,
   `demarrer-pharmastock.bat`, `README.md`, `package.json`.

---

## 2. Installer Node.js 20 LTS

1. Aller sur <https://nodejs.org> → bouton **LTS** → télécharger le fichier `.msi` **64 bits**.
2. Installer en laissant toutes les options par défaut (garder « Add to PATH » coché).
3. **Fermer tous les terminaux ouverts**, puis ouvrir un **nouvel** invité de commandes
   (`Touche Windows` + `cmd` + Entrée) et vérifier :

```
node -v
npm -v
```

Attendu : `v20.x.x` et `10.x.x`. Si « `node` n’est pas reconnu », redémarrer le PC puis réessayer.

---

## 3. Installer PostgreSQL 16 et créer la base

1. Aller sur <https://www.postgresql.org/download/windows/> → **Download the installer** → **PostgreSQL 16**.
2. Pendant l’installation :
   - **mot de passe du superutilisateur `postgres`** : choisissez-en un et **notez-le**
     (exemple : `Postgres2026Officine`) ;
   - **port** : `5432` (laisser par défaut) ;
   - composants : garder **pgAdmin 4** et **Command Line Tools** (indispensable pour `psql`).
3. Vérifier que le service tourne : `Services` (dans la recherche Windows) → `postgresql-x64-16` → **En cours d’exécution**.

> **La base de données ne se crée plus dans psql.** Une seule commande s’en occupe
> (**étape 4 bis**, après `npm install`) : `npm run setup`. Aucun `psql`, aucun copier-coller SQL,
> aucune faute de frappe possible. Le nom retenu par défaut est **`pharmacie_stock`**.

<details>
<summary>Méthode manuelle (si vous préférez psql)</summary>

```sql
CREATE ROLE pharmastock LOGIN PASSWORD 'Officine-2026';
CREATE DATABASE pharmacie_stock      OWNER pharmastock ENCODING 'UTF8';
CREATE DATABASE pharmacie_stock_test OWNER pharmastock ENCODING 'UTF8';
\q
```

`Officine-2026` est le mot de passe **de l’application** dans la base : remplacez-le si vous voulez,
mais reportez alors la même valeur dans `backend\.env` (étape 4).
L’encodage `'UTF8'` est obligatoire (sinon les accents sont corrompus).

</details>

---

## 4. Configurer l’application (`backend\.env`)

> **Si vous utilisez `npm run setup` (étape 4 bis), cette étape est déjà faite** : le fichier
> `backend\.env` est écrit automatiquement, avec `DATABASE_URL` et `ADMIN_PASSWORD` remplis.
> Ne le modifiez pas à la main dans ce cas ; passez directement à l’étape 5.

1. Dans le dossier du projet, aller dans `backend`.
2. Copier le fichier `.env.example` puis le renommer en **`.env`**
   (astuce : afficher les extensions — onglet *Affichage* de l’explorateur → cocher *Extensions de noms de fichiers*).
3. Ouvrir `.env` avec le **Bloc-notes** et compléter :

```ini
NODE_ENV=development
PORT=3001
APP_ORIGIN=http://localhost:5173
APP_ORIGIN_EXTRA=
TRUST_PROXY=0
SESSION_HOURS=8

DATABASE_URL=postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock   # base créée à l’étape 3 ou par « npm run setup »
DATABASE_SSL=false

ADMIN_LOGIN=admin
ADMIN_NAME=Administrateur
ADMIN_PASSWORD=Pharma-Officine-2026!

ALLOW_DEMO=true
```

4. **Ctrl+S** puis fermer le Bloc-notes. C’est tout : aucune autre valeur n’est à inventer.

> Règles importantes :
> - le mot de passe de `DATABASE_URL` doit être **encodé en URL** s’il contient `@ : / ? & #`
>   (exemple : `p@ss` → `p%40ss`) ;
> - `ADMIN_PASSWORD` doit faire **12 caractères minimum** ;
> - une fois le compte administrateur créé (étape 6), **effacez la ligne `ADMIN_PASSWORD`** ;
> - **`SESSION_SECRET` n’existe pas** dans ce projet : inutile de l’ajouter, les sessions sont
>   des jetons aléatoires enregistrés dans PostgreSQL ;
> - **`PHARMACY_NAME` ne va pas ici** : le nom de la pharmacie se règle dans l’application,
>   écran **Pilotage → Paramètres** (valeur de départ : *Ma pharmacie*), et il apparaît sur les
>   tickets et documents imprimés ;
> - détail ligne par ligne : `docs/7-REMPLIR-BACKEND-ENV.md`.

---

## 4 bis. Créer la base et le fichier `backend\.env` en une commande

**À faire une seule fois, après `npm install` (étape 5).** Depuis la racine du projet :

```
npm run setup
```

Ce que la commande demande (Entrée = valeur proposée) :

| Question | Valeur conseillée |
|---|---|
| Nom de la base de données | **Entrée** → `pharmacie_stock` |
| Nom du rôle PostgreSQL de l’application | **Entrée** → `pharmastock` |
| Hôte / port PostgreSQL | **Entrée** → `127.0.0.1` puis `5432` |
| Mot de passe du superutilisateur `postgres` | celui noté à l’étape 3 (saisie masquée, rien ne s’affiche) |
| Mot de passe du premier administrateur | 12 caractères minimum — **notez-le**, c’est celui de `admin` dans l’application |

Ce que la commande fait : créer le rôle `pharmastock`, créer la base `pharmacie_stock` **en UTF8**,
tester la connexion, puis écrire `backend\.env` (`DATABASE_URL` + `ADMIN_PASSWORD`).

Pour tout enchaîner (base + tables + compte administrateur) en une seule fois :

```
npm run setup -- --full
```

Pour les essais et les démonstrations (catalogue fictif, comptes d’essai, scénario complet) :

```
npm run setup -- --demo --full     # met ALLOW_DEMO=true
npm run demo:seed && npm run demo:users && npm run demo:scenario
```

> La commande est sans danger si on la relance : elle conserve une base déjà existante et met
> seulement à jour le mot de passe du rôle. `npm run db:create` crée uniquement le rôle et la base,
> sans toucher à `backend\.env`.

---

## 4 ter. Où lancer les commandes ? (à la racine, jamais « cd backend » d’abord)

Le projet est un **ensemble de deux applications** (`backend/` = serveur, `frontend/` = interface)
pilotées depuis la **racine** `C:\pharmastock`. Les raccourcis du fichier `package.json` de la racine
savent d’eux-mêmes quel dossier concerner (exemple : `npm run db:migrate` → `npm run db:migrate -w backend`).

| Ce que vous voulez faire | Depuis où |
|---|---|
| `npm install` | **racine** `C:\pharmastock` |
| `npm run db:migrate`, `db:status`, `admin:create`, `demo:seed` | **racine** |
| `npm run test`, `npm run test:integration`, `npm run build` | **racine** |
| `npm run dev` (serveur **et** interface ensemble) | **racine** |
| démarrer **uniquement** le serveur | **racine** : `npm run dev -w backend` |
| ouvrir le fichier de configuration | dossier `backend\` (fichier `.env` uniquement) |

**Pourquoi ne pas commencer par `cd backend` ?**
`npm install` lancé dans `backend\` n’installe **que** les 152 paquets du serveur : il manque
React/Vite pour l’interface **et** l’outil `concurrently` qui démarre les deux ensemble. Résultat,
à la racine : `'concurrently' n’est pas reconnu en tant que commande interne ou externe…` et
l’interface refuse de s’ouvrir. Toutes les dépendances s’installent dans un **seul dossier partagé** :
`C:\pharmastock\node_modules`.

**Bonne habitude** : un seul `cd` suffit, à l’ouverture de l’invité de commandes :

```
cd C:\pharmastock
```

puis toutes les commandes s’enchaînent sans jamais quitter la racine.

---

## 5. Installer les dépendances du projet

Dans l’invité de commandes, placez-vous dans le dossier du projet (adaptez le chemin) :

```
cd C:\pharmastock
npm install
```

Attendu : beaucoup de lignes puis un message sans `ERR!`. Durée 1 à 3 minutes.
En cas d’erreur réseau, relancer `npm install`.

---

## 6. Créer les tables, l’administrateur (et un catalogue de démonstration)

Toujours dans `C:\pharmastock` :

```
npm run db:migrate
npm run db:status
npm run admin:create
npm run demo:seed
```

Ce que vous devez voir :

| Commande | Message attendu |
|---|---|
| `db:migrate` | `2 migration(s) appliquée(s)` |
| `db:status` | les migrations **1** et **2** marquées comme appliquées |
| `admin:create` | `Administrateur « admin » créé.` |
| `demo:seed` | `5 catégories, 2 fournisseurs et 6 médicaments fictifs créés.` |

Ensuite, ouvrez `backend\.env` et **supprimez la ligne `ADMIN_PASSWORD`** (le mot de passe reste
enregistré, haché, dans la base).

> `demo:seed` est réservé aux essais : il ne s’exécute que si `ALLOW_DEMO=true` et que la base
> est vide. Mettez `ALLOW_DEMO=false` le jour où vous saisissez vos vrais médicaments.

---

## 6 bis. Les comptes : lequel pour qui (et les comptes d’essai)

Il n’y a **aucun compte d’essai préinstallé** : le seul compte existant après l’étape 6 est
`admin` (celui de `ADMIN_PASSWORD`). C’est volontaire — un registre d’officine ne doit contenir
que des comptes réels. Un compte par personne, jamais un compte partagé : le journal d’audit
enregistre chaque action avec son auteur.

### Les quatre profils de l’application

| Profil (rôle) | Peut faire | N’a jamais accès à |
|---|---|---|
| **Administrateur** | tout, y compris comptes, paramètres, plage de marge | — |
| **Pharmacien / responsable** | stock + prix, marges, annulations, rapports, journal d’audit | comptes et paramètres |
| **Gestionnaire de stock** | commander, réceptionner, pertes/retours, inventaires, rapports | ventes au comptoir, comptes |
| **Vendeur habilité** | vendre, imprimer les tickets, consulter les documents de vente | coûts d’achat, marges, commandes, inventaires |

Un identifiant distinct par personne, du type : `h.rasoanaivo`, `n.rakoto`, `s.rabe`… (les comptes
d’essai ci-dessous utilisent des noms simples, à remplacer).

### Pour essayer les quatre profils : trois comptes de démonstration

Pendant les essais uniquement, la commande suivante crée un compte par rôle
(elle n’écrase rien : un identifiant déjà présent est simplement ignoré) :

```
npm run demo:users
```

| Identifiant | Mot de passe provisoire | Profil |
|---|---|---|
| `pharmacien` | `Pharmacien-2026!` | Pharmacien / responsable |
| `gestionnaire` | `Gestion-2026!` | Gestionnaire de stock |
| `vendeur` | `Vendeur-2026!` | Vendeur habilité |

Testez ainsi la règle RG18 : avec `vendeur`, l’écran Utilisateurs et les inventaires sont refusés ;
avec `gestionnaire`, l’écran Ventes disparaît ; avec `pharmacien`, tout le stock est accessible sauf
les comptes et les paramètres.

### Passer à l’usage réel

1. **Utilisateurs → Nouvel utilisateur** : créer un compte par membre de l’équipe (nom réel,
   identifiant de connexion, rôle, mot de passe de 12 caractères minimum — à communiquer à la
   personne concernée, qui le changera par 🔑 *Mon compte*).
2. **Désactiver les comptes d’essai** : écran **Utilisateurs** → ligne concernée → *Désactiver*.
   L’application **ne supprime pas** les comptes : la traçabilité exige de conserver l’historique
   (les documents restent signés par leur auteur). Un compte désactivé ne peut plus se connecter.
3. Passer `ALLOW_DEMO=false` dans `backend\.env` pour interdire les données fictives.
4. Le dernier administrateur actif ne peut être ni rétrogradé ni désactivé : il reste toujours
   quelqu’un pour gérer les comptes.

## 7. Lancer l’application

```
npm run dev
```

Laissez cette fenêtre **ouverte** : elle contient l’API et l’interface.

```
  API        → http://127.0.0.1:3001
  Interface  → http://127.0.0.1:5173      ← ouvrez cette adresse dans le navigateur
```

Se connecter avec `ADMIN_LOGIN` (par défaut `admin`) et le mot de passe saisi à l’étape 4.

**Pour arrêter** : `Ctrl+C` dans la fenêtre.
**Pour reprendre plus tard** : double-cliquer sur `demarrer-pharmastock.bat`, ou rouvrir
l’invité de commandes, `cd C:\pharmastock`, `npm run dev`.

---

## 8. Premier parcours à faire (10 minutes) pour vérifier que tout fonctionne

1. **Tableau de bord** : les compteurs s’affichent (`0 Ar` tant qu’aucun mouvement n’existe).
2. **Catalogue → Fournisseurs → Nouveau fournisseur** : nom + téléphone → *Enregistrer*.
3. **Catalogue → Médicaments → Nouveau médicament** : code, désignation, unité `boîte`,
   seuil d’alerte `5`, taux de marge `20` → *Enregistrer*.
4. **Achats → Commandes → Nouvelle commande** : 100 unités, prix d’achat `8000` → *Enregistrer*.
5. **Achats → Réceptions → Nouvelle réception** : choisir la commande, numéro de lot `LOT-01`,
   date de péremption dans 18 mois, prix `8000`, frais de livraison `100000` → *Valider la réception*
   → le coût de revient (9 000 Ar) et le prix de vente (10 800 Ar) sont calculés.
6. **Ventes** : rechercher le médicament, quantité `3`, *Recalculer le total*, *Valider la vente*, *Imprimer le ticket*.
7. **Sorties → Pertes et dons** : motif `Casse`, remarque obligatoire, 2 unités → *Enregistrer*.
8. **Stock → Inventaires** : *Ouvrir un inventaire*, saisir un écart + justification, *Valider*.
9. **Pilotage → Rapports** : *Ventes*, période *Ce mois*, puis *Export CSV* (le fichier s’ouvre dans Excel).
10. **Pilotage → Journal d’audit** : toutes les actions ci-dessus y figurent, avec l’utilisateur et l’heure.

Si ces dix étapes passent, l’application est correctement installée sur votre PC.

---

## 9. Utiliser l’application depuis un téléphone ou une tablette (facultatif)

1. Trouver l’adresse IP du PC :

```
ipconfig
```

relever la ligne **Adresse IPv4** de la carte Wi-Fi (exemple `192.168.1.25`).

2. Autoriser les ports dans le pare-feu — **invité de commandes en mode administrateur**
   (clic droit → *Exécuter en tant qu’administrateur*) :

```
netsh advfirewall firewall add rule name="PharmaStock 5173" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="PharmaStock 3001" dir=in action=allow protocol=TCP localport=3001
```

3. Dans `backend\.env`, compléter l’origine autorisée (les deux adresses, séparées par une virgule) :

```ini
APP_ORIGIN=http://127.0.0.1:5173,http://192.168.1.25:5173
```

4. Relancer `npm run dev`, puis ouvrir `http://192.168.1.25:5173` sur le téléphone
   (le téléphone doit être sur **le même réseau Wi-Fi** que le PC).

---

## 10. Option : faire tourner l’application en mode « production » sur Windows

Utile si ce PC reste allumé en permanence à l’officine et que vous voulez une seule adresse
(`http://127.0.0.1:3001`) :

```
cd C:\pharmastock
npm run build
set NODE_ENV=production
npm start
```

L’interface et l’API sont alors servies par le même port (3001). Pour rendre la chose automatique
au démarrage de Windows, créez une **Tâche planifiée** (Planificateur de tâches → *Créer une tâche* →
déclencheur *À l’ouverture de session* → action *Démarrer un programme* : `npm` avec les arguments
`start`, dossier `C:\pharmastock`). Le déploiement prévu pour l’officine reste **Debian 12**
(`docs/2-DEPLOIEMENT-DEBIAN12.md`), qui installe le service automatique.

---

## 11. Vérifications automatiques (facultatif mais recommandé)

```
npm test                                        :: 20 tests des règles de calcul (marge, FEFO, frais, CMP…)
npm run qa:render -w frontend                   :: vérifie que les 20 écrans s’affichent sans erreur

set DATABASE_URL=postgres://pharmastock:Officine-2026@127.0.0.1:5432/pharmacie_stock_test
npm run test:integration                        :: 28 scénarios complets sur la base de TEST
```

> Ces tests **effacent** le contenu de la base ciblée. L’application refuse donc de les exécuter
> si le nom de la base ne se termine pas par `_test` : vous ne pouvez pas détruire par erreur
> la base de l’officine. Les deux dernières lignes ci-dessus indiquent explicitement la base
> `pharmacie_stock_test` (adaptez le mot de passe).

---

## 12. Si quelque chose ne fonctionne pas

| Message | Cause | Solution |
|---|---|---|
| `'node' n’est pas reconnu…` | Node.js absent ou PATH non rechargé | réinstaller Node.js puis redémarrer le PC |
| `'psql' n’est pas reconnu…` | outils en ligne de commande non installés | inutile avec `npm run setup` ; sinon rouvrir SQL Shell (psql) depuis le menu Démarrer, ou ajouter `C:\Program Files\PostgreSQL\16\bin` au PATH |
| `npm run setup` : « Mot de passe refusé » | c’est le mot de passe du **superutilisateur `postgres`** qui est demandé | ressaisir celui choisi à l’installation de PostgreSQL |
| `npm run setup` : « Le serveur PostgreSQL ne répond pas » | service arrêté | Services Windows → `postgresql-x64-16` → **Démarrer**, puis relancer la commande |
| `npm error Missing script: setup` | dossier du projet trop ancien (ZIP v2.1 ou avant) | retélécharger `PharmaStock-v2.6.zip` |
| `password authentication failed for user "pharmastock"` | mot de passe différent dans `.env` et dans PostgreSQL | refaire l’étape 3 (`ALTER ROLE pharmastock PASSWORD '…';`) puis corriger `.env` |
| `database "pharmacie_stock" does not exist` | base non créée | reprendre l’étape 3 |
| `ECONNREFUSED 127.0.0.1:5432` | service PostgreSQL arrêté | Services Windows → `postgresql-x64-16` → **Démarrer** |
| `EADDRINUSE : port 3001` | un autre programme occupe le port | `netstat -ano | findstr :3001` puis `taskkill /PID <numéro> /F`, ou changer `PORT` dans `.env` et `API_TARGET` pour Vite |
| Page blanche sur `5173` | interface non démarrée | vérifier que `npm run dev` affiche bien les deux lignes `API` et `VITE` |
| `Origine non autorisée` en se connectant | adresse différente de `APP_ORIGIN` | ajouter l’adresse utilisée dans `APP_ORIGIN` (étape 9) |
| `Session expirée` juste après la connexion | cookies bloqués par le navigateur/extensions | autoriser les cookies pour `127.0.0.1`, ou tester avec un autre navigateur |
| Mot de passe administrateur oublié | — | demander à un autre administrateur de le réinitialiser (écran **Utilisateurs**), ou repartir d’une base vide (voir ci-dessous) |

**Repartir d’une base neuve** (⚠️ efface toutes les données de l’application) :

```sql
-- dans psql, connecté en postgres (arrêter d’abord « npm run dev », sinon « base en cours d’utilisation »)
DROP DATABASE pharmacie_stock;
```

puis, dans `C:\pharmastock` : `npm run setup` (recrée la base vide) → `npm run db:migrate`
→ `npm run admin:create` → `npm run demo:seed` (facultatif).

---

## 13. Où sont les autres documents

| Fichier | Contenu |
|---|---|
| `README.md` | présentation du projet, structure, comptes, sécurité |
| `docs/1-INSTALLATION-WINDOWS.md` | la même installation, en détail, avec VS Code |
| `docs/2-DEPLOIEMENT-DEBIAN12.md` | installation sur le poste fixe de la pharmacie (Debian 12) |
| `docs/3-MANUEL-UTILISATEUR.md` | mode d’emploi quotidien (vendeur, gestionnaire, pharmacien) |
| `docs/4-ARCHITECTURE-API.md` | tables, API, règles métier |
| `docs/5-SAUVEGARDE-MAINTENANCE.md` | sauvegardes, restauration, entretien |
| `docs/6-RECETTE-CAHIER-DES-CHARGES.md` | chaque règle du cahier des charges et où la vérifier |
| `docs/7-REMPLIR-BACKEND-ENV.md` | **chaque ligne de `backend\.env` expliquée** (dont `SESSION_SECRET`, `ADMIN_PASSWORD`, nom de la pharmacie) |
| `docs/8-TORO-LALANA-MALAGASY.md` | **toro-lalana feno amin’ny teny malagasy** : ny zavatra rehetra azo atao ao amin’ny rindranasa, efijery isaky ny efijery |
| `docs/9-TORO-LALANA-ISAKY-NY-ROLE.md` | **isaky ny role** : ny asa rehetra azony atao, ny fomba, ary iza no manao raha tsy izy |
| `docs/10-ETAPES-PS-TO-VSCODE.md` | **dingana mifanesy** avy amin’ny psql (base) ka hatramin’ny VS Code (installation, migration, fanombohana) |
| `docs/12-FAMPIANARANA-INSTALLATION.md` | **fametrahana amin’ny teny malagasy** : ZIP → `npm run setup` (base `pharmacie_stock` + `.env`) → `npm run dev` |
| `docs/13-FANAOVANA-DEMONSTRATION.md` | **fanaovana démonstration** : angona fanandramana (`demo:scenario`), filaharana 30 min, valin’ny fanontaniana, plan B |
| `docs/14-FAMPIASANA-TENA-IZY.md` | **fampiasana tena izy** : ny atao voalohany (base madio, import ny catalogue, stock de départ), ohatra tena izy isaky ny rôle, andro iray, kasus 12 |
| `docs/15-GUIDE-FENO-ECRAN-ISAKY-NY-EFIJERY.md` | **guide fenô** : séance 1 → 6, efijery isaky ny efijery, sanda fenoina amin’ny saha rehetra, isa tokony ho hita |

---

## Fanazavana amin’ny teny malagasy (résumé)

1. **Alaina sy esorina amin’ny ZIP** ny projet (`C:\pharmastock`, aza asiana elanelana na tendron-teny ny anaran’ny dossier).
2. **Apetraho Node.js 20 LTS** (nodejs.org) sy **PostgreSQL 16** (postgresql.org) — tadidio ny teny miafin’ny `postgres`.
3. **`npm install`** ao anatin’ny `C:\pharmastock`, avy eo **`npm run setup`** : io ihany no mamorona
   ny rôle `pharmastock`, ny base **`pharmacie_stock`** (UTF8) sy ny `backend\.env` —
   tsy mila manoratra SQL ao amin’ny psql intsony. (`npm run setup -- --full` dia manampy
   `db:migrate` sy `admin:create` avy hatrany.)
4. **Izay ao amin’ny `backend\.env`** dia nosoratan’ny `npm run setup` : `DATABASE_URL`, `ADMIN_PASSWORD` (12 litera farafahakeliny).
   Tsy misy `SESSION_SECRET` (tsy ampiasain’ny programme) ary tsy ao ny anaran’ny fivarotana :
   ao amin’ny **Pilotage → Paramètres** io.
5. **Ao amin’ny cmd**, ao anatin’ny `C:\pharmastock` : `npm run db:migrate`, avy eo `npm run admin:create`,
   ary `npm run demo:seed` raha andrana.
5 bis. **Sahan’ny mpampiasa** : `admin` ihany no compte voajanahary. Ny hafa dia foronina ao amin’ny
   **Utilisateurs → Nouvel utilisateur** (iray isaky ny olona, tsy iombonana). Ho an’ny andrana :
   `npm run demo:users` dia mamorona `pharmacien` / `gestionnaire` / `vendeur` ho fanandramana ny
   fahefana (RG18) — dia **esory (désactiver)** ao amin’ny Utilisateurs rehefa vita ny andrana.
6. **Alefa ny rindranasa** : `npm run dev`, dia sokafy `http://localhost:5173` — midira amin’ny `admin`
   sy ny teny miafina nosafidinao.
   ⚠️ **Ny baiko rehetra dia atao ao amin’ny fakan’ny projet** (`C:\pharmastock`), fa tsy ao `backend`.
   `cd C:\pharmastock` indray mandeha dia ampy. Raha ao `backend` ianao no manao `npm install`, ny
   serveur ihany no mahazo dépendansy : tsy hisy React/Vite (ny interface) ary `npm run dev` dia
   hiteny hoe `concurrently n’est pas reconnu…`.
7. **Fialana** : `Ctrl+C`. **Famerenana** : tsindrio indroa foana ny `demarrer-pharmastock.bat`.
8. Raha tianao ny avy amin’ny finday/tabletty : ampidiro ny adiresy IP-n’ny PC ao amin’ny `APP_ORIGIN` ary alalano ny ports 5173 sy 3001 amin’ny pare-feu (fizarana 9).
