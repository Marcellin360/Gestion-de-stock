#!/usr/bin/env bash
# ============================================================================
# Sauvegarde quotidienne de la base PharmaStock.
#   - export compressé horodaté dans $BACKUP_DIR (ou /var/backups/pharmastock)
#   - vérification de l'archive juste après création
#   - suppression des sauvegardes de plus de $BACKUP_RETENTION_DAYS jours (90 par défaut)
# Installation : sudo cp deploy/backup-pharmastock.sh /usr/local/bin/backup-pharmastock
#                sudo chmod +x /usr/local/bin/backup-pharmastock
# ============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pharmastock}"
ENV_FILE="${ENV_FILE:-$APP_DIR/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pharmastock}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-90}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Erreur : $ENV_FILE introuvable." >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
if [ -z "$DATABASE_URL" ]; then
  echo "Erreur : DATABASE_URL absent de $ENV_FILE." >&2
  exit 1
fi

# postgres://utilisateur:motdepasse@hote:port/base  →  variables pg_dump
proto_removed="${DATABASE_URL#*://}"
credentials="${proto_removed%%@*}"
host_and_db="${proto_removed##*@}"
DB_USER="${credentials%%:*}"
DB_PASSWORD="${credentials#*:}"
DB_HOSTPORT="${host_and_db%%/*}"
DB_NAME="${host_and_db##*/}"
DB_NAME="${DB_NAME%%\?*}"
DB_HOST="${DB_HOSTPORT%%:*}"
DB_PORT="${DB_HOSTPORT##*:}"
[ "$DB_PORT" = "$DB_HOST" ] && DB_PORT=5432

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/pharmastock-$STAMP.sql.gz"

export PGPASSWORD="$DB_PASSWORD"
pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
        --no-owner --no-privileges | gzip -9 > "$FILE"
unset PGPASSWORD

if gzip -t "$FILE" 2>/dev/null && [ -s "$FILE" ]; then
  echo "$(date '+%F %T') — sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
else
  echo "$(date '+%F %T') — ECHEC : archive invalide ($FILE)" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'pharmastock-*.sql.gz' -type f -mtime "+$RETENTION_DAYS" -delete
echo "$(date '+%F %T') — sauvegardes conservées : $(find "$BACKUP_DIR" -name 'pharmastock-*.sql.gz' | wc -l)"
