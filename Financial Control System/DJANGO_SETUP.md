# CONFIGURAÇÃO DJANGO - SM DECOR FINANCEIRO

## 1. SETTINGS.PY

Adicione ao seu `settings.py`:

```python
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Apps de terceiros
    'rest_framework',
    'corsheaders',
    
    # Sua app (exemplo: 'financeiro')
    'financeiro',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # ADICIONAR AQUI (antes do CommonMiddleware)
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS - Permitir requisições do React
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite (React)
    "http://127.0.0.1:5173",
]

CORS_ALLOW_CREDENTIALS = True

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100
}
```

---

## 2. MODELS.PY

Crie ou atualize `financeiro/models.py`:

```python
from django.db import models

class Cliente(models.Model):
    nome = models.CharField(max_length=200)
    cpf_cnpj = models.CharField(max_length=20, blank=True)
    telefone = models.CharField(max_length=20, blank=True)
    endereco = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.nome


class Categoria(models.Model):
    TIPO_CHOICES = [
        ('produto', 'Produto'),
        ('material', 'Material'),
    ]
    nome = models.CharField(max_length=100)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    descricao = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return f"{self.nome} ({self.get_tipo_display()})"


class Produto(models.Model):
    categoria = models.CharField(max_length=100)
    nome = models.CharField(max_length=200)
    preco_inicial = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome


class Fornecedor(models.Model):
    nome_razao_social = models.CharField(max_length=200)
    cpf_cnpj = models.CharField(max_length=20, blank=True)
    telefone = models.CharField(max_length=20, blank=True)
    endereco = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome_razao_social']

    def __str__(self):
        return self.nome_razao_social


class Material(models.Model):
    nome = models.CharField(max_length=200)
    categoria = models.CharField(max_length=100)
    fornecedor = models.CharField(max_length=200)
    preco_unitario_base = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome


class ContaBancaria(models.Model):
    nome = models.CharField(max_length=200)
    saldo = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome


class Venda(models.Model):
    cliente_nome = models.CharField(max_length=200)
    produto_nome = models.CharField(max_length=200)
    quantidade = models.IntegerField()
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    forma_pagamento = models.CharField(max_length=50)
    data = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-created_at']

    def __str__(self):
        return f"Venda {self.produto_nome} - {self.cliente_nome}"


class Compra(models.Model):
    produto_nome = models.CharField(max_length=200)
    fornecedor = models.CharField(max_length=200)
    quantidade = models.IntegerField()
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    data = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data', '-created_at']

    def __str__(self):
        return f"Compra {self.produto_nome} - {self.fornecedor}"


class Transacao(models.Model):
    TIPO_CHOICES = [
        ('income', 'Receita'),
        ('expense', 'Despesa'),
    ]
    description = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    type = models.CharField(max_length=10, choices=TIPO_CHOICES)
    category = models.CharField(max_length=100)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.get_type_display()} - {self.description}"
```

---

## 3. SERIALIZERS.PY

Crie `financeiro/serializers.py`:

```python
from rest_framework import serializers
from .models import (
    Cliente, Categoria, Produto, Fornecedor, 
    Material, ContaBancaria, Venda, Compra, Transacao
)

class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = '__all__'


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = '__all__'


class ProdutoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Produto
        fields = '__all__'


class FornecedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fornecedor
        fields = '__all__'


class MaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = Material
        fields = '__all__'


class ContaBancariaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContaBancaria
        fields = '__all__'


class VendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venda
        fields = '__all__'


class CompraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Compra
        fields = '__all__'


class TransacaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transacao
        fields = '__all__'
```

---

## 4. VIEWS.PY

Crie ou atualize `financeiro/views.py`:

