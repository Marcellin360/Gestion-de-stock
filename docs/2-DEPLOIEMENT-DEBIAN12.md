# 2. Déploiement sur le poste fixe de la pharmacie (Debian 12)

> ⚠️ **Kinova 2.7 — niova ny fomba fiasa : vakio ity aloha.**
> Ny rindranasa dia miasa amin’ny **magasin roa** : **DÉPÔT (réserve)** sy **PHARMACIE (comptoir)**.
> Ny fanafody rehetra tonga dia **Réception → DÉPÔT**, avy eo **Transfert → PHARMACIE** ;
> ny **vente** dia ao amin’ny pharmacie ihany. Ny rôle dia **3** : **ADMIN**, **PHARMACIST**, **DEPOT**
> (« Vendeur habilité » sy « Gestionnaire de stock » dia **nesorina**). **Tsy misy commande** sy
> **tsy misy retour fournisseur** intsony. Ny fanazavana feno : **`docs/14`**, **`docs/15`** ary
> **`NOUVEAUTES-V2.7.md`**.



Objectif : l’application tourne en service sur le PC de l’officine, accessible depuis les
navigateurs du réseau local (comptoir, tablette, téléphone) via `http://<ip-du-poste>:3001`.

Hypothèses : Debian 12 *bookworm* fraîchement installé, accès `sudo`, connexion Internet
pendant l’installation. **Aucune connexion Internet n’est nécessaire ensuite.**

---

## Méthode rapide (script fourni)

```bash
sudo apt update && sudo apt install -y unzip
unzip PharmaStock-v2.6.zip -d /tmp
sudo bash /tmp/pharmastock/deploy/install-debian12.sh
```

Le script enchaîne toutes les étapes ci-dessous (Node.js 20, PostgreSQL 16, base, utilisateur,
configuration, migration, compte administrateur, service systemd, sauvegarde quotidienne).
Les étapes manuelles restent décrites pour comprendre et vérifier chaque action.

---

## Méthode détaillée, étape par étape

### Étape 1 — Mettre à jour le système et installer les outils de base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg unzip git ufw
```

### Étape 2 — Installer Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # v20.x
npm -v
```

### Étape 3 — Installer PostgreSQL 16 et créer la base

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql --version
```

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE pharmastock LOGIN PASSWORD 'MotDePasseBase-2026';
CREATE DATABASE pharmacie_stock OWNER pharmastock ENCODING 'UTF8';
CREATE DATABASE pharmacie_stock_test OWNER pharmastock ENCODING 'UTF8';
\q
SQL
```

> Choisissez un mot de passe de base **différent** de celui de l’application et notez-le
> dans le registre des mots de passe de l’officine.

### Étape 4 — Installer l’application

```bash
sudo mkdir -p /opt/pharmastock
sudo unzip PharmaStock-v2.6.zip -d /opt
sudo chown -R www-data:www-data /opt/pharmastock     # ou l'utilisateur qui fera tourner le service
cd /opt/pharmastock
sudo -u www-data npm ci --omit=dev || sudo npm install --omit=dev
```

> Le fichier `frontend/dist/` (interface déjà compilée) est fourni dans l’archive : rien à compiler
> sur le serveur. Si vous modifiez le code de l’interface, voir « Recompiler l’interface » plus bas.

### Étape 5 — Configurer l’environnement

```bash
cd /opt/pharmastock
sudo cp backend/.env.example backend/.env
sudo nano backend/.env
```

Contenu à adapter :

```ini
NODE_ENV=production
PORT=3001
DATABASE_URL=postgres://pharmastock:MotDePasseBase-2026@127.0.0.1:5432/pharmacie_stock
APP_ORIGIN=http://192.168.1.25:3001          # adresse IP ou nom DNS du poste de la pharmacie
ADMIN_LOGIN=admin
ADMIN_PASSWORD=<mot de passe de 12 caractères minimum, à effacer après la création>
ALLOW_DEMO=false
BACKUP_DIR=/var/backups/pharmastock
```

Puis protéger le fichier :

```bash
sudo chown www-data:www-data backend/.env
sudo chmod 600 backend/.env
```

