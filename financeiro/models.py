from django.db import models
from django.utils import timezone
from decimal import Decimal
from django.contrib.auth.models import User

# ==========================================
# 1. PESSOAS (CLIENTES E FORNECEDORES)
# ==========================================

class Cliente(models.Model):
    ativo = models.BooleanField(default=True, verbose_name="Ativo")
    nome = models.CharField(max_length=200)
    cpf = models.CharField(max_length=14, blank=True, null=True, verbose_name="CPF")
    cnpj = models.CharField(max_length=18, blank=True, null=True, verbose_name="CNPJ")
    telefone = models.CharField(max_length=20, blank=True)
    chave_pix = models.CharField(max_length=100, blank=True, null=True, verbose_name="Chave PIX")
    endereco = models.TextField(blank=True, null=True, verbose_name="Endereço (legado)")
    logradouro = models.CharField(max_length=200, blank=True, null=True, verbose_name="Rua")
    bairro = models.CharField(max_length=100, blank=True, null=True)
    numero = models.CharField(max_length=20, blank=True, null=True, verbose_name="Número")
    ponto_referencia = models.CharField(max_length=200, blank=True, null=True, verbose_name="Ponto de referência")
    cep = models.CharField(max_length=9, blank=True, null=True)
    cidade = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=2, blank=True, null=True, verbose_name="UF")

    def __str__(self):
        return self.nome

    @property
    def saldo_devedor(self):
        # Soma total das vendas não canceladas menos o que ele já pagou
        total_vendas = sum(
            v.total_venda for v in self.vendas.filter(cancelada=False)
        )
        total_pagos = sum(p.valor for p in self.pagamentos.all())
        return Decimal(total_vendas) - Decimal(total_pagos)

class Fornecedor(models.Model):
    ativo = models.BooleanField(default=True, verbose_name="Ativo")
    nome = models.CharField(max_length=200)
    cpf = models.CharField(max_length=14, blank=True, null=True, verbose_name='CPF')
    cnpj = models.CharField(max_length=18, blank=True, null=True, verbose_name='CNPJ')
    telefone = models.CharField(max_length=20, blank=True)
    chave_pix = models.CharField(max_length=100, blank=True, null=True, verbose_name="Chave PIX")
    endereco = models.TextField(blank=True, null=True, verbose_name="Endereço (legado)")
    logradouro = models.CharField(max_length=200, blank=True, null=True, verbose_name="Rua")
    bairro = models.CharField(max_length=100, blank=True, null=True)
    numero = models.CharField(max_length=20, blank=True, null=True, verbose_name="Número")
    ponto_referencia = models.CharField(max_length=200, blank=True, null=True, verbose_name="Ponto de referência")
    cep = models.CharField(max_length=9, blank=True, null=True)
    cidade = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=2, blank=True, null=True, verbose_name="UF")

    def __str__(self):
        return self.nome

    @property
    def saldo_devedor(self):
        # Materiais (related_name compras) + produtos de revenda (compras_produtos)
        z = Decimal("0")

        def _conta_linha(c):
            if c.ordem_id is None:
                return True
            return not c.ordem.cancelada

        total_m = sum(
            (c.total_compra for c in self.compras.select_related('ordem').all() if _conta_linha(c)),
            z,
        )
        total_p = sum(
            (c.total_compra for c in self.compras_produtos.select_related('ordem').all() if _conta_linha(c)),
            z,
        )
        total_compras = total_m + total_p
        total_pagos = sum((p.valor for p in self.pagamentos_feitos.all()), z)
        return total_compras - total_pagos

# ==========================================
# 2. PRODUTOS (PARA VENDA) E MATERIAIS (COMPRA)
# ==========================================

class Produto(models.Model):
    ativo = models.BooleanField(default=True, verbose_name="Ativo")
    nome = models.CharField(max_length=200)
    categoria = models.ForeignKey(
        'CategoriaProduto',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='produtos'
    )
    revenda = models.BooleanField(default=False, verbose_name="Revenda")
    fabricado = models.BooleanField(default=False, verbose_name="Fabricado")
    fornecedor = models.ForeignKey(
        Fornecedor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='produtos',
    )
    preco_custo = models.DecimalField(max_digits=14, decimal_places=4, default=0.00)
    mao_obra_unitaria = models.DecimalField(max_digits=14, decimal_places=4, default=0.00)
    margem_lucro_percent = models.DecimalField(max_digits=10, decimal_places=4, default=0.00)
    preco_venda = models.DecimalField(max_digits=14, decimal_places=4, default=0.00)
    descricao = models.TextField(blank=True, null=True)
    estoque_atual = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"[{self.id}] {self.nome}"

