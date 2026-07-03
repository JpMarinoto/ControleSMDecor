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

ssh deploy@129.121.53.239
