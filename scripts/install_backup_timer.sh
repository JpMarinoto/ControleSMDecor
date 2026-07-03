#!/usr/bin/env bash
# Instala o timer systemd de backup diário na VPS (executar na pasta do projeto).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

chmod +x "${SCRIPT_DIR}/backup_db.sh"
mkdir -p "${PROJECT_DIR}/backups/db"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Aviso: sqlite3 não encontrado. Instale com: sudo dnf install -y sqlite"
fi

sudo cp "${PROJECT_DIR}/deploy/systemd/financeiro-backup.service" \
        "${PROJECT_DIR}/deploy/systemd/financeiro-backup.timer" \
        /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-backup.timer

echo "Timer activo:"
systemctl list-timers financeiro-backup.timer --no-pager || true

echo "A executar primeiro backup..."
sudo systemctl start financeiro-backup.service

echo "Últimos backups:"
ls -1t "${PROJECT_DIR}/backups/db"/db-*.sqlite3 2>/dev/null | head -5 || echo "(nenhum ainda)"
