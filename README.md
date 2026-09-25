# PharmaStock — gestion de stock pour pharmacie d’officine

> ⚠️ **Version 2.7 — le fonctionnement a changé : à lire en premier.**
> L’application travaille avec **deux magasins** : le **DÉPÔT (réserve)** et la **PHARMACIE (comptoir)**.
> Toute marchandise reçue entre **au dépôt** (`Réception`), puis part au comptoir par un **`Transfert`** ;
> la **vente** n’existe qu’en pharmacie. Trois rôles seulement : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » et « Gestionnaire de stock » ont été supprimés). **Plus de commandes** ni de
> **retours fournisseur**. Guides complets : **`docs/14`**, **`docs/15`** (malgache) et
> **`NOUVEAUTES-V2.7.md`** (ce qui change, et comment migrer).



Application web complète (React + Node/Express + Sequelize + PostgreSQL) pour tenir le stock
d’une pharmacie **en deux magasins** : les médicaments entrent au **DÉPÔT**, sont **transférés**
au comptoir selon les besoins, puis **vendus** en pharmacie (FEFO). Pertes motivées, inventaires
par magasin, **alertes de rupture et de péremption dans chaque magasin**, rapports (dont les
**deux fiches de stock**), journal d’audit. Interface **responsive** (ordinateur, tablette, téléphone).

- **Démarrage sur votre PC (Windows 11), pas à pas** : `DEMARRAGE-PC-WINDOWS.md`
  ou double-clic sur `demarrer-pharmastock.bat` (fait tout automatiquement)
- **Développement** : Windows 11 + VS Code — voir `docs/1-INSTALLATION-WINDOWS.md`
- **Exploitation dans la pharmacie** : Debian 12 (poste fixe) — voir `docs/2-DEPLOIEMENT-DEBIAN12.md`
- **Mode d’emploi quotidien** : `docs/3-MANUEL-UTILISATEUR.md`
- **Architecture, base de données et API** : `docs/4-ARCHITECTURE-API.md`
- **Sauvegardes et maintenance** : `docs/5-SAUVEGARDE-MAINTENANCE.md`
- **Recette du cahier des charges (RG01 → RG24)** : `docs/6-RECETTE-CAHIER-DES-CHARGES.md`
- **Chaque ligne de `backend\.env`** : `docs/7-REMPLIR-BACKEND-ENV.md`
- **Toro-lalana feno amin’ny teny malagasy (écrans)** : `docs/8-TORO-LALANA-MALAGASY.md`
- **Isaky ny role : asa + fomba** : `docs/9-TORO-LALANA-ISAKY-NY-ROLE.md`
- **Etape manomboka amin’ny pg ka hatramin’ny VS Code** : `docs/10-ETAPES-PS-TO-VSCODE.md`
- **Conception UML (cas d’utilisation, classes, séquences, états)** : `docs/11-CONCEPTION-UML.md`
- **Fametrahana dingana tsirairay (malagasy)** : `docs/12-FAMPIANARANA-INSTALLATION.md`
- **Fanaovana démonstration (scénario 30 min, malagasy)** : `docs/13-FANAOVANA-DEMONSTRATION.md`
- **Fampiasana tena izy (ohatra isaky ny rôle, malagasy)** : `docs/14-FAMPIASANA-TENA-IZY.md`
- **Guide fenô efijery isaky ny efijery (isa azo antoka, malagasy)** : `docs/15-GUIDE-FENO-ECRAN-ISAKY-NY-EFIJERY.md`

**Ergonomie (v2.1)** : le menu ne garde que les gestes utiles — *Stock* (onglets *Lots & stock* /
*Mouvements*) et *Catalogue* (onglets *Médicaments* / *Catégories* / *Fournisseurs*). Tout ce qui peut
être choisi l’est dans une liste (médicament, fournisseur, lot, client, motif, taux de marge, durée de
conservation) ; le reste est calculé par le serveur (prix, totaux, dates de péremption, coût de revient,
FEFO, CMP). Ne se saisissent que les chiffres et numéros que vous seul connaissez.

---

## 1. Ce que fait l’application