class Material(models.Model):
    nome = models.CharField(max_length=200)
    categoria = models.ForeignKey(
        'CategoriaProduto',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='materiais',
        limit_choices_to={'tipo': 'material'},
    )
    fornecedor_padrao = models.ForeignKey(Fornecedor, on_delete=models.SET_NULL, null=True, blank=True)
    preco_unitario_base = models.DecimalField(max_digits=12, decimal_places=4)
    preco_fabricacao = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Opcional: preço usado só no custo de insumos. Compras e estoque usam preco_unitario_base.",
    )
    estoque_atual = models.PositiveIntegerField(default=0)

    def preco_para_insumo(self):
        """Custo unitário do material na composição de produtos fabricados."""
        if self.preco_fabricacao is not None:
            return self.preco_fabricacao
        return self.preco_unitario_base

    def __str__(self):
        return self.nome


class ProdutoInsumo(models.Model):
    """Materiais necessários para fabricar um produto e sua quantidade por unidade."""
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE, related_name='insumos')
    material = models.ForeignKey(Material, on_delete=models.CASCADE)
    quantidade = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    class Meta:
        unique_together = [('produto', 'material')]

    def __str__(self):
        return f"{self.produto.nome} - {self.material.nome} ({self.quantidade})"

# ==========================================
# 3. TRANSAÇÕES DE VENDA (CLIENTES)
# ==========================================

class Venda(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='vendas')
    data_lancamento = models.DateTimeField(
        default=timezone.now,
        verbose_name='Data de lançamento',
        help_text='Momento em que a venda foi registrada no sistema (não altera com a data da venda).',
    )
    data_venda = models.DateTimeField(
        default=timezone.now,
        verbose_name='Data da venda',
        help_text='Data da operação de venda (pode ser ajustada após salvar).',
    )
    cancelada = models.BooleanField(default=False, verbose_name="Cancelada")
    observacao = models.TextField(blank=True, verbose_name="Observação")
    marcada_paga = models.BooleanField(
        default=False,
        verbose_name="Marcada como paga",
        help_text="Controle manual no detalhe do cliente; não substitui pagamentos lançados.",
    )

    def __str__(self):
        return f"Venda {self.id} - {self.cliente.nome}"

    @property
    def total_venda(self):
        return sum(item.total_item for item in self.itens.all())

class ItemVenda(models.Model):
    """Item da venda: preço e quantidade são snapshot no momento da venda (alterar Produto.preco_venda depois não muda linhas antigas)."""
    venda = models.ForeignKey(Venda, on_delete=models.CASCADE, related_name='itens')
    produto = models.ForeignKey(Produto, on_delete=models.PROTECT)
    quantidade = models.PositiveIntegerField(default=1)
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    preco_custo_unitario = models.DecimalField(
        max_digits=14,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name='Custo unitário (snapshot)',
        help_text='Custo do produto no momento da venda; usado no relatório de lucros.',
    )

    def save(self, *args, **kwargs):
        if self.preco_custo_unitario is None and self.produto_id:
            pc = Produto.objects.filter(pk=self.produto_id).values_list('preco_custo', flat=True).first()
            self.preco_custo_unitario = pc if pc is not None else Decimal('0')
        super().save(*args, **kwargs)

    @property
    def total_item(self):
        return self.quantidade * self.preco_unitario

class Pagamento(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='pagamentos')
    valor = models.DecimalField(max_digits=10, decimal_places=2)
    data_pagamento = models.DateField(default=timezone.now)
    metodo = models.CharField(max_length=50, default='Pix')
    observacao = models.CharField(max_length=255, blank=True)
    conta = models.ForeignKey('financeiro.ContaBanco', on_delete=models.SET_NULL, null=True, blank=True, related_name='pagamentos_cliente')


