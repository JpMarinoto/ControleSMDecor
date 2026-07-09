##Para atualizar do localhost para vps primeiro preparar o git no local##

git status
git add .
git commit -m "Atualizacao"
git push

##Depois na vps fazer os procedimentos

ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd "Financial Control System" && npm install && npm run build && cd ..
sudo cp deploy/systemd/financeiro.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart financeiro
sudo systemctl restart nginx

## Homologação Shopee (cópia virgem em /homolog/)

Ver guia completo: `deploy/HOMOLOG_SHOPEE.md`

```bash
ssh deploy@129.121.53.239
cd /home/deploy/ControleSMDecor
git pull
chmod +x scripts/setup_homolog_shopee.sh
./scripts/setup_homolog_shopee.sh
# Depois: incluir deploy/nginx/homolog-location.conf no nginx e reload
```

URLs:
- App: https://santosmarinoto.com/homolog/
- Callback: https://santosmarinoto.com/homolog/api/shopee/oauth/callback/
- Login teste: shopee_test / ShopeeTest123!

## Estabilidade (SQLite): o unit acima usa workers=1 — não voltar ao Gunicorn default

## Backup automático diário (instalar UMA vez na VPS)

ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
git pull
chmod +x scripts/install_backup_timer.sh scripts/backup_db.sh
./scripts/install_backup_timer.sh

# Confere: deve listar db-AAAA-MM-DD_*.sqlite3 e o timer às 03:00
ls -lt backups/db/
systemctl list-timers financeiro-backup.timer

ver status
sudo systemctl status nginx --no-pager



Se der erro "504 Gateway Time-out"

O nginx está no ar, mas o Gunicorn (financeiro) não responde a tempo — serviço parado, worker travado ou SQLite bloqueado.

ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"

# 1) Reiniciar (resolve na maioria dos casos)
sudo systemctl restart financeiro
sudo systemctl restart nginx
sudo systemctl status financeiro nginx --no-pager

# 2) Se continuar 504 — ver logs
sudo journalctl -u financeiro -n 80 --no-pager
sudo tail -n 40 /var/log/nginx/error.log

# 3) Testar Django manualmente
source .venv/bin/activate
python manage.py check
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/ || echo " backend não responde"

# 4) Se financeiro não sobe — redeploy completo
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
python manage.py collectstatic --noinput
cd "Financial Control System" && npm run build && cd ..
sudo cp deploy/systemd/financeiro.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart financeiro
sudo systemctl restart nginx

# Não aumentar workers do Gunicorn — SQLite usa só 1 worker (ver deploy/gunicorn.conf.py)