| Écran | Ce qu’on y fait |
|---|---|
| Connexion | session par cookie HTTP-only + jeton CSRF (rôles administrateur, pharmacien, **gestionnaire du dépôt**) |
| Tableau de bord | **deux cartes magasin** (Dépôt : valeur, médicaments, ruptures — Pharmacie : ventes du jour), alertes rouges et orange, derniers transferts, actions rapides |
| **Historique de vente** | recherche du médicament, calcul du total par le serveur, sortie FEFO sur le stock du comptoir, ticket imprimable, historique des ventes |
| Documents | registre complet (vente, réception, **transfert**, perte, ajustement), détail, impression, annulation tracée |
| Lots et stock | quantités **par magasin et par lot**, coût de revient, péremption, mise en quarantaine d’un lot ; création des **lots jumeaux** par transfert |
| Mouvements | journal des entrées/sorties avec **magasin**, motif et document d’origine |
| Inventaires | **un inventaire par magasin**, comptage physique lot par lot, écart justifié obligatoire, ajustement généré et tracé |
| Réceptions (**dépôt**) | création des lots, frais répartis, coût de revient, CMP, recalcul des prix de vente — **toute marchandise entre au dépôt** |
| **Transferts dépôt → pharmacie** | transfert partiel du stock, motif obligatoire, lots jumeaux, bordereau imprimable, annulation tracée |
| Pertes et dons | **magasin obligatoire** (Dépôt ou Pharmacie), sortie au coût retenu, motif imposé, remarque justificative |
| Rapports | **12 états** dont les **deux fiches de stock** (PHARMACIE et DÉPÔT) et les transferts, export CSV (Excel) et version imprimable, contrôle d’intégrité |
| Catalogue | médicaments, catégories, fournisseurs (aucune suppression : désactivation) |

| Journal d’audit | qui a fait quoi et quand, valeurs avant/après, aucune donnée sensible |
| Utilisateurs | comptes, rôles, droits, réinitialisation de mot de passe, dernier administrateur protégé |
| Paramètres | identité de l’officine, devise, valorisation (lot ou CMP), mode et plage de marge, alertes de péremption |

Règles structurantes : **rien ne se supprime** (documents validés → annulation tracée ;
médicaments/comptes → désactivation), **le prix de vente n’est jamais saisi** (coût + taux de marge),
**toute sortie de stock a un motif**, **le stock théorique est comparé au stock physique**.

## 2. Structure du projet

```
pharmastock/
├── backend/                     API Node/Express + Sequelize
│   ├── sql/                     schéma PostgreSQL (001) + références (002)
│   ├── src/
│   │   ├── config/              variables d’environnement, base, constantes
│   │   ├── models/              27 modèles Sequelize (une table par entité)
│   │   ├── controllers/         entrées HTTP
│   │   ├── routes/              routes et permissions par module
│   │   ├── services/            règles métier (vente, stock, prix, inventaire…)
│   │   ├── middlewares/         session, CSRF, validation, erreurs, sécurité
│   │   ├── validators/          schémas zod
│   │   ├── templates/           documents imprimables
│   │   ├── utils/               montants, dates, transactions, export
│   │   ├── app.js / server.js   application Express et démarrage
│   ├── scripts/                 migration, admin, jeu de démonstration, sauvegarde
│   └── test/                    tests unitaires + tests d’intégration (API)
├── frontend/                    Interface React (Vite)
│   ├── src/api/                 client HTTP et routes de l’API
│   ├── src/context/             session, données du poste, notifications
│   ├── src/components/          ossature, bibliothèque d’interface
│   ├── src/pages/               18 écrans (Stock et Catalogue regroupent leurs onglets)
│   ├── src/forms/               formulaires métier
│   └── src/utils/               formatage, routeur
├── deploy/                      installation Debian 12, service systemd, sauvegardes
└── docs/                        installation, déploiement, manuel, architecture, recette
```

## 3. Démarrage rapide (développement, Windows 11)

