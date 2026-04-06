# Como rodar o projeto (front React + backend Django)

**Se aparecer "Build do React não encontrado"** na página inicial, é porque ainda não fizeste o build do frontend. Faz os passos da secção 2 abaixo (entra na pasta `Financial Control System`, corre `npm install` e depois `npm run build`). Precisas do **Node.js** instalado. Enquanto não houver build, podes usar o site em templates em **http://127.0.0.1:8000/legacy/**.

---

## 1. Backend Django

```bash
# Na raiz do projeto (onde está manage.py)
# Se usar ambiente virtual (venv), ative-o primeiro: .\venv\Scripts\Activate.ps1 (PowerShell) ou venv\Scripts\activate (cmd)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

O Django fica em **http://127.0.0.1:8000**. A API usa autenticação por **Token** (tabelas do `rest_framework.authtoken` são criadas pelo `migrate`).

### Dados de teste

Para popular o banco com clientes, fornecedores, produtos, materiais, vendas, compras, etc. (fins de teste):

```bash
python manage.py seed_test_data
```

Para limpar os dados existentes e inserir de novo: `python manage.py seed_test_data --clear`

### Login (Chefe e funcionários)

O sistema exige login. Para criar o **primeiro usuário (Chefe)**, que pode criar e editar funcionários:

```bash
# Na raiz do projeto, com o ambiente virtual ativado
python manage.py migrate
python manage.py criar_mestao --username chefe --password 123456
```

Depois acesse a aplicação, vá em **/login** e entre com esse usuário. O Chefe verá o menu **Usuários**, onde pode criar funcionários e outros chefes e definir permissões.

## 2. Frontend React (Financial Control System)

### Desenvolvimento (front com proxy para a API)

```bash
cd "Financial Control System"
npm install
npm run dev
```

O Vite sobe em **http://localhost:5173** e faz proxy de `/api` para o Django (8000). O Django **tem de estar a correr** em 8000. A autenticação é por **token**: após o login, o frontend guarda o token e envia-o no header `Authorization: Token <token>` em todos os pedidos à API. Não depende de cookies.

**Se der 401/403 na aba Usuários:** faça logout e login de novo como chefe. Confirme que executou `python manage.py criar_mestao --username mestao --password mestao123` e que entra com esse utilizador.

### Build para produção (servir tudo pelo Django)

```bash
cd "Financial Control System"
npm run build
```

Depois, com o Django a correr (`python manage.py runserver`), abre **http://127.0.0.1:8000/** — o site que aparece é o **React** (Financial Control System). O Django serve o build e a API.

## URLs

| URL | O que é |
|-----|---------|
| `/` | Frontend React (Dashboard, Venda, Compra, etc.) |
| `/cadastro`, `/venda`, `/compra`, `/transacoes` | Rotas do React |
| `/api/clientes/`, `/api/vendas/`, etc. | API REST (backend) |
| `/admin/` | Painel admin do Django |
| `/legacy/` | Site antigo em templates Django (se precisar) |

## Resumo

- **Substituição do front:** O front dos templates foi substituído pelo **Financial Control System** na raiz (`/`).
- **Ligações back–front:** O React usa a API em `/api/` (clientes, produtos, vendas, compras, transações, contas, materiais, categorias, fornecedores).
- **Dados:** O Dashboard e as transações já carregam e gravam no Django; as outras páginas (Venda, Compra, Cadastro) podem continuar a usar localStorage em paralelo até serem totalmente ligadas à API.


VPS

Produção: **https://santosmarinoto.com** e **https://www.santosmarinoto.com** (se o DNS e o Nginx tiverem os dois).

ssh deploy@129.121.53.239

cd "/home/deploy/ControleSMDecor"
source .venv/bin/activate

git pull

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput

cd "Financial Control System"
npm install
npm run build
cd ..
sudo systemctl restart financeiro

---

## VPS: apontar o domínio para a zona do WHM (nameservers)

Se o site abre pelo **IP da VPS** mas **não pelo domínio**, ou o `nslookup` mostra **outro IP**, quase sempre o domínio ainda usa **dns3/dns4.hostgator.com.br** em vez dos **NS da VPS**. A zona correta está no **WHM → DNS Zone Manager**; o registo do domínio tem de **perguntar a esses NS**.

### 1) Anotar os nameservers da VPS (no WHM)

1. Entra no **WHM** (`https://IP-DA-VPS:2087`).
2. **DNS Functions** → **DNS Zone Manager** → escolhe **santosmarinoto.com**.
3. No topo da zona vês os **NS**, por exemplo:
   - `ns1.vps-XXXXX.vpsbr-XXXXX.vpshostgator.com.br`
   - `ns2.vps-XXXXX.vpsbr-XXXXX.vpshostgator.com.br`  
   Copia **exatamente** estes dois nomes (os teus podem diferir do exemplo).

### 2) Alterar os DNS no sítio onde o domínio está gerido

**A) Domínio na área de cliente HostGator (Brasil)**

1. Login em **https://financeiro.hostgator.com.br** (ou portal que usas).
2. **Domínios** → seleciona **santosmarinoto.com** → **Gerenciar** / **Configurar domínio**.
3. Procura **Servidores DNS** / **Nameservers** / **Alterar DNS**.
4. Escolhe opção do tipo **Personalizado** / **Outro** / **Usar meus próprios nameservers** (não uses só “padrão HostGator” se isso voltar a dns3/dns4).
5. Cola o **Servidor 1** = `ns1.vps-....vpshostgator.com.br` e **Servidor 2** = `ns2.vps-....vpshostgator.com.br`.
6. Guarda / confirma.

**B) Domínio no Registro.br (titularidade .br)**

1. **https://registro.br** → login → **Meus domínios** → **santosmarinoto.com**.
2. **DNS** ou **Alterar servidores DNS**.
3. Marca **usar DNS dos servidores** (ou equivalente) e indica os **dois** hostnames do passo 1.
4. Confirma; a alteração no .br pode levar algum tempo a propagar.

### 3) Cloudflare (se aparecer “domínio na Cloudflare”)

- No painel **Cloudflare** do domínio, em **DNS**, o tipo **A** de `@` (e `www` se for A ou CNAME adequado) deve apontar para **`129.121.53.239`** (ou desativa proxy “nuvem laranja” temporariamente para testar, **DNS only**).
- Se **não** usares Cloudflare à frente, garante que a alteração de **nameservers** no passo 2 não fica a mandar tudo para dns3/dns4 enquanto queres usar só a VPS.

### 4) Esperar e testar

- Propagação: de **minutos a 48 h** (TTL e caches).
- No Windows: `ipconfig /flushdns` e `nslookup santosmarinoto.com`.
- Teste direto aos NS da VPS: `nslookup santosmarinoto.com ns1.vps-....vpshostgator.com.br` → deve responder **129.121.53.239**.

### 5) Na VPS (depois do DNS certo)

- Nginx com `server_name santosmarinoto.com www.santosmarinoto.com`.
- `.env`: `DJANGO_ALLOWED_HOSTS` inclui os dois hostnames e o IP.
- `sudo systemctl reload nginx` e `sudo systemctl restart financeiro` se mudaste `.env`.
