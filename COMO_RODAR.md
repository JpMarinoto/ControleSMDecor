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
# Na raiz do projeto, com o ambiente virtual ativado
python manage.py seed_test_data
```

Para limpar os dados existentes e inserir de novo: `python manage.py seed_test_data --clear`

### Login (Chefe e funcionários)

O sistema exige login. Para criar o **primeiro usuário (Chefe)**, que pode criar e editar funcionários:

```bash
# Na raiz do projeto, com o ambiente virtual ativado
python manage.py migrate
python manage.py criar_mestao --username mestao --password sua_senha
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
ssh deploy@129.121.53.239

cd /home/deploy/ControleSMDecor
source .venv/bin/activate

git pull

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput

cd "/home/deploy/ControleSMDecor/Financial Control System"
npm install
npm run build
cd /home/deploy/ControleSMDecor

cd "/home/deploy/ControleSMDecor/Financial Control System" && npm run build && cd ..
sudo systemctl restart financeiro