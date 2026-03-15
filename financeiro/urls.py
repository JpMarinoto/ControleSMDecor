from django.urls import path
from . import views

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('logs/', views.exibir_logs, name='lista_logs'),
    path('caixa/', views.gerir_caixa, name='gerir_caixa'),
    
    path('clientes/', views.lista_clientes, name='lista_clientes'),
    path('clientes/novo/', views.novo_cliente, name='novo_cliente'),
    path('clientes/detalhe/<int:cliente_id>/', views.detalhe_cliente, name='detalhe_cliente'),
    path('clientes/detalhe/<int:cliente_id>/relatorio/', views.relatorio_vendas_cliente, name='relatorio_vendas_cliente'),
    path('clientes/editar/<int:id>/', views.editar_cliente, name='editar_cliente'),
    path('clientes/excluir/<int:id>/', views.excluir_cliente, name='excluir_cliente'),
    
    path('fornecedores/', views.lista_fornecedores, name='lista_fornecedores'),
    path('fornecedores/novo/', views.novo_fornecedor, name='novo_fornecedor'),
    path('fornecedores/detalhe/<int:id>/', views.detalhe_fornecedor, name='detalhe_fornecedor'),
    path('fornecedores/detalhe/<int:id>/pagar/', views.pagar_fornecedor, name='pagar_fornecedor'),
    path('fornecedores/compra/<int:id>/', views.detalhe_compra, name='detalhe_compra'),
    path('fornecedores/editar/<int:id>/', views.editar_fornecedor, name='editar_fornecedor'),
    path('fornecedores/excluir/<int:id>/', views.excluir_fornecedor, name='excluir_fornecedor'),
    
    path('materiais/', views.lista_materiais, name='lista_materiais'),
    path('materiais/novo/', views.cadastrar_material, name='cadastrar_material'),
    path('materiais/editar/<int:id>/', views.editar_material, name='editar_material'),
    path('materiais/excluir/<int:id>/', views.excluir_material, name='excluir_material'),
    
    path('categorias/', views.lista_categorias, name='lista_categorias'),
    path('categorias/nova/', views.nova_categoria, name='nova_categoria'),
    path('categorias/editar/<int:id>/', views.editar_categoria, name='editar_categoria'),
    path('categorias/excluir/<int:id>/', views.excluir_categoria, name='excluir_categoria'),
    
    path('produtos/', views.lista_produtos, name='lista_produtos'),
    path('produtos/novo/', views.novo_produto, name='novo_produto'),
    path('produtos/editar/<int:id>/', views.editar_produto, name='editar_produto'),
    path('produtos/excluir/<int:id>/', views.excluir_produto, name='excluir_produto'),
    
    path('vendas/nova/', views.registrar_venda, name='registrar_venda'),
    path('vendas/<int:id>/', views.detalhe_venda, name='detalhe_venda'),
    path('vendas/<int:id>/editar/', views.editar_venda, name='editar_venda'),
    path('vendas/<int:id>/excluir/', views.excluir_venda, name='excluir_venda'),
    path('compras/nova/', views.registrar_compra, name='registrar_compra'),

    path('movimentacoes/', views.lista_movimentacoes, name='lista_movimentacoes'),
    path('movimentacoes/nova/', views.nova_movimentacao, name='nova_movimentacao'),
    path('estoque/', views.estoque_ajuste, name='estoque_ajuste'),
    path('estoque/lancar/', views.estoque_ajuste_lancar, name='estoque_ajuste_lancar'),

    path('dividas-gerais/', views.lista_dividas_gerais, name='lista_dividas_gerais'),
    path('dividas-gerais/nova/', views.nova_divida_geral, name='nova_divida_geral'),
    path('dividas-gerais/editar/<int:id>/', views.editar_divida_geral, name='editar_divida_geral'),
    path('dividas-gerais/excluir/<int:id>/', views.excluir_divida_geral, name='excluir_divida_geral'),

    path('outros-a-receber/', views.lista_outros_a_receber, name='lista_outros_a_receber'),
    path('outros-a-receber/novo/', views.novo_outros_a_receber, name='novo_outros_a_receber'),
    path('outros-a-receber/editar/<int:id>/', views.editar_outros_a_receber, name='editar_outros_a_receber'),
    path('outros-a-receber/excluir/<int:id>/', views.excluir_outros_a_receber, name='excluir_outros_a_receber'),

    path('conta-banco/', views.conta_banco, name='conta_banco'),
    path('conta-banco/criar/', views.conta_banco_criar, name='conta_banco_criar'),
    path('conta-banco/<int:id>/atualizar-saldo/', views.conta_banco_atualizar_saldo, name='conta_banco_atualizar_saldo'),
    path('conta-banco/<int:id>/movimento/', views.conta_banco_movimento, name='conta_banco_movimento'),
    path('conta-banco/<int:id>/excluir/', views.conta_banco_excluir, name='conta_banco_excluir'),

    path('api/buscar-produto/', views.buscar_produto_por_id, name='api_buscar_produto'),
    path('api/produtos/', views.api_produtos_por_categoria, name='api_produtos_por_categoria'),
    path('api/ultimo-preco-cliente-categoria/', views.api_ultimo_preco_cliente_categoria, name='api_ultimo_preco_cliente_categoria'),
    path('api/buscar-ultimo-custo/', views.buscar_ultimo_custo, name='api_buscar_ultimo_custo'),
]