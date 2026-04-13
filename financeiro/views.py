from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.db.models import Sum
from django.contrib import messages
from django.utils import timezone
from datetime import timedelta, datetime
from decimal import Decimal
import json
from .models import (
    Cliente,
    Fornecedor,
    Produto,
    Material,
    CompraMaterial,
    Venda,
    ItemVenda,
    Pagamento,
    PagamentoFornecedor,
    MovimentoCaixa,
    AjusteEstoque,
    DividaGeral,
    OutrosAReceber,
    ContaBanco,
    MovimentoBanco,
    LogSistema,
    CategoriaProduto,
)

def _registrar_log(request, acao, tabela, detalhes=''):
    """Registra uma ação no log do sistema (auditoria)."""
    user = getattr(request, 'user', None)
    usuario = user if (user and getattr(user, 'is_authenticated', False)) else None
    LogSistema.objects.create(usuario=usuario, acao=acao, tabela=tabela, detalhes=detalhes or '')


# --- DASHBOARD ---
def dashboard(request):
    total_a_receber = sum(Decimal(str(c.saldo_devedor)) for c in Cliente.objects.all())
    total_entradas = Pagamento.objects.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    total_saidas = PagamentoFornecedor.objects.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    mov_saidas = MovimentoCaixa.objects.filter(tipo='saida').aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    saldo_caixa = total_entradas - total_saidas - mov_saidas
    total_dividas_fornecedores = sum(Decimal(str(f.saldo_devedor)) for f in Fornecedor.objects.all())
    dividas_gerais = DividaGeral.objects.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    total_outros_a_receber = OutrosAReceber.objects.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    saldo_banco = ContaBanco.objects.aggregate(Sum('saldo_atual'))['saldo_atual__sum'] or Decimal('0')
    valor_estoque = sum(
        (m.estoque_atual or 0) * (m.preco_unitario_base or 0)
        for m in Material.objects.all()
    )
    saldo_geral = saldo_caixa + total_a_receber + total_outros_a_receber + saldo_banco - total_dividas_fornecedores - dividas_gerais

    # Diário Finanças: últimos 14 dias com entradas, saídas e saldo acumulado
    hoje = timezone.now().date()
    diario = []
    saldo_acum = saldo_caixa
    for i in range(13, -1, -1):
        dia = hoje - timedelta(days=i)
        entradas = Pagamento.objects.filter(data_pagamento=dia).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        saidas = PagamentoFornecedor.objects.filter(data_pagamento__date=dia).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        saidas += MovimentoCaixa.objects.filter(tipo='saida', data__date=dia).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        saldo_dia = entradas - saidas
        saldo_acum -= saldo_dia  # ao percorrer do mais recente ao mais antigo, subtraímos para achar o saldo no início do período
        diario.append({
            'data': dia,
            'entradas': entradas,
            'saidas': saidas,
            'saldo_dia': saldo_dia,
        })
    # recalcular saldo acumulado do mais antigo ao mais recente
    saldo_acum = saldo_caixa - sum(d['saldo_dia'] for d in diario)
    for d in diario:
        saldo_acum += d['saldo_dia']
        d['saldo_acumulado'] = saldo_acum

    # Estoque: materiais com quantidade e valor total
    estoque_lista = []
    for m in Material.objects.all().order_by('nome'):
        total_item = (m.estoque_atual or 0) * (m.preco_unitario_base or 0)
        estoque_lista.append({
            'material': m,
            'quantidade': m.estoque_atual or 0,
            'valor_unit': m.preco_unitario_base or 0,
            'total': total_item,
        })
    soma_estoque = sum(e['total'] for e in estoque_lista)

    # A Receber: clientes com dívida > 0
    clientes_a_receber = [{'nome': c.nome, 'valor': c.saldo_devedor, 'id': c.id} for c in Cliente.objects.all() if c.saldo_devedor > 0]
    clientes_a_receber.sort(key=lambda x: x['valor'], reverse=True)

    # A Pagar: fornecedores com dívida > 0
    fornecedores_a_pagar = [{'nome': f.nome, 'valor': f.saldo_devedor, 'id': f.id} for f in Fornecedor.objects.all() if f.saldo_devedor > 0]
    fornecedores_a_pagar.sort(key=lambda x: x['valor'], reverse=True)

    # Histórico de saídas: PagamentoFornecedor + MovimentoCaixa (saída), ordenado por data
    historico_saidas = []
    for p in PagamentoFornecedor.objects.select_related('fornecedor').order_by('-data_pagamento')[:50]:
        historico_saidas.append({'data': p.data_pagamento, 'descricao': f'Pagamento a {p.fornecedor.nome}', 'valor': p.valor})
    for m in MovimentoCaixa.objects.filter(tipo='saida').order_by('-data')[:50]:
        historico_saidas.append({'data': m.data, 'descricao': m.descricao, 'valor': m.valor})
    historico_saidas.sort(key=lambda x: x['data'], reverse=True)
    historico_saidas = historico_saidas[:80]

    # Últimos pagamentos (entradas recebidas de clientes)
    ultimos_pagamentos = []
    for p in Pagamento.objects.select_related('cliente').order_by('-data_pagamento')[:25]:
        ultimos_pagamentos.append({'data': p.data_pagamento, 'descricao': f'Recebido de {p.cliente.nome}', 'valor': p.valor})

    # Série semanal: saldo caixa ao fim de cada semana (últimas 10 semanas, domingo)
    saldo_semanal_series = []
    for s in range(9, -1, -1):
        # Fim da semana = domingo; hoje pode ser qualquer dia
        fim_semana = hoje - timedelta(days=hoje.weekday() + 1 + s * 7)
        if fim_semana > hoje:
            continue
        entradas_ate = Pagamento.objects.filter(data_pagamento__lte=fim_semana).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        saidas_ate = PagamentoFornecedor.objects.filter(data_pagamento__date__lte=fim_semana).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        mov_ate = MovimentoCaixa.objects.filter(tipo='saida', data__date__lte=fim_semana).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
        saldo_fim = entradas_ate - saidas_ate - mov_ate
        saldo_semanal_series.append({
            'data': fim_semana,
            'label': fim_semana.strftime('%d/%m'),
            'valor': saldo_fim,
        })

    # Detalhe do dia (para o modal "Ver" do diário)
    dia_detalhe = None
    dia_param = request.GET.get('dia')
    if dia_param:
        try:
            dia_ver = datetime.strptime(dia_param, '%Y-%m-%d').date()
            entradas_ate = Pagamento.objects.filter(data_pagamento__lte=dia_ver).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
            saidas_ate = PagamentoFornecedor.objects.filter(data_pagamento__date__lte=dia_ver).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
            mov_ate = MovimentoCaixa.objects.filter(tipo='saida', data__date__lte=dia_ver).aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
            saldo_fim_dia = entradas_ate - saidas_ate - mov_ate
            # Saldo "total" do dia = saldo caixa fim do dia + (valores atuais dos outros, pois não temos histórico)
            saldo_total_dia = saldo_fim_dia + total_a_receber + total_outros_a_receber + saldo_banco - total_dividas_fornecedores - dividas_gerais
            dia_detalhe = {
                'data': dia_ver,
                'saldo_fim_dia': saldo_fim_dia,
                'saldo_total_dia': saldo_total_dia,
                'dividas_gerais': dividas_gerais,
                'total_a_receber': total_a_receber,
                'total_outros_a_receber': total_outros_a_receber,
                'saldo_banco': saldo_banco,
                'valor_estoque': valor_estoque,
            }
        except (ValueError, TypeError):
            pass

    context = {
        'total_a_receber': total_a_receber,
        'total_a_receber_js': float(total_a_receber),
        'total_entradas': total_entradas,
        'total_saidas': total_saidas,
        'saldo_caixa': saldo_caixa,
        'total_dividas_fornecedores': total_dividas_fornecedores,
        'total_dividas_fornecedores_js': float(total_dividas_fornecedores),
        'dividas_gerais': dividas_gerais,
        'total_outros_a_receber': total_outros_a_receber,
        'saldo_banco': saldo_banco,
        'valor_estoque': valor_estoque,
        'saldo_geral': saldo_geral,
        'diario_financas': diario,
        'estoque_lista': estoque_lista,
        'soma_estoque': soma_estoque,
        'clientes_a_receber': clientes_a_receber,
        'fornecedores_a_pagar': fornecedores_a_pagar,
        'historico_saidas': historico_saidas,
        'ultimos_pagamentos': ultimos_pagamentos,
        'saldo_semanal_series': saldo_semanal_series,
        'saldo_semanal_labels_js': json.dumps([s['label'] for s in saldo_semanal_series]),
        'saldo_semanal_valores_js': json.dumps([float(s['valor']) for s in saldo_semanal_series]),
        'dia_detalhe': dia_detalhe,
    }
    return render(request, 'financeiro/dashboard.html', context)