class PrecoClienteProduto(models.Model):
    """Preço específico que um cliente paga por um produto (cadastrado pelo chefe)."""
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='precos_produtos')
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE, related_name='precos_por_cliente')
    preco = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        unique_together = [('cliente', 'produto')]
        verbose_name = 'Preço cliente × produto'
        verbose_name_plural = 'Preços cliente × produto'

    def __str__(self):
        return f"{self.cliente.nome} — {self.produto.nome}: R$ {self.preco}"


class PrecificacaoShopee(models.Model):
    """Planilha de precificação Shopee (chefe); persiste no banco com o restante do sistema."""

    nome = models.CharField(max_length=200, unique=True)
    mes_referencia = models.CharField(max_length=7, blank=True, default="")
    nf_percent = models.CharField(max_length=20, default="70")
    imposto_percent = models.CharField(max_length=20, default="10")
    linhas = models.JSONField(default=list)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-atualizado_em"]
        verbose_name = "Precificação Shopee"
        verbose_name_plural = "Precificações Shopee"

    def __str__(self):
        return self.nome


# ==========================================
# 4. TRANSAÇÕES DE COMPRA (FORNECEDORES)
# ==========================================

class OrdemCompra(models.Model):
    """Ordem de compra (uma compra com N itens), como Venda com ItemVenda."""
    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.CASCADE, related_name='ordens_compra')
    data_lancamento = models.DateTimeField(
        default=timezone.now,
        verbose_name='Data de lançamento',
        help_text='Momento em que a ordem foi registrada no sistema.',
    )
    data_compra = models.DateTimeField(
        default=timezone.now,
        verbose_name='Data da compra',
        help_text='Data da operação de compra (pode ser ajustada após salvar).',
    )
    cancelada = models.BooleanField(default=False, verbose_name='Cancelada')
    marcada_paga = models.BooleanField(
        default=False,
        verbose_name='Marcada como paga',
        help_text='Controle manual no detalhe do fornecedor.',
    )
    ultima_alteracao_observacao = models.TextField(
        blank=True,
        default='',
        verbose_name='Última observação de alteração',
        help_text='Texto da última alteração (data, itens, exclusão, etc.) para exibição no sistema.',
    )
    ultima_alteracao_em = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Data da última alteração',
    )

    class Meta:
        ordering = ['-data_compra']

    def __str__(self):
        return f"Ordem #{self.id} - {self.fornecedor.nome}"

    @property
    def total_ordem(self):
        return sum(item.total_compra for item in self.itens.all())


class CompraMaterial(models.Model):
    """Compra: preco_no_dia é o valor negociado na nota; mudança no cadastro do material não altera compras antigas."""
    material = models.ForeignKey(Material, on_delete=models.CASCADE)
    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.CASCADE, related_name='compras')
    quantidade = models.PositiveIntegerField()
    preco_no_dia = models.DecimalField(max_digits=10, decimal_places=2)
    data_lancamento = models.DateTimeField(default=timezone.now, verbose_name='Data de lançamento')
    data_compra = models.DateTimeField(default=timezone.now, verbose_name='Data da compra')
    ordem = models.ForeignKey(
        OrdemCompra,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='itens',
    )
    marcada_paga = models.BooleanField(
        default=False,
        verbose_name='Marcada como paga (avulsa)',
        help_text='Só para linha sem ordem; com ordem, usa a marcação da ordem.',
    )

    @property
    def total_compra(self):
        return self.quantidade * self.preco_no_dia


class CompraProduto(models.Model):
    """Compra de produto de revenda (produto pronto) vinculada a fornecedor."""
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE)
    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.CASCADE, related_name='compras_produtos')
    quantidade = models.PositiveIntegerField()
    preco_no_dia = models.DecimalField(max_digits=10, decimal_places=2)
    data_lancamento = models.DateTimeField(default=timezone.now, verbose_name='Data de lançamento')
    data_compra = models.DateTimeField(default=timezone.now, verbose_name='Data da compra')
    ordem = models.ForeignKey(
        OrdemCompra,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='itens_produtos',
    )
    marcada_paga = models.BooleanField(
        default=False,
        verbose_name='Marcada como paga (avulsa)',
        help_text='Só para linha sem ordem; com ordem, usa a marcação da ordem.',
    )

    @property
    def total_compra(self):
        return self.quantidade * self.preco_no_dia

