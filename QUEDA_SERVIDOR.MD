# Servidor caiu

Site fora, 502 ou 504 → entre na VPS e reinicie os serviços.

## 1. Entrar e reiniciar (tenta isto primeiro)

```bash
ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
sudo systemctl restart financeiro
sudo systemctl restart nginx
sudo systemctl status financeiro nginx --no-pager
```

Teste o site. Se voltou, pronto.

## 2. Se não voltou — ver o erro

```bash
sudo journalctl -u financeiro -n 50 --no-pager
sudo tail -n 30 /var/log/nginx/error.log
df -h
```

## 3. Se o backend não sobe

```bash
cd "/home/deploy/ControleSMDecor"
source .venv/bin/activate
python manage.py check
sudo systemctl restart financeiro
```

## 4. Atualizar e subir de novo (depois de git pull)

```bash
cd "/home/deploy/ControleSMDecor"
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd "Financial Control System" && npm install && npm run build && cd ..
sudo systemctl restart financeiro
sudo systemctl restart nginx
```

## 5. Backup antes de mexer no banco

```bash
cd "/home/deploy/ControleSMDecor"
./scripts/backup_db.sh
```

Mais detalhes em `Backup_Banco.md` e `ATT_LOCAL_PARA_VPS.md`.

**Não aumentar workers do Gunicorn** — SQLite usa só 1 worker.