```python
from rest_framework import viewsets
from .models import (
    Cliente, Categoria, Produto, Fornecedor,
    Material, ContaBancaria, Venda, Compra, Transacao
)
from .serializers import (
    ClienteSerializer, CategoriaSerializer, ProdutoSerializer,
    FornecedorSerializer, MaterialSerializer, ContaBancariaSerializer,
    VendaSerializer, CompraSerializer, TransacaoSerializer
)


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer


class CategoriaViewSet(viewsets.ModelViewSet):
    queryset = Categoria.objects.all()
    serializer_class = CategoriaSerializer


class ProdutoViewSet(viewsets.ModelViewSet):
    queryset = Produto.objects.all()
    serializer_class = ProdutoSerializer


class FornecedorViewSet(viewsets.ModelViewSet):
    queryset = Fornecedor.objects.all()
    serializer_class = FornecedorSerializer


class MaterialViewSet(viewsets.ModelViewSet):
    queryset = Material.objects.all()
    serializer_class = MaterialSerializer


class ContaBancariaViewSet(viewsets.ModelViewSet):
    queryset = ContaBancaria.objects.all()
    serializer_class = ContaBancariaSerializer


class VendaViewSet(viewsets.ModelViewSet):
    queryset = Venda.objects.all()
    serializer_class = VendaSerializer


class CompraViewSet(viewsets.ModelViewSet):
    queryset = Compra.objects.all()
    serializer_class = CompraSerializer


class TransacaoViewSet(viewsets.ModelViewSet):
    queryset = Transacao.objects.all()
    serializer_class = TransacaoSerializer
```

---

## 5. URLS.PY

Crie `financeiro/urls.py`:

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClienteViewSet, CategoriaViewSet, ProdutoViewSet,
    FornecedorViewSet, MaterialViewSet, ContaBancariaViewSet,
    VendaViewSet, CompraViewSet, TransacaoViewSet
)

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet)
router.register(r'categorias', CategoriaViewSet)
router.register(r'produtos', ProdutoViewSet)
router.register(r'fornecedores', FornecedorViewSet)
router.register(r'materiais', MaterialViewSet)
router.register(r'contas', ContaBancariaViewSet)
router.register(r'vendas', VendaViewSet)
router.register(r'compras', CompraViewSet)
router.register(r'transacoes', TransacaoViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
```

E no `urls.py` principal do projeto:

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('financeiro.urls')),  # Suas APIs
]
```

---

## 6. ADMIN.PY

Crie `financeiro/admin.py` para gerenciar pelo Django Admin:

```python
from django.contrib import admin
from .models import (
    Cliente, Categoria, Produto, Fornecedor,
    Material, ContaBancaria, Venda, Compra, Transacao
)

@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ['nome', 'cpf_cnpj', 'telefone', 'created_at']
    search_fields = ['nome', 'cpf_cnpj']

@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display = ['nome', 'tipo', 'created_at']
    list_filter = ['tipo']

@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ['nome', 'categoria', 'preco_inicial', 'created_at']
    search_fields = ['nome']

@admin.register(Fornecedor)
class FornecedorAdmin(admin.ModelAdmin):
    list_display = ['nome_razao_social', 'cpf_cnpj', 'telefone', 'created_at']
    search_fields = ['nome_razao_social']

@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    list_display = ['nome', 'categoria', 'fornecedor', 'preco_unitario_base']

@admin.register(ContaBancaria)
class ContaBancariaAdmin(admin.ModelAdmin):
    list_display = ['nome', 'saldo', 'created_at']

@admin.register(Venda)
class VendaAdmin(admin.ModelAdmin):
    list_display = ['produto_nome', 'cliente_nome', 'quantidade', 'total', 'data']
    list_filter = ['data', 'forma_pagamento']

@admin.register(Compra)
class CompraAdmin(admin.ModelAdmin):
    list_display = ['produto_nome', 'fornecedor', 'quantidade', 'total', 'data']
    list_filter = ['data']

@admin.register(Transacao)
class TransacaoAdmin(admin.ModelAdmin):
    list_display = ['description', 'type', 'amount', 'category', 'date']
    list_filter = ['type', 'category', 'date']
```

---

## 7. MIGRATIONS

Execute os comandos:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser  # Criar usuário admin
python manage.py runserver
```

---

## 8. TESTAR A API

Acesse no navegador:
- http://localhost:8000/api/ - Ver todas as rotas
- http://localhost:8000/api/clientes/ - Lista de clientes
- http://localhost:8000/api/produtos/ - Lista de produtos
- http://localhost:8000/admin/ - Painel administrativo

A API está funcionando! ✅
