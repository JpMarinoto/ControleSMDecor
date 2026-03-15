# 🚀 GUIA RÁPIDO - SM DECOR FINANCEIRO

## ⚡ COMEÇAR AGORA (3 passos)

### Opção A: Usar com LocalStorage (Sem Django)
```bash
# 1. Entrar na pasta do projeto React
cd seu-projeto-react

# 2. Instalar dependências
npm install

# 3. Rodar
npm run dev
```
✅ Pronto! Acesse http://localhost:5173

---

### Opção B: Usar com Django API
```bash
# TERMINAL 1 - Django
cd seu-projeto-django
python manage.py runserver

# TERMINAL 2 - React
cd seu-projeto-react
npm run dev
```
✅ Django: http://localhost:8000
✅ React: http://localhost:5173

---

## 📋 CHECKLIST DE INTEGRAÇÃO

### Backend Django
- [ ] Instalar: `pip install djangorestframework django-cors-headers`
- [ ] Configurar `settings.py` (ver DJANGO_SETUP.md)
- [ ] Criar models, serializers, views (ver DJANGO_SETUP.md)
- [ ] Configurar URLs
- [ ] `python manage.py makemigrations`
- [ ] `python manage.py migrate`
- [ ] `python manage.py createsuperuser`
- [ ] `python manage.py runserver`
- [ ] Testar: http://localhost:8000/api/

### Frontend React
- [ ] Criar arquivo `.env` com `VITE_API_URL=http://localhost:8000/api`
- [ ] Para usar API: adicionar `VITE_USE_API=true` no `.env`
- [ ] `npm install`
- [ ] `npm run dev`
- [ ] Testar: http://localhost:5173

---

## 🎯 ESTRUTURA DO SISTEMA

```
SM DECOR - SISTEMA FINANCEIRO
│
├── 📊 DASHBOARD
│   ├── A Receber (vendas pendentes)
│   ├── A Pagar (compras pendentes)
│   ├── Total Semanal
│   ├── Saldo Total
│   ├── Histórico de Saída
│   ├── Últimos Pagamentos
│   ├── Estatísticas Rápidas
│   └── Contas Bancárias
│
├── 📝 CADASTROS
│   ├── Clientes (Nome, CPF/CNPJ, Telefone, Endereço)
│   ├── Produtos (Categoria, Nome, Preço Inicial)
│   ├── Categorias (Nome, Tipo, Descrição)
│   ├── Fornecedores (Nome/Razão Social, CPF/CNPJ, Telefone, Endereço)
│   ├── Materiais (Nome, Categoria, Fornecedor, Preço Base)
│   └── Contas Bancárias (Nome, Saldo)
│
├── 🛒 COMPRA
│   └── Registro de compras de materiais/produtos
│
├── 💰 VENDA
│   └── Registro de vendas aos clientes
│
└── 📈 TRANSAÇÕES
    └── Gestão completa de receitas e despesas
```

---

## 🔧 COMANDOS ÚTEIS

### Django
```bash
# Criar migrações
python manage.py makemigrations

# Aplicar migrações
python manage.py migrate

# Criar superusuário
python manage.py createsuperuser

# Rodar servidor
python manage.py runserver

# Acessar admin
# http://localhost:8000/admin
```

### React
```bash
# Instalar dependências
npm install

# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview
```

---

## 📂 ARQUIVOS IMPORTANTES

```
PROJETO/
│
├── DJANGO (Backend)
│   ├── settings.py          ← Configurações CORS, REST Framework
│   ├── financeiro/
│   │   ├── models.py       ← 9 models (Cliente, Produto, etc)
│   │   ├── serializers.py  ← Serializers para API
│   │   ├── views.py        ← ViewSets REST
│   │   ├── urls.py         ← Rotas da API
│   │   └── admin.py        ← Painel admin
│   └── manage.py
│
└── REACT (Frontend)
    ├── .env                 ← Configuração da API
    ├── src/
    │   ├── app/
    │   │   ├── pages/      ← Dashboard, Cadastro, Compra, Venda
    │   │   ├── components/ ← Componentes reutilizáveis
    │   │   ├── lib/
    │   │   │   ├── api.ts      ← Conexão com Django
    │   │   │   └── storage.ts  ← LocalStorage ou API
    │   │   └── routes.tsx
    │   └── styles/
    │       └── theme.css   ← Cores azul SM Decor
    └── package.json
```

---

## 🎨 PERSONALIZAÇÃO

### Cores do Sistema
As cores azuis da SM Decor estão em: `/src/styles/theme.css`

Cor principal: `#1e3a5f` (azul escuro)

### Logo
A logo está em: `/src/app/components/Layout.tsx`
Importada como: `figma:asset/8599e829b26e8d629a33cbf7eb7400b7dbc1c879.png`

---

## 📊 ENDPOINTS DA API

Todos os endpoints estão em: `http://localhost:8000/api/`

```
GET/POST    /api/clientes/
GET/PUT/DEL /api/clientes/{id}/

GET/POST    /api/produtos/
GET/PUT/DEL /api/produtos/{id}/

GET/POST    /api/categorias/
GET/PUT/DEL /api/categorias/{id}/

GET/POST    /api/fornecedores/
GET/PUT/DEL /api/fornecedores/{id}/

GET/POST    /api/materiais/
GET/PUT/DEL /api/materiais/{id}/

GET/POST    /api/contas/
GET/PUT/DEL /api/contas/{id}/

GET/POST    /api/vendas/
GET/DEL     /api/vendas/{id}/

GET/POST    /api/compras/
GET/DEL     /api/compras/{id}/

GET/POST    /api/transacoes/
GET/PUT/DEL /api/transacoes/{id}/
```

---

## ❓ DÚVIDAS COMUNS

### Como adicionar autenticação?
Atualmente o sistema está sem autenticação. Para adicionar:
1. Use Django Rest Framework Token/JWT
2. Adicione login no React
3. Envie token em todas as requisições

### Posso usar PostgreSQL?
Sim! No Django `settings.py`, configure:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'smdecor',
        'USER': 'seu_usuario',
        'PASSWORD': 'sua_senha',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

### Como fazer deploy?
- **Frontend**: Vercel, Netlify (conecte o repo GitHub)
- **Backend**: Railway, Heroku, Render
- Atualize `CORS_ALLOWED_ORIGINS` com a URL de produção

---

## 📞 SUPORTE

Documentação completa:
- `/DJANGO_SETUP.md` - Configuração detalhada do Django
- `/REACT_SETUP.md` - Configuração detalhada do React
- `/GUIA_RAPIDO.md` - Este arquivo

**Criado para SM Decor** 🏠✨
Sistema de Controle Financeiro Completo
