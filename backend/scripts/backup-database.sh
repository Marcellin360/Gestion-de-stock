#!/usr/bin/env bash
# Sauvegarde locale de la base PharmaStock (PostgreSQL) au format custom compressé.
# Usage : bash scripts/backup-database.sh [dossier_destination]
# Les sauvegardes doivent être copiées HORS du PC de la pharmacie (clé USB dédiée).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

# Chargement de DATABASE_URL depuis backend/.env
set -a; . "$ROOT/.env"; set +a
: "${DATABASE_URL:?DATABASE_URL absent de backend/.env}"

FILE="$DEST/pharmastock-$STAMP.dump"
pg_dump --format=custom --no-owner --file="$FILE" "$DATABASE_URL"
pg_restore --list "$FILE" > /dev/null   # contrôle d'intégrité de l'archive
gzip -9 -f "$FILE"
find "$DEST" -name 'pharmastock-*.dump.gz' -mtime "+$RETENTION_DAYS" -delete
echo "Sauvegarde créée : $FILE.gz ($(du -h "$FILE.gz" | cut -f1))"
echo "Copier ce fichier hors du PC (clé USB / disque externe) pour être réellement protégé."
