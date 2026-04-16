"""
Serializers para a API REST consumida pelo frontend React (Financial Control System).
"""
from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework import serializers
from decimal import Decimal

from .models import (
    Cliente,
    Fornecedor,
    Produto,
    ProdutoInsumo,
    Material,
    CategoriaProduto,
    Venda,
    ItemVenda,
    CompraMaterial,
    CompraProduto,
    OrdemCompra,
    Pagamento,
    PagamentoFornecedor,
    MovimentoCaixa,
    ContaBanco,
    RegistroImpressao,
)


def _data_compra_iso_br(data_compra):
    """YYYY-MM-DD no calendário de America/Sao_Paulo (igual histórico de pagamentos)."""
    if not data_compra:
        return None
    dv = data_compra
    tz_br = ZoneInfo('America/Sao_Paulo')
    if hasattr(dv, 'hour'):
        if timezone.is_naive(dv):
            dt_br = dv.replace(tzinfo=ZoneInfo('UTC')).astimezone(tz_br)
        else:
            dt_br = dv.astimezone(tz_br)
        return dt_br.date().isoformat()
    if hasattr(dv, 'isoformat'):
        return dv.isoformat()[:10]
    return str(dv).strip()[:10]


def _lancamento_iso_datetime_br(dt):
    """Data/hora de lançamento em ISO (fuso America/Sao_Paulo) para ordenação no frontend."""
    if not dt:
        return None
    dv = dt
    tz_br = ZoneInfo('America/Sao_Paulo')
    if hasattr(dv, 'hour'):
        if timezone.is_naive(dv):
            dt_br = dv.replace(tzinfo=ZoneInfo('UTC')).astimezone(tz_br)
        else:
            dt_br = dv.astimezone(tz_br)
        return dt_br.isoformat()
    if hasattr(dv, 'isoformat'):
        return dv.isoformat()
    return str(dv).strip() or None


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = [
            'id', 'ativo', 'nome', 'cpf', 'cnpj', 'telefone', 'chave_pix',
            'endereco', 'logradouro', 'bairro', 'numero', 'ponto_referencia', 'cep', 'cidade', 'estado',
        ]


class FornecedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fornecedor
        fields = [
            'id', 'nome', 'cpf', 'cnpj', 'telefone', 'chave_pix',
            'endereco', 'logradouro', 'bairro', 'numero', 'ponto_referencia', 'cep', 'cidade', 'estado',
        ]


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaProduto
        fields = ['id', 'nome', 'tipo', 'descricao']


class ProdutoSerializer(serializers.ModelSerializer):
    insumos = serializers.SerializerMethodField(read_only=True)
    custo_materiais = serializers.SerializerMethodField(read_only=True)
    custo_total_fabricacao = serializers.SerializerMethodField(read_only=True)
    categoria_nome = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Produto
        fields = [
            'id',
            'ativo',
            'nome',
            'categoria',
            'categoria_nome',
            'revenda',
            'fabricado',
            'fornecedor',
            'preco_custo',
            'mao_obra_unitaria',
            'margem_lucro_percent',
            'preco_venda',
            'descricao',
            'insumos',
            'custo_materiais',
            'custo_total_fabricacao',
        ]

    def get_categoria_nome(self, obj):
        if obj.categoria_id and obj.categoria:
            return obj.categoria.nome or ''
        return ''

    def get_insumos(self, obj):
        itens = []
        for i in obj.insumos.select_related('material').all():
            preco_ins = Decimal(str(i.material.preco_para_insumo() or 0))
            qtd = Decimal(str(i.quantidade or 0))
            itens.append(
                {
                    'id': i.id,
                    'material': i.material_id,
                    'material_nome': i.material.nome,
                    'quantidade': float(qtd),
                    'preco_unitario_base': float(preco_ins),
                    'total_insumo': float(qtd * preco_ins),
                }
            )
        return itens

    def get_custo_materiais(self, obj):
        total = Decimal('0')
        for i in obj.insumos.select_related('material').all():
            total += Decimal(str(i.quantidade or 0)) * Decimal(str(i.material.preco_para_insumo() or 0))
        return float(total)

    def get_custo_total_fabricacao(self, obj):
        custo_mat = Decimal(str(self.get_custo_materiais(obj)))
        mao_obra = Decimal(str(obj.mao_obra_unitaria or 0))
        return float(custo_mat + mao_obra)


