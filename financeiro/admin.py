from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from .models import (
    Cliente, Fornecedor, Produto,
    OrdemCompra, CompraProduto, Venda, ItemVenda, Pagamento,
    PagamentoFornecedor, LogSistema, PerfilUsuario,
)

User = get_user_model()


@admin.register(Produto)
class ProdutoAdmin(admin.ModelAdmin):
    list_display = ('id', 'nome', 'eh_insumo', 'revenda', 'fabricado', 'fornecedor', 'preco_custo', 'preco_venda')
    list_filter = ('eh_insumo', 'revenda', 'fabricado', 'ativo')


@admin.register(OrdemCompra)
class OrdemCompraAdmin(admin.ModelAdmin):
    list_display = ('id', 'fornecedor', 'numero_venda_fornecedor', 'data_compra', 'cancelada')
    list_filter = ('fornecedor', 'cancelada')


@admin.register(CompraProduto)
class CompraProdutoAdmin(admin.ModelAdmin):
    list_display = ('data_compra', 'ordem', 'produto', 'fornecedor', 'quantidade', 'total_compra')
    list_filter = ('fornecedor', 'data_compra')


admin.site.register(Cliente)
admin.site.register(Fornecedor)
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