# --- CLIENTES ---
def lista_clientes(request):
    return render(request, 'financeiro/clientes/lista.html', {'clientes': Cliente.objects.all()})

def novo_cliente(request):
    if request.method == 'POST':
        Cliente.objects.create(
            nome=request.POST.get('nome'),
            telefone=request.POST.get('telefone'),
            cpf=request.POST.get('cpf'),
            cnpj=request.POST.get('cnpj'),
            endereco=request.POST.get('endereco')
        )
        _registrar_log(request, 'Criar', 'Cliente', f'Cliente criado: {request.POST.get("nome")}')
        return redirect('lista_clientes')
    return render(request, 'financeiro/clientes/form.html')

def detalhe_cliente(request, cliente_id):
    from django.utils import timezone
    from datetime import timedelta
    cliente = get_object_or_404(Cliente, id=cliente_id)
    vendas = Venda.objects.filter(cliente=cliente).select_related('cliente').prefetch_related('itens__produto').order_by('-data_venda')
    hoje = timezone.now().date()
    periodo = request.GET.get('periodo', '')
    data_inicio = request.GET.get('data_inicio', '')
    data_fim = request.GET.get('data_fim', '')
    if periodo == 'dia':
        vendas = vendas.filter(data_venda__date=hoje)
    elif periodo == 'semana':
        inicio = hoje - timedelta(days=7)
        vendas = vendas.filter(data_venda__date__gte=inicio, data_venda__date__lte=hoje)
    elif periodo == 'mes':
        inicio = hoje - timedelta(days=30)
        vendas = vendas.filter(data_venda__date__gte=inicio, data_venda__date__lte=hoje)
    elif periodo == 'personalizado' and data_inicio and data_fim:
        try:
            from datetime import datetime
            di = datetime.strptime(data_inicio, '%Y-%m-%d').date()
            df = datetime.strptime(data_fim, '%Y-%m-%d').date()
            vendas = vendas.filter(data_venda__date__gte=di, data_venda__date__lte=df)
        except ValueError:
            pass
    pagamentos = Pagamento.objects.filter(cliente=cliente).order_by('-data_pagamento')
    return render(request, 'financeiro/clientes/detalhe.html', {
        'cliente': cliente,
        'vendas': vendas,
        'pagamentos': pagamentos,
        'periodo': periodo,
        'data_inicio': data_inicio,
        'data_fim': data_fim,
    })


