#!/usr/bin/env bash
# Cria/atualiza cópia VIRGEM do sistema em /homolog/ para homologação Shopee.
# NÃO toca no banco nem no serviço de produção.
#
# Uso (na VPS, como deploy):
#   bash /home/deploy/ControleSMDecor/scripts/setup_homolog_shopee.sh
set -euo pipefail

PROD_DIR="${PROD_DIR:-/home/deploy/ControleSMDecor}"
HOMOLOG_DIR="${HOMOLOG_DIR:-/home/deploy/ControleSMDecor-homolog}"
HOMOLOG_USER="${HOMOLOG_USER:-shopee_test}"
HOMOLOG_PASS="${HOMOLOG_PASS:-ShopeeTest123!}"

echo "==> Homologação Shopee"
echo "    Produção:  ${PROD_DIR}"
echo "    Homolog:   ${HOMOLOG_DIR}"

if [[ ! -d "${PROD_DIR}" ]]; then
  echo "Pasta de produção não encontrada: ${PROD_DIR}"
  exit 1
fi

# 1) Cópia do código (sem banco de produção)
mkdir -p "${HOMOLOG_DIR}"
rsync -a --delete \
  --exclude 'db.sqlite3' \
  --exclude 'db.sqlite3-*' \
  --exclude 'backups/' \
  --exclude '.venv/' \
  --exclude 'Financial Control System/node_modules/' \
  --exclude 'Financial Control System/dist/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.env' \
  "${PROD_DIR}/" "${HOMOLOG_DIR}/"

# 2) venv
if [[ ! -d "${HOMOLOG_DIR}/.venv" ]]; then
  python3 -m venv "${HOMOLOG_DIR}/.venv"
fi
# shellcheck disable=SC1091
source "${HOMOLOG_DIR}/.venv/bin/activate"
pip install -q -r "${HOMOLOG_DIR}/requirements.txt"

# 3) .env próprio (banco vazio separado)
if [[ ! -f "${HOMOLOG_DIR}/.env" ]]; then
  SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(50))')"
  cat > "${HOMOLOG_DIR}/.env" <<EOF
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=${SECRET}
DJANGO_ALLOWED_HOSTS=santosmarinoto.com,www.santosmarinoto.com,127.0.0.1,localhost
DJANGO_CORS_ALLOWED_ORIGINS=https://santosmarinoto.com,https://www.santosmarinoto.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://santosmarinoto.com,https://www.santosmarinoto.com
DJANGO_USE_X_FORWARDED_HOST=True
FRONTEND_URL=https://santosmarinoto.com/homolog
GUNICORN_BIND=127.0.0.1:8001
EOF
  echo "Criado ${HOMOLOG_DIR}/.env"
fi

# 4) Banco VIRGEM
cd "${HOMOLOG_DIR}"
rm -f db.sqlite3
python manage.py migrate --noinput
python manage.py criar_mestao --username "${HOMOLOG_USER}" --password "${HOMOLOG_PASS}"
python manage.py collectstatic --noinput

# 5) Build React com base /homolog/
cd "${HOMOLOG_DIR}/Financial Control System"
npm install --silent
VITE_BASE=/homolog/ npm run build
cd "${HOMOLOG_DIR}"

# 6) Serviço systemd
sudo cp "${HOMOLOG_DIR}/deploy/systemd/financeiro-homolog.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro-homolog
sudo systemctl restart financeiro-homolog

echo ""
echo "OK — homologação no ar (serviço financeiro-homolog)."
echo ""
echo "URLs para a Shopee:"
echo "  Produto / login:  https://santosmarinoto.com/homolog/"
echo "  Callback OAuth:   https://santosmarinoto.com/homolog/api/shopee/oauth/callback/"
echo ""
echo "Usuário de teste (preencher no Console Shopee):"
echo "  Usuário: ${HOMOLOG_USER}"
echo "  Senha:   ${HOMOLOG_PASS}"
echo ""
echo "Ainda falta no nginx (uma vez):"
echo "  Incluir o trecho de deploy/nginx/homolog-location.conf no server de santosmarinoto.com"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Domínio de redirecionamento de TESTE no Console Shopee:"
echo "  https://santosmarinoto.com"
