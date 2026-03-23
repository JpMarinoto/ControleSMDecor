# Deploy na VPS via GitHub (AlmaLinux + Django + React)

Este guia coloca o sistema em producao com:
- `gunicorn` para executar o Django
- `nginx` como proxy reverso
- build do React (`Financial Control System`) servido no dominio principal
- deploy por `git pull` na VPS

## 1) Preparar o repositorio local e enviar ao GitHub

No seu computador (projeto local):

```bash
git add .
git commit -m "chore: preparar projeto para deploy em VPS"
git branch -M main
git push --set-upstream origin main
```

Depois disso, os proximos envios serao somente:

```bash
git push
```

## 2) Preparar a VPS (AlmaLinux)

Conecte por SSH:

```bash
ssh root@IP_DA_VPS
```

Atualize o sistema e instale pacotes base:

```bash
dnf update -y
dnf install -y git nginx python3 python3-pip python3-devel gcc certbot python3-certbot-nginx
```

Instale Node.js 20 (necessario para build do React):

```bash
dnf module reset nodejs -y
dnf module enable nodejs:20 -y
dnf install -y nodejs
```

Crie usuario de deploy (recomendado):

```bash
adduser deploy
passwd deploy
usermod -aG wheel deploy
```

## 3) Clonar projeto do GitHub na VPS

Troque para o usuario deploy:

```bash
su - deploy
```

Clone e entre no projeto:

```bash
git clone https://github.com/JpMarinoto/ControleSMDecor.git
cd ControleSMDecor
```

## 4) Configurar backend (Django)

Crie e ative venv:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Instale dependencias:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Crie `.env`:

```bash
cp .env.example .env
nano .env
```

Exemplo minimo para producao:

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=COLE_AQUI_A_CHAVE_GERADA
DJANGO_ALLOWED_HOSTS=santosmarinoto.com,www.santosmarinoto.com,129.121.53.239
DJANGO_CORS_ALLOWED_ORIGINS=https://santosmarinoto.com,https://www.santosmarinoto.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://santosmarinoto.com,https://www.santosmarinoto.com
DJANGO_USE_X_FORWARDED_HOST=True
DJANGO_SECURE_SSL_REDIRECT=True
DJANGO_SECURE_HSTS_SECONDS=31536000
DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True
DJANGO_SECURE_HSTS_PRELOAD=False
```

Rode checks, migracoes e estaticos:

```bash
python manage.py check --deploy
python manage.py migrate
python manage.py collectstatic --noinput
```

## 5) Build do frontend React

```bash
cd "Financial Control System"
npm install
npm run build
cd ..
```

## 6) SELinux e permissoes (AlmaLinux)

Se o SELinux estiver ativo, permita conexao do Nginx com o Gunicorn:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Ajuste dono/permite leitura dos arquivos:

```bash
sudo chown -R deploy:deploy /home/deploy/ControleSMDecor
sudo chmod -R o+rX /home/deploy/ControleSMDecor/staticfiles
sudo chmod -R o+rX "/home/deploy/ControleSMDecor/Financial Control System/dist"
```

## 7) Criar servico systemd do Gunicorn

Crie arquivo:

```bash
sudo nano /etc/systemd/system/financeiro.service
```

Conteudo:

```ini
[Unit]
Description=Gunicorn Financeiro Django
After=network.target

[Service]
User=deploy
Group=nginx
WorkingDirectory=/home/deploy/ControleSMDecor
EnvironmentFile=/home/deploy/ControleSMDecor/.env
ExecStart=/home/deploy/ControleSMDecor/.venv/bin/gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now financeiro
sudo systemctl status financeiro
```

## 8) Configurar Nginx (AlmaLinux)

Crie arquivo:

```bash
sudo nano /etc/nginx/conf.d/financeiro.conf
```

Conteudo:

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    client_max_body_size 20M;

    location /static/ {
        alias /home/deploy/ControleSMDecor/staticfiles/;
    }

    location /assets/ {
        alias /home/deploy/ControleSMDecor/Financial\ Control\ System/dist/assets/;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Valide e suba o Nginx:

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl restart nginx
```

## 9) Firewall (firewalld)

Abra HTTP/HTTPS:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 10) Ativar HTTPS (Certbot)

Com DNS do dominio apontando para a VPS:

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

Teste renovacao:

```bash
sudo certbot renew --dry-run
```

## 11) Fluxo de atualizacao pelo GitHub (dia a dia)

No seu PC:

```bash
git add .
git commit -m "feat: sua alteracao"
git push
```

Na VPS:

```bash
cd /home/deploy/ControleSMDecor
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd "Financial Control System" && npm install && npm run build && cd ..
sudo systemctl restart financeiro
sudo systemctl reload nginx
```

## 12) Comandos de diagnostico

```bash
cat /etc/os-release
sudo systemctl status financeiro
sudo journalctl -u financeiro -n 200 --no-pager
sudo nginx -t
sudo systemctl status nginx
sudo firewall-cmd --list-all
```

Se aparecer erro de host invalido, revise `DJANGO_ALLOWED_HOSTS`.
Se aparecer erro de CORS/CSRF, revise `DJANGO_CORS_ALLOWED_ORIGINS` e `DJANGO_CSRF_TRUSTED_ORIGINS`.

## 13) Backup diario do banco (SQLite) e restaurar

O banco em producao e o ficheiro `db.sqlite3` na raiz do projeto. O repositorio inclui o script `scripts/backup_db.sh`.

### Instalar ferramenta de backup consistente (recomendado)

```bash
sudo dnf install -y sqlite
```

### Dar permissao de execucao (uma vez)

```bash
chmod +x /home/deploy/ControleSMDecor/scripts/backup_db.sh
```

### Testar manualmente

```bash
/home/deploy/ControleSMDecor/scripts/backup_db.sh
ls -lt /home/deploy/ControleSMDecor/backups/db/
```

As copias ficam em `backups/db/` com nome `db-AAAA-MM-DD_HHMMSS.sqlite3`. Por defeito remove ficheiros com mais de **14 dias** (altere com `export RETENTION_DAYS=30` antes do script ou edite `RETENTION_DAYS` no script).

### Agendar todos os dias (cron, utilizador `deploy`)

```bash
crontab -e
```

Adicione uma linha (ex.: todos os dias as 03:00):

```cron
0 3 * * * /home/deploy/ControleSMDecor/scripts/backup_db.sh >> /home/deploy/ControleSMDecor/backups/backup-cron.log 2>&1
```

### Restaurar o backup de ontem (ou outro dia)

1. Pare o backend para ninguem escrever na base:

```bash
sudo systemctl stop financeiro
```

2. Copie o ficheiro desejado por cima do `db.sqlite3` (ajuste o nome do backup):

```bash
cd /home/deploy/ControleSMDecor
cp -a backups/db/db-2026-03-23_030001.sqlite3 db.sqlite3
sudo chown deploy:deploy db.sqlite3
```

3. Suba o servico:

```bash
sudo systemctl start financeiro
```

Liste backups disponiveis: `ls -lt backups/db/`

**Nota:** Apos `git pull`, confirme que `scripts/backup_db.sh` continua executavel (`chmod +x`).
