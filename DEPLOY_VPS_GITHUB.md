# Deploy na VPS via GitHub (Django + React)

Este guia coloca o sistema em producao com:
- `gunicorn` para executar o Django
- `nginx` como proxy reverso e servidor de arquivos estaticos
- build do React (`Financial Control System`) servido no dominio principal
- deploy por `git pull` na VPS

## 1) Preparar o repositorio local e enviar ao GitHub

No seu computador (projeto local):

```bash
git add .
git commit -m "chore: preparar projeto para deploy em VPS"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

Se o remoto `origin` ja existir, use apenas:

```bash
git push
```

## 2) Preparar a VPS (Ubuntu)

Conecte por SSH:

```bash
ssh root@IP_DA_VPS
```

Instale dependencias base:

```bash
apt update && apt upgrade -y
apt install -y python3 python3-venv python3-pip nginx git certbot python3-certbot-nginx
```

Crie usuario de app (recomendado):

```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
```

## 3) Clonar projeto do GitHub na VPS

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO
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

Sugestao minima para producao:

```env
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=COLOQUE_UMA_CHAVE_FORTE_AQUI
DJANGO_ALLOWED_HOSTS=seudominio.com,www.seudominio.com,IP_DA_VPS
DJANGO_CORS_ALLOWED_ORIGINS=https://seudominio.com,https://www.seudominio.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://seudominio.com,https://www.seudominio.com
DJANGO_USE_X_FORWARDED_HOST=True
DJANGO_SECURE_SSL_REDIRECT=True
DJANGO_SECURE_HSTS_SECONDS=31536000
DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS=True
DJANGO_SECURE_HSTS_PRELOAD=False
```

Execute migracoes e estaticos:

```bash
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

## 6) Criar servico systemd do Gunicorn

Crie arquivo:

```bash
sudo nano /etc/systemd/system/financeiro.service
```

Conteudo (ajuste `deploy` e caminho do repo):

```ini
[Unit]
Description=Gunicorn Financeiro Django
After=network.target

[Service]
User=deploy
Group=www-data
WorkingDirectory=/home/deploy/SEU_REPO
EnvironmentFile=/home/deploy/SEU_REPO/.env
ExecStart=/home/deploy/SEU_REPO/.venv/bin/gunicorn core.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable financeiro
sudo systemctl start financeiro
sudo systemctl status financeiro
```

## 7) Configurar Nginx

Crie arquivo:

```bash
sudo nano /etc/nginx/sites-available/financeiro
```

Conteudo (ajuste dominio e caminho):

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    client_max_body_size 20M;

    # Django static (collectstatic)
    location /static/ {
        alias /home/deploy/SEU_REPO/staticfiles/;
    }

    # React build assets
    location /assets/ {
        alias /home/deploy/SEU_REPO/Financial Control System/dist/assets/;
    }

    # API Django
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Demais rotas (SPA + fallback)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative site e valide:

```bash
sudo ln -s /etc/nginx/sites-available/financeiro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 8) Ativar HTTPS (Certbot)

```bash
sudo certbot --nginx -d seudominio.com -d www.seudominio.com
```

Teste renovacao automatica:

```bash
sudo certbot renew --dry-run
```

## 9) Fluxo de atualizacao pelo GitHub (dia a dia)

Sempre que alterar codigo no PC:

```bash
git add .
git commit -m "feat: sua alteracao"
git push
```

Na VPS (deploy):

```bash
cd /home/deploy/SEU_REPO
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd "Financial Control System" && npm install && npm run build && cd ..
sudo systemctl restart financeiro
sudo systemctl reload nginx
```

## 10) Comandos de diagnostico

```bash
sudo systemctl status financeiro
sudo journalctl -u financeiro -n 200 --no-pager
sudo nginx -t
sudo systemctl status nginx
```

Se aparecer erro de host invalido, revise `DJANGO_ALLOWED_HOSTS`.
Se aparecer erro de CORS/CSRF, revise `DJANGO_CORS_ALLOWED_ORIGINS` e `DJANGO_CSRF_TRUSTED_ORIGINS`.
