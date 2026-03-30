from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from .models import (
    Cliente, Fornecedor, Produto, Material,
    OrdemCompra, CompraMaterial, Venda, ItemVenda, Pagamento,
    PagamentoFornecedor, LogSistema, PerfilUsuario,
)

User = get_user_model()

# Configuração simples para ver o ID nos produtos
@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ('id', 'nome', 'preco_venda')

@admin.register(OrdemCompra)
class OrdemCompraAdmin(admin.ModelAdmin):
    list_display = ('id', 'fornecedor', 'data_compra', 'cancelada')
    list_filter = ('fornecedor', 'cancelada')

@admin.register(CompraMaterial)
class CompraMaterialAdmin(admin.ModelAdmin):
    list_display = ('data_compra', 'ordem', 'material', 'fornecedor', 'quantidade', 'total_compra')
    list_filter = ('fornecedor', 'data_compra')

# Registro das outras tabelas
admin.site.register(Cliente)
admin.site.register(Fornecedor)
admin.site.register(Material)
admin.site.register(Venda)
admin.site.register(ItemVenda)
admin.site.register(Pagamento)
admin.site.register(PagamentoFornecedor)
admin.site.register(LogSistema)


@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'nome_exibicao')
    list_filter = ('role',)
    search_fields = ('user__username', 'nome_exibicao')