def relatorio_vendas_cliente(request, cliente_id):
    """Relatório / fechamento das vendas selecionadas (ex.: fechamento semanal/quinzenal)."""
    cliente = get_object_or_404(Cliente, id=cliente_id)
    ids_param = request.GET.get('vendas', '')
    if not ids_param:
        return redirect('detalhe_cliente', cliente_id=cliente_id)
    try:
        ids = [int(x.strip()) for x in ids_param.split(',') if x.strip()]
    except ValueError:
        return redirect('detalhe_cliente', cliente_id=cliente_id)
    vendas_qs = (
        Venda.objects.filter(cliente=cliente, id__in=ids)
        .prefetch_related('itens__produto')
        .order_by('data_venda')
    )
    vendas = list(vendas_qs)
    total_periodo = sum(v.total_venda for v in vendas)
    data_inicio = vendas[0].data_venda.date() if vendas else None
    data_fim = vendas[-1].data_venda.date() if vendas else None
    return render(request, 'financeiro/clientes/relatorio_vendas.html', {
        'cliente': cliente,
        'vendas': vendas,
        'total_periodo': total_periodo,
        'data_inicio': data_inicio,
        'data_fim': data_fim,
    })


def editar_cliente(request, id):
    cliente = get_object_or_404(Cliente, id=id)
    if request.method == 'POST':
        cliente.nome = request.POST.get('nome'); cliente.cpf = request.POST.get('cpf')
        cliente.cnpj = request.POST.get('cnpj'); cliente.telefone = request.POST.get('telefone')
        cliente.endereco = request.POST.get('endereco'); cliente.save()
        _registrar_log(request, 'Editar', 'Cliente', f'Cliente ID {id} atualizado: {cliente.nome}')
        return redirect('lista_clientes')
    return render(request, 'financeiro/clientes/form.html', {'cliente': cliente})

def excluir_cliente(request, id):
    cliente = get_object_or_404(Cliente, id=id)
    nome = cliente.nome
    cliente.delete()
    _registrar_log(request, 'Excluir', 'Cliente', f'Cliente excluído: {nome} (ID {id})')
    return redirect('lista_clientes')

# --- FORNECEDORES ---
def lista_fornecedores(request):
    return render(request, 'financeiro/fornecedores/lista.html', {'fornecedores': Fornecedor.objects.all()})

def novo_fornecedor(request):
    if request.method == 'POST':
        nome = request.POST.get('nome')
        Fornecedor.objects.create(
            nome=nome,
            cpf=request.POST.get('cpf') or None,
            cnpj=request.POST.get('cnpj') or None,
            telefone=request.POST.get('telefone', ''),
        )
        _registrar_log(request, 'Criar', 'Fornecedor', f'Fornecedor criado: {nome}')
        return redirect('lista_fornecedores')
    return render(request, 'financeiro/fornecedores/form.html')


def editar_fornecedor(request, id):
    fornecedor = get_object_or_404(Fornecedor, id=id)
    if request.method == 'POST':
        fornecedor.nome = request.POST.get('nome')
        fornecedor.cpf = request.POST.get('cpf') or None
        fornecedor.cnpj = request.POST.get('cnpj') or None
        fornecedor.telefone = request.POST.get('telefone', '')
        fornecedor.save()
        _registrar_log(request, 'Editar', 'Fornecedor', f'Fornecedor ID {id} atualizado: {fornecedor.nome}')
        return redirect('lista_fornecedores')
    return render(request, 'financeiro/fornecedores/form.html', {'fornecedor': fornecedor})


def excluir_fornecedor(request, id):
    fornecedor = get_object_or_404(Fornecedor, id=id)
    nome = fornecedor.nome
    fornecedor.delete()
    _registrar_log(request, 'Excluir', 'Fornecedor', f'Fornecedor excluído: {nome} (ID {id})')
    return redirect('lista_fornecedores')