class MaterialSerializer(serializers.ModelSerializer):
    nome = serializers.CharField()
    precoUnitarioBase = serializers.DecimalField(source='preco_unitario_base', max_digits=12, decimal_places=4)
    precoFabricacao = serializers.DecimalField(
        source='preco_fabricacao', max_digits=12, decimal_places=4, required=False, allow_null=True
    )

    class Meta:
        model = Material
        fields = ['id', 'nome', 'precoUnitarioBase', 'precoFabricacao', 'estoque_atual', 'categoria', 'fornecedor_padrao']


class ContaBancoSerializer(serializers.ModelSerializer):
    saldo = serializers.DecimalField(source='saldo_atual', max_digits=12, decimal_places=2, read_only=True)
    saldo_atual = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)

    class Meta:
        model = ContaBanco
        fields = ['id', 'nome', 'saldo', 'saldo_atual']


# --- Vendas (formato esperado pelo front: clienteNome, data, total) ---
class ItemVendaSerializer(serializers.ModelSerializer):
    produto_nome = serializers.CharField(source='produto.nome', read_only=True)

    class Meta:
        model = ItemVenda
        fields = ['id', 'produto', 'produto_nome', 'quantidade', 'preco_unitario', 'preco_custo_unitario']


class VendaSerializer(serializers.ModelSerializer):
    clienteNome = serializers.CharField(source='cliente.nome', read_only=True)
    data = serializers.SerializerMethodField()
    data_lancamento = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    itens = ItemVendaSerializer(many=True, read_only=True)

    class Meta:
        model = Venda
        fields = [
            'id', 'cliente', 'clienteNome', 'data_venda', 'data', 'data_lancamento',
            'total', 'cancelada', 'observacao', 'marcada_paga', 'itens',
        ]

    def get_data_lancamento(self, obj):
        return _data_compra_iso_br(getattr(obj, 'data_lancamento', None))

    def get_data(self, obj):
        if not obj.data_venda:
            return None
        dv = obj.data_venda
        tz_br = ZoneInfo('America/Sao_Paulo')
        if hasattr(dv, 'hour'):
            if timezone.is_naive(dv):
                dt_br = dv.replace(tzinfo=ZoneInfo('UTC')).astimezone(tz_br)
            else:
                dt_br = dv.astimezone(tz_br)
            return dt_br.date().isoformat()
        if hasattr(dv, 'isoformat'):
            return dv.isoformat()[:10]
        return str(dv).strip()[:10]

    def get_total(self, obj):
        return float(obj.total_venda)

    def create(self, validated_data):
        itens_data = self.initial_data.get('itens', [])
        cliente_id = validated_data.get('cliente')
        if isinstance(cliente_id, Cliente):
            cliente = cliente_id
        else:
            cliente = Cliente.objects.get(pk=cliente_id)
        venda = Venda.objects.create(cliente=cliente)
        for item in itens_data:
            produto = Produto.objects.get(pk=item['produto'])
            ItemVenda.objects.create(
                venda=venda,
                produto_id=item['produto'],
                quantidade=item.get('quantidade', 1),
                preco_unitario=item.get('preco_unitario', produto.preco_venda),
                preco_custo_unitario=produto.preco_custo,
            )
        return venda


class VendaCreateSerializer(serializers.Serializer):
    cliente = serializers.PrimaryKeyRelatedField(queryset=Cliente.objects.all())
    itens = serializers.ListField(
        child=serializers.DictField()
    )


