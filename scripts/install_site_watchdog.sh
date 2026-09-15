#!/usr/bin/env bash
# Instala watchdog que mantém nginx + financeiro no ar.
# Uso (na VPS, como deploy, com sudo):
#   cd /home/deploy/ControleSMDecor && sudo bash scripts/install_site_watchdog.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR=/etc/systemd/system

chmod +x "${ROOT}/scripts/site_watchdog.sh"

cp "${ROOT}/deploy/systemd/site-watchdog.service" "${UNIT_DIR}/site-watchdog.service"
cp "${ROOT}/deploy/systemd/site-watchdog.timer" "${UNIT_DIR}/site-watchdog.timer"

# Mantém o nginx-watchdog antigo se existir, mas o site-watchdog cobre os dois
if [[ -f "${ROOT}/deploy/systemd/nginx-watchdog.service" ]]; then
  cp "${ROOT}/deploy/systemd/nginx-watchdog.service" "${UNIT_DIR}/nginx-watchdog.service"
  cp "${ROOT}/deploy/systemd/nginx-watchdog.timer" "${UNIT_DIR}/nginx-watchdog.timer"
fi

# financeiro.service atualizado (StartLimit no [Unit])
if [[ -f "${ROOT}/deploy/systemd/financeiro.service" ]]; then
  cp "${ROOT}/deploy/systemd/financeiro.service" "${UNIT_DIR}/financeiro.service"
fi

systemctl daemon-reload
systemctl enable --now nginx.service financeiro.service
systemctl enable --now site-watchdog.timer
systemctl start site-watchdog.service || true

# Desativa o timer antigo se existir (redundante com site-watchdog)
systemctl disable --now nginx-watchdog.timer 2>/dev/null || true

echo "==> Status"
systemctl is-active nginx financeiro || true
systemctl list-timers site-watchdog.timer --no-pager || true
curl -s -o /dev/null -w "local :8000 -> HTTP %{http_code}\n" --max-time 8 http://127.0.0.1:8000/api/ || echo "local :8000 sem resposta"
echo "OK — watchdog instalado (a cada 2 min)."
