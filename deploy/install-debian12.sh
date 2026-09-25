#!/usr/bin/env bash
# ============================================================================
# Installation complète de PharmaStock sur Debian 12 (poste fixe de la pharmacie).
#
#   sudo bash deploy/install-debian12.sh
#
# Le script est idempotent : on peut le relancer sans casser une installation
# existante (les données ne sont jamais effacées).
#
# Variables facultatives :
#   APP_DIR=/opt/pharmastock  SERVICE_USER=www-data  PG_PASSWORD=...  APP_PORT=3001
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pharmastock}"
SERVICE_USER="${SERVICE_USER:-www-data}"
APP_PORT="${APP_PORT:-3001}"
NODE_MAJOR="${NODE_MAJOR:-20}"
DB_NAME="pharmacie_stock"
DB_TEST_NAME="pharmacie_stock_test"
DB_USER="pharmastock"

info()  { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
warn()  { printf '\n\033[1;33m! %s\033[0m\n' "$*"; }
fatal() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fatal "Ce script doit être lancé avec sudo."

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SOURCE_DIR/package.json" ] || fatal "Lancez le script depuis le projet décompressé (deploy/install-debian12.sh)."

info "1/9 Mise à jour du système et installation des paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg unzip ufw rsync postgresql postgresql-contrib

info "2/9 Installation de Node.js ${NODE_MAJOR} LTS"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v && npm -v

info "3/9 Démarrage de PostgreSQL et création de la base"
systemctl enable --now postgresql

PG_PASSWORD="${PG_PASSWORD:-}"
if [ -z "$PG_PASSWORD" ]; then
  PG_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)"
  GENERATED_PASSWORD=1
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${PG_PASSWORD}';"
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${PG_PASSWORD}';"
for db in "$DB_NAME" "$DB_TEST_NAME"; do
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE ${db} OWNER ${DB_USER} ENCODING 'UTF8';"
done

info "4/9 Installation des fichiers de l'application dans ${APP_DIR}"
mkdir -p "$APP_DIR"
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
  rsync -a --delete \
    --exclude 'node_modules' --exclude '.git' --exclude 'backend/tmp' \
    --exclude 'frontend/.cache' --exclude 'backend/.env' \
    "$SOURCE_DIR"/ "$APP_DIR"/
fi
cd "$APP_DIR"

HOST_IP="$(hostname -I | awk '{print $1}')"
if [ ! -f backend/.env ]; then
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cat > backend/.env <<ENVFILE
# Généré par deploy/install-debian12.sh — à conserver et à sauvegarder.
NODE_ENV=production
PORT=${APP_PORT}
DATABASE_URL=postgres://${DB_USER}:${PG_PASSWORD}@127.0.0.1:5432/${DB_NAME}
APP_ORIGIN=http://${HOST_IP}:${APP_PORT}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_LOGIN=admin
ADMIN_PASSWORD=Pharmacie-${RANDOM}${RANDOM}!
PHARMACY_NAME=Ma pharmacie
ALLOW_DEMO=false
BACKUP_DIR=/var/backups/pharmastock
ENVFILE
  chmod 600 backend/.env
  warn "Mot de passe administrateur provisoire généré : $(grep '^ADMIN_PASSWORD=' backend/.env | cut -d= -f2)
     Notez-le, connectez-vous, changez-le depuis l'interface (bouton clé en haut à droite),
     puis supprimez la ligne ADMIN_PASSWORD de ${APP_DIR}/backend/.env."
else
  warn "backend/.env existe déjà : il est conservé tel quel."
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://${DB_USER}:${PG_PASSWORD}@127.0.0.1:5432/${DB_NAME}|" backend/.env
fi

info "5/9 Dépendances et schéma de la base"
npm ci --omit=dev || npm install --omit=dev
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$APP_DIR"
sudo -u "$SERVICE_USER" npm run db:migrate
sudo -u "$SERVICE_USER" npm run admin:create || warn "Compte administrateur déjà présent."
sudo -u "$SERVICE_USER" npm run db:status

info "6/9 Service systemd (démarrage automatique)"
sed "s|/opt/pharmastock|${APP_DIR}|g; s|User=www-data|User=${SERVICE_USER}|; s|Group=www-data|Group=${SERVICE_USER}|" \
  deploy/pharmastock.service > /etc/systemd/system/pharmastock.service
systemctl daemon-reload
systemctl enable --now pharmastock
sleep 3
systemctl is-active pharmastock >/dev/null || { journalctl -u pharmastock -n 60 --no-pager; fatal "Le service ne démarre pas."; }

info "7/9 Vérification de l'accès HTTP"
curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null && echo "API en ligne sur http://127.0.0.1:${APP_PORT}"
curl -fsS "http://127.0.0.1:${APP_PORT}/" >/dev/null && echo "Interface servie sur http://${HOST_IP}:${APP_PORT}"

info "8/9 Pare-feu (réseau local uniquement)"
ufw allow OpenSSH >/dev/null 2>&1 || true
SUBNET="$(echo "$HOST_IP" | cut -d. -f1-3).0/24"
ufw allow from "$SUBNET" to any port "$APP_PORT" proto tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
ufw status | sed -n '1,12p'

info "9/9 Sauvegarde quotidienne"
mkdir -p /var/backups/pharmastock
chmod 700 /var/backups/pharmastock
install -m 755 deploy/backup-pharmastock.sh /usr/local/bin/backup-pharmastock
( crontab -l 2>/dev/null | grep -v 'backup-pharmastock' ; \
  echo "30 20 * * * /usr/local/bin/backup-pharmastock >> /var/log/pharmastock-backup.log 2>&1" ) | crontab -
/usr/local/bin/backup-pharmastock

printf '\n\033[1;32m✔ Installation terminée\033[0m\n'
echo "  Interface  : http://${HOST_IP}:${APP_PORT}"
echo "  Identifiant: $(grep '^ADMIN_LOGIN=' "$APP_DIR/backend/.env" | cut -d= -f2)"
if [ "${GENERATED_PASSWORD:-0}" = "1" ]; then
  echo "  Mot de passe base PostgreSQL (à noter) : ${PG_PASSWORD}"
fi
echo "  Service    : systemctl status pharmastock"
echo "  Journaux   : journalctl -u pharmastock -f"
echo "  Sauvegarde : /usr/local/bin/backup-pharmastock"
echo
echo "Étapes suivantes recommandées :"
echo "  1. connectez-vous et changez le mot de passe administrateur ;"
echo "  2. supprimez la ligne ADMIN_PASSWORD de $APP_DIR/backend/.env ;"
echo "  3. remplissez la fiche d'identité de docs/5-SAUVEGARDE-MAINTENANCE.md."