def detalhe_fornecedor(request, id):
    from datetime import datetime
    fornecedor = get_object_or_404(Fornecedor, id=id)
    compras = CompraMaterial.objects.filter(fornecedor=fornecedor).select_related('material').order_by('-data_compra')
    pagamentos = PagamentoFornecedor.objects.filter(fornecedor=fornecedor).order_by('-data_pagamento')
    periodo = request.GET.get('periodo', '')
    data_inicio = request.GET.get('data_inicio', '')
    data_fim = request.GET.get('data_fim', '')
    hoje = timezone.now().date()
    if periodo == 'dia':
        compras = compras.filter(data_compra__date=hoje)
    elif periodo == 'semana':
        inicio = hoje - timedelta(days=7)
        compras = compras.filter(data_compra__date__gte=inicio, data_compra__date__lte=hoje)
    elif periodo == 'mes':
        inicio = hoje - timedelta(days=30)
        compras = compras.filter(data_compra__date__gte=inicio, data_compra__date__lte=hoje)
    elif periodo == 'personalizado' and data_inicio and data_fim:
        try:
            di = datetime.strptime(data_inicio, '%Y-%m-%d').date()
            df = datetime.strptime(data_fim, '%Y-%m-%d').date()
            compras = compras.filter(data_compra__date__gte=di, data_compra__date__lte=df)
        except ValueError:
            pass
    total_compras_periodo = sum(c.total_compra for c in compras)
    return render(request, 'financeiro/fornecedores/detalhe.html', {
        'fornecedor': fornecedor,
        'compras': compras,
        'pagamentos': pagamentos,
        'periodo': periodo,
        'data_inicio': data_inicio,
        'data_fim': data_fim,
        'total_compras_periodo': total_compras_periodo,
    })


def pagar_fornecedor(request, id):
    """Registra um pagamento ao fornecedor (dar baixa na dívida)."""
    if request.method != 'POST':
        return redirect('detalhe_fornecedor', id=id)
    fornecedor = get_object_or_404(Fornecedor, id=id)
    valor = request.POST.get('valor')
    if valor:
        try:
            v = Decimal(str(valor).replace(',', '.'))
            if v > 0:
                PagamentoFornecedor.objects.create(fornecedor=fornecedor, valor=v)
                _registrar_log(request, 'Pagamento (fornecedor)', 'Caixa', f'Fornecedor {fornecedor.nome} (ID {id}) - R$ {v}')
        except (ValueError, TypeError):
            pass
    return redirect('detalhe_fornecedor', id=id)


def detalhe_compra(request, id):
    """Visualizar uma compra (registro único de CompraMaterial)."""
    compra = get_object_or_404(CompraMaterial.objects.select_related('material', 'fornecedor'), id=id)
    return render(request, 'financeiro/fornecedores/detalhe_compra.html', {'compra': compra})

# --- MATERIAIS ---
def lista_materiais(request):
    materiais = Material.objects.select_related('categoria', 'fornecedor_padrao').all()
    return render(request, 'financeiro/materiais/lista.html', {'materiais': materiais})

def cadastrar_material(request):
    if request.method == 'POST':
        nome = request.POST.get('nome')
        Material.objects.create(
            nome=nome,
            categoria_id=request.POST.get('categoria') or None,
            fornecedor_padrao_id=request.POST.get('fornecedor') or None,
            preco_unitario_base=request.POST.get('preco') or 0,
            estoque_atual=request.POST.get('estoque_atual') or request.POST.get('estoque_inicial') or 0
        )
        _registrar_log(request, 'Criar', 'Material', f'Material criado: {nome}')
        return redirect('lista_materiais')
    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_MATERIAL).order_by('nome')
    return render(request, 'financeiro/materiais/form.html', {
        'fornecedores': Fornecedor.objects.all(),
        'categorias': categorias,
    })


def editar_material(request, id):
    material = get_object_or_404(Material, id=id)
    if request.method == 'POST':
        material.nome = request.POST.get('nome')
        material.categoria_id = request.POST.get('categoria') or None
        material.fornecedor_padrao_id = request.POST.get('fornecedor') or None
        material.preco_unitario_base = request.POST.get('preco') or 0
        material.estoque_atual = request.POST.get('estoque_atual') or material.estoque_atual
        material.save()
        _registrar_log(request, 'Editar', 'Material', f'Material ID {id} atualizado: {material.nome}')
        return redirect('lista_materiais')
    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_MATERIAL).order_by('nome')
    context = {
        'material': material,
        'fornecedores': Fornecedor.objects.all(),
        'categorias': categorias,
    }
    return render(request, 'financeiro/materiais/form.html', context)


def excluir_material(request, id):
    material = get_object_or_404(Material, id=id)
    nome = material.nome
    material.delete()
    _registrar_log(request, 'Excluir', 'Material', f'Material excluído: {nome} (ID {id})')
    return redirect('lista_materiais')

def buscar_ultimo_custo(request):
    material_id = request.GET.get('material_id')
    fornecedor_id = request.GET.get('fornecedor_id')
    ultima = CompraMaterial.objects.filter(material_id=material_id, fornecedor_id=fornecedor_id).order_by('-data_compra').first()
    if ultima:
        return JsonResponse({'sucesso': True, 'preco': str(ultima.preco_no_dia)})
    try:
        m = Material.objects.get(id=material_id)
        return JsonResponse({'sucesso': True, 'preco': str(m.preco_unitario_base)})
    except: return JsonResponse({'sucesso': False})

