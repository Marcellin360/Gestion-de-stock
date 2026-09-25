# 1. Installation sur le poste de développement (Windows 11 + VS Code)

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Temps estimé : 30 à 45 minutes. Toutes les commandes se tapent dans **PowerShell**.
À la fin, l’application tourne sur `http://127.0.0.1:5173`.

---

## Étape 1 — Installer Node.js 20 LTS

1. Ouvrir <https://nodejs.org> → télécharger **Node.js 20 LTS (Windows Installer .msi, 64 bits)**.
2. Installer en laissant les options par défaut (cocher *Add to PATH*).
3. Vérifier dans un **nouveau** PowerShell :

```powershell
node -v      # doit afficher v20.x ou v22.x
npm -v       # doit afficher 10.x ou plus
```

## Étape 2 — Installer PostgreSQL 16

1. Ouvrir <https://www.postgresql.org/download/windows/> → *Download the installer* → **PostgreSQL 16**.
2. Pendant l’installation :
   - mot de passe du superutilisateur `postgres` : **notez-le** (ex. `MotDePassePostgres!2026`) ;
   - port : **5432** (par défaut) ;
   - composant **pgAdmin 4** : à garder (interface graphique utile) ;
   - composant **Command Line Tools** : à garder (fournit `psql`).
3. Vérifier :

```powershell
psql --version    # psql (PostgreSQL) 16.x
```

## Étape 3 — Créer la base et l’utilisateur de l’application

**Deux méthodes ; la première évite toute faute de frappe.**

**A. Automatique (recommandée)** — à lancer **après** l’étape 5 (`npm install`), depuis la racine du projet :

```powershell
npm run setup            # ou : npm run setup -- --full  (enchaîne aussi db:migrate et admin:create)
```

Cette commande crée le rôle `pharmastock`, la base **`pharmacie_stock`** (encodage UTF8), vérifie la
connexion, puis écrit **`backend\.env`** (`DATABASE_URL` + `ADMIN_PASSWORD`). Elle ne demande que :
le mot de passe du superutilisateur `postgres` (saisie masquée), le nom de la base (Entrée =
`pharmacie_stock`) et le mot de passe du futur compte administrateur (Entrée = généré).
L’étape 4 ci-dessous devient alors inutile.

**B. Manuelle, dans SQL Shell (psql)**, connecté en `postgres` :

```sql
CREATE ROLE pharmastock LOGIN PASSWORD 'Changez-Moi-2026';
CREATE DATABASE pharmacie_stock      OWNER pharmastock ENCODING 'UTF8';
CREATE DATABASE pharmacie_stock_test OWNER pharmastock ENCODING 'UTF8';   -- pour les tests automatiques
\q
```

> `pharmacie_stock` contient les données de l’officine ; `pharmacie_stock_test` ne sert qu’aux tests
> d’intégration, qui effacent son contenu à chaque exécution.
>
> L’encodage `'UTF8'` est **obligatoire** : un PostgreSQL installé en Windows français crée parfois la
> base en WIN1252, et les accents français ou malgaches y seraient corrompus.
> Après la méthode B, il faut encore créer `backend\.env` à la main (copier `backend\.env.example`,
> puis renseigner `DATABASE_URL` et `ADMIN_PASSWORD` — voir `docs/7-REMPLIR-BACKEND-ENV.md`).

## Étape 4 — Ouvrir le projet dans VS Code

1. Installer **VS Code** : <https://code.visualstudio.com>.
2. Extensions recommandées (panneau Extensions, `Ctrl+Maj+X`) : *ESLint*, *Prettier*, *PostgreSQL*
   (facultatif), *Thunder Client* (facultatif, pour tester l’API).
3. Décompresser `PharmaStock-v2.6.zip` dans un dossier **sans espace ni accent**, par exemple
   `C:\dev\pharmastock`, puis : `Fichier → Ouvrir le dossier…` → sélectionner ce dossier.
4. Ouvrir un terminal intégré : `Ctrl+ù` (ou *Terminal → Nouveau terminal*).

## Étape 5 — Installer les dépendances (depuis la racine du projet)

Le projet regroupe **deux applications** pilotées depuis un seul dossier :

| Dossier | Rôle |
|---|---|
| `C:\pharmastock\backend\` | serveur (API) et scripts de base de données |
| `C:\pharmastock\frontend\` | interface React affichée dans le navigateur |
| `C:\pharmastock\` (racine) | **toutes les commandes se lancent ici** |

Les raccourcis de la racine savent quel sous-projet lancer :

```
npm run db:migrate   →   npm run db:migrate -w backend
npm run dev          →   démarre le serveur ET l’interface
```

Donc, dans l’invité de commandes :

```powershell
cd C:\pharmastock
npm install
```

Durée : 1 à 3 minutes. En cas d’erreur réseau, relancer la commande.

> **Ne lancez pas `npm install` dans `backend\`** : cela n’installerait que les paquets du serveur
> (152), sans React/Vite ni l’outil `concurrently` qui démarre les deux ensemble — et
> `npm run dev` échouerait alors avec `'concurrently' n’est pas reconnu…`.
> Un seul `cd C:\pharmastock` suffit pour tout le reste de la procédure.

## Étape 6 — Configurer l’application

```powershell
copy backend\.env.example backend\.env
notepad backend\.env
```

Renseigner au minimum :

```ini
NODE_ENV=development
PORT=3001
DATABASE_URL=postgres://pharmastock:Changez-Moi-2026@127.0.0.1:5432/pharmacie_stock
APP_ORIGIN=http://127.0.0.1:5173
ADMIN_LOGIN=admin
ADMIN_PASSWORD=<mot de passe de 12 caractères minimum>
ALLOW_DEMO=true
```

> Aucune variable `SESSION_SECRET` n’est nécessaire (les sessions sont des jetons aléatoires
> conservés en base) et le nom de la pharmacie se règle dans l’application, écran
> **Paramètres** — pas dans ce fichier. Détail ligne par ligne : `docs/7-REMPLIR-BACKEND-ENV.md`.

> Le mot de passe de l’utilisateur PostgreSQL doit être encodé en URL s’il contient
> `@ : / ? & #` (ex. `p@ss` → `p%40ss`).