```powershell
# 1. installation des dépendances (depuis la racine du projet)
npm install

# 2. base de données + configuration : rôle, base « pharmacie_stock » en UTF8, backend\.env
npm run setup                     # questions guidées ; « -- --full » enchaîne aussi l’étape 3,
                                  # « -- --demo » autorise les données fictives (ALLOW_DEMO=true)
#    variante manuelle : dans psql → CREATE ROLE pharmastock LOGIN PASSWORD 'motdepasse';
#                        CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';

# 3. schéma + comptes + données de démonstration
npm run db:migrate
npm run admin:create            # crée l’administrateur défini dans backend\.env
npm run demo:seed               # facultatif : catalogue fictif pour essayer l’application
npm run demo:users              # facultatif : comptes d’essai pharmacien (`pharmacien`) / dépôt (`depot`)
npm run demo:scenario           # facultatif : une « journée » complète en deux magasins : réception au
                                #  dépôt, transfert vers la pharmacie, 2 ventes, 1 perte au comptoir,
                                #  1 perte à la réserve — pour une démonstration prête à présenter
npm run import:products -- "backend\samples\catalogue-exemple.csv" --dry-run
                                # usage réel : import du catalogue depuis un fichier CSV (Excel)
                                # --dry-run simule, --update met à jour les codes déjà présents
npm run diagnose                # diagnostic de l’installation (lecture seule, ne modifie rien)
# db:migrate et db:status vérifient aussi le schéma : une base héritée d’une version
# antérieure est signalée au lieu d’être prise pour une base à jour.
npm run reset:password          # réinitialiser un mot de passe (RESET_LOGIN + RESET_PASSWORD)

# 4. lancer l’API et l’interface
npm run dev                     # API http://127.0.0.1:3001 — interface http://127.0.0.1:5173
```

> **Toutes ces commandes se lancent depuis la racine du projet** (`C:\pharmastock`), pas depuis
> `backend\` : les scripts de la racine délèguent au bon espace de travail
> (`npm run db:migrate` → `npm run db:migrate -w backend`). Un `npm install` exécuté dans `backend\`
> n’installerait que les paquets du serveur et `npm run dev` échouerait
> (`'concurrently' n’est pas reconnu…`). Pour démarrer le serveur seul : `npm run dev -w backend`.

## 4. Vérifications automatisées

```powershell
npm test                                        # 20 tests unitaires (règles de calcul : marge, FEFO, frais, CSV…)
npm run qa:render -w frontend                   # rendu des 20 écrans et des 9 formulaires

set DATABASE_URL=postgres://pharmastock:motdepasse@127.0.0.1:5432/pharmacie_stock_test
npm run test:integration                        # 28 tests d’intégration sur la base de TEST
```

> Les tests d’intégration recréent le schéma de la base pointée par `DATABASE_URL`.
> Un garde-fou intégré **refuse de les lancer** si le nom de la base ne se termine pas par
> `_test` : la base de l’officine ne peut pas être effacée par erreur.

## 5. Comptes

| Rôle | Droits principaux |
|---|---|
| Administrateur | tout, y compris utilisateurs, paramètres, annulations, marges |
| Pharmacien / responsable | ventes, achats, stock, prix, annulations, rapports, audit |
| **Gestionnaire du dépôt** (`DEPOT`) | réceptions (toutes les entrées), transferts dépôt → pharmacie, pertes et inventaires de la réserve, rapports du dépôt — **aucune vente, aucun prix de vente visible** |
| **Pharmacien** (`PHARMACIST`) | ventes au comptoir, annulations, prix et marges, pertes et inventaires de la pharmacie, rapports, journal d’audit |

`npm run admin:create` utilise `ADMIN_LOGIN` et `ADMIN_PASSWORD` de `backend/.env`.
Après la création, **effacez la ligne `ADMIN_PASSWORD`** : le mot de passe reste haché en base.

## 6. Sécurité

- Mots de passe hachés (bcrypt, 12 tours), 12 caractères minimum, jamais renvoyés par l’API.
- Session par cookie `HttpOnly` + `SameSite`, jeton CSRF obligatoire sur toute écriture.
- Contrôle d’origine (même hôte ou `APP_ORIGIN`), limitation de débit sur la connexion et les écritures.
- Requêtes paramétrées (zod + Sequelize), en-têtes de sécurité (helmet).
- Écritures atomiques (transactions) avec verrou global : deux postes ne peuvent pas déstocker la même unité.
- Journal d’audit et mouvements **immuables au niveau PostgreSQL** (déclencheurs : ni modification, ni suppression).

## 7. Hors périmètre de cette version

Ventes à l’unité fractionnaire, patients et ordonnances, encaissement multi-moyens, retours clients,
remboursements, gestion des médecins, dossier médical.