# --- CATEGORIAS DE PRODUTO ---
def lista_categorias(request):
    categorias = CategoriaProduto.objects.all().order_by('nome')
    return render(request, 'financeiro/categorias/lista.html', {'categorias': categorias})


def nova_categoria(request):
    if request.method == 'POST':
        nome = request.POST.get('nome')
        tipo = request.POST.get('tipo', CategoriaProduto.TIPO_PRODUTO)
        descricao = request.POST.get('descricao')
        CategoriaProduto.objects.create(nome=nome, tipo=tipo, descricao=descricao)
        _registrar_log(request, 'Criar', 'Categoria', f'Categoria criada: {nome} (tipo: {tipo})')
        return redirect('lista_categorias')

    return render(request, 'financeiro/categorias/form.html')


def editar_categoria(request, id):
    categoria = get_object_or_404(CategoriaProduto, id=id)
    if request.method == 'POST':
        categoria.nome = request.POST.get('nome')
        categoria.tipo = request.POST.get('tipo', CategoriaProduto.TIPO_PRODUTO)
        categoria.descricao = request.POST.get('descricao')
        categoria.save()
        _registrar_log(request, 'Editar', 'Categoria', f'Categoria ID {id} atualizada: {categoria.nome}')
        return redirect('lista_categorias')

    return render(request, 'financeiro/categorias/form.html', {'categoria': categoria})


def excluir_categoria(request, id):
    categoria = get_object_or_404(CategoriaProduto, id=id)
    nome = categoria.nome
    categoria.delete()
    _registrar_log(request, 'Excluir', 'Categoria', f'Categoria excluída: {nome} (ID {id})')
    return redirect('lista_categorias')

# --- PRODUTOS ---
def lista_produtos(request):
    produtos = Produto.objects.select_related('categoria').filter(ativo=True).order_by('nome')
    return render(request, 'financeiro/produtos/lista.html', {'produtos': produtos})


def novo_produto(request):
    if request.method == 'POST':
        nome = request.POST.get('nome')
        preco = request.POST.get('preco_venda')
        categoria_id = request.POST.get('categoria') or None

        Produto.objects.create(
            nome=nome,
            preco_venda=preco or 0,
            categoria_id=categoria_id,
        )
        _registrar_log(request, 'Criar', 'Produto', f'Produto criado: {nome}')
        return redirect('lista_produtos')

    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_PRODUTO).order_by('nome')
    return render(request, 'financeiro/produtos/form.html', {'categorias': categorias})


def editar_produto(request, id):
    produto = get_object_or_404(Produto, id=id)
    if request.method == 'POST':
        produto.nome = request.POST.get('nome')
        produto.preco_venda = request.POST.get('preco_venda') or 0
        produto.categoria_id = request.POST.get('categoria') or None
        produto.save()
        _registrar_log(request, 'Editar', 'Produto', f'Produto ID {id} atualizado: {produto.nome}')
        return redirect('lista_produtos')

    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_PRODUTO).order_by('nome')
    context = {
        'produto': produto,
        'categorias': categorias,
    }
    return render(request, 'financeiro/produtos/form.html', context)


def excluir_produto(request, id):
    produto = get_object_or_404(Produto, id=id)
    nome = produto.nome
    produto.ativo = False
    produto.save(update_fields=['ativo'])
    _registrar_log(
        request,
        'Excluir',
        'Produto',
        f'Produto removido do cadastro (inativado): {nome} (ID {id})',
    )
    messages.success(
        request,
        'Produto removido do cadastro. Vendas e ordens antigas continuam com o histórico preservado.',
    )
    return redirect('lista_produtos')

def buscar_produto_por_id(request):
    """API para buscar o produto e o preço instantaneamente na tela de venda"""
    prod_id = request.GET.get('id')
    try:
        p = Produto.objects.select_related('categoria').get(id=prod_id)
        if not p.ativo:
            return JsonResponse({'sucesso': False, 'erro': 'Produto inativo no cadastro.'})
        return JsonResponse({
            'sucesso': True,
            'nome': p.nome,
            'preco': str(p.preco_venda),
            'categoria_id': p.categoria_id,
            'categoria': p.categoria.nome if p.categoria else None,
        })
    except Produto.DoesNotExist:
        return JsonResponse({'sucesso': False})


def api_produtos_por_categoria(request):
    """API: lista produtos, opcionalmente filtrados por categoria_id."""
    categoria_id = request.GET.get('categoria_id')
    qs = Produto.objects.select_related('categoria').all().order_by('nome')
    if categoria_id:
        qs = qs.filter(categoria_id=categoria_id)
    lista = [
        {
            'id': p.id,
            'nome': p.nome,
            'preco_venda': str(p.preco_venda),
            'categoria_id': p.categoria_id,
        }
        for p in qs
    ]
    return JsonResponse(lista, safe=False)


def api_ultimo_preco_cliente_categoria(request):
    """API: último preço usado para este cliente nesta categoria (ex.: ripado = mesmo valor por cor)."""
    cliente_id = request.GET.get('cliente_id')
    categoria_id = request.GET.get('categoria_id')
    if not cliente_id or not categoria_id:
        return JsonResponse({'preco': None})
    item = (
        ItemVenda.objects
        .filter(venda__cliente_id=cliente_id, produto__categoria_id=categoria_id)
        .select_related('venda')
        .order_by('-venda__data_venda')
        .first()
    )
    if item:
        return JsonResponse({'preco': str(item.preco_unitario)})
    return JsonResponse({'preco': None})