## Étape 7 — Créer le schéma, l’administrateur et (si besoin) un catalogue de démonstration

```powershell
npm run db:migrate      # crée les 27 tables, les déclencheurs et les références
npm run db:status       # doit afficher les migrations 1 et 2 comme appliquées
npm run admin:create    # crée le compte administrateur défini dans backend\.env
npm run demo:seed       # facultatif : catégories, fournisseurs, médicaments fictifs (sans stock)
```

Après la création du compte, **ouvrez `backend\.env` et supprimez la ligne `ADMIN_PASSWORD`**.

## Étape 8 — Lancer l’application

```powershell
npm run dev
```

Deux serveurs démarrent :

- **API** : <http://127.0.0.1:3001> (message `PharmaStock — API et interface sur le port 3001`)
- **Interface** : <http://127.0.0.1:5173> → ouvrir cette adresse dans le navigateur

Connectez-vous avec `ADMIN_LOGIN` / le mot de passe choisi à l’étape 6.
Pour arrêter : `Ctrl+C` dans le terminal.

## Étape 9 — Essayer le parcours complet (10 minutes)

1. **Catalogue → Fournisseurs** : créer un grossiste.
2. **Catalogue → Médicaments** : créer un médicament (code, nom, unité, seuil d’alerte, taux de marge 10–30 %).
3. **Réceptions (dépôt)** : réceptionner 100 unités avec un numéro de lot, une date de péremption dans
   18 mois, un prix d’achat et des frais de livraison (connexion avec le compte **dépôt**).
   → le coût de revient et le prix de vente sont calculés automatiquement ; **tout entre au dépôt**.
4. **Transferts dépôt → pharmacie** : transférer 40 unités avec un motif — le dépôt en garde 60,
   le comptoir reçoit 40 (lot jumeau).
5. **Historique de vente** (compte pharmacien ou admin) : rechercher le médicament, quantité 3,
   *Recalculer le total*, *Valider la vente*, imprimer le ticket — le stock du dépôt ne bouge pas.
6. **Stock → Lots et stock** : choisir le **magasin** (Dépôt / Pharmacie) et vérifier les quantités.
7. **Pertes et dons** : déclarer une casse de 2 unités **en choisissant le magasin** (motif + remarque obligatoires).
8. **Inventaires** : ouvrir un inventaire (magasin au choix), saisir un écart, justifier, valider → l’ajustement est tracé.
9. **Pilotage → Rapports** : `Fiche de stock — PHARMACIE`, `Fiche de stock — DÉPÔT`, `Transferts dépôt → pharmacie`,
   ventes du mois, export CSV.
9. **Pilotage → Journal d’audit** : retrouver toutes les actions ci-dessus, avec l’utilisateur et l’horodatage.

## Étape 10 — Accès depuis un téléphone ou une tablette de l’officine (facultatif)

1. Trouver l’adresse IP locale du PC :

```powershell
ipconfig     # ligne « Adresse IPv4 » de la carte Wi-Fi, ex. 192.168.1.25
```

2. Autoriser l’application dans le pare-feu Windows (une seule fois, PowerShell **en administrateur**) :

```powershell
New-NetFirewallRule -DisplayName "PharmaStock 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PharmaStock 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

3. Ajouter l’adresse au fichier `backend\.env` (les deux valeurs, séparées par une virgule) :

```ini
APP_ORIGIN=http://127.0.0.1:5173,http://192.168.1.25:5173
```

4. Redémarrer `npm run dev`, puis ouvrir `http://192.168.1.25:5173` sur le téléphone (même réseau Wi-Fi).

## Étape 11 — Lancer les vérifications

```powershell
npm test                                        # tests unitaires des règles de calcul
npm run qa:render -w frontend                   # rendu des 18 écrans

$env:DATABASE_URL = "postgres://pharmastock:Changez-Moi-2026@127.0.0.1:5432/pharmacie_stock_test"
npm run test:integration                        # parcours complet de l’API sur la base de TEST
```

Les tests d’intégration effacent la base ciblée : le programme **refuse** de s’exécuter si le nom
de la base ne finit pas par `_test`. C’est ce qui protège le registre réel de l’officine.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | service PostgreSQL arrêté | *Services* → `postgresql-x64-16` → **Démarrer** |
| `password authentication failed for user "pharmastock"` | mot de passe erroné ou non encodé | corriger `DATABASE_URL` (encoder `@ : / ?` en `%40 %3A %2F %3F`) |
| `database "pharmacie_stock" does not exist` | base non créée | reprendre l’étape 3 |
| `Session expirée` après connexion | `APP_ORIGIN` ne correspond pas à l’adresse ouverte | aligner `APP_ORIGIN` sur l’adresse du navigateur |
| Page blanche sur 5173 | interface non démarrée | vérifier que `npm run dev` affiche bien `VITE` et `API` |
| `Requête refusée : origine non autorisée` | accès par IP sans `APP_ORIGIN` | ajouter l’adresse dans `APP_ORIGIN` (étape 10) |