class PagamentoFornecedor(models.Model):
    fornecedor = models.ForeignKey(Fornecedor, on_delete=models.CASCADE, related_name='pagamentos_feitos')
    valor = models.DecimalField(max_digits=10, decimal_places=2)
    data_pagamento = models.DateTimeField(auto_now_add=True)
    metodo = models.CharField(max_length=50, default='Pix')
    observacao = models.CharField(max_length=255, blank=True)
    conta = models.ForeignKey('financeiro.ContaBanco', on_delete=models.SET_NULL, null=True, blank=True, related_name='pagamentos_fornecedor')


class MovimentoCaixa(models.Model):
    """Entradas e saídas genéricas (ex.: saída "fita dupla face R$10", entrada avulsa)."""
    ENTRADA = 'entrada'
    SAIDA = 'saida'
    TIPO_CHOICES = [(ENTRADA, 'Entrada'), (SAIDA, 'Saída')]
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    descricao = models.CharField(max_length=255)
    valor = models.DecimalField(max_digits=10, decimal_places=2)
    data = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data']


class AjusteEstoque(models.Model):
    """Histórico de entradas/saídas de estoque (ajuste manual da quantidade)."""
    ENTRADA = 'entrada'
    SAIDA = 'saida'
    TIPO_CHOICES = [(ENTRADA, 'Entrada'), (SAIDA, 'Saída')]
    material = models.ForeignKey(Material, on_delete=models.CASCADE, related_name='ajustes')
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    quantidade = models.PositiveIntegerField()
    observacao = models.CharField(max_length=255, blank=True)
    data = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data']


class AjusteEstoqueProduto(models.Model):
    """Histórico de ajustes de estoque de produtos (contagem / definição de quantidade atual)."""
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE, related_name='ajustes_estoque')
    quantidade = models.PositiveIntegerField()
    observacao = models.CharField(max_length=255, blank=True)
    data = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data']


class DividaGeral(models.Model):
    """Dívidas fixas (aluguel, funcionários, governo, etc.) que entram no total a pagar."""
    nome = models.CharField(max_length=200)
    valor = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Dívida geral'
        verbose_name_plural = 'Dívidas gerais'

    def __str__(self):
        return f'{self.nome} — R$ {self.valor}'


class Funcionario(models.Model):
    """Funcionário: cadastro, salário, horas extras e controle de pagamentos."""
    ativo = models.BooleanField(default=True, verbose_name="Ativo")
    nome = models.CharField(max_length=200)
    salario = models.DecimalField(max_digits=12, decimal_places=2, default=0, verbose_name="Salário")
    observacao = models.TextField(blank=True, null=True, verbose_name="Observações")

    class Meta:
        ordering = ['nome']
        verbose_name = 'Funcionário'
        verbose_name_plural = 'Funcionários'

    def __str__(self):
        return self.nome

    @property
    def total_horas_extras(self):
        from django.db.models import Sum
        r = self.horas_extras.aggregate(s=Sum('valor_total'))
        return r['s'] or Decimal('0')

    @property
    def total_pago(self):
        from django.db.models import Sum
        r = self.pagamentos.aggregate(s=Sum('valor'))
        return r['s'] or Decimal('0')

    @property
    def saldo_devedor(self):
        """Salário + horas extras - total já pago."""
        return (Decimal(self.salario) + self.total_horas_extras) - self.total_pago


