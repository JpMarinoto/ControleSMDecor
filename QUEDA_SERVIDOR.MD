# Servidor caiu

Site fora, HTTPS a carregar sem fim, 502 ou 504 → entre na VPS e reinicie os serviços.

## Diagnóstico típico (set/2026)

- **HTTP :80** responde (nginx no ar) e redireciona para HTTPS
- **HTTPS :443** trava → quase sempre o **Gunicorn (`financeiro`)** parado ou worker travado na porta 8000
- Antes também aconteceu **nginx parado** vários dias — por isso existe watchdog

## 1. Entrar e reiniciar (tenta isto primeiro)

```bash
ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
sudo systemctl restart financeiro
sudo systemctl restart nginx
sudo systemctl status financeiro nginx --no-pager
curl -s -o /dev/null -w "backend=%{http_code}\n" --max-time 8 http://127.0.0.1:8000/api/
```

Teste https://santosmarinoto.com — se voltou, pronto.

## 2. Instalar watchdog (uma vez — evita cair de novo)

```bash
cd "/home/deploy/ControleSMDecor"
git pull
chmod +x scripts/site_watchdog.sh scripts/install_site_watchdog.sh
sudo bash scripts/install_site_watchdog.sh
```

O timer verifica a cada **2 minutos**: sobe nginx/financeiro se pararem e reinicia o Gunicorn se `:8000` não responder.

## 3. Se não voltou — ver o erro

```bash
sudo journalctl -u financeiro -n 80 --no-pager
sudo tail -n 40 /var/log/nginx/error.log
df -h
free -h
```

## 4. Se o backend não sobe

```bash
cd "/home/deploy/ControleSMDecor"
source .venv/bin/activate
python manage.py check
sudo systemctl restart financeiro
```

## 5. Atualizar e subir de novo (depois de git pull)

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

## 6. Backup antes de mexer no banco

```bash
cd "/home/deploy/ControleSMDecor"
./scripts/backup_db.sh
```

**Não aumentar workers do Gunicorn** — SQLite usa só 1 worker.