# --- VENDAS E COMPRAS ---
def registrar_venda(request):
    if request.method == 'POST':
        venda = Venda.objects.create(cliente_id=request.POST.get('cliente'))
        p_ids = request.POST.getlist('produto_id[]')
        qts = request.POST.getlist('quantidade[]')
        precos = request.POST.getlist('preco[]')
        for i in range(len(p_ids)):
            if p_ids[i] and p_ids[i].strip():
                q = qts[i] if i < len(qts) else 1
                pr = precos[i] if i < len(precos) else 0
                produto = Produto.objects.get(pk=int(p_ids[i]))
                ItemVenda.objects.create(
                    venda=venda,
                    produto_id=int(p_ids[i]),
                    quantidade=int(q) or 1,
                    preco_unitario=pr or 0,
                    preco_custo_unitario=produto.preco_custo,
                )
        total = sum((float(precos[i]) if i < len(precos) else 0) * (int(qts[i]) if i < len(qts) else 1) for i in range(len(p_ids)) if p_ids[i] and p_ids[i].strip())
        _registrar_log(request, 'Criar', 'Venda', f'Venda #{venda.id} - Cliente ID {venda.cliente_id} - Total R$ {total:.2f}')
        return redirect('dashboard')
    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_PRODUTO).order_by('nome')
    return render(request, 'financeiro/vendas/form.html', {
        'clientes': Cliente.objects.all(),
        'categorias': categorias,
    })


def detalhe_venda(request, id):
    venda = get_object_or_404(Venda.objects.prefetch_related('itens__produto').select_related('cliente'), id=id)
    return render(request, 'financeiro/vendas/detalhe.html', {'venda': venda})


def editar_venda(request, id):
    venda = get_object_or_404(Venda.objects.prefetch_related('itens__produto').select_related('cliente'), id=id)
    if request.method == 'POST':
        cliente_id = request.POST.get('cliente')
        if cliente_id:
            venda.cliente_id = cliente_id
            venda.save()
        venda.itens.all().delete()
        p_ids = request.POST.getlist('produto_id[]')
        qts = request.POST.getlist('quantidade[]')
        precos = request.POST.getlist('preco[]')
        for i in range(len(p_ids)):
            if p_ids[i] and str(p_ids[i]).strip():
                q = qts[i] if i < len(qts) else 1
                pr = precos[i] if i < len(precos) else 0
                produto = Produto.objects.get(pk=int(p_ids[i]))
                ItemVenda.objects.create(
                    venda=venda,
                    produto_id=int(p_ids[i]),
                    quantidade=int(q) or 1,
                    preco_unitario=pr or 0,
                    preco_custo_unitario=produto.preco_custo,
                )
        _registrar_log(request, 'Editar', 'Venda', f'Venda #{venda.id} atualizada')
        return redirect('detalhe_venda', id=venda.id)
    categorias = CategoriaProduto.objects.filter(tipo=CategoriaProduto.TIPO_PRODUTO).order_by('nome')
    return render(request, 'financeiro/vendas/editar.html', {
        'venda': venda,
        'clientes': Cliente.objects.all(),
        'categorias': categorias,
    })


def excluir_venda(request, id):
    venda = get_object_or_404(Venda, id=id)
    cliente_id = venda.cliente_id
    venda_id = venda.id
    venda.delete()
    _registrar_log(request, 'Excluir', 'Venda', f'Venda #{venda_id} excluída')
    return redirect('detalhe_cliente', cliente_id=cliente_id)


def registrar_compra(request):
    if request.method == 'POST':
        m_id = request.POST.get('material')
        q_td = int(request.POST.get('quantidade'))
        f_id = request.POST.get('fornecedor')
        preco = request.POST.get('preco')
        CompraMaterial.objects.create(material_id=m_id, fornecedor_id=f_id, quantidade=q_td, preco_no_dia=preco)
        mat = Material.objects.get(id=m_id)
        mat.estoque_atual += q_td
        mat.save()
        _registrar_log(request, 'Criar', 'Compra', f'Compra de material ID {m_id} - Qtd {q_td} - Fornecedor ID {f_id} - R$ {preco}')
        return redirect('lista_fornecedores')
    return render(request, 'financeiro/fornecedores/form_compra.html', {'materiais': Material.objects.all(), 'fornecedores': Fornecedor.objects.all()})

# --- MOVIMENTAÇÕES (ENTRADAS/SAÍDAS GENÉRICAS) ---
def lista_movimentacoes(request):
    movimentacoes = MovimentoCaixa.objects.filter(tipo='saida').order_by('-data')[:100]
    return render(request, 'financeiro/movimentacoes/lista.html', {'movimentacoes': movimentacoes})


def nova_movimentacao(request):
    if request.method == 'POST':
        descricao = request.POST.get('descricao', '').strip()
        valor = request.POST.get('valor')
        if descricao and valor:
            try:
                v = Decimal(str(valor).replace(',', '.'))
                if v > 0:
                    MovimentoCaixa.objects.create(tipo='saida', descricao=descricao, valor=v)
                    _registrar_log(request, 'Saída', 'MovimentoCaixa', f'{descricao} - R$ {v}')
            except (ValueError, TypeError):
                pass
        return redirect('lista_movimentacoes')
    return render(request, 'financeiro/movimentacoes/form.html')