# --- Compras (ordem com itens, como Venda) ---
class ItemCompraMaterialSerializer(serializers.ModelSerializer):
    tipo = serializers.SerializerMethodField()
    material_nome = serializers.CharField(source='material.nome', read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = CompraMaterial
        fields = ['id', 'tipo', 'material', 'material_nome', 'quantidade', 'preco_no_dia', 'total']

    def get_tipo(self, obj):
        return 'material'

    def get_total(self, obj):
        return float(obj.total_compra)


class ItemCompraProdutoSerializer(serializers.ModelSerializer):
    tipo = serializers.SerializerMethodField()
    produto_nome = serializers.CharField(source='produto.nome', read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = CompraProduto
        fields = ['id', 'tipo', 'produto', 'produto_nome', 'quantidade', 'preco_no_dia', 'total']

    def get_tipo(self, obj):
        return 'produto'

    def get_total(self, obj):
        return float(obj.total_compra)


class OrdemCompraSerializer(serializers.ModelSerializer):
    fornecedor = serializers.CharField(source='fornecedor.nome', read_only=True)
    fornecedor_id = serializers.PrimaryKeyRelatedField(queryset=Fornecedor.objects.all(), source='fornecedor', write_only=True)
    data = serializers.SerializerMethodField()
    data_lancamento = serializers.SerializerMethodField()
    ultima_alteracao_em = serializers.SerializerMethodField()
    itens = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = OrdemCompra
        fields = [
            'id', 'fornecedor_id', 'fornecedor', 'data', 'data_lancamento', 'cancelada',
            'marcada_paga', 'ultima_alteracao_observacao', 'ultima_alteracao_em', 'itens', 'total',
        ]

    def get_ultima_alteracao_em(self, obj):
        dt = getattr(obj, 'ultima_alteracao_em', None)
        if not dt:
            return None
        return _lancamento_iso_datetime_br(dt)

    def get_data(self, obj):
        return _data_compra_iso_br(obj.data_compra)

    def get_data_lancamento(self, obj):
        return _lancamento_iso_datetime_br(getattr(obj, 'data_lancamento', None))

    def get_itens(self, obj):
        # Junta itens de material + itens de produto (revenda)
        itens_mat = list(getattr(obj, 'itens', []).all()) if hasattr(obj, 'itens') else []
        itens_prod = list(getattr(obj, 'itens_produtos', []).all()) if hasattr(obj, 'itens_produtos') else []
        out = [ItemCompraMaterialSerializer(i).data for i in itens_mat] + [ItemCompraProdutoSerializer(i).data for i in itens_prod]
        return out

    def get_total(self, obj):
        try:
            total = float(obj.total_ordem)
        except Exception:
            total = 0.0
        # Inclui produtos de revenda quando existirem
        try:
            total += sum(float(i.total_compra) for i in obj.itens_produtos.all())
        except Exception:
            pass
        return float(total)


# Serializer para um item avulso (edição/exclusão/copiar)
class CompraSerializer(serializers.ModelSerializer):
    fornecedor = serializers.CharField(source='fornecedor.nome', read_only=True)
    material_nome = serializers.CharField(source='material.nome', read_only=True)
    fornecedor_id = serializers.PrimaryKeyRelatedField(queryset=Fornecedor.objects.all(), source='fornecedor', write_only=True)
    data = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = CompraMaterial
        fields = ['id', 'material', 'material_nome', 'fornecedor_id', 'fornecedor', 'quantidade', 'preco_no_dia', 'data_compra', 'data', 'total']

    def get_data(self, obj):
        return _data_compra_iso_br(obj.data_compra)

    def get_total(self, obj):
        return float(obj.total_compra)

    def create(self, validated_data):
        validated_data.pop('fornecedor_id', None)
        return CompraMaterial.objects.create(**validated_data)


# --- Transações (entradas/saídas genéricas + pagamentos) ---
class TransacaoSerializer(serializers.Serializer):
    id = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    createdAt = serializers.SerializerMethodField()

    def get_id(self, obj):
        return obj.get('id')

    def get_description(self, obj):
        return obj.get('description', '')

    def get_amount(self, obj):
        return float(obj.get('amount', 0))

    def get_type(self, obj):
        return obj.get('type', 'expense')

    def get_date(self, obj):
        return obj.get('date', '')

    def get_category(self, obj):
        return obj.get('category', 'Outros')

    def get_createdAt(self, obj):
        return obj.get('createdAt', '')


class RegistroImpressaoListSerializer(serializers.ModelSerializer):
    usuario_username = serializers.CharField(source='usuario.username', read_only=True, allow_null=True)

    class Meta:
        model = RegistroImpressao
        fields = ['id', 'tipo', 'titulo', 'meta', 'criado_em', 'usuario_username']


class RegistroImpressaoDetailSerializer(serializers.ModelSerializer):
    usuario_username = serializers.CharField(source='usuario.username', read_only=True, allow_null=True)

    class Meta:
        model = RegistroImpressao
        fields = ['id', 'tipo', 'titulo', 'html', 'meta', 'criado_em', 'usuario_username']
