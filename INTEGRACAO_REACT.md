# Como colocar o front React (Figma) neste projeto

Este projeto Django já está preparado para servir um frontend em **React**. O design que tens no Figma podes implementar no frontend React e ligá-lo ao backend Django.

---

## Estrutura

- **`frontend/`** — aplicação React (Vite). Aqui implementas as telas do Figma.
- **Django** — continua a servir as páginas atuais em `/` (dashboard, clientes, etc.) e passa a servir o **React em `/app/`** depois do build.

---

## 1. Instalar e correr o React (desenvolvimento)

```bash
cd frontend
npm install
npm run dev
```

O Vite sobe em **http://localhost:5173**. Podes desenvolver aí o layout e as telas baseadas no Figma.

**Proxy:** No `vite.config.js` está configurado proxy de `/api` para `http://127.0.0.1:8000`. Quando criares a API no Django, as chamadas a `/api/...` a partir do React vão para o Django.

---

## 2. Trazer o design do Figma para o React

- **Figma → código:** No Figma podes usar plugins como **“Figma to Code”** ou **“Anima”** para exportar HTML/CSS (depois adaptas para React), ou inspecionar medidas/cores e recriar à mão.
- **Componentes:** Cria pastas como `frontend/src/components`, `frontend/src/pages` e monta as páginas (Dashboard, Clientes, etc.) com base nos teus frames do Figma.
- **Estilos:** Podes usar CSS modules, Tailwind ou o que preferires. Se exportares CSS do Figma, podes colar em ficheiros `.module.css` ou globais.

---

## 3. Build e servir pelo Django

Quando o front estiver pronto (ou para testar):

```bash
cd frontend
npm run build
```

Isto gera a pasta **`frontend/dist/`**. O Django está configurado para:

- Servir os ficheiros estáticos do build em **`/app/assets/`**
- Devolver **`index.html`** para qualquer URL em **`/app/`** (ex.: `/app/`, `/app/dashboard`)

Com o servidor Django a correr:

```bash
python manage.py runserver
```

abre no browser: **http://127.0.0.1:8000/app/**  
Verás o frontend React. As páginas atuais do Django (dashboard em `/`, clientes, etc.) continuam iguais.

---

## 4. API no Django para o React

Hoje o projeto usa views que devolvem HTML. Para o React consumir dados, precisas de **endpoints em JSON**.

**Opção A – Django REST Framework (recomendado)**

```bash
pip install djangorestframework
```

Em `core/settings.py`:

```python
INSTALLED_APPS = [
    ...
    'rest_framework',
    'financeiro'
]
```

Depois crias, por exemplo, `financeiro/serializers.py` e `financeiro/api_views.py` com endpoints como:

- `GET /api/dashboard/` — totais para o dashboard
- `GET /api/clientes/` — lista de clientes
- etc.

No React, usas `fetch('/api/dashboard/')` ou uma biblioteca (axios, react-query) com a base URL `/api`.

**Opção B – Views Django que devolvem JsonResponse**

Em `financeiro/views.py` podes ter views que façam `return JsonResponse({...})` e em `urls.py` registar em rotas como `/api/...`. O React chama essas URLs e usa o JSON.

---

## 5. Resumo de URLs

| Onde       | URL exemplo        | O que é                          |
|-----------|---------------------|-----------------------------------|
| Django    | `/`                 | Site atual (templates)           |
| Django    | `/dashboard/`       | Dashboard atual                   |
| React     | `/app/`             | Frontend React (SPA)              |
| React     | `/app/dashboard`     | Rota dentro do React             |
| API (a criar) | `/api/...`      | Endpoints JSON para o React      |

---

## 6. Trocar totalmente para o React (opcional)

Se um dia quiseres que a **página inicial** seja o React em vez do Django:

- No `core/urls.py` podes colocar as rotas do React (e da API) **antes** de `path('', include('financeiro.urls'))`.
- Ou usar um reverse proxy (ex.: Nginx) que envie `/` para o build do React e `/api/` para o Django.

Por agora, manter o Django em `/` e o React em `/app/` permite usar os dois ao mesmo tempo e migrar aos poucos.

---

## Comandos úteis

```bash
# Desenvolvimento React (sozinho)
cd frontend && npm run dev

# Desenvolvimento Django (site atual)
python manage.py runserver

# Build React e testar tudo pelo Django
cd frontend && npm run build
python manage.py runserver
# Abrir http://127.0.0.1:8000/app/
```

Se quiseres, no próximo passo podemos: criar um primeiro endpoint de API (ex. dashboard) no Django e uma página no React que o consuma, ou ajustar a estrutura de pastas do `frontend/` às tuas telas do Figma.