class FuncionarioHoraExtra(models.Model):
    """Horas extras (ou bônus) do funcionário."""
    funcionario = models.ForeignKey(Funcionario, on_delete=models.CASCADE, related_name='horas_extras')
    quantidade_horas = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    valor_hora = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    valor_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    data_referencia = models.DateField(null=True, blank=True)
    observacao = models.CharField(max_length=255, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']

    def save(self, *args, **kwargs):
        if self.valor_total == 0 and self.quantidade_horas and self.valor_hora:
            self.valor_total = self.quantidade_horas * self.valor_hora
        super().save(*args, **kwargs)


class FuncionarioPagamento(models.Model):
    """Registro de pagamento ao funcionário (data e valor pago)."""
    funcionario = models.ForeignKey(Funcionario, on_delete=models.CASCADE, related_name='pagamentos')
    data_pagamento = models.DateField()
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    observacao = models.CharField(max_length=255, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data_pagamento', '-id']


class OutrosAReceber(models.Model):
    """Valores a receber de outras fontes (e-commerce, marketplace, etc.)."""
    descricao = models.CharField(max_length=255)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    data_prevista = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-data_prevista', '-id']

    def __str__(self):
        return f'{self.descricao} — R$ {self.valor}'


class ContaBanco(models.Model):
    """Conta bancária com saldo atual (atualizado pelas movimentações)."""
    nome = models.CharField(max_length=100)
    saldo_atual = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ['nome']

    def __str__(self):
        return self.nome


class MovimentoBanco(models.Model):
    """Entrada ou saída na conta bancária."""
    ENTRADA = 'entrada'
    SAIDA = 'saida'
    TIPO_CHOICES = [(ENTRADA, 'Entrada'), (SAIDA, 'Saída')]
    conta = models.ForeignKey(ContaBanco, on_delete=models.CASCADE, related_name='movimentacoes')
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    descricao = models.CharField(max_length=255)
    valor = models.DecimalField(max_digits=12, decimal_places=2)
    data = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data']


# ==========================================
# 5. REGISTRO DE IMPRESSÕES (ORDENS / FECHAMENTOS)
# ==========================================


class RegistroImpressao(models.Model):
    """Cópia do HTML gerado na impressão (venda, compra, fechamentos)."""

    class Tipo(models.TextChoices):
        VENDA = 'venda', 'Venda'
        COMPRA = 'compra', 'Compra'
        FECHAMENTO_CLIENTE = 'fechamento_cliente', 'Fechamento cliente'
        FECHAMENTO_CLIENTE_SELECAO = 'fechamento_cliente_selecao', 'Fechamento cliente (seleção)'
        FECHAMENTO_FORNECEDOR = 'fechamento_fornecedor', 'Fechamento fornecedor'
        FECHAMENTO_FORNECEDOR_SELECAO = 'fechamento_fornecedor_selecao', 'Fechamento fornecedor (seleção)'

    tipo = models.CharField(max_length=48, choices=Tipo.choices)
    titulo = models.CharField(max_length=255, blank=True)
    html = models.TextField()
    meta = models.JSONField(default=dict, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    usuario = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='impressoes_registradas'
    )

    class Meta:
        ordering = ['-criado_em']

    def __str__(self):
        return f"{self.get_tipo_display()} — {self.titulo or self.pk}"


# ==========================================
# 6. LOGS
# ==========================================

class LogSistema(models.Model):
    data = models.DateTimeField(auto_now_add=True)
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    acao = models.CharField(max_length=255)
    tabela = models.CharField(max_length=100)
    detalhes = models.TextField()

    class Meta:
        ordering = ['-data']


# ==========================================
# 7. PERFIL (CHEFE / FUNCIONÁRIO)
# ==========================================

class PerfilUsuario(models.Model):
    """Perfil do usuário: 1 = Chefe (acesso total), 2 = Funcionário (acesso limitado)."""
    ROLE_CHEFE = '1'
    ROLE_FUNCIONARIO = '2'
    ROLE_CHOICES = [(ROLE_CHEFE, 'Chefe'), (ROLE_FUNCIONARIO, 'Funcionário')]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='perfil_financeiro')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_FUNCIONARIO)
    nome_exibicao = models.CharField(max_length=100, blank=True)

    class Meta:
        verbose_name = 'Perfil usuário'
        verbose_name_plural = 'Perfis de usuário'

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    @property
    def is_chefe(self):
        return self.role == self.ROLE_CHEFE


class CategoriaProduto(models.Model):
    TIPO_PRODUTO = 'produto'
    TIPO_MATERIAL = 'material'
    TIPO_CHOICES = [
        (TIPO_PRODUTO, 'Categoria de Produto'),
        (TIPO_MATERIAL, 'Categoria de Material'),
    ]
    nome = models.CharField(max_length=200)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default=TIPO_PRODUTO)
    descricao = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['tipo', 'nome']
        unique_together = [['nome', 'tipo']]

    def __str__(self):
        return self.nome