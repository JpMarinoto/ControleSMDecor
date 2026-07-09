# Homologação Shopee — cópia virgem em /homolog/

Objetivo: ambiente **separado da produção**, com banco vazio e usuário de teste,
para preencher o Console da Open Platform (Product URL, credenciais, screenshots, OAuth).

## URLs

| Uso | URL |
|-----|-----|
| App (login) | https://santosmarinoto.com/homolog/ |
| Callback OAuth | https://santosmarinoto.com/homolog/api/shopee/oauth/callback/ |
| Domínio no Console (teste) | `https://santosmarinoto.com` |

## Usuário de teste (padrão do script)

- Usuário: `shopee_test`
- Senha: `ShopeeTest123!`

(Altere no script ou rode `criar_mestao` de novo na pasta homolog.)

## Instalação na VPS (uma vez)

### 1. Código atualizado na produção (git pull) e depois:

```bash
ssh deploy@129.121.53.239
cd /home/deploy/ControleSMDecor
git pull
chmod +x scripts/setup_homolog_shopee.sh
./scripts/setup_homolog_shopee.sh
```

### 2. Nginx — incluir trecho de `deploy/nginx/homolog-location.conf`

Edite o conf do site (ex.: `/etc/nginx/conf.d/...` ou `sites-available/...`)
**dentro** do `server { ... }` de `santosmarinoto.com`, **antes** do `location /`:

```bash
sudo nano /etc/nginx/conf.d/SEU_ARQUIVO.conf
# cole o conteúdo de deploy/nginx/homolog-location.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Console Shopee — preencher

- **Product URL:** `https://santosmarinoto.com/homolog/`
- **Usuário / senha de teste:** `shopee_test` / `ShopeeTest123!`
- **Breve introdução:** texto do ERP (controle financeiro + integração Shopee)
- **Screenshots:** prints do login + aba Shopee
- **Domínio redirect de teste:** `https://santosmarinoto.com` (já cadastrado)

### 4. No app homolog — loja Shopee

1. Login em `/homolog/`
2. Aba Shopee → Adicionar loja
3. Ambiente: **Sandbox**
4. Partner ID / Key de **teste**
5. Redirect URL:
   `https://santosmarinoto.com/homolog/api/shopee/oauth/callback/`
6. Conectar Loja

## Atualizar homolog depois de mudanças no código

```bash
cd /home/deploy/ControleSMDecor
git pull
./scripts/setup_homolog_shopee.sh
```

O script **apaga o banco homolog** e recria virgem. Produção (`db.sqlite3` e `financeiro`) **não é alterada**.

## Segurança

- Homolog é público na internet — use só dados fictícios.
- Troque a senha `shopee_test` se preferir.
- Não copie o `db.sqlite3` de produção para a pasta homolog.