# --- ESTOQUE (AJUSTE DE QUANTIDADE) ---
def estoque_ajuste(request):
    """Aba estoque: listar materiais com quantidade e valor; dar entrada ou saída."""
    materiais = Material.objects.all().order_by('nome')
    estoque_lista = []
    for m in materiais:
        total_item = (m.estoque_atual or 0) * (m.preco_unitario_base or 0)
        estoque_lista.append({
            'material': m,
            'quantidade': m.estoque_atual or 0,
            'valor_unit': m.preco_unitario_base or 0,
            'total': total_item,
        })
    soma_estoque = sum(e['total'] for e in estoque_lista)
    return render(request, 'financeiro/estoque/ajuste.html', {
        'estoque_lista': estoque_lista,
        'soma_estoque': soma_estoque,
    })


def estoque_ajuste_lancar(request):
    """Lançar entrada ou saída de estoque para um material."""
    if request.method != 'POST':
        return redirect('estoque_ajuste')
    material_id = request.POST.get('material_id')
    tipo = request.POST.get('tipo')
    quantidade = request.POST.get('quantidade')
    observacao = request.POST.get('observacao', '').strip()
    if not material_id or tipo not in ('entrada', 'saida') or not quantidade:
        return redirect('estoque_ajuste')
    try:
        qty = int(quantidade)
        if qty <= 0:
            return redirect('estoque_ajuste')
        material = get_object_or_404(Material, id=material_id)
        if tipo == 'entrada':
            material.estoque_atual = (material.estoque_atual or 0) + qty
            material.save()
            AjusteEstoque.objects.create(material=material, tipo='entrada', quantidade=qty, observacao=observacao)
            _registrar_log(request, 'Entrada estoque', 'AjusteEstoque', f'{material.nome} +{qty}')
        else:
            atual = material.estoque_atual or 0
            if qty > atual:
                qty = atual
            if qty > 0:
                material.estoque_atual = atual - qty
                material.save()
                AjusteEstoque.objects.create(material=material, tipo='saida', quantidade=qty, observacao=observacao)
                _registrar_log(request, 'Saída estoque', 'AjusteEstoque', f'{material.nome} -{qty}')
    except (ValueError, TypeError):
        pass
    return redirect('estoque_ajuste')


# --- DÍVIDAS GERAIS ---
def lista_dividas_gerais(request):
    dividas = DividaGeral.objects.all().order_by('nome')
    total = dividas.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    return render(request, 'financeiro/dividas_gerais/lista.html', {'dividas': dividas, 'total': total})


def nova_divida_geral(request):
    if request.method == 'POST':
        nome = request.POST.get('nome', '').strip()
        valor = request.POST.get('valor')
        if nome and valor:
            try:
                v = Decimal(str(valor).replace(',', '.'))
                DividaGeral.objects.create(nome=nome, valor=v)
                _registrar_log(request, 'Criar', 'DividaGeral', f'{nome} - R$ {v}')
            except (ValueError, TypeError):
                pass
        return redirect('lista_dividas_gerais')
    return render(request, 'financeiro/dividas_gerais/form.html')


def editar_divida_geral(request, id):
    divida = get_object_or_404(DividaGeral, id=id)
    if request.method == 'POST':
        divida.nome = request.POST.get('nome', '').strip()
        try:
            divida.valor = Decimal(str(request.POST.get('valor', 0)).replace(',', '.'))
            divida.save()
            _registrar_log(request, 'Editar', 'DividaGeral', f'{divida.nome} - R$ {divida.valor}')
        except (ValueError, TypeError):
            pass
        return redirect('lista_dividas_gerais')
    return render(request, 'financeiro/dividas_gerais/form.html', {'divida': divida})


def excluir_divida_geral(request, id):
    divida = get_object_or_404(DividaGeral, id=id)
    nome = divida.nome
    divida.delete()
    _registrar_log(request, 'Excluir', 'DividaGeral', nome)
    return redirect('lista_dividas_gerais')


# --- OUTROS A RECEBER ---
def lista_outros_a_receber(request):
    itens = OutrosAReceber.objects.all().order_by('-data_prevista', '-id')
    total = itens.aggregate(Sum('valor'))['valor__sum'] or Decimal('0')
    return render(request, 'financeiro/outros_a_receber/lista.html', {'itens': itens, 'total': total})


def novo_outros_a_receber(request):
    if request.method == 'POST':
        descricao = request.POST.get('descricao', '').strip()
        valor = request.POST.get('valor')
        data_prevista = request.POST.get('data_prevista') or None
        if descricao and valor:
            try:
                v = Decimal(str(valor).replace(',', '.'))
                d = None
                if data_prevista:
                    from datetime import datetime
                    d = datetime.strptime(data_prevista, '%Y-%m-%d').date()
                OutrosAReceber.objects.create(descricao=descricao, valor=v, data_prevista=d)
                _registrar_log(request, 'Criar', 'OutrosAReceber', f'{descricao} - R$ {v}')
            except (ValueError, TypeError):
                pass
        return redirect('lista_outros_a_receber')
    return render(request, 'financeiro/outros_a_receber/form.html')


