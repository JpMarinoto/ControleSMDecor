#!/usr/bin/env bash
# Watchdog do site ControleSMDecor — nginx + Gunicorn (financeiro).
# Pensado para rodar via systemd timer (site-watchdog.timer), como root.
set -u

LOG_TAG="site-watchdog"
log() { logger -t "$LOG_TAG" "$*" 2>/dev/null || echo "[$LOG_TAG] $*"; }

# --- nginx ---
if ! systemctl is-active --quiet nginx.service; then
  log "nginx inativo — a iniciar"
  systemctl start nginx.service || log "FALHA ao iniciar nginx"
fi

# --- financeiro (Gunicorn) ---
if ! systemctl is-active --quiet financeiro.service; then
  log "financeiro inativo — a iniciar"
  systemctl start financeiro.service || log "FALHA ao iniciar financeiro"
  sleep 2
fi

# Se o serviço está "active" mas a porta não responde (worker travado / deadlock SQLite)
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:8000/api/ 2>/dev/null || true)"
if [[ -z "$code" || "$code" == "000" ]]; then
  log "Gunicorn sem resposta em :8000 (http_code=${code:-vazio}) — a reiniciar financeiro"
  systemctl restart financeiro.service || log "FALHA ao reiniciar financeiro"
fi