> En `NODE_ENV=production`, `APP_ORIGIN` doit commencer par `https://` **sauf** si l’application
> est publiée en clair sur le réseau local : le contrôle d’origine accepte alors les requêtes
> dont l’hôte correspond à celui de la requête (cas normal d’un accès direct `http://ip:3001`).

### Étape 6 — Créer le schéma, l’administrateur et les données de référence

```bash
cd /opt/pharmastock
# le fichier backend/.env est lu automatiquement par l'application
sudo -u www-data npm run db:migrate
sudo -u www-data npm run admin:create
sudo -u www-data npm run db:status
```

Puis **supprimez la ligne `ADMIN_PASSWORD`** du fichier `.env`.

### Étape 7 — Installer le service systemd (démarrage automatique)

```bash
sudo cp deploy/pharmastock.service /etc/systemd/system/pharmastock.service
sudo nano /etc/systemd/system/pharmastock.service      # vérifier User, Group et WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now pharmastock
systemctl status pharmastock --no-pager
```

Vérifier l’accès :

```bash
curl -s http://127.0.0.1:3001/api/health     # {"status":"ok",...}
```

Depuis un autre poste du réseau : ouvrir `http://<ip-du-poste>:3001` dans le navigateur.

### Étape 8 — Ouvrir le pare-feu (réseau local uniquement)

```bash
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp
sudo ufw enable
sudo ufw status
```

> N’ouvrez **jamais** le port 3001 vers Internet en HTTP : si un accès extérieur est indispensable,
> passez par Nginx + certificat HTTPS (voir `deploy/nginx-pharmastock.conf`).

### Étape 9 — Sauvegardes automatiques

```bash
sudo mkdir -p /var/backups/pharmastock
sudo cp deploy/backup-pharmastock.sh /usr/local/bin/backup-pharmastock
sudo chmod +x /usr/local/bin/backup-pharmastock
sudo crontab -e
```

Ajouter :

```cron
# sauvegarde quotidienne à 20 h 30 et copie sur clé USB montée dans /media/sauvegarde
30 20 * * * /usr/local/bin/backup-pharmastock >> /var/log/pharmastock-backup.log 2>&1
```

Détails et restauration : `docs/5-SAUVEGARDE-MAINTENANCE.md`.

### Étape 10 — Contrôles après installation

```bash
systemctl is-enabled pharmastock      # enabled
systemctl is-active pharmastock       # active
sudo -u www-data npm --prefix /opt/pharmastock run db:status
```

Puis, dans l’interface : se connecter, créer un fournisseur, un médicament, une réception et une vente
(voir `docs/1-INSTALLATION-WINDOWS.md` étape 9 pour le scénario complet).

## Recompiler l’interface (uniquement après modification du code frontend)

```bash
cd /opt/pharmastock
sudo npm install                       # réinstalle aussi les dépendances de développement
sudo npm run build                     # régénère frontend/dist
sudo systemctl restart pharmastock
```

## Mise à jour de l’application

```bash
sudo /usr/local/bin/backup-pharmastock            # sauvegarde avant toute mise à jour
sudo systemctl stop pharmastock
sudo unzip -o PharmaStock-v2.6.zip -d /opt        # remplace le code, conserve backend/.env
cd /opt/pharmastock && sudo npm ci --omit=dev
sudo -u www-data npm run db:migrate
sudo systemctl start pharmastock
```

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `systemctl status` : `inactive (dead)` | erreur de configuration | `journalctl -u pharmastock -n 80 --no-pager` |
| `ECONNREFUSED 5432` | PostgreSQL arrêté | `sudo systemctl restart postgresql` |
| `Identifiants invalides` avec le bon mot de passe | base non migrée / compte absent | `npm run db:migrate` puis `npm run admin:create` |
| Page blanche | `frontend/dist` absent | `npm run build` |
| Accès refusé depuis un autre poste | pare-feu ou `APP_ORIGIN` | vérifier `ufw status` et l’adresse dans `APP_ORIGIN` |
| `EACCES` sur les fichiers | droits du dossier | `sudo chown -R www-data:www-data /opt/pharmastock` |