def editar_outros_a_receber(request, id):
    item = get_object_or_404(OutrosAReceber, id=id)
    if request.method == 'POST':
        item.descricao = request.POST.get('descricao', '').strip()
        try:
            item.valor = Decimal(str(request.POST.get('valor', 0)).replace(',', '.'))
            item.data_prevista = None
            if request.POST.get('data_prevista'):
                from datetime import datetime
                item.data_prevista = datetime.strptime(request.POST.get('data_prevista'), '%Y-%m-%d').date()
            item.save()
            _registrar_log(request, 'Editar', 'OutrosAReceber', f'{item.descricao}')
        except (ValueError, TypeError):
            pass
        return redirect('lista_outros_a_receber')
    return render(request, 'financeiro/outros_a_receber/form.html', {'item': item})


def excluir_outros_a_receber(request, id):
    item = get_object_or_404(OutrosAReceber, id=id)
    desc = item.descricao
    item.delete()
    _registrar_log(request, 'Excluir', 'OutrosAReceber', desc)
    return redirect('lista_outros_a_receber')


# --- CONTA BANCO ---
def conta_banco(request):
    from django.db.models import Prefetch
    contas = ContaBanco.objects.prefetch_related(
        Prefetch('movimentacoes', queryset=MovimentoBanco.objects.order_by('-data'))
    ).order_by('nome')
    return render(request, 'financeiro/conta_banco/conta_banco.html', {'contas': contas})


def conta_banco_criar(request):
    if request.method == 'POST':
        nome = request.POST.get('nome', '').strip()
        saldo = request.POST.get('saldo_inicial')
        if nome:
            try:
                s = Decimal(str(saldo or 0).replace(',', '.'))
                ContaBanco.objects.create(nome=nome, saldo_atual=s)
                _registrar_log(request, 'Criar', 'ContaBanco', f'{nome} - Saldo R$ {s}')
            except (ValueError, TypeError):
                ContaBanco.objects.create(nome=nome, saldo_atual=0)
            return redirect('conta_banco')
    return redirect('conta_banco')


def conta_banco_atualizar_saldo(request, id):
    if request.method != 'POST':
        return redirect('conta_banco')
    conta = get_object_or_404(ContaBanco, id=id)
    try:
        novo_saldo = Decimal(str(request.POST.get('saldo_atual', 0)).replace(',', '.'))
        conta.saldo_atual = novo_saldo
        conta.save()
        _registrar_log(request, 'Atualizar saldo', 'ContaBanco', f'{conta.nome} = R$ {novo_saldo}')
    except (ValueError, TypeError):
        pass
    return redirect('conta_banco')


def conta_banco_movimento(request, id):
    if request.method != 'POST':
        return redirect('conta_banco')
    conta = get_object_or_404(ContaBanco, id=id)
    tipo = request.POST.get('tipo')
    descricao = request.POST.get('descricao', '').strip()
    valor = request.POST.get('valor')
    if tipo not in ('entrada', 'saida') or not descricao or not valor:
        return redirect('conta_banco')
    try:
        v = Decimal(str(valor).replace(',', '.'))
        if v <= 0:
            return redirect('conta_banco')
        MovimentoBanco.objects.create(conta=conta, tipo=tipo, descricao=descricao, valor=v)
        if tipo == 'entrada':
            conta.saldo_atual += v
        else:
            conta.saldo_atual -= v
        conta.save()
        _registrar_log(request, tipo.capitalize() + ' banco', 'MovimentoBanco', f'{conta.nome} - {descricao} R$ {v}')
    except (ValueError, TypeError):
        pass
    return redirect('conta_banco')


def conta_banco_excluir(request, id):
    conta = get_object_or_404(ContaBanco, id=id)
    nome = conta.nome
    conta.delete()
    _registrar_log(request, 'Excluir', 'ContaBanco', nome)
    return redirect('conta_banco')


# --- CAIXA E LOGS ---
def gerir_caixa(request):
    if request.method == 'POST':
        tipo = request.POST.get('tipo')
        valor = request.POST.get('valor')
        if tipo == 'pagamento_cliente':
            c_id = request.POST.get('cliente')
            Pagamento.objects.create(cliente_id=c_id, valor=valor)
            _registrar_log(request, 'Pagamento (cliente)', 'Caixa', f'Cliente ID {c_id} - R$ {valor}')
        elif tipo == 'pagamento_fornecedor':
            f_id = request.POST.get('fornecedor')
            PagamentoFornecedor.objects.create(fornecedor_id=f_id, valor=valor)
            _registrar_log(request, 'Pagamento (fornecedor)', 'Caixa', f'Fornecedor ID {f_id} - R$ {valor}')
        return redirect('dashboard')
    return render(request, 'financeiro/caixa.html', {'clientes': Cliente.objects.all(), 'fornecedores': Fornecedor.objects.all()})

def exibir_logs(request):
    return render(request, 'financeiro/logs/lista.html', {'logs': LogSistema.objects.all().order_by('-data')})