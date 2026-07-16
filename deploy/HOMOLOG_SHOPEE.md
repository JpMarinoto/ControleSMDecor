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

### 2. Nginx — instalar bloco `/homolog/` (obrigatório)

Sem este passo, `https://santosmarinoto.com/homolog/` cai no app de **produção**
e o React redireciona para `/login` (parece “proteção de sessão”, mas não é).

```bash
chmod +x scripts/install_homolog_nginx.sh
./scripts/install_homolog_nginx.sh
```

O script acha o conf do domínio, insere o `include` do snippet
`deploy/nginx/homolog-location.conf` **antes** de `location /`, testa e dá reload.

Conferência:
```bash
curl -s https://santosmarinoto.com/homolog/ | head -n 15
# deve ter: src="/homolog/assets/...
# NÃO pode ter: src="/assets/...
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
