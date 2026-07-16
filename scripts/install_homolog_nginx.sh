#!/usr/bin/env bash
# Instala o bloco nginx de /homolog/ no site santosmarinoto.com.
# Sem isso, /homolog cai no location / da produção e o React manda para /login.
#
# Uso (na VPS, como deploy — precisa de sudo):
#   bash /home/deploy/ControleSMDecor/scripts/install_homolog_nginx.sh
set -euo pipefail

PROD_DIR="${PROD_DIR:-/home/deploy/ControleSMDecor}"
SNIPPET="${PROD_DIR}/deploy/nginx/homolog-location.conf"
MARKER="homolog-location.conf"
DOMAIN="${DOMAIN:-santosmarinoto.com}"

echo "==> Nginx homolog /homolog/"

if [[ ! -f "${SNIPPET}" ]]; then
  echo "Snippet não encontrado: ${SNIPPET}"
  echo "Faça git pull na pasta de produção primeiro."
  exit 1
fi

# Serviço homolog precisa estar escutando em 8001
if ! curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:8001/" 2>/dev/null; then
  echo "AVISO: http://127.0.0.1:8001/ não responde."
  echo "Rode antes: ./scripts/setup_homolog_shopee.sh"
  echo "Continuando com o nginx mesmo assim..."
fi

# Achar conf do domínio
mapfile -t CANDIDATES < <(
  sudo grep -RIl --include='*.conf' "server_name.*${DOMAIN}" /etc/nginx/ 2>/dev/null || true
)

if [[ ${#CANDIDATES[@]} -eq 0 ]]; then
  echo "Não achei conf nginx com server_name ${DOMAIN}."
  echo "Liste manualmente: sudo grep -Rln '${DOMAIN}' /etc/nginx/"
  exit 1
fi

CONF="${CANDIDATES[0]}"
if [[ ${#CANDIDATES[@]} -gt 1 ]]; then
  echo "Vários confs encontrados; usando o primeiro:"
  printf '  - %s\n' "${CANDIDATES[@]}"
fi
echo "    Conf: ${CONF}"

INCLUDE_LINE="    include ${SNIPPET};"

if sudo grep -qF "${MARKER}" "${CONF}"; then
  echo "    Include já presente — só recarregando nginx."
else
  # Backup
  TS="$(date +%Y%m%d_%H%M%S)"
  sudo cp "${CONF}" "${CONF}.bak-homolog-${TS}"
  echo "    Backup: ${CONF}.bak-homolog-${TS}"

  # Inserir include imediatamente ANTES do primeiro "location / {" (ou location / {)
  # Usa awk para não depender de editores interativos.
  TMP="$(mktemp)"
  sudo awk -v line="${INCLUDE_LINE}" '
    BEGIN { done=0 }
    !done && $0 ~ /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/ {
      print ""
      print "    # Homologação Shopee — gerado por install_homolog_nginx.sh"
      print line
      print ""
      done=1
    }
    { print }
    END {
      if (!done) {
        print "" > "/dev/stderr"
        print "ERRO: não achei \"location / {\" em " FILENAME > "/dev/stderr"
        exit 2
      }
    }
  ' "${CONF}" > "${TMP}"

  sudo cp "${TMP}" "${CONF}"
  rm -f "${TMP}"
  echo "    Include inserido antes de location /"
fi

echo "    Testando nginx..."
sudo nginx -t
sudo systemctl reload nginx
echo "    nginx reload OK"

echo ""
echo "Teste rápido:"
echo "  curl -s https://${DOMAIN}/homolog/ | head -n 15"
echo "  → deve mostrar /homolog/assets/... (NÃO /assets/...)"
echo ""
echo "No navegador (aba anônima): https://${DOMAIN}/homolog/"
echo "  Login: shopee_test / ShopeeTest123!"
