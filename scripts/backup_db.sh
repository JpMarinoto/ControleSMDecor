#!/usr/bin/env bash
# Backup diário do SQLite (Django). Uso na VPS com cron/systemd timer.
# Recomendado: instalar sqlite para cópia consistente: dnf install -y sqlite
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_FILE="${PROJECT_DIR}/db.sqlite3"
BACKUP_DIR="${PROJECT_DIR}/backups/db"
# Quantos dias manter cópias (apaga mais antigas)
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%F_%H%M%S)"
OUT="${BACKUP_DIR}/db-${STAMP}.sqlite3"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${DB_FILE}" ]]; then
  echo "Aviso: ${DB_FILE} não existe — nada a copiar."
  exit 0
fi

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DB_FILE}" ".backup '${OUT}'"
  echo "Backup (sqlite3 .backup): ${OUT}"
else
  cp -a "${DB_FILE}" "${OUT}"
  echo "Backup (cp): ${OUT} — instale 'sqlite3' para cópia mais segura com app a correr."
fi

# Rotação: remover backups com mais de RETENTION_DAYS dias
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'db-*.sqlite3' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "Backups atuais:"
ls -1t "${BACKUP_DIR}"/db-*.sqlite3 2>/dev/null | head -5 || true
