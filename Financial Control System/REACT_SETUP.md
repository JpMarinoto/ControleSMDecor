# CONFIGURAÇÃO FRONTEND REACT - SM DECOR FINANCEIRO

## MODO DE OPERAÇÃO

O frontend pode funcionar em **2 modos**:

### 1. Modo LocalStorage (Padrão - Atual)
- Dados salvos no navegador
- Não precisa de backend
- Funciona offline
- Dados são perdidos ao limpar o navegador

### 2. Modo API (Django Backend)
- Dados salvos no banco de dados
- Precisa do Django rodando
- Dados persistentes
- Múltiplos usuários

---

## COMO ALTERNAR ENTRE OS MODOS

### Para usar LocalStorage (já está assim):
No arquivo `.env`:
```env
VITE_API_URL=http://localhost:8000/api
# VITE_USE_API não definido ou false
```

### Para usar API Django:
No arquivo `.env`:
```env
VITE_API_URL=http://localhost:8000/api
VITE_USE_API=true
```

---

## EXECUTAR O PROJETO

### 1. Instalar dependências (primeira vez):
```bash
npm install
```

### 2. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```

O React estará rodando em: **http://localhost:5173**

---

## ESTRUTURA DO PROJETO

```
src/
├── app/
│   ├── components/        # Componentes reutilizáveis
│   │   ├── ui/           # Componentes de UI (Button, Card, etc)
│   │   ├── Layout.tsx    # Layout principal com header e navegação
│   │   ├── StatCard.tsx  # Card de estatísticas
│   │   └── TransactionDialog.tsx
│   │
│   ├── pages/            # Páginas da aplicação
│   │   ├── Dashboard.tsx # Dashboard principal
│   │   ├── Cadastro.tsx  # Cadastros (Clientes, Produtos, etc)
│   │   ├── Compra.tsx    # Registro de compras
│   │   ├── Venda.tsx     # Registro de vendas
│   │   └── Transactions.tsx
│   │
│   ├── lib/              # Bibliotecas e utilitários
│   │   ├── api.ts        # Comunicação com API Django
│   │   └── storage.ts    # Gerenciamento de dados (localStorage ou API)
│   │
│   ├── routes.tsx        # Configuração de rotas
│   └── App.tsx           # Componente principal
│
├── styles/               # Estilos globais
│   ├── theme.css        # Tema com cores da SM Decor
│   └── tailwind.css     # Configuração do Tailwind
│
└── .env                 # Variáveis de ambiente
```

---

## CONECTAR COM DJANGO

### Passo 1: Certifique-se que o Django está rodando
```bash
# No terminal do Django
python manage.py runserver
```

O Django deve estar em: **http://localhost:8000**

### Passo 2: Ativar modo API no React

Edite o arquivo `.env`:
```env
VITE_API_URL=http://localhost:8000/api
VITE_USE_API=true
```

### Passo 3: Reiniciar o React
```bash
# Ctrl+C para parar
npm run dev
```

### Passo 4: Testar a conexão

1. Abra o React: http://localhost:5173
2. Tente cadastrar um cliente
3. Verifique no Django Admin se foi criado: http://localhost:8000/admin

---

## MIGRANDO DADOS DO LOCALSTORAGE PARA API

Se você já tem dados no localStorage e quer migrar para o Django:

### Opção 1: Exportar/Importar manualmente
1. Abra o Console do navegador (F12)
2. Execute:
```javascript
// Exportar dados
const data = {
  clientes: JSON.parse(localStorage.getItem('sm_decor_clientes') || '[]'),
  produtos: JSON.parse(localStorage.getItem('sm_decor_produtos') || '[]'),
  categorias: JSON.parse(localStorage.getItem('sm_decor_categorias') || '[]'),
  fornecedores: JSON.parse(localStorage.getItem('sm_decor_fornecedores') || '[]'),
  materiais: JSON.parse(localStorage.getItem('sm_decor_materiais') || '[]'),
  contas: JSON.parse(localStorage.getItem('sm_decor_contas') || '[]'),
  vendas: JSON.parse(localStorage.getItem('sm_decor_vendas') || '[]'),
  compras: JSON.parse(localStorage.getItem('sm_decor_compras') || '[]'),
  transacoes: JSON.parse(localStorage.getItem('financial_transactions') || '[]'),
};

// Copie o resultado
console.log(JSON.stringify(data, null, 2));
```

3. Depois, com VITE_USE_API=true, use o Django Admin para importar

### Opção 2: Script de migração
(Pode ser criado se necessário)

---

## BUILD PARA PRODUÇÃO

Quando estiver pronto para deploy:

```bash
npm run build
```

Isso criará uma pasta `dist/` com os arquivos otimizados.

### Opções de deploy:

**1. Servir pelo Django (integrado)**
- Copie os arquivos de `dist/` para a pasta `static/` do Django
- Configure o Django para servir o index.html

**2. Deploy separado (recomendado)**
- React: Vercel, Netlify, AWS S3
- Django: Heroku, Railway, AWS EC2
- Mais flexível e escalável

---

## TROUBLESHOOTING

### Erro de CORS
Se aparecer erro "blocked by CORS policy":
- Verifique se `django-cors-headers` está instalado
- Confirme que `http://localhost:5173` está em `CORS_ALLOWED_ORIGINS` no Django

### API não responde
- Verifique se o Django está rodando: http://localhost:8000/api
- Confirme a URL no `.env`: `VITE_API_URL=http://localhost:8000/api`

### Dados não aparecem
- Verifique qual modo está ativo (localStorage ou API)
- Se API: certifique-se que `VITE_USE_API=true` no `.env`
- Se localStorage: dados estão no navegador (F12 > Application > Local Storage)

---

## PRÓXIMOS PASSOS

✅ Backend Django configurado
✅ Frontend React funcionando
✅ Comunicação API pronta

Agora você pode:
1. Começar a usar com localStorage (já funciona)
2. Configurar Django e ativar modo API
3. Adicionar autenticação de usuários
4. Fazer deploy em produção
