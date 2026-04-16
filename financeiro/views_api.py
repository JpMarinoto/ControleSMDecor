"""
API REST para o frontend React (Financial Control System).
"""
import json
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Sum, F, Q, Value, DecimalField, ExpressionWrapper
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import JSONParser

import math
from decimal import Decimal, InvalidOperation
from .models import (
    Cliente,
    Fornecedor,
    Produto,
    Material,
    CategoriaProduto,
    Venda,
    ItemVenda,
    Pagamento,
    PrecoClienteProduto,
    CompraMaterial,
    CompraProduto,
    ProdutoInsumo,
    OrdemCompra,
    PagamentoFornecedor,
    MovimentoCaixa,
    ContaBanco,
    MovimentoBanco,
    DividaGeral,
    OutrosAReceber,
    LogSistema,
    AjusteEstoque,
    AjusteEstoqueProduto,
    Funcionario,
    FuncionarioHoraExtra,
    FuncionarioPagamento,
    RegistroImpressao,
    PrecificacaoShopee,
)
from .serializers import (
    ClienteSerializer,
    FornecedorSerializer,
    ProdutoSerializer,
    MaterialSerializer,
    CategoriaSerializer,
    ContaBancoSerializer,
    VendaSerializer,
    OrdemCompraSerializer,
    ItemCompraMaterialSerializer,
    ItemCompraProdutoSerializer,
    CompraSerializer,
    _lancamento_iso_datetime_br,
    RegistroImpressaoListSerializer,
    RegistroImpressaoDetailSerializer,
)


def _safe_float(x):
    """Converte para float garantindo valor finito (evita Infinity no JSON que quebra o parse no frontend)."""
    try:
        f = float(x)
        return f if math.isfinite(f) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _int_quantidade_item(qtd):
    """
    Quantidade inteira (compras/itens): JSON pode chegar como float com ruído binário
    (ex.: 2999.9999999999995), onde int() trunca para 2999.
    """
    if qtd is None:
        raise ValueError
    if isinstance(qtd, bool):
        raise ValueError
    if isinstance(qtd, int):
        return qtd
    try:
        return int(round(float(qtd)))
    except (TypeError, ValueError, OverflowError):
        raise ValueError


def _api_log(request, acao, tabela, detalhes=""):
    """Registra ação nos logs do sistema (usado pela API)."""
    user = None
    if request and getattr(request, "user", None) and getattr(request.user, "is_authenticated", False):
        user = request.user
    LogSistema.objects.create(usuario=user, acao=acao, tabela=tabela, detalhes=detalhes or "")


def _exigir_motivo_exclusao(request):
    """Motivo/observação obrigatória no corpo JSON do DELETE (mín. 3 caracteres).

    Compatibilidade: aceita `motivo` (antigo) e `observacao` (novo).
    """
    data = request.data if hasattr(request, 'data') and request.data is not None else {}
    if not isinstance(data, dict):
        data = {}
    motivo = (data.get('observacao') or data.get('motivo') or '').strip()
    if len(motivo) < 3:
        return None, Response(
            {'observacao': ['Informe o motivo/observação (mínimo 3 caracteres).']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return motivo, None


def _exigir_senha_e_observacao_compra(request, min_obs=5):
    """Exige senha do usuário autenticado + observação para auditoria."""
    data = request.data if hasattr(request, 'data') and request.data is not None else {}
    if not isinstance(data, dict):
        data = {}
    if not getattr(request.user, 'is_authenticated', False):
        return None, None, Response(
            {'detail': 'É necessário estar autenticado para alterar compras.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    password = (data.get('password') or '').strip()
    observacao = (data.get('observacao') or '').strip()
    if not password:
        return None, None, Response(
            {'password': ['Informe sua senha para confirmar a alteração.']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(observacao) < min_obs:
        return None, None, Response(
            {'observacao': [f'Informe a observação (mínimo {min_obs} caracteres).']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not request.user.check_password(password):
        return None, None, Response(
            {'password': ['Senha incorreta.']},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return password, observacao, None


def _set_ultima_alteracao_ordem(ordem_pk, observacao):
    """Grava observação e horário na ordem para exibição discreta (tooltip) no frontend."""
    if not ordem_pk:
        return
    obs = (observacao or '').strip()[:2000]
    OrdemCompra.objects.filter(pk=ordem_pk).update(
        ultima_alteracao_observacao=obs,
        ultima_alteracao_em=timezone.now(),
    )


def _resolve_compra_linha_por_pk(pk, tipo_hint=None):
    """
    CompraMaterial e CompraProduto têm sequências de ID independentes; o mesmo número pode
    existir nas duas tabelas. tipo_hint: 'material', 'produto' ou None.
    Retorna (obj, kind) com kind em {'material','produto'}, (None, None) se não existir,
    ou (None, 'ambiguous') se existirem os dois e tipo_hint não desambiguar.
    """
    try:
        pk_int = int(pk)
    except (ValueError, TypeError):
        return None, None
    mat = (
        CompraMaterial.objects.select_related('fornecedor', 'material', 'ordem')
        .filter(pk=pk_int)
        .first()
    )
    prod = (
        CompraProduto.objects.select_related('fornecedor', 'produto', 'ordem')
        .filter(pk=pk_int)
        .first()
    )
    if mat and prod:
        t = (tipo_hint or '').strip().lower()
        if t == 'produto':
            return prod, 'produto'
        if t == 'material':
            return mat, 'material'
        return None, 'ambiguous'
    if mat:
        return mat, 'material'
    if prod:
        return prod, 'produto'
    return None, None


def _produto_elegivel_compra_pronta(produto):
    """Linha de ordem de compra como produto pronto: não fabricado e (revenda ou fornecedor cadastrado)."""
    if not produto.ativo:
        return False
    if produto.fabricado:
        return False
    if produto.revenda:
        return True
    return bool(produto.fornecedor_id)


# --- Clientes ---
@method_decorator(csrf_exempt, name='dispatch')
class ClienteListCreate(APIView):
    def get(self, request):
        from datetime import datetime
        incluir_inativos = request.GET.get('incluir_inativos', '').strip() == '1'
        qs = Cliente.objects.all().order_by('nome')
        if not incluir_inativos:
            qs = qs.filter(ativo=True)
        data_inicio = request.GET.get('data_inicio', '').strip()
        data_fim = request.GET.get('data_fim', '').strip()
        if data_inicio and data_fim:
            try:
                di = datetime.strptime(data_inicio[:10], '%Y-%m-%d').date()
                df = datetime.strptime(data_fim[:10], '%Y-%m-%d').date()
                from django.db.models import Exists, OuterRef
                vendas_no_periodo = Venda.objects.filter(
                    cliente_id=OuterRef('pk'), cancelada=False,
                    data_venda__date__gte=di, data_venda__date__lte=df
                )
                qs = qs.annotate(tem_venda_periodo=Exists(vendas_no_periodo)).filter(tem_venda_periodo=True)
            except (ValueError, TypeError):
                pass
        serializer = ClienteSerializer(qs, many=True)
        out = list(serializer.data)
        for i, c in enumerate(qs):
            out[i]['saldo_devedor'] = float(c.saldo_devedor)
        return Response(out)

    def post(self, request):
        serializer = ClienteSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Criar", "Cliente", f"Cliente criado: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class ClienteDetail(APIView):
    def get_object(self, pk):
        return Cliente.objects.get(pk=pk)

    def get(self, request, pk):
        obj = self.get_object(pk)
        serializer = ClienteSerializer(obj)
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        serializer = ClienteSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Editar", "Cliente", f"Cliente ID {pk} atualizado: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if obj.vendas.exists() or obj.pagamentos.exists():
            return Response(
                {
                    "error": "Não é possível excluir: este cliente possui vendas ou pagamentos registrados.",
                    "code": "tem_vendas",
                    "hint": "Use 'Inativar' para ocultar o cliente da lista sem apagar os dados.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "Cliente", f"Cliente excluído: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if request.data.get('ativo') is False:
            obj.ativo = False
            obj.save()
            _api_log(request, "Inativar", "Cliente", f"Cliente inativado: {obj.nome} (ID {pk})")
        serializer = ClienteSerializer(obj)
        return Response(serializer.data)


# --- Fornecedores ---
@method_decorator(csrf_exempt, name='dispatch')
class FornecedorListCreate(APIView):
    def get(self, request):
        # Por padrão retorna todos (ativos e inativos) para listagem/cadastro
        apenas_ativos = request.GET.get('apenas_ativos', '').strip() == '1'
        qs = Fornecedor.objects.all().order_by('nome')
        if apenas_ativos:
            qs = qs.filter(ativo=True)
        serializer = FornecedorSerializer(qs, many=True)
        out = list(serializer.data)
        for i, f in enumerate(qs):
            try:
                out[i]['saldo_devedor'] = float(f.saldo_devedor)
            except Exception:
                out[i]['saldo_devedor'] = 0.0
        return Response(out)

    def post(self, request):
        serializer = FornecedorSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Criar", "Fornecedor", f"Fornecedor criado: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class FornecedorDetail(APIView):
    def get_object(self, pk):
        return Fornecedor.objects.get(pk=pk)

    def get(self, request, pk):
        serializer = FornecedorSerializer(self.get_object(pk))
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        serializer = FornecedorSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Editar", "Fornecedor", f"Fornecedor ID {pk} atualizado: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if obj.compras.exists() or obj.pagamentos_feitos.exists():
            return Response(
                {
                    "error": "Não é possível excluir: este fornecedor possui compras ou pagamentos registrados.",
                    "code": "tem_compras",
                    "hint": "Use 'Inativar' para ocultar o fornecedor da lista sem apagar os dados.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "Fornecedor", f"Fornecedor excluído: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if request.data.get('ativo') is False:
            obj.ativo = False
            obj.save()
            _api_log(request, "Inativar", "Fornecedor", f"Fornecedor inativado: {obj.nome} (ID {pk})")
        serializer = FornecedorSerializer(obj)
        return Response(serializer.data)


# --- Produtos ---
@method_decorator(csrf_exempt, name='dispatch')
class ProdutoListCreate(APIView):
    @staticmethod
    def _sync_insumos(produto, insumos):
        if not isinstance(insumos, list):
            return
        # Limpa e recria para manter simples e consistente
        ProdutoInsumo.objects.filter(produto=produto).delete()
        novos = []
        for item in insumos:
            if not isinstance(item, dict):
                continue
            material_id = item.get('material')
            qtd = item.get('quantidade')
            if not material_id or qtd is None:
                continue
            try:
                material = Material.objects.get(pk=int(material_id))
                q = Decimal(str(qtd).replace(',', '.'))
            except (Material.DoesNotExist, ValueError, TypeError, InvalidOperation):
                continue
            if q <= 0:
                continue
            novos.append(ProdutoInsumo(produto=produto, material=material, quantidade=q))
        if novos:
            ProdutoInsumo.objects.bulk_create(novos)

    def get(self, request):
        incluir_inativos = request.GET.get('incluir_inativos', '').strip() == '1'
        qs = Produto.objects.select_related('categoria').prefetch_related('insumos__material').all().order_by('nome')
        if not incluir_inativos:
            qs = qs.filter(ativo=True)
        serializer = ProdutoSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        insumos = data.pop('insumos', None)
        serializer = ProdutoSerializer(data=data)
        if serializer.is_valid():
            obj = serializer.save()
            self._sync_insumos(obj, insumos)
            serializer = ProdutoSerializer(obj)
            _api_log(request, "Criar", "Produto", f"Produto criado: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class ProdutoDetail(APIView):
    def get_object(self, pk):
        return Produto.objects.get(pk=pk)

    def get(self, request, pk):
        serializer = ProdutoSerializer(self.get_object(pk))
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        data = request.data.copy()
        insumos = data.pop('insumos', None)
        serializer = ProdutoSerializer(obj, data=data, partial=True)
        if serializer.is_valid():
            obj = serializer.save()
            if insumos is not None:
                ProdutoListCreate._sync_insumos(obj, insumos)
            serializer = ProdutoSerializer(obj)
            _api_log(request, "Editar", "Produto", f"Produto ID {pk} atualizado: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """Remove o produto só da lista de cadastro (inativa). Vendas e ordens mantêm o histórico."""
        obj = self.get_object(pk)
        nome = obj.nome
        obj.ativo = False
        obj.save(update_fields=['ativo'])
        _api_log(
            request,
            "Excluir",
            "Produto",
            f"Produto removido do cadastro (inativado): {nome} (ID {pk})",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if request.data.get('ativo') is False:
            obj.ativo = False
            obj.save(update_fields=['ativo'])
            _api_log(request, "Inativar", "Produto", f"Produto inativado: {obj.nome} (ID {pk})")
        elif request.data.get('ativo') is True:
            obj.ativo = True
            obj.save(update_fields=['ativo'])
            _api_log(request, "Reativar", "Produto", f"Produto reativado: {obj.nome} (ID {pk})")
        serializer = ProdutoSerializer(obj)
        return Response(serializer.data)


@method_decorator(csrf_exempt, name='dispatch')
class ProdutoBulkPrecos(APIView):
    """Atualiza preco_venda, preco_custo e/ou margem_lucro_percent de vários produtos (apenas chefe)."""

    def post(self, request):
        try:
            from .views_auth import _is_chefe

            if not _is_chefe(request):
                return Response(
                    {'error': 'Apenas o chefe pode atualizar preços em massa.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            return Response(
                {'error': 'Apenas o chefe pode atualizar preços em massa.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = getattr(request, 'data', None) or {}
        if not isinstance(data, dict) and hasattr(request, 'body'):
            try:
                data = json.loads(request.body.decode('utf-8')) if request.body else {}
            except Exception:
                data = {}
        if not isinstance(data, dict):
            data = {}

        ids = data.get('ids')
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({'error': 'Envie ids: lista de IDs de produtos.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > 500:
            return Response({'error': 'No máximo 500 produtos por requisição.'}, status=status.HTTP_400_BAD_REQUEST)

        pv = data.get('preco_venda')
        pc = data.get('preco_custo')
        pm = data.get('margem_lucro_percent')
        preco_venda_val = None
        preco_custo_val = None
        margem_val = None
        if pv is not None:
            try:
                preco_venda_val = Decimal(str(pv).replace(',', '.'))
                if preco_venda_val < 0:
                    return Response({'error': 'preco_venda deve ser >= 0'}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError, InvalidOperation):
                return Response({'error': 'preco_venda inválido'}, status=status.HTTP_400_BAD_REQUEST)
        if pc is not None:
            try:
                preco_custo_val = Decimal(str(pc).replace(',', '.'))
                if preco_custo_val < 0:
                    return Response({'error': 'preco_custo deve ser >= 0'}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError, InvalidOperation):
                return Response({'error': 'preco_custo inválido'}, status=status.HTTP_400_BAD_REQUEST)
        if pm is not None:
            try:
                margem_val = Decimal(str(pm).replace(',', '.'))
            except (ValueError, TypeError, InvalidOperation):
                return Response({'error': 'margem_lucro_percent inválida'}, status=status.HTTP_400_BAD_REQUEST)

        if preco_venda_val is None and preco_custo_val is None and margem_val is None:
            return Response(
                {'error': 'Informe pelo menos preco_venda, preco_custo ou margem_lucro_percent.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        id_ints = []
        for x in ids:
            try:
                id_ints.append(int(x))
            except (ValueError, TypeError):
                continue
        if not id_ints:
            return Response({'error': 'Nenhum id válido.'}, status=status.HTTP_400_BAD_REQUEST)

        ok = 0
        errors = []
        for pid in id_ints:
            prod = Produto.objects.filter(pk=pid).first()
            if not prod:
                errors.append({'id': pid, 'error': 'Produto não encontrado'})
                continue
            if not prod.ativo:
                errors.append({'id': pid, 'error': 'Produto inativo no cadastro'})
                continue
            fields = []
            if preco_custo_val is not None:
                prod.preco_custo = preco_custo_val
                fields.append('preco_custo')

            q4 = Decimal('0.0001')
            if margem_val is not None:
                c = prod.preco_custo
                if c is None or c <= 0:
                    errors.append(
                        {
                            'id': pid,
                            'error': 'Preço de custo deve ser > 0 para aplicar margem %. Ajuste o custo do produto ou informe custo em massa.',
                        }
                    )
                    continue
                fator = Decimal('1') + (margem_val / Decimal('100'))
                prod.preco_venda = (c * fator).quantize(q4)
                prod.margem_lucro_percent = margem_val
                fields.extend(['preco_venda', 'margem_lucro_percent'])
            elif preco_venda_val is not None:
                prod.preco_venda = preco_venda_val
                fields.append('preco_venda')
                c = prod.preco_custo
                if c is not None and c > 0:
                    prod.margem_lucro_percent = ((prod.preco_venda / c - Decimal('1')) * Decimal('100')).quantize(
                        Decimal('0.0001')
                    )
                    fields.append('margem_lucro_percent')
            elif preco_custo_val is not None:
                c = prod.preco_custo
                if c is not None and c > 0:
                    prod.margem_lucro_percent = ((prod.preco_venda / c - Decimal('1')) * Decimal('100')).quantize(
                        Decimal('0.0001')
                    )
                    fields.append('margem_lucro_percent')

            prod.save(update_fields=list(dict.fromkeys(fields)))
            ok += 1

        _api_log(request, 'Editar', 'Produto', f'Preços em massa: {ok} produto(s) atualizado(s)')
        return Response({'ok': ok, 'failed': len(errors), 'errors': errors}, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class MaterialBulkPrecos(APIView):
    """Atualiza preco_unitario_base e/ou preco_fabricacao de vários materiais (apenas chefe)."""

    def post(self, request):
        try:
            from .views_auth import _is_chefe

            if not _is_chefe(request):
                return Response(
                    {'error': 'Apenas o chefe pode atualizar preços em massa.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            return Response(
                {'error': 'Apenas o chefe pode atualizar preços em massa.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = getattr(request, 'data', None) or {}
        if not isinstance(data, dict) and hasattr(request, 'body'):
            try:
                data = json.loads(request.body.decode('utf-8')) if request.body else {}
            except Exception:
                data = {}
        if not isinstance(data, dict):
            data = {}

        ids = data.get('ids')
        if not isinstance(ids, list) or len(ids) == 0:
            return Response({'error': 'Envie ids: lista de IDs de materiais.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(ids) > 500:
            return Response({'error': 'No máximo 500 materiais por requisição.'}, status=status.HTTP_400_BAD_REQUEST)

        has_base = 'preco_unitario_base' in data or 'precoUnitarioBase' in data
        has_fab = 'preco_fabricacao' in data or 'precoFabricacao' in data
        if not has_base and not has_fab:
            return Response(
                {
                    'error': 'Informe preco_unitario_base e/ou preco_fabricacao (null zera o preço de fabricação).',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        preco_base_val = None
        if has_base:
            raw = data.get('preco_unitario_base', data.get('precoUnitarioBase'))
            try:
                preco_base_val = Decimal(str(raw).replace(',', '.'))
                if preco_base_val < 0:
                    return Response({'error': 'preço base deve ser >= 0'}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError, InvalidOperation):
                return Response({'error': 'preço base inválido'}, status=status.HTTP_400_BAD_REQUEST)

        preco_fab_val = None
        if has_fab:
            rawf = data.get('preco_fabricacao', data.get('precoFabricacao'))
            if rawf is None:
                preco_fab_val = None
            else:
                try:
                    preco_fab_val = Decimal(str(rawf).replace(',', '.'))
                    if preco_fab_val < 0:
                        return Response({'error': 'preço fabricação deve ser >= 0'}, status=status.HTTP_400_BAD_REQUEST)
                except (ValueError, TypeError, InvalidOperation):
                    return Response({'error': 'preço fabricação inválido'}, status=status.HTTP_400_BAD_REQUEST)

        id_ints = []
        for x in ids:
            try:
                id_ints.append(int(x))
            except (ValueError, TypeError):
                continue
        if not id_ints:
            return Response({'error': 'Nenhum id válido.'}, status=status.HTTP_400_BAD_REQUEST)

        ok = 0
        errors = []
        for mid in id_ints:
            mat = Material.objects.filter(pk=mid).first()
            if not mat:
                errors.append({'id': mid, 'error': 'Material não encontrado'})
                continue
            fields = []
            if has_base:
                mat.preco_unitario_base = preco_base_val
                fields.append('preco_unitario_base')
            if has_fab:
                mat.preco_fabricacao = preco_fab_val
                fields.append('preco_fabricacao')
            mat.save(update_fields=fields)
            ok += 1

        _api_log(request, 'Editar', 'Material', f'Preços em massa: {ok} material(is) atualizado(s)')
        return Response({'ok': ok, 'failed': len(errors), 'errors': errors}, status=status.HTTP_200_OK)


# --- Materiais ---
@method_decorator(csrf_exempt, name='dispatch')
class MaterialListCreate(APIView):
    def get(self, request):
        qs = Material.objects.all().order_by('nome')
        serializer = MaterialSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        if 'precoUnitarioBase' in data and 'preco_unitario_base' not in data:
            data['preco_unitario_base'] = data['precoUnitarioBase']
        serializer = MaterialSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Criar", "Material", f"Material criado: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class MaterialDetail(APIView):
    def get_object(self, pk):
        return Material.objects.get(pk=pk)

    def get(self, request, pk):
        serializer = MaterialSerializer(self.get_object(pk))
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        data = request.data.copy()
        if 'precoUnitarioBase' in data:
            data['preco_unitario_base'] = data['precoUnitarioBase']
        serializer = MaterialSerializer(obj, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Editar", "Material", f"Material ID {pk} atualizado: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "Material", f"Material excluído: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Categorias ---
@method_decorator(csrf_exempt, name='dispatch')
class CategoriaListCreate(APIView):
    def get(self, request):
        qs = CategoriaProduto.objects.all().order_by('tipo', 'nome')
        serializer = CategoriaSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = CategoriaSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Criar", "Categoria", f"Categoria criada: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class CategoriaDetail(APIView):
    def get_object(self, pk):
        return CategoriaProduto.objects.get(pk=pk)

    def get(self, request, pk):
        serializer = CategoriaSerializer(self.get_object(pk))
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        serializer = CategoriaSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Editar", "Categoria", f"Categoria ID {pk} atualizada: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "Categoria", f"Categoria excluída: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Contas (ContaBanco) ---
@method_decorator(csrf_exempt, name='dispatch')
class ContaListCreate(APIView):
    def get(self, request):
        qs = ContaBanco.objects.all().order_by('nome')
        serializer = ContaBancoSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        if 'saldo' in data and 'saldo_atual' not in data:
            data['saldo_atual'] = data['saldo']
        serializer = ContaBancoSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Criar", "ContaBanco", f"Conta criada: {serializer.data.get('nome', '')}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class ContaDetail(APIView):
    def get_object(self, pk):
        return ContaBanco.objects.get(pk=pk)

    def get(self, request, pk):
        serializer = ContaBancoSerializer(self.get_object(pk))
        return Response(serializer.data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        data = request.data.copy()
        if 'saldo' in data:
            data['saldo_atual'] = data['saldo']
        serializer = ContaBancoSerializer(obj, data=data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _api_log(request, "Editar", "ContaBanco", f"Conta ID {pk} atualizada: {obj.nome}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "ContaBanco", f"Conta excluída: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Vendas ---
@method_decorator(csrf_exempt, name='dispatch')
class VendaListCreate(APIView):
    def get(self, request):
        # Por padrão retorna todas (ativas e canceladas) para histórico
        apenas_ativas = request.GET.get('apenas_ativas', '').strip() == '1'
        qs = Venda.objects.select_related('cliente').prefetch_related('itens').order_by('-data_lancamento', '-id')
        if apenas_ativas:
            qs = qs.filter(cancelada=False)
        serializer = VendaSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        cliente_id = data.get('cliente')
        if not cliente_id:
            return Response({'cliente': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        itens = data.get('itens', [])
        if not itens:
            return Response({'itens': ['Pelo menos um item']}, status=status.HTTP_400_BAD_REQUEST)
        from .models import ItemVenda
        try:
            cliente = Cliente.objects.get(pk=cliente_id)
        except Cliente.DoesNotExist:
            return Response({'cliente': ['Não encontrado']}, status=status.HTTP_400_BAD_REQUEST)
        data_raw = data.get('data') or data.get('data_venda')
        data_enviada = _parse_data_request(data_raw)
        if data_enviada:
            tz_br = ZoneInfo('America/Sao_Paulo')
            data_hora_venda = datetime.combine(
                data_enviada, datetime.min.time().replace(hour=12, minute=0, second=0, microsecond=0), tzinfo=tz_br
            )
        else:
            _, data_hora_venda = _data_hora_negocio()
        obs_txt = (data.get('observacao') or '').strip() if isinstance(data.get('observacao'), str) else ''
        if not obs_txt and data.get('observacao'):
            obs_txt = str(data.get('observacao')).strip()
        for item in itens:
            prod_id = item.get('produto') or item.get('produto_id')
            if prod_id:
                try:
                    prod_chk = Produto.objects.get(pk=prod_id)
                except Produto.DoesNotExist:
                    return Response(
                        {'itens': [f'Produto id {prod_id} não encontrado.']},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not prod_chk.ativo:
                    return Response(
                        {
                            'itens': [
                                f'Produto "{prod_chk.nome}" foi removido do cadastro e não pode ser incluído em novas vendas.'
                            ]
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        venda = Venda.objects.create(cliente=cliente, data_venda=data_hora_venda, observacao=obs_txt)
        for item in itens:
            prod_id = item.get('produto') or item.get('produto_id')
            qty = item.get('quantidade', 1)
            preco = item.get('preco_unitario')
            produto = Produto.objects.get(pk=prod_id)
            # Snapshot: só usa preço do cadastro se o cliente não enviou preco_unitario (notas antigas nunca são atualizadas pelo PUT do produto).
            if preco is None:
                preco = produto.preco_venda
            ItemVenda.objects.create(
                venda=venda,
                produto_id=prod_id,
                quantidade=qty,
                preco_unitario=preco,
                preco_custo_unitario=produto.preco_custo,
            )
        total = sum(i.get("quantidade", 1) * float(i.get("preco_unitario", 0)) for i in itens)
        _api_log(request, "Criar", "Venda", f"Venda #{venda.id} - Cliente {cliente.nome} (ID {cliente_id}) - Total R$ {total:.2f}")
        serializer = VendaSerializer(venda)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class VendaDetail(APIView):
    def get_object(self, pk):
        return Venda.objects.select_related('cliente').prefetch_related('itens__produto').get(pk=pk)

    def get(self, request, pk):
        venda = self.get_object(pk)
        serializer = VendaSerializer(venda)
        return Response(serializer.data)

    def patch(self, request, pk):
        venda = self.get_object(pk)
        data = request.data or {}
        if data.get('cancelada') is True:
            venda.cancelada = True
            venda.save(update_fields=['cancelada'])
            _api_log(request, "Cancelar", "Venda", f"Venda #{pk} cancelada (permanece no banco para histórico)")
            return Response(VendaSerializer(venda).data)

        if 'marcada_paga' in data:
            try:
                from .views_auth import _is_chefe
                if not _is_chefe(request):
                    return Response(
                        {'error': 'Apenas o chefe pode marcar vendas como pagas.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            except Exception:
                return Response(
                    {'error': 'Apenas o chefe pode marcar vendas como pagas.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            venda.marcada_paga = bool(data.get('marcada_paga'))
            venda.save(update_fields=['marcada_paga'])
            cn = venda.cliente.nome if getattr(venda, 'cliente', None) else 'Cliente'
            est = 'marcada como paga' if venda.marcada_paga else 'desmarcada (em aberto)'
            _api_log(
                request,
                'Editar',
                'Venda',
                f'Cliente «{cn}» — Venda nº {venda.id} — {est}',
            )
            return Response(VendaSerializer(venda).data)

        data_raw = data.get('data') or data.get('data_venda')
        if data_raw:
            data_enviada = _parse_data_request(str(data_raw).strip())
            if not data_enviada:
                return Response(
                    {'data': ['Data inválida. Use YYYY-MM-DD.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tz_br = ZoneInfo('America/Sao_Paulo')
            venda.data_venda = datetime.combine(
                data_enviada,
                datetime.min.time().replace(hour=12, minute=0, second=0, microsecond=0),
                tzinfo=tz_br,
            )
            venda.save(update_fields=['data_venda'])
            _api_log(
                request,
                "Editar",
                "Venda",
                f"Venda #{pk} - data da venda alterada para {data_enviada.isoformat()}",
            )
        return Response(VendaSerializer(venda).data)

    def delete(self, request, pk):
        """Soft delete: marca a venda como cancelada em vez de apagar."""
        motivo, err = _exigir_motivo_exclusao(request)
        if err:
            return err
        venda = self.get_object(pk)
        venda.cancelada = True
        venda.save()
        _api_log(
            request,
            "Cancelar",
            "Venda",
            f"Venda #{pk} cancelada (exclusão lógica). Motivo: {motivo}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class VendaAddItem(APIView):
    def post(self, request, pk):
        venda = Venda.objects.get(pk=pk)
        prod_id = request.data.get('produto') or request.data.get('produto_id')
        qty = request.data.get('quantidade', 1)
        preco = request.data.get('preco_unitario')
        if not prod_id:
            return Response({'produto': ['Obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            produto = Produto.objects.get(pk=prod_id)
        except Produto.DoesNotExist:
            return Response({'produto': ['Produto não encontrado.']}, status=status.HTTP_400_BAD_REQUEST)
        if not produto.ativo:
            return Response(
                {
                    'produto': [
                        f'Produto "{produto.nome}" foi removido do cadastro e não pode ser adicionado à venda.'
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if preco is None:
            preco = produto.preco_venda
        # preco_unitario gravado na linha; alterar Produto.preco_venda depois não mexe neste registro.
        ItemVenda.objects.create(
            venda=venda,
            produto_id=prod_id,
            quantidade=qty,
            preco_unitario=preco,
            preco_custo_unitario=produto.preco_custo,
        )
        _api_log(request, "Editar", "Venda", f"Venda #{pk} - item adicionado (produto {prod_id}, qtd {qty})")
        venda = Venda.objects.select_related('cliente').prefetch_related('itens__produto').get(pk=pk)
        serializer = VendaSerializer(venda)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class VendaItemDetail(APIView):
    def patch(self, request, pk, item_pk):
        # Apenas chefe pode alterar itens de venda já feita
        if not getattr(getattr(request, "user", None), "is_authenticated", False):
            return Response({"error": "Não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            from .views_auth import _is_chefe
            is_chefe = _is_chefe(request)
        except Exception:
            is_chefe = False
        if not is_chefe:
            return Response({"error": "Apenas o chefe pode editar itens da venda."}, status=status.HTTP_403_FORBIDDEN)

        item = ItemVenda.objects.filter(venda_id=pk, pk=item_pk).select_related("produto").first()
        if not item:
            return Response(status=status.HTTP_404_NOT_FOUND)

        data = request.data or {}
        if "quantidade" in data:
            try:
                qty = int(data.get("quantidade"))
                if qty <= 0:
                    raise ValueError()
            except Exception:
                return Response({"quantidade": ["Quantidade inválida."]}, status=status.HTTP_400_BAD_REQUEST)
            item.quantidade = qty

        if "preco_unitario" in data:
            try:
                preco_raw = data.get("preco_unitario")
                preco = Decimal(str(preco_raw).replace(",", "."))
                if preco < 0:
                    raise ValueError()
            except Exception:
                return Response({"preco_unitario": ["Preço inválido."]}, status=status.HTTP_400_BAD_REQUEST)
            item.preco_unitario = preco

        item.save()
        _api_log(
            request,
            "Editar",
            "Venda",
            f"Venda #{pk} - item {item_pk} atualizado (qtd={item.quantidade}, preco={item.preco_unitario})",
        )
        venda = Venda.objects.select_related("cliente").prefetch_related("itens__produto").get(pk=pk)
        serializer = VendaSerializer(venda)
        return Response(serializer.data)

    def delete(self, request, pk, item_pk):
        item = ItemVenda.objects.filter(venda_id=pk, pk=item_pk).first()
        if not item:
            return Response(status=status.HTTP_404_NOT_FOUND)
        item.delete()
        _api_log(request, "Editar", "Venda", f"Venda #{pk} - item {item_pk} removido")
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class VendaCopiar(APIView):
    def post(self, request, pk):
        origem = Venda.objects.select_related('cliente').prefetch_related('itens__produto').get(pk=pk)
        nova = Venda.objects.create(cliente=origem.cliente, data_venda=origem.data_venda)
        for item in origem.itens.all():
            cu = item.preco_custo_unitario
            if cu is None and item.produto_id:
                cu = item.produto.preco_custo
            ItemVenda.objects.create(
                venda=nova,
                produto=item.produto,
                quantidade=item.quantidade,
                preco_unitario=item.preco_unitario,
                preco_custo_unitario=cu,
            )
        _api_log(request, "Criar", "Venda", f"Venda #{nova.id} copiada da venda #{pk}")
        serializer = VendaSerializer(nova)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class UltimoPrecoClienteProduto(APIView):
    """Preço a usar: 1) preço cadastrado do chefe para este cliente+produto, 2) último cobrado, 3) preço do produto."""
    def get(self, request):
        cliente_id = request.GET.get('cliente_id')
        produto_id = request.GET.get('produto_id')
        if not cliente_id or not produto_id:
            return Response({'preco': None})
        # 1) Preço específico cadastrado para este cliente (pelo chefe)
        preco_cad = PrecoClienteProduto.objects.filter(
            cliente_id=cliente_id, produto_id=produto_id
        ).values('preco').first()
        if preco_cad is not None:
            return Response({'preco': float(preco_cad['preco'])})
        # 2) Último preço cobrado neste cliente+produto
        item = (
            ItemVenda.objects
            .filter(venda__cliente_id=cliente_id, produto_id=produto_id)
            .order_by('-venda__data_venda')
            .values('preco_unitario')
            .first()
        )
        if item:
            return Response({'preco': float(item['preco_unitario'])})
        # 3) Preço padrão do produto (só se ainda ativo no cadastro)
        prod = Produto.objects.filter(pk=produto_id).first()
        if prod and prod.ativo:
            return Response({'preco': float(prod.preco_venda)})
        return Response({'preco': None})


@method_decorator(csrf_exempt, name='dispatch')
class RelatorioLucrosVendas(APIView):
    """Lucro por mercadoria: (preço de venda − custo) × quantidade, agregado no período (data da venda)."""

    def get(self, request):
        if not getattr(request.user, "is_authenticated", False):
            return Response({"error": "Não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            from .views_auth import _is_chefe
            if not _is_chefe(request):
                return Response(
                    {"error": "Apenas o chefe pode ver o relatório de lucros."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            return Response(
                {"error": "Apenas o chefe pode ver o relatório de lucros."},
                status=status.HTTP_403_FORBIDDEN,
            )

        di = _parse_data_request(request.GET.get('data_inicio') or request.GET.get('de'))
        df = _parse_data_request(request.GET.get('data_fim') or request.GET.get('ate'))
        if not di or not df:
            return Response(
                {'error': 'Informe data_inicio e data_fim (YYYY-MM-DD).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if di > df:
            return Response(
                {'error': 'data_inicio não pode ser posterior a data_fim.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cliente_param = (request.GET.get('cliente_id') or '').strip()
        qs = ItemVenda.objects.filter(
            venda__cancelada=False,
            venda__data_venda__date__gte=di,
            venda__data_venda__date__lte=df,
        )
        if cliente_param:
            try:
                qs = qs.filter(venda__cliente_id=int(cliente_param))
            except ValueError:
                return Response({'error': 'cliente_id inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        dec4 = DecimalField(max_digits=14, decimal_places=4)
        zero = Value(Decimal('0'), output_field=dec4)
        custo_u = Coalesce(F('preco_custo_unitario'), F('produto__preco_custo'), zero, output_field=dec4)
        money = DecimalField(max_digits=18, decimal_places=4)
        qs_ann = qs.annotate(
            receita_linha=ExpressionWrapper(F('quantidade') * F('preco_unitario'), output_field=money),
            custo_linha=ExpressionWrapper(F('quantidade') * custo_u, output_field=money),
        )

        tot = qs_ann.aggregate(
            receita_total=Sum('receita_linha'),
            custo_total=Sum('custo_linha'),
        )
        receita_total = tot['receita_total'] or Decimal('0')
        custo_total = tot['custo_total'] or Decimal('0')
        lucro_total = receita_total - custo_total

        por_cliente = []
        for row in (
            qs_ann.values('venda__cliente_id', 'venda__cliente__nome')
            .annotate(receita=Sum('receita_linha'), custo=Sum('custo_linha'))
            .order_by('-receita')
        ):
            rec = row['receita'] or Decimal('0')
            cust = row['custo'] or Decimal('0')
            por_cliente.append({
                'cliente_id': row['venda__cliente_id'],
                'cliente_nome': row['venda__cliente__nome'] or '',
                'receita': _safe_float(rec),
                'custo': _safe_float(cust),
                'lucro': _safe_float(rec - cust),
            })

        por_produto = []
        for row in (
            qs_ann.values('produto_id', 'produto__nome')
            .annotate(qtd_vendida=Sum('quantidade'), receita=Sum('receita_linha'), custo=Sum('custo_linha'))
            .order_by('-receita')
        ):
            rec = row['receita'] or Decimal('0')
            cust = row['custo'] or Decimal('0')
            por_produto.append({
                'produto_id': row['produto_id'],
                'produto_nome': row['produto__nome'] or '',
                'quantidade': int(row['qtd_vendida'] or 0),
                'receita': _safe_float(rec),
                'custo': _safe_float(cust),
                'lucro': _safe_float(rec - cust),
            })

        return Response({
            'data_inicio': di.isoformat(),
            'data_fim': df.isoformat(),
            'receita_total': _safe_float(receita_total),
            'custo_total': _safe_float(custo_total),
            'lucro_total': _safe_float(lucro_total),
            'por_cliente': por_cliente,
            'por_produto': por_produto,
        })


@method_decorator(csrf_exempt, name='dispatch')
class RelatorioComprasPeriodo(APIView):
    """Materiais e produtos comprados no período (data da compra), excl. ordens canceladas."""

    def get(self, request):
        if not getattr(request.user, "is_authenticated", False):
            return Response({"error": "Não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            from .views_auth import _is_chefe
            if not _is_chefe(request):
                return Response(
                    {"error": "Apenas o chefe pode ver este relatório."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            return Response(
                {"error": "Apenas o chefe pode ver este relatório."},
                status=status.HTTP_403_FORBIDDEN,
            )

        di = _parse_data_request(request.GET.get('data_inicio') or request.GET.get('de'))
        df = _parse_data_request(request.GET.get('data_fim') or request.GET.get('ate'))
        if not di or not df:
            return Response(
                {'error': 'Informe data_inicio e data_fim (YYYY-MM-DD).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if di > df:
            return Response(
                {'error': 'data_inicio não pode ser posterior a data_fim.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filtro_ordem_ok = Q(ordem__isnull=True) | Q(ordem__cancelada=False)
        money = DecimalField(max_digits=18, decimal_places=2)
        # total_gasto antes de quantidade: senão F('quantidade') vira Sum(quantidade) e Sum aninha Sum (FieldError no Django 6).
        linha_valor = ExpressionWrapper(F('quantidade') * F('preco_no_dia'), output_field=money)

        mat_base = CompraMaterial.objects.filter(
            filtro_ordem_ok,
            data_compra__date__gte=di,
            data_compra__date__lte=df,
        )
        materiais = []
        for row in (
            mat_base.values('material_id', 'material__nome')
            .annotate(total_gasto=Sum(linha_valor), quantidade=Sum('quantidade'))
            .order_by('-quantidade')
        ):
            materiais.append({
                'material_id': row['material_id'],
                'nome': row['material__nome'] or '',
                'quantidade': int(row['quantidade'] or 0),
                'total_gasto': _safe_float(row['total_gasto'] or 0),
            })

        prod_base = CompraProduto.objects.filter(
            filtro_ordem_ok,
            data_compra__date__gte=di,
            data_compra__date__lte=df,
        )
        produtos = []
        for row in (
            prod_base.values('produto_id', 'produto__nome')
            .annotate(total_gasto=Sum(linha_valor), quantidade=Sum('quantidade'))
            .order_by('-quantidade')
        ):
            produtos.append({
                'produto_id': row['produto_id'],
                'nome': row['produto__nome'] or '',
                'quantidade': int(row['quantidade'] or 0),
                'total_gasto': _safe_float(row['total_gasto'] or 0),
            })

        return Response({
            'data_inicio': di.isoformat(),
            'data_fim': df.isoformat(),
            'materiais': materiais,
            'produtos': produtos,
        })


# --- Compras (ordem com itens, como Venda) ---
@method_decorator(csrf_exempt, name='dispatch')
class CompraListCreate(APIView):
    def get(self, request):
        try:
            tz_br = ZoneInfo('America/Sao_Paulo')
            ordens = list(
                OrdemCompra.objects
                .prefetch_related('itens__material', 'itens_produtos__produto')
                .select_related('fornecedor')
            )
            itens_sem_ordem_mat = list(
                CompraMaterial.objects.filter(ordem__isnull=True).select_related('fornecedor', 'material')
            )
            itens_sem_ordem_prod = list(
                CompraProduto.objects.filter(ordem__isnull=True).select_related('fornecedor', 'produto')
            )

            def _ts(dt):
                if not dt:
                    return 0.0
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, tz_br)
                return dt.timestamp()

            merged = []
            for o in ordens:
                dt = o.data_lancamento or o.data_compra
                merged.append((_ts(dt), o.id or 0, 'ordem', o))
            for c in itens_sem_ordem_mat:
                dt = c.data_lancamento or c.data_compra
                merged.append((_ts(dt), c.id or 0, 'mat', c))
            for c in itens_sem_ordem_prod:
                dt = c.data_lancamento or c.data_compra
                merged.append((_ts(dt), c.id or 0, 'prod', c))

            merged.sort(key=lambda x: (x[0], x[1]), reverse=True)

            out = []
            for _, _, kind, obj in merged:
                if kind == 'ordem':
                    out.append(OrdemCompraSerializer(obj).data)
                elif kind == 'mat':
                    c = obj
                    d_iso = _data_historico_iso(c.data_compra)
                    dl_iso = _lancamento_iso_datetime_br(getattr(c, 'data_lancamento', None) or c.data_compra)
                    out.append({
                        'id': f'item-mat-{c.id}',
                        'fornecedor': c.fornecedor.nome,
                        'fornecedor_id': c.fornecedor_id,
                        'data': d_iso if d_iso else None,
                        'data_lancamento': dl_iso if dl_iso else None,
                        'itens': [ItemCompraMaterialSerializer(c).data],
                        'total': float(c.total_compra),
                    })
                else:
                    c = obj
                    d_iso = _data_historico_iso(c.data_compra)
                    dl_iso = _lancamento_iso_datetime_br(getattr(c, 'data_lancamento', None) or c.data_compra)
                    out.append({
                        'id': f'item-prod-{c.id}',
                        'fornecedor': c.fornecedor.nome,
                        'fornecedor_id': c.fornecedor_id,
                        'data': d_iso if d_iso else None,
                        'data_lancamento': dl_iso if dl_iso else None,
                        'itens': [ItemCompraProdutoSerializer(c).data],
                        'total': float(c.total_compra),
                    })
            return Response(out)
        except Exception as e:
            # Migração 0018 (OrdemCompra/ordem) não aplicada ou outro erro de BD
            from django.db.utils import OperationalError
            if isinstance(e, OperationalError):
                return Response([])
            raise

    def post(self, request):
        fornecedor_id = request.data.get('fornecedor_id')
        itens = request.data.get('itens', [])
        if not fornecedor_id:
            return Response({'fornecedor_id': ['Este campo é obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)
        if not itens or not isinstance(itens, list):
            return Response({'itens': ['Envie pelo menos um item.']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            fornecedor = Fornecedor.objects.get(pk=fornecedor_id)
        except Fornecedor.DoesNotExist:
            return Response({'fornecedor_id': ['Fornecedor inválido.']}, status=status.HTTP_400_BAD_REQUEST)
        data_raw = request.data.get('data') or request.data.get('data_compra')
        data_enviada = _parse_data_request(data_raw)
        if data_enviada:
            tz_br = ZoneInfo('America/Sao_Paulo')
            data_hora_compra = datetime.combine(
                data_enviada, datetime.min.time().replace(hour=12, minute=0, second=0, microsecond=0), tzinfo=tz_br
            )
        else:
            _, data_hora_compra = _data_hora_negocio()
        ordem = OrdemCompra.objects.create(fornecedor=fornecedor, data_compra=data_hora_compra)
        created = []
        for item in itens:
            item_tipo = (item.get('tipo') or '').strip().lower()
            material_id = item.get('material')
            produto_id = item.get('produto')
            qtd = item.get('quantidade')
            preco = item.get('preco_no_dia')
            if qtd is None or preco is None:
                continue
            try:
                q = _int_quantidade_item(qtd)
                p = Decimal(str(preco).replace(',', '.'))
            except (ValueError, TypeError):
                continue
            if q <= 0 or p < 0:
                continue
            # Se não veio tipo explícito, tenta inferir por presença do campo
            if not item_tipo:
                item_tipo = 'produto' if produto_id else 'material'

            if item_tipo == 'produto' or produto_id:
                if not produto_id:
                    continue
                try:
                    prod = Produto.objects.get(pk=produto_id)
                except Produto.DoesNotExist:
                    continue
                if not _produto_elegivel_compra_pronta(prod):
                    continue
                c = CompraProduto.objects.create(
                    ordem=ordem,
                    fornecedor=fornecedor,
                    produto=prod,
                    quantidade=q,
                    preco_no_dia=p,
                    data_compra=data_hora_compra,
                )
                created.append(c)
            else:
                if not material_id:
                    continue
                try:
                    material = Material.objects.get(pk=material_id)
                except Material.DoesNotExist:
                    continue
                c = CompraMaterial.objects.create(
                    ordem=ordem,
                    fornecedor=fornecedor,
                    material=material,
                    quantidade=q,
                    preco_no_dia=p,
                    data_compra=data_hora_compra,
                )
                created.append(c)
        if not created:
            ordem.delete()
            return Response({'itens': ['Nenhum item válido.']}, status=status.HTTP_400_BAD_REQUEST)
        _api_log(request, "Criar", "Compra", f"Ordem #{ordem.id} - {len(created)} itens - Fornecedor {fornecedor.nome} (ID {fornecedor.id})")
        return Response(OrdemCompraSerializer(ordem).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class CompraDetail(APIView):
    def get(self, request, pk):
        try:
            if isinstance(pk, str) and pk.startswith('item-'):
                pk = pk.replace('item-', '')
                pk = pk.replace('mat-', '').replace('prod-', '')
            pk_int = int(pk)
        except (ValueError, TypeError):
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            ordem = OrdemCompra.objects.prefetch_related('itens__material', 'itens_produtos__produto').select_related('fornecedor').filter(pk=pk_int).first()
            if ordem:
                return Response(OrdemCompraSerializer(ordem).data)
            item = CompraMaterial.objects.select_related('fornecedor', 'material').filter(pk=pk_int).first()
            if item:
                if item.ordem_id:
                    return Response(OrdemCompraSerializer(item.ordem).data)
                d_iso = _data_historico_iso(item.data_compra)
                dl_iso = _data_historico_iso(getattr(item, 'data_lancamento', None) or item.data_compra)
                return Response({
                    'id': f'item-mat-{item.id}',
                    'fornecedor': item.fornecedor.nome,
                    'fornecedor_id': item.fornecedor_id,
                    'data': d_iso if d_iso else None,
                    'data_lancamento': dl_iso if dl_iso else None,
                    'itens': [ItemCompraMaterialSerializer(item).data],
                    'total': float(item.total_compra),
                })
            itemp = CompraProduto.objects.select_related('fornecedor', 'produto').filter(pk=pk_int).first()
            if itemp:
                if itemp.ordem_id:
                    return Response(OrdemCompraSerializer(itemp.ordem).data)
                d_iso = _data_historico_iso(itemp.data_compra)
                dl_iso = _data_historico_iso(getattr(itemp, 'data_lancamento', None) or itemp.data_compra)
                return Response({
                    'id': f'item-prod-{itemp.id}',
                    'fornecedor': itemp.fornecedor.nome,
                    'fornecedor_id': itemp.fornecedor_id,
                    'data': d_iso if d_iso else None,
                    'data_lancamento': dl_iso if dl_iso else None,
                    'itens': [ItemCompraProdutoSerializer(itemp).data],
                    'total': float(itemp.total_compra),
                })
        except Exception as e:
            from django.db.utils import OperationalError
            if isinstance(e, OperationalError):
                return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
            raise
        return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, pk):
        """Altera a data da compra da ordem (e dos itens); não altera data_lancamento."""
        try:
            pk_int = int(pk)
        except (ValueError, TypeError):
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        ordem = OrdemCompra.objects.filter(pk=pk_int).first()
        if not ordem:
            return Response(
                {'detail': 'Só é possível alterar a data em conjunto para uma ordem (id numérico).'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if ordem.cancelada:
            return Response({'detail': 'Ordem cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
        _, observacao, err = _exigir_senha_e_observacao_compra(request)
        if err:
            return err
        data = request.data or {}
        data_raw = data.get('data') or data.get('data_compra')
        if not data_raw:
            return Response(
                {'data': ['Informe data ou data_compra (YYYY-MM-DD).']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data_enviada = _parse_data_request(str(data_raw).strip())
        if not data_enviada:
            return Response(
                {'data': ['Data inválida. Use YYYY-MM-DD.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tz_br = ZoneInfo('America/Sao_Paulo')
        data_hora = datetime.combine(
            data_enviada,
            datetime.min.time().replace(hour=12, minute=0, second=0, microsecond=0),
            tzinfo=tz_br,
        )
        data_antiga = ordem.data_compra.date().isoformat() if ordem.data_compra else ''
        ordem.data_compra = data_hora
        ordem.ultima_alteracao_observacao = observacao[:2000]
        ordem.ultima_alteracao_em = timezone.now()
        ordem.save(update_fields=['data_compra', 'ultima_alteracao_observacao', 'ultima_alteracao_em'])
        ordem.itens.update(data_compra=data_hora)
        ordem.itens_produtos.update(data_compra=data_hora)
        _api_log(
            request,
            "Editar",
            "Compra",
            f"Ordem #{pk_int} - data da compra {data_antiga} → {data_enviada.isoformat()}. Obs.: {observacao}",
        )
        ordem = OrdemCompra.objects.prefetch_related(
            'itens__material', 'itens_produtos__produto'
        ).select_related('fornecedor').get(pk=pk_int)
        return Response(OrdemCompraSerializer(ordem).data)

    def post(self, request, pk):
        """Adiciona um item (material/produto) numa ordem existente."""
        try:
            pk_int = int(pk)
        except (ValueError, TypeError):
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        ordem = OrdemCompra.objects.select_related('fornecedor').filter(pk=pk_int).first()
        if not ordem:
            return Response({'detail': 'Só é possível adicionar itens a uma ordem (id numérico).'}, status=status.HTTP_404_NOT_FOUND)
        if ordem.cancelada:
            return Response({'detail': 'Ordem cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
        _, observacao, err = _exigir_senha_e_observacao_compra(request)
        if err:
            return err
        data = request.data if isinstance(request.data, dict) else {}
        item_tipo = (data.get('tipo') or '').strip().lower()
        qtd = data.get('quantidade')
        preco = data.get('preco_no_dia')
        if qtd is None or preco is None:
            return Response({'detail': 'Informe quantidade e preco_no_dia.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            q = _int_quantidade_item(qtd)
            p = Decimal(str(preco).replace(',', '.'))
        except (ValueError, TypeError):
            return Response({'detail': 'Quantidade ou preço inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        if q <= 0 or p < 0:
            return Response({'detail': 'Quantidade deve ser > 0 e preço >= 0.'}, status=status.HTTP_400_BAD_REQUEST)

        # Default: inferir tipo pelo campo presente
        material_id = data.get('material')
        produto_id = data.get('produto')
        if not item_tipo:
            item_tipo = 'produto' if produto_id else 'material'

        if item_tipo == 'produto' or produto_id:
            if not produto_id:
                return Response({'produto': ['Informe o produto.']}, status=status.HTTP_400_BAD_REQUEST)
            try:
                prod = Produto.objects.get(pk=int(produto_id))
            except (Produto.DoesNotExist, ValueError, TypeError):
                return Response({'produto': ['Produto inválido.']}, status=status.HTTP_400_BAD_REQUEST)
            if not _produto_elegivel_compra_pronta(prod):
                return Response({'produto': ['Produto não elegível para compra como item pronto.']}, status=status.HTTP_400_BAD_REQUEST)
            item = CompraProduto.objects.create(
                ordem=ordem,
                fornecedor=ordem.fornecedor,
                produto=prod,
                quantidade=q,
                preco_no_dia=p,
                data_compra=ordem.data_compra,
            )
            _api_log(
                request,
                "Editar",
                "Compra",
                f"Ordem #{pk_int} - item produto adicionado (linha #{item.id}, produto {prod.id}, qtd {q}, preço {float(p)}). Obs.: {observacao}",
            )
            _set_ultima_alteracao_ordem(pk_int, observacao)
        else:
            if not material_id:
                return Response({'material': ['Informe o material.']}, status=status.HTTP_400_BAD_REQUEST)
            try:
                material = Material.objects.get(pk=int(material_id))
            except (Material.DoesNotExist, ValueError, TypeError):
                return Response({'material': ['Material inválido.']}, status=status.HTTP_400_BAD_REQUEST)
            item = CompraMaterial.objects.create(
                ordem=ordem,
                fornecedor=ordem.fornecedor,
                material=material,
                quantidade=q,
                preco_no_dia=p,
                data_compra=ordem.data_compra,
            )
            _api_log(
                request,
                "Editar",
                "Compra",
                f"Ordem #{pk_int} - item material adicionado (linha #{item.id}, material {material.id}, qtd {q}, preço {float(p)}). Obs.: {observacao}",
            )
            _set_ultima_alteracao_ordem(pk_int, observacao)

        ordem = OrdemCompra.objects.prefetch_related('itens__material', 'itens_produtos__produto').select_related('fornecedor').get(pk=pk_int)
        return Response(OrdemCompraSerializer(ordem).data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        if isinstance(pk, str) and pk.startswith('item-'):
            pk = pk.replace('item-', '')
            pk = pk.replace('mat-', '').replace('prod-', '')
        tipo_hint = request.data.get('tipo') if isinstance(request.data, dict) else None
        obj, kind = _resolve_compra_linha_por_pk(pk, tipo_hint)
        if kind == 'ambiguous':
            return Response(
                {
                    'detail': 'Existem uma linha de material e uma de produto com o mesmo ID numérico. Envie "tipo": "material" ou "produto".',
                    'tipo': ['Obrigatório para desambiguar esta linha.'],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if obj is None:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.ordem_id and obj.ordem.cancelada:
            return Response({'detail': 'Ordem cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
        _, observacao, err = _exigir_senha_e_observacao_compra(request)
        if err:
            return err
        old_q = obj.quantidade
        old_p = float(obj.preco_no_dia or 0)
        old_mat = getattr(obj, 'material_id', None)
        old_prod = getattr(obj, 'produto_id', None)
        old_forn = getattr(obj, 'fornecedor_id', None)
        if request.data.get('quantidade') is not None:
            try:
                obj.quantidade = _int_quantidade_item(request.data.get('quantidade'))
            except (ValueError, TypeError):
                pass
        if request.data.get('preco_no_dia') is not None:
            try:
                obj.preco_no_dia = Decimal(str(request.data.get('preco_no_dia')).replace(',', '.'))
            except (ValueError, TypeError):
                pass
        if kind == 'material' and request.data.get('material') is not None:
            try:
                obj.material_id = int(request.data.get('material'))
            except (ValueError, TypeError):
                pass
        if kind == 'produto' and request.data.get('produto') is not None:
            try:
                new_pid = int(request.data.get('produto'))
                np = Produto.objects.filter(pk=new_pid).first()
                if not np:
                    return Response({'produto': ['Produto não encontrado.']}, status=status.HTTP_400_BAD_REQUEST)
                if not np.ativo:
                    return Response(
                        {'produto': ['Produto inativo no cadastro; escolha um produto ativo.']},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                obj.produto_id = new_pid
            except (ValueError, TypeError):
                pass
        if request.data.get('fornecedor') is not None:
            try:
                obj.fornecedor_id = int(request.data.get('fornecedor'))
            except (ValueError, TypeError):
                pass
        obj.save()
        mud = []
        if request.data.get('quantidade') is not None and old_q != obj.quantidade:
            mud.append(f"qtd {old_q}→{obj.quantidade}")
        if request.data.get('preco_no_dia') is not None and old_p != float(obj.preco_no_dia or 0):
            mud.append(f"preço {old_p}→{float(obj.preco_no_dia or 0)}")
        if kind == 'material' and request.data.get('material') is not None and old_mat != obj.material_id:
            mud.append(f"material {old_mat}→{obj.material_id}")
        if kind == 'produto' and request.data.get('produto') is not None and old_prod != obj.produto_id:
            mud.append(f"produto {old_prod}→{obj.produto_id}")
        if request.data.get('fornecedor') is not None and old_forn != obj.fornecedor_id:
            mud.append(f"fornecedor_linha {old_forn}→{obj.fornecedor_id}")
        det = ', '.join(mud) if mud else 'sem mudança de campos reconhecida'
        _api_log(
            request,
            "Editar",
            "Compra",
            f"{'Ordem #' + str(obj.ordem_id) if obj.ordem_id else 'Compra avulsa'} linha #{pk} ({kind}): {det}. Obs.: {observacao}",
        )
        _set_ultima_alteracao_ordem(obj.ordem_id, observacao)
        if kind == 'material':
            return Response(CompraSerializer(obj).data)
        return Response(ItemCompraProdutoSerializer(obj).data)

    def delete(self, request, pk):
        if isinstance(pk, str) and pk.startswith('item-'):
            pk = pk.replace('item-', '')
            pk = pk.replace('mat-', '').replace('prod-', '')
        try:
            pk_int = int(pk)
        except (ValueError, TypeError):
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        ordem = OrdemCompra.objects.filter(pk=pk_int).first()
        if ordem:
            if ordem.cancelada:
                return Response(status=status.HTTP_204_NO_CONTENT)
            _, observacao, err = _exigir_senha_e_observacao_compra(request)
            if err:
                return err
            motivo, merr = _exigir_motivo_exclusao(request)
            if merr:
                return merr
            OrdemCompra.objects.filter(pk=pk_int).update(
                cancelada=True,
                ultima_alteracao_observacao=observacao[:2000],
                ultima_alteracao_em=timezone.now(),
            )
            _api_log(
                request,
                "Cancelar",
                "Compra",
                f"Ordem #{pk} cancelada (permanece no histórico). Motivo: {motivo}. Obs.: {observacao}",
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        tipo_hint = request.data.get('tipo') if isinstance(request.data, dict) else None
        obj, kind = _resolve_compra_linha_por_pk(pk_int, tipo_hint)
        if kind == 'ambiguous':
            return Response(
                {
                    'detail': 'Existem linha de material e de produto com o mesmo ID numérico. Envie "tipo": "material" ou "produto".',
                    'tipo': ['Obrigatório para desambiguar.'],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if obj is None:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if obj.ordem_id and obj.ordem.cancelada:
            return Response({'detail': 'Ordem cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
        _, observacao, err = _exigir_senha_e_observacao_compra(request)
        if err:
            return err
        motivo, merr = _exigir_motivo_exclusao(request)
        if merr:
            return merr
        ordem = obj.ordem
        if ordem:
            _set_ultima_alteracao_ordem(ordem.pk, observacao)
        if kind == 'produto':
            obj.delete()
            if ordem and (not ordem.itens.exists()) and (not ordem.itens_produtos.exists()):
                ordem.delete()
            _api_log(request, "Excluir", "Compra", f"Compra produto #{pk} excluída. Motivo: {motivo}. Obs.: {observacao}")
            return Response(status=status.HTTP_204_NO_CONTENT)
        obj.delete()
        if ordem and (not ordem.itens.exists()) and (not ordem.itens_produtos.exists()):
            ordem.delete()
        _api_log(request, "Excluir", "Compra", f"Compra #{pk} excluída. Motivo: {motivo}. Obs.: {observacao}")
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class CompraCopiar(APIView):
    def post(self, request, pk):
        if isinstance(pk, str) and pk.startswith('item-'):
            pk = pk.replace('item-', '')
            pk = pk.replace('mat-', '').replace('prod-', '')
        try:
            pk_int = int(pk)
        except (ValueError, TypeError):
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        ordem = OrdemCompra.objects.prefetch_related('itens__material', 'itens_produtos__produto').select_related('fornecedor').filter(pk=pk_int).first()
        if ordem:
            if ordem.cancelada:
                return Response({'detail': 'Não é possível copiar uma ordem cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
            nova_ordem = OrdemCompra.objects.create(
                fornecedor=ordem.fornecedor,
                data_compra=ordem.data_compra,
            )
            for item in ordem.itens.all():
                CompraMaterial.objects.create(
                    ordem=nova_ordem,
                    fornecedor=ordem.fornecedor,
                    material=item.material,
                    quantidade=item.quantidade,
                    preco_no_dia=item.preco_no_dia,
                    data_compra=ordem.data_compra,
                )
            for item in ordem.itens_produtos.all():
                CompraProduto.objects.create(
                    ordem=nova_ordem,
                    fornecedor=ordem.fornecedor,
                    produto=item.produto,
                    quantidade=item.quantidade,
                    preco_no_dia=item.preco_no_dia,
                    data_compra=ordem.data_compra,
                )
            _api_log(request, "Criar", "Compra", f"Ordem #{nova_ordem.id} copiada da ordem #{pk}")
            return Response(OrdemCompraSerializer(nova_ordem).data, status=status.HTTP_201_CREATED)
        item = CompraMaterial.objects.select_related('fornecedor', 'material').filter(pk=pk_int).first()
        if item:
            nova = CompraMaterial.objects.create(
                fornecedor=item.fornecedor,
                material=item.material,
                quantidade=item.quantidade,
                preco_no_dia=item.preco_no_dia,
            )
            _api_log(request, "Criar", "Compra", f"Compra #{nova.id} copiada da compra #{pk}")
            return Response(CompraSerializer(nova).data, status=status.HTTP_201_CREATED)
        itemp = CompraProduto.objects.select_related('fornecedor', 'produto').filter(pk=pk_int).first()
        if itemp:
            nova = CompraProduto.objects.create(
                fornecedor=itemp.fornecedor,
                produto=itemp.produto,
                quantidade=itemp.quantidade,
                preco_no_dia=itemp.preco_no_dia,
            )
            _api_log(request, "Criar", "Compra", f"Compra produto #{nova.id} copiada da compra #{pk}")
            return Response(ItemCompraProdutoSerializer(nova).data, status=status.HTTP_201_CREATED)
        return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)


# --- Transações ---
@method_decorator(csrf_exempt, name='dispatch')
class TransacaoListCreate(APIView):
    def get(self, request):
        from django.db import connection
        out = []
        tbl_pag = Pagamento._meta.db_table
        tbl_pf = PagamentoFornecedor._meta.db_table
        tbl_cli = Cliente._meta.db_table
        tbl_forn = Fornecedor._meta.db_table
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT p.id, p.data_pagamento, CAST(p.valor AS REAL), p.cliente_id FROM {tbl_pag} p ORDER BY p.data_pagamento DESC LIMIT 200"
            )
            rows_pag = cursor.fetchall()
            cursor.execute(
                f"SELECT pf.id, pf.data_pagamento, CAST(pf.valor AS REAL), pf.fornecedor_id FROM {tbl_pf} pf ORDER BY pf.data_pagamento DESC LIMIT 200"
            )
            rows_pf = cursor.fetchall()
        cliente_ids = list({r[3] for r in rows_pag if r[3]})
        fornecedor_ids = list({r[3] for r in rows_pf if r[3]})
        nomes_cliente = dict(Cliente.objects.filter(id__in=cliente_ids).values_list('id', 'nome')) if cliente_ids else {}
        nomes_forn = dict(Fornecedor.objects.filter(id__in=fornecedor_ids).values_list('id', 'nome')) if fornecedor_ids else {}
        for r in rows_pag:
            id_, dt, val, cliente_id = r[0], r[1], r[2], r[3]
            date_str = dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)[:10]
            if hasattr(dt, 'date'):
                date_str = dt.date().isoformat() if dt else ''
            nome = nomes_cliente.get(cliente_id, '')
            out.append({
                'id': f'pag-{id_}',
                'description': f'Recebido de {nome}',
                'amount': _safe_float(val),
                'type': 'income',
                'date': date_str,
                'category': 'Vendas',
                'createdAt': date_str,
            })
        for r in rows_pf:
            id_, dt, val, forn_id = r[0], r[1], r[2], r[3]
            date_str = str(dt)[:10] if dt else ''
            if hasattr(dt, 'date'):
                date_str = dt.date().isoformat() if dt else ''
            nome = nomes_forn.get(forn_id, '')
            out.append({
                'id': f'pf-{id_}',
                'description': f'Pagamento a {nome}',
                'amount': _safe_float(val),
                'type': 'expense',
                'date': date_str,
                'category': 'Compras',
                'createdAt': date_str,
            })
        for m in MovimentoCaixa.objects.filter(tipo='saida').order_by('-data')[:200]:
            dt = m.data
            date_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)[:10]
            out.append({
                'id': f'mov-{m.id}',
                'description': m.descricao,
                'amount': float(m.valor),
                'type': 'expense',
                'date': date_str,
                'category': 'Outros',
                'createdAt': date_str,
            })
        for m in MovimentoCaixa.objects.filter(tipo='entrada').order_by('-data')[:200]:
            dt = m.data
            date_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)[:10]
            out.append({
                'id': f'mov-e-{m.id}',
                'description': m.descricao,
                'amount': float(m.valor),
                'type': 'income',
                'date': date_str,
                'category': 'Outros',
                'createdAt': date_str,
            })
        for m in MovimentoBanco.objects.select_related('conta').order_by('-data')[:200]:
            # Movimentos bancários automáticos já estão representados nas transações de Pagamento/PagamentoFornecedor.
            # Evita duplicar despesas/receitas no frontend (ex.: pagamento a fornecedor com conta_id cria MovimentoBanco).
            desc = (m.descricao or '')
            desc_low = desc.lower()
            if (
                ('pagamento fornecedor id' in desc_low)
                or ('recebimento cliente id' in desc_low)
            ):
                continue
            dt = m.data
            date_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)[:10]
            out.append({
                'id': f'mb-{m.id}',
                'description': desc,
                'amount': float(m.valor),
                'type': 'income' if m.tipo == 'entrada' else 'expense',
                'date': date_str,
                'category': m.conta.nome if m.conta_id else 'Conta bancária',
                'createdAt': date_str,
            })
        out.sort(key=lambda x: x['date'], reverse=True)
        return Response(out[:200])

    def post(self, request):
        data = request.data
        desc = data.get('description', '')
        amount = data.get('amount', 0)
        typ = data.get('type', 'expense')
        category = data.get('category', 'Outros')
        date_str = data.get('date') or timezone.now().date().isoformat()
        conta_id = data.get('conta_id')
        if conta_id:
            try:
                conta = ContaBanco.objects.get(pk=conta_id)
                tipo = 'entrada' if typ == 'income' else 'saida'
                v = Decimal(str(amount).replace(',', '.'))
                if v <= 0:
                    return Response({'amount': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
                MovimentoBanco.objects.create(conta=conta, tipo=tipo, descricao=desc or 'Transação', valor=v)
                if tipo == 'entrada':
                    conta.saldo_atual += v
                else:
                    conta.saldo_atual -= v
                conta.save()
                _api_log(request, tipo.capitalize() + " banco", "MovimentoBanco", f"{conta.nome} - {desc or 'Transação'} R$ {float(v)}")
                return Response({**data, 'id': f'mb-new'}, status=status.HTTP_201_CREATED)
            except ContaBanco.DoesNotExist:
                return Response({'conta_id': ['Conta não encontrada']}, status=status.HTTP_400_BAD_REQUEST)
        if typ == 'income':
            MovimentoCaixa.objects.create(tipo='entrada', descricao=desc, valor=Decimal(str(amount)))
            _api_log(request, "Entrada", "MovimentoCaixa", f"{desc} - R$ {amount}")
        else:
            MovimentoCaixa.objects.create(tipo='saida', descricao=desc, valor=Decimal(str(amount)))
            _api_log(request, "Saída", "MovimentoCaixa", f"{desc} - R$ {amount}")
        return Response(data, status=status.HTTP_201_CREATED)


# --- Logs ---
@method_decorator(csrf_exempt, name='dispatch')
class LogList(APIView):
    def get(self, request):
        from .models import PerfilUsuario
        logs = LogSistema.objects.select_related('usuario').all().order_by('-data')[:500]
        out = []
        for l in logs:
            usuario_nome = None
            if l.usuario:
                try:
                    usuario_nome = l.usuario.perfil_financeiro.nome_exibicao or l.usuario.get_full_name() or l.usuario.username
                except PerfilUsuario.DoesNotExist:
                    usuario_nome = l.usuario.get_full_name() or l.usuario.username
                if not usuario_nome:
                    usuario_nome = l.usuario.username
            out.append({
                'id': l.id,
                'data': l.data.isoformat() if l.data else '',
                'acao': l.acao,
                'tabela': l.tabela,
                'detalhes': l.detalhes,
                'usuario': usuario_nome or (l.usuario.username if l.usuario else None),
            })
        return Response(out)


# --- Registro de impressões (ordens / fechamentos) ---
@method_decorator(csrf_exempt, name='dispatch')
class ImpressaoListCreate(APIView):
    def get(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response({'error': 'Não autenticado.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            from .views_auth import _is_chefe
            if not _is_chefe(request):
                return Response({'error': 'Apenas o chefe pode listar impressões.'}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            return Response({'error': 'Apenas o chefe pode listar impressões.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            limit = min(int(request.GET.get('limit', 200)), 500)
        except (TypeError, ValueError):
            limit = 200
        qs = RegistroImpressao.objects.select_related('usuario').order_by('-criado_em')[:limit]
        return Response(RegistroImpressaoListSerializer(qs, many=True).data)

    def post(self, request):
        if not getattr(request.user, 'is_authenticated', False):
            return Response({'error': 'Não autenticado.'}, status=status.HTTP_401_UNAUTHORIZED)
        body = request.data or {}
        tipo = (body.get('tipo') or '').strip()
        titulo = (body.get('titulo') or '').strip()[:255]
        html = body.get('html')
        valid_tipos = {c[0] for c in RegistroImpressao.Tipo.choices}
        if tipo not in valid_tipos:
            return Response({'tipo': ['Tipo inválido.']}, status=status.HTTP_400_BAD_REQUEST)
        if html is None or not str(html).strip():
            return Response({'html': ['Conteúdo HTML obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)
        meta = body.get('meta') if isinstance(body.get('meta'), dict) else {}
        reg = RegistroImpressao.objects.create(
            tipo=tipo,
            titulo=titulo,
            html=str(html),
            meta=meta,
            usuario=request.user if request.user.is_authenticated else None,
        )
        _api_log(request, "Registrar impressão", "RegistroImpressao", f"{tipo} — {titulo or reg.id}")
        return Response(RegistroImpressaoDetailSerializer(reg).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class ImpressaoDetail(APIView):
    def get(self, request, pk):
        if not getattr(request.user, 'is_authenticated', False):
            return Response({'error': 'Não autenticado.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            from .views_auth import _is_chefe
            if not _is_chefe(request):
                return Response({'error': 'Apenas o chefe pode ver impressões.'}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            return Response({'error': 'Apenas o chefe pode ver impressões.'}, status=status.HTTP_403_FORBIDDEN)
        reg = RegistroImpressao.objects.select_related('usuario').filter(pk=pk).first()
        if not reg:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(RegistroImpressaoDetailSerializer(reg).data)


# --- Dívidas gerais ---
@method_decorator(csrf_exempt, name='dispatch')
class DividaGeralListCreate(APIView):
    def get(self, request):
        qs = DividaGeral.objects.all().order_by('nome')
        out = [{'id': d.id, 'nome': d.nome, 'valor': float(d.valor)} for d in qs]
        return Response(out)

    def post(self, request):
        nome = request.data.get('nome', '').strip()
        valor = request.data.get('valor', 0)
        if not nome:
            return Response({'nome': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            v = Decimal(str(valor).replace(',', '.'))
            d = DividaGeral.objects.create(nome=nome, valor=v)
            _api_log(request, "Criar", "DividaGeral", f"{d.nome} - R$ {float(d.valor)}")
            return Response({'id': d.id, 'nome': d.nome, 'valor': float(d.valor)}, status=status.HTTP_201_CREATED)
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class DividaGeralDetail(APIView):
    def get_object(self, pk):
        return DividaGeral.objects.get(pk=pk)

    def put(self, request, pk):
        obj = self.get_object(pk)
        nome = request.data.get('nome')
        valor = request.data.get('valor')
        if nome is not None:
            obj.nome = nome.strip()
        if valor is not None:
            try:
                obj.valor = Decimal(str(valor).replace(',', '.'))
            except (ValueError, TypeError):
                pass
        obj.save()
        _api_log(request, "Editar", "DividaGeral", f"{obj.nome} - R$ {float(obj.valor)}")
        return Response({'id': obj.id, 'nome': obj.nome, 'valor': float(obj.valor)})

    def delete(self, request, pk):
        obj = self.get_object(pk)
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "DividaGeral", nome)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Outros a receber ---
@method_decorator(csrf_exempt, name='dispatch')
class OutrosAReceberListCreate(APIView):
    def get(self, request):
        qs = OutrosAReceber.objects.all().order_by('-data_prevista', '-id')
        out = [{'id': o.id, 'descricao': o.descricao, 'valor': float(o.valor), 'data_prevista': o.data_prevista.isoformat() if o.data_prevista else None} for o in qs]
        return Response(out)

    def post(self, request):
        descricao = request.data.get('descricao', '').strip()
        valor = request.data.get('valor', 0)
        data_prevista = request.data.get('data_prevista')
        if not descricao:
            return Response({'descricao': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            v = Decimal(str(valor).replace(',', '.'))
            from datetime import datetime
            dp = datetime.strptime(data_prevista[:10], '%Y-%m-%d').date() if data_prevista else None
            o = OutrosAReceber.objects.create(descricao=descricao, valor=v, data_prevista=dp)
            _api_log(request, "Criar", "OutrosAReceber", f"{o.descricao} - R$ {float(o.valor)}")
            return Response({'id': o.id, 'descricao': o.descricao, 'valor': float(o.valor), 'data_prevista': o.data_prevista.isoformat() if o.data_prevista else None}, status=status.HTTP_201_CREATED)
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class OutrosAReceberDetail(APIView):
    def get_object(self, pk):
        return OutrosAReceber.objects.get(pk=pk)

    def put(self, request, pk):
        obj = self.get_object(pk)
        if request.data.get('descricao') is not None:
            obj.descricao = request.data.get('descricao', '').strip()
        if request.data.get('valor') is not None:
            try:
                obj.valor = Decimal(str(request.data.get('valor')).replace(',', '.'))
            except (ValueError, TypeError):
                pass
        if request.data.get('data_prevista') is not None:
            from datetime import datetime
            dp = request.data.get('data_prevista')
            obj.data_prevista = datetime.strptime(dp[:10], '%Y-%m-%d').date() if dp else None
        obj.save()
        _api_log(request, "Editar", "OutrosAReceber", obj.descricao)
        return Response({'id': obj.id, 'descricao': obj.descricao, 'valor': float(obj.valor), 'data_prevista': obj.data_prevista.isoformat() if obj.data_prevista else None})

    def delete(self, request, pk):
        obj = self.get_object(pk)
        desc = obj.descricao
        obj.delete()
        _api_log(request, "Excluir", "OutrosAReceber", desc)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Saídas (MovimentoCaixa tipo saida) ---
@method_decorator(csrf_exempt, name='dispatch')
class SaidasListCreate(APIView):
    def get(self, request):
        qs = MovimentoCaixa.objects.filter(tipo='saida').order_by('-data')[:100]
        out = [{'id': m.id, 'data': m.data.isoformat() if m.data else '', 'descricao': m.descricao, 'valor': float(m.valor)} for m in qs]
        return Response(out)

    def post(self, request):
        descricao = request.data.get('descricao', '').strip()
        valor = request.data.get('valor')
        if not descricao or valor is None:
            return Response({'error': 'descricao e valor obrigatórios'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            v = Decimal(str(valor).replace(',', '.'))
            if v <= 0:
                return Response({'valor': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
            m = MovimentoCaixa.objects.create(tipo='saida', descricao=descricao, valor=v)
            _api_log(request, "Saída", "MovimentoCaixa", f"{descricao} - R$ {float(v)}")
            return Response({'id': m.id, 'descricao': m.descricao, 'valor': float(m.valor)}, status=status.HTTP_201_CREATED)
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


# --- Estoque (materiais + produtos separados) ---
@method_decorator(csrf_exempt, name='dispatch')
class EstoqueList(APIView):
    def get(self, request):
        from django.utils import timezone
        hoje = timezone.now().date()
        ids_alterados_hoje = set(
            AjusteEstoque.objects.filter(data__date=hoje).values_list('material_id', flat=True)
        )
        ids_produtos_alterados_hoje = set(
            AjusteEstoqueProduto.objects.filter(data__date=hoje).values_list('produto_id', flat=True)
        )
        materiais_qs = Material.objects.select_related('categoria').all().order_by('nome')
        out_materiais = []
        for m in materiais_qs:
            cat = m.categoria
            out_materiais.append({
                'id': m.id,
                'nome': m.nome,
                'estoque_atual': m.estoque_atual or 0,
                'preco_unitario_base': float(m.preco_unitario_base),
                'total': float((m.estoque_atual or 0) * (m.preco_unitario_base or 0)),
                'categoria_id': cat.id if cat else None,
                'categoria_nome': cat.nome if cat else None,
                'alterado_hoje': m.id in ids_alterados_hoje,
            })
        produtos_qs = Produto.objects.select_related('categoria').filter(ativo=True).order_by('nome')
        out_produtos = []
        for p in produtos_qs:
            cat = p.categoria
            # Estoque deve refletir custo (investimento), não preço de venda.
            preco = float(p.preco_custo or 0)
            qtd = p.estoque_atual or 0
            out_produtos.append({
                'id': p.id,
                'nome': p.nome,
                'estoque_atual': qtd,
                'preco_unitario_base': preco,
                'total': float(qtd * preco),
                'categoria_id': cat.id if cat else None,
                'categoria_nome': cat.nome if cat else None,
                'alterado_hoje': p.id in ids_produtos_alterados_hoje,
            })
        return Response({'materiais': out_materiais, 'produtos': out_produtos})


@method_decorator(csrf_exempt, name='dispatch')
class EstoqueUltimaAtualizacao(APIView):
    """Retorna a última atualização de estoque (material ou produto)."""
    def get(self, request):
        last_mat = (
            AjusteEstoque.objects.select_related('material')
            .order_by('-data')
            .values('id', 'data', 'tipo', 'quantidade', 'observacao', 'material__nome')
            .first()
        )
        last_prod = (
            AjusteEstoqueProduto.objects.select_related('produto')
            .order_by('-data')
            .values('id', 'data', 'quantidade', 'observacao', 'produto__nome')
            .first()
        )

        if not last_mat and not last_prod:
            return Response({'last_update': None})

        def _dt(v):
            return v.get('data') if v else None

        pick = None
        kind = None
        if last_mat and last_prod:
            pick = last_mat if _dt(last_mat) >= _dt(last_prod) else last_prod
            kind = 'material' if pick is last_mat else 'produto'
        elif last_mat:
            pick = last_mat
            kind = 'material'
        else:
            pick = last_prod
            kind = 'produto'

        if kind == 'material':
            detalhe = f"{pick.get('tipo')} {pick.get('quantidade')}"
            item_nome = pick.get('material__nome') or ''
        else:
            detalhe = f"quantidade → {pick.get('quantidade')}"
            item_nome = pick.get('produto__nome') or ''

        return Response({
            'last_update': {
                'kind': kind,
                'data': pick.get('data').isoformat() if pick.get('data') else None,
                'item_nome': item_nome,
                'detalhe': detalhe,
                'observacao': pick.get('observacao') or '',
            }
        })


@method_decorator(csrf_exempt, name='dispatch')
class EstoqueAjuste(APIView):
    def post(self, request):
        material_id = request.data.get('material_id')
        tipo = request.data.get('tipo')  # 'entrada' | 'saida'
        quantidade = request.data.get('quantidade')
        quantidade_nova = request.data.get('quantidade_nova')  # ajuste por valor fixo: definir qtd atual
        observacao = request.data.get('observacao', '')
        if not material_id:
            return Response({'error': 'material_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            material = Material.objects.get(pk=material_id)
            atual = material.estoque_atual or 0
            if quantidade_nova is not None:
                nova = int(quantidade_nova)
                if nova < 0:
                    return Response({'quantidade_nova': ['Deve ser >= 0']}, status=status.HTTP_400_BAD_REQUEST)
                diff = nova - atual
                if diff > 0:
                    AjusteEstoque.objects.create(material=material, tipo='entrada', quantidade=diff, observacao=observacao or 'Ajuste para quantidade fixa')
                    material.estoque_atual = nova
                elif diff < 0:
                    AjusteEstoque.objects.create(material=material, tipo='saida', quantidade=abs(diff), observacao=observacao or 'Ajuste para quantidade fixa')
                    material.estoque_atual = nova
                material.save()
                _api_log(request, "Ajuste estoque", "AjusteEstoque", f"{material.nome} quantidade fixa → {nova}")
                return Response({'success': True}, status=status.HTTP_201_CREATED)
            if tipo not in ('entrada', 'saida') or quantidade is None:
                return Response({'error': 'tipo e quantidade obrigatórios (ou use quantidade_nova)'}, status=status.HTTP_400_BAD_REQUEST)
            qty = int(quantidade)
            if qty <= 0:
                return Response({'quantidade': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
            if tipo == 'saida' and atual < qty:
                return Response({'error': 'Estoque insuficiente'}, status=status.HTTP_400_BAD_REQUEST)
            AjusteEstoque.objects.create(material=material, tipo=tipo, quantidade=qty, observacao=observacao)
            if tipo == 'entrada':
                material.estoque_atual = atual + qty
                _api_log(request, "Entrada estoque", "AjusteEstoque", f"{material.nome} +{qty}")
            else:
                material.estoque_atual = atual - qty
                _api_log(request, "Saída estoque", "AjusteEstoque", f"{material.nome} -{qty}")
            material.save()
            return Response({'success': True}, status=status.HTTP_201_CREATED)
        except Material.DoesNotExist:
            return Response({'error': 'Material não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError):
            return Response({'quantidade': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class EstoqueAjusteProduto(APIView):
    """Ajuste de estoque de produto (contagem / definir quantidade atual)."""
    def post(self, request):
        produto_id = request.data.get('produto_id')
        quantidade_nova = request.data.get('quantidade_nova')
        observacao = request.data.get('observacao', '')
        if not produto_id:
            return Response({'error': 'produto_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        if quantidade_nova is None:
            return Response({'error': 'quantidade_nova obrigatória'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            produto = Produto.objects.get(pk=produto_id)
            nova = int(quantidade_nova)
            if nova < 0:
                return Response({'quantidade_nova': ['Deve ser >= 0']}, status=status.HTTP_400_BAD_REQUEST)
            produto.estoque_atual = nova
            produto.save()
            AjusteEstoqueProduto.objects.create(
                produto=produto,
                quantidade=nova,
                observacao=observacao or 'Ajuste para quantidade fixa (produto)',
            )
            _api_log(request, "Ajuste estoque produto", "Produto", f"{produto.nome} quantidade → {nova}")
            return Response({'success': True}, status=status.HTTP_201_CREATED)
        except Produto.DoesNotExist:
            return Response({'error': 'Produto não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError):
            return Response({'quantidade_nova': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


# Formas de pagamento permitidas (obrigatório no lançamento)
METODO_PAGAMENTO_CHOICES = {'Pix', 'Dinheiro', 'Cartão crédito', 'Cartão débito', 'Cheque'}

# Fuso do negócio: fallback quando o frontend não envia a data
def _data_hora_negocio():
    tz_br = ZoneInfo('America/Sao_Paulo')
    now_br = datetime.now(tz_br)
    data_hoje = now_br.date()
    hora_meio_dia_br = now_br.replace(hour=12, minute=0, second=0, microsecond=0)
    return data_hoje, hora_meio_dia_br


def _parse_data_request(data_str):
    """Valida e retorna date a partir de YYYY-MM-DD enviado pelo frontend; None se inválido."""
    if not data_str or len(data_str) < 10:
        return None
    try:
        s = str(data_str).strip()[:10]
        y, m, d = int(s[:4]), int(s[5:7]), int(s[8:10])
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


def _data_historico_iso(data_pag):
    """Retorna a data no formato YYYY-MM-DD para exibição no histórico (fuso America/Sao_Paulo para datetime)."""
    if not data_pag:
        return ''
    tz_br = ZoneInfo('America/Sao_Paulo')
    if hasattr(data_pag, 'date') and hasattr(data_pag, 'hour'):
        # datetime: converter para fuso do negócio para evitar dia errado no frontend
        if timezone.is_naive(data_pag):
            dt_br = data_pag.replace(tzinfo=ZoneInfo('UTC')).astimezone(tz_br)
        else:
            dt_br = data_pag.astimezone(tz_br)
        return dt_br.date().isoformat()
    if hasattr(data_pag, 'isoformat'):
        return data_pag.isoformat()[:10]
    return str(data_pag).strip()[:10]

# --- Caixa (registrar pagamento cliente / fornecedor; opcional conta_id para atualizar saldo) ---
@method_decorator(csrf_exempt, name='dispatch')
class CaixaPagamento(APIView):
    def post(self, request):
        tipo = request.data.get('tipo')  # 'cliente' | 'fornecedor'
        valor = request.data.get('valor')
        metodo = request.data.get('metodo')
        observacao = (request.data.get('observacao') or '').strip()[:255]
        cliente_id = request.data.get('cliente_id')
        fornecedor_id = request.data.get('fornecedor_id')
        conta_id = request.data.get('conta_id')
        data_raw = request.data.get('data')
        data_enviada = _parse_data_request(data_raw)
        # #region agent log
        try:
            _log_path = os.path.join(os.path.dirname(__file__), '..', '..', 'debug-46f6aa.log')
            _payload = {'location': 'views_api.CaixaPagamento.post', 'message': 'data request', 'data': {'data_raw': data_raw, 'data_enviada': str(data_enviada) if data_enviada else None, 'request_keys': list(request.data.keys()) if hasattr(request.data, 'keys') else []}, 'timestamp': int(datetime.now(ZoneInfo('America/Sao_Paulo')).timestamp() * 1000), 'hypothesisId': 'H1'}
            with open(_log_path, 'a', encoding='utf-8') as _f:
                _f.write(json.dumps(_payload) + '\n')
        except Exception:
            pass
        # #endregion
        if not metodo or metodo not in METODO_PAGAMENTO_CHOICES:
            return Response({'error': 'Forma de pagamento obrigatória. Opções: Pix, Dinheiro, Cartão crédito, Cartão débito, Cheque.'}, status=status.HTTP_400_BAD_REQUEST)
        if tipo == 'cliente' and cliente_id and valor is not None:
            try:
                v = Decimal(str(valor).replace(',', '.'))
                conta_obj = ContaBanco.objects.filter(pk=conta_id).first() if conta_id else None
                data_hoje = data_enviada or _data_hora_negocio()[0]
                # #region agent log
                try:
                    _log_path = os.path.join(os.path.dirname(__file__), '..', '..', 'debug-46f6aa.log')
                    _payload = {'location': 'views_api.CaixaPagamento.post(cliente)', 'message': 'data_hoje antes de create', 'data': {'data_hoje': str(data_hoje)}, 'timestamp': int(datetime.now(ZoneInfo('America/Sao_Paulo')).timestamp() * 1000), 'hypothesisId': 'H2'}
                    with open(_log_path, 'a', encoding='utf-8') as _f:
                        _f.write(json.dumps(_payload) + '\n')
                except Exception:
                    pass
                # #endregion
                cliente = Cliente.objects.get(pk=cliente_id)
                pag = Pagamento.objects.create(
                    cliente_id=cliente_id, valor=v, metodo=metodo, observacao=observacao,
                    conta=conta_obj, data_pagamento=data_hoje,
                )
                if conta_id:
                    try:
                        conta = ContaBanco.objects.get(pk=conta_id)
                        MovimentoBanco.objects.create(
                            conta=conta, tipo='entrada',
                            descricao=f'Recebimento cliente ID {cliente_id} pag #{pag.id}', valor=v
                        )
                        conta.saldo_atual += v
                        conta.save()
                    except ContaBanco.DoesNotExist:
                        pass
                _api_log(request, "Pagamento (cliente)", "Caixa", f"Cliente {cliente.nome} (ID {cliente_id}) - R$ {float(v)}")
                return Response({'success': True, 'data_gravada': data_hoje.isoformat()}, status=status.HTTP_201_CREATED)
            except (ValueError, TypeError):
                return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        if tipo == 'fornecedor' and fornecedor_id and valor is not None:
            try:
                v = Decimal(str(valor).replace(',', '.'))
                conta_obj = ContaBanco.objects.filter(pk=conta_id).first() if conta_id else None
                data_hoje = data_enviada or _data_hora_negocio()[0]
                # #region agent log
                try:
                    _log_path = os.path.join(os.path.dirname(__file__), '..', '..', 'debug-46f6aa.log')
                    _payload = {'location': 'views_api.CaixaPagamento.post(fornecedor)', 'message': 'data_hoje antes de create', 'data': {'data_hoje': str(data_hoje)}, 'timestamp': int(datetime.now(ZoneInfo('America/Sao_Paulo')).timestamp() * 1000), 'hypothesisId': 'H2'}
                    with open(_log_path, 'a', encoding='utf-8') as _f:
                        _f.write(json.dumps(_payload) + '\n')
                except Exception:
                    pass
                # #endregion
                tz_br = ZoneInfo('America/Sao_Paulo')
                data_hora_gravar = datetime.combine(data_hoje, datetime.min.time().replace(hour=12), tzinfo=tz_br)
                fornecedor = Fornecedor.objects.get(pk=fornecedor_id)
                pag_f = PagamentoFornecedor.objects.create(
                    fornecedor_id=fornecedor_id, valor=v, metodo=metodo, observacao=observacao,
                    conta=conta_obj, data_pagamento=data_hora_gravar,
                )
                if conta_id:
                    try:
                        conta = ContaBanco.objects.get(pk=conta_id)
                        MovimentoBanco.objects.create(
                            conta=conta, tipo='saida',
                            descricao=f'Pagamento fornecedor ID {fornecedor_id} pag #{pag_f.id}', valor=v
                        )
                        conta.saldo_atual -= v
                        conta.save()
                    except ContaBanco.DoesNotExist:
                        pass
                _api_log(request, "Pagamento (fornecedor)", "Caixa", f"Fornecedor {fornecedor.nome} (ID {fornecedor_id}) - R$ {float(v)}")
                return Response({'success': True, 'data_gravada': data_hoje.isoformat()}, status=status.HTTP_201_CREATED)
            except (ValueError, TypeError):
                return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'error': 'tipo e ids obrigatórios'}, status=status.HTTP_400_BAD_REQUEST)


def _requer_chefe_pagamento(request):
    if not getattr(getattr(request, "user", None), "is_authenticated", False):
        return Response({"error": "Não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        from .views_auth import _is_chefe
        if not _is_chefe(request):
            return Response({"error": "Apenas o chefe pode alterar ou excluir pagamentos."}, status=status.HTTP_403_FORBIDDEN)
    except Exception:
        return Response({"error": "Apenas o chefe pode alterar ou excluir pagamentos."}, status=status.HTTP_403_FORBIDDEN)
    return None


def _reverse_banco_pagamento_cliente(pag):
    """Desfaz entrada no saldo e remove MovimentoBanco ligado."""
    if not pag.conta_id:
        return
    try:
        conta = ContaBanco.objects.get(pk=pag.conta_id)
    except ContaBanco.DoesNotExist:
        return
    conta.saldo_atual -= pag.valor
    conta.save()
    ref = f'pag #{pag.id}'
    qs = MovimentoBanco.objects.filter(conta_id=pag.conta_id, tipo='entrada', descricao__contains=ref)
    if qs.exists():
        qs.delete()
        return
    leg = MovimentoBanco.objects.filter(
        conta_id=pag.conta_id, tipo='entrada',
        descricao=f'Recebimento cliente ID {pag.cliente_id}',
        valor=pag.valor,
    ).order_by('-id').first()
    if leg:
        leg.delete()


def _apply_banco_pagamento_cliente(pag):
    if not pag.conta_id:
        return
    try:
        conta = ContaBanco.objects.get(pk=pag.conta_id)
    except ContaBanco.DoesNotExist:
        return
    MovimentoBanco.objects.create(
        conta=conta, tipo='entrada',
        descricao=f'Recebimento cliente ID {pag.cliente_id} pag #{pag.id}',
        valor=pag.valor,
    )
    conta.saldo_atual += pag.valor
    conta.save()


def _reverse_banco_pagamento_fornecedor(pag):
    if not pag.conta_id:
        return
    try:
        conta = ContaBanco.objects.get(pk=pag.conta_id)
    except ContaBanco.DoesNotExist:
        return
    conta.saldo_atual += pag.valor
    conta.save()
    ref = f'pag #{pag.id}'
    qs = MovimentoBanco.objects.filter(conta_id=pag.conta_id, tipo='saida', descricao__contains=ref)
    if qs.exists():
        qs.delete()
        return
    leg = MovimentoBanco.objects.filter(
        conta_id=pag.conta_id, tipo='saida',
        descricao=f'Pagamento fornecedor ID {pag.fornecedor_id}',
        valor=pag.valor,
    ).order_by('-id').first()
    if leg:
        leg.delete()


def _apply_banco_pagamento_fornecedor(pag):
    if not pag.conta_id:
        return
    try:
        conta = ContaBanco.objects.get(pk=pag.conta_id)
    except ContaBanco.DoesNotExist:
        return
    MovimentoBanco.objects.create(
        conta=conta, tipo='saida',
        descricao=f'Pagamento fornecedor ID {pag.fornecedor_id} pag #{pag.id}',
        valor=pag.valor,
    )
    conta.saldo_atual -= pag.valor
    conta.save()


@method_decorator(csrf_exempt, name='dispatch')
class PagamentoClienteDetail(APIView):
    """PUT/PATCH/DELETE de pagamento de cliente (ajusta conta bancária se houver)."""

    def put(self, request, pk):
        err = _requer_chefe_pagamento(request)
        if err:
            return err
        try:
            pag = Pagamento.objects.get(pk=pk)
        except Pagamento.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        body = request.data or {}
        novo_valor = None
        if body.get('valor') is not None:
            try:
                novo_valor = Decimal(str(body.get('valor')).replace(',', '.'))
                if novo_valor <= 0:
                    return Response({'valor': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        if body.get('metodo'):
            if body.get('metodo') not in METODO_PAGAMENTO_CHOICES:
                return Response({'error': 'Forma de pagamento inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        if body.get('data') is not None and body.get('data') != '':
            if _parse_data_request(body.get('data')) is None:
                return Response({'data': ['Data inválida (use YYYY-MM-DD).']}, status=status.HTTP_400_BAD_REQUEST)
        if 'conta_id' in body and body.get('conta_id') not in (None, '', 'null'):
            try:
                ContaBanco.objects.get(pk=int(body.get('conta_id')))
            except (ValueError, TypeError, ContaBanco.DoesNotExist):
                return Response({'conta_id': ['Conta inválida.']}, status=status.HTTP_400_BAD_REQUEST)

        _reverse_banco_pagamento_cliente(pag)
        if novo_valor is not None:
            pag.valor = novo_valor
        if body.get('metodo'):
            pag.metodo = body.get('metodo')
        if body.get('observacao') is not None:
            pag.observacao = (body.get('observacao') or '').strip()[:255]
        if body.get('data') is not None:
            d = _parse_data_request(body.get('data'))
            if d:
                pag.data_pagamento = d
        if 'conta_id' in body:
            cid = body.get('conta_id')
            pag.conta_id = int(cid) if cid not in (None, '', 'null') else None
        pag.save()
        _apply_banco_pagamento_cliente(pag)
        _api_log(request, "Editar pagamento (cliente)", "Pagamento", f"ID {pk} cliente {pag.cliente_id} R$ {float(pag.valor)}")
        return Response({
            'id': pag.id,
            'data': pag.data_pagamento.isoformat() if pag.data_pagamento else '',
            'valor': _safe_float(pag.valor),
            'metodo': pag.metodo or '',
            'conta_id': pag.conta_id,
            'observacao': pag.observacao or '',
        })

    def delete(self, request, pk):
        err = _requer_chefe_pagamento(request)
        if err:
            return err
        motivo, merr = _exigir_motivo_exclusao(request)
        if merr:
            return merr
        try:
            pag = Pagamento.objects.get(pk=pk)
        except Pagamento.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        cid = pag.cliente_id
        _reverse_banco_pagamento_cliente(pag)
        pag.delete()
        _api_log(
            request,
            "Excluir pagamento (cliente)",
            "Pagamento",
            f"ID {pk} cliente {cid}. Motivo: {motivo}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class PagamentoFornecedorDetail(APIView):
    """PUT/PATCH/DELETE de pagamento a fornecedor."""

    def put(self, request, pk):
        err = _requer_chefe_pagamento(request)
        if err:
            return err
        try:
            pag = PagamentoFornecedor.objects.get(pk=pk)
        except PagamentoFornecedor.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        body = request.data or {}
        novo_valor = None
        if body.get('valor') is not None:
            try:
                novo_valor = Decimal(str(body.get('valor')).replace(',', '.'))
                if novo_valor <= 0:
                    return Response({'valor': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        if body.get('metodo'):
            if body.get('metodo') not in METODO_PAGAMENTO_CHOICES:
                return Response({'error': 'Forma de pagamento inválida.'}, status=status.HTTP_400_BAD_REQUEST)
        if body.get('data') is not None and body.get('data') != '':
            if _parse_data_request(body.get('data')) is None:
                return Response({'data': ['Data inválida (use YYYY-MM-DD).']}, status=status.HTTP_400_BAD_REQUEST)
        if 'conta_id' in body and body.get('conta_id') not in (None, '', 'null'):
            try:
                ContaBanco.objects.get(pk=int(body.get('conta_id')))
            except (ValueError, TypeError, ContaBanco.DoesNotExist):
                return Response({'conta_id': ['Conta inválida.']}, status=status.HTTP_400_BAD_REQUEST)

        _reverse_banco_pagamento_fornecedor(pag)
        if novo_valor is not None:
            pag.valor = novo_valor
        if body.get('metodo'):
            pag.metodo = body.get('metodo')
        if body.get('observacao') is not None:
            pag.observacao = (body.get('observacao') or '').strip()[:255]
        if body.get('data') is not None:
            d = _parse_data_request(body.get('data'))
            if d:
                tz_br = ZoneInfo('America/Sao_Paulo')
                pag.data_pagamento = datetime.combine(d, datetime.min.time().replace(hour=12), tzinfo=tz_br)
        if 'conta_id' in body:
            cid = body.get('conta_id')
            pag.conta_id = int(cid) if cid not in (None, '', 'null') else None
        pag.save()
        _apply_banco_pagamento_fornecedor(pag)
        _api_log(request, "Editar pagamento (fornecedor)", "PagamentoFornecedor", f"ID {pk} fornecedor {pag.fornecedor_id} R$ {float(pag.valor)}")
        data_str = _data_historico_iso(pag.data_pagamento)
        return Response({
            'id': pag.id,
            'data': data_str,
            'valor': _safe_float(pag.valor),
            'metodo': pag.metodo or '',
            'conta_id': pag.conta_id,
            'observacao': pag.observacao or '',
        })

    def delete(self, request, pk):
        err = _requer_chefe_pagamento(request)
        if err:
            return err
        motivo, merr = _exigir_motivo_exclusao(request)
        if merr:
            return merr
        try:
            pag = PagamentoFornecedor.objects.get(pk=pk)
        except PagamentoFornecedor.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        fid = pag.fornecedor_id
        _reverse_banco_pagamento_fornecedor(pag)
        pag.delete()
        _api_log(
            request,
            "Excluir pagamento (fornecedor)",
            "PagamentoFornecedor",
            f"ID {pk} fornecedor {fid}. Motivo: {motivo}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Caixa: histórico de recebimentos e pagamentos (raw SQL para evitar decimal.InvalidOperation no valor) ---
@method_decorator(csrf_exempt, name='dispatch')
class CaixaHistorico(APIView):
    def get(self, request):
        from django.db import connection
        try:
            raw_limit = request.GET.get('limit', 80)
            limit = min(int(raw_limit), 200) if raw_limit is not None else 80
        except (TypeError, ValueError):
            limit = 80
        try:
            tbl_pag = Pagamento._meta.db_table
            tbl_pf = PagamentoFornecedor._meta.db_table
            tbl_cli = Cliente._meta.db_table
            tbl_forn = Fornecedor._meta.db_table
            tbl_conta = ContaBanco._meta.db_table
            items = []
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT p.id, p.data_pagamento, CAST(p.valor AS REAL), COALESCE(p.metodo, ''), cb.nome, c.nome "
                    f"FROM {tbl_pag} p LEFT JOIN {tbl_conta} cb ON cb.id = p.conta_id "
                    f"LEFT JOIN {tbl_cli} c ON c.id = p.cliente_id ORDER BY p.data_pagamento DESC LIMIT %s",
                    [limit]
                )
                for r in cursor.fetchall():
                    id_, data_pag, val, metodo, conta_nome, nome = r[0], r[1], r[2], (r[3] or ''), (r[4] or ''), (r[5] or '')
                    data_str = _data_historico_iso(data_pag)
                    items.append({
                        'tipo': 'recebimento',
                        'id': id_,
                        'id_interno': f'c-{id_}',
                        'valor': _safe_float(val),
                        'data': data_str,
                        'metodo': metodo,
                        'conta_nome': conta_nome,
                        'nome': nome,
                    })
                cursor.execute(
                    f"SELECT pf.id, pf.data_pagamento, CAST(pf.valor AS REAL), COALESCE(pf.metodo, ''), cb.nome, f.nome "
                    f"FROM {tbl_pf} pf LEFT JOIN {tbl_conta} cb ON cb.id = pf.conta_id "
                    f"LEFT JOIN {tbl_forn} f ON f.id = pf.fornecedor_id ORDER BY pf.data_pagamento DESC LIMIT %s",
                    [limit]
                )
                for r in cursor.fetchall():
                    id_, data_pag, val, metodo, conta_nome, nome = r[0], r[1], r[2], (r[3] or ''), (r[4] or ''), (r[5] or '')
                    data_str = _data_historico_iso(data_pag)
                    items.append({
                        'tipo': 'pagamento',
                        'id': id_,
                        'id_interno': f'f-{id_}',
                        'valor': _safe_float(val),
                        'data': data_str,
                        'metodo': metodo,
                        'conta_nome': conta_nome,
                        'nome': nome,
                    })
            items.sort(key=lambda x: (x['data'] or '', x['id']), reverse=True)
            items = items[:limit]
            # #region agent log
            if items:
                try:
                    _log_path = os.path.join(os.path.dirname(__file__), '..', '..', 'debug-46f6aa.log')
                    _first = items[0]
                    _payload = {'location': 'views_api.CaixaHistorico.get', 'message': 'primeiro item retornado', 'data': {'data': _first.get('data'), 'tipo': _first.get('tipo'), 'id': _first.get('id')}, 'timestamp': int(datetime.now(ZoneInfo('America/Sao_Paulo')).timestamp() * 1000), 'hypothesisId': 'H4'}
                    with open(_log_path, 'a', encoding='utf-8') as _f:
                        _f.write(json.dumps(_payload) + '\n')
                except Exception:
                    pass
            # #endregion
            return Response({'items': items})
        except Exception as e:
            return Response({'items': [], 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- Conta: movimentos e atualizar saldo ---
@method_decorator(csrf_exempt, name='dispatch')
class ContaMovimentos(APIView):
    def get(self, request, pk):
        conta = ContaBanco.objects.get(pk=pk)
        movs = MovimentoBanco.objects.filter(conta=conta).order_by('-data')[:50]
        out = [{'id': m.id, 'data': m.data.isoformat() if m.data else '', 'tipo': m.tipo, 'descricao': m.descricao, 'valor': float(m.valor)} for m in movs]
        return Response({'conta': {'id': conta.id, 'nome': conta.nome, 'saldo': float(conta.saldo_atual)}, 'movimentos': out})

    def post(self, request, pk):
        conta = ContaBanco.objects.get(pk=pk)
        tipo = request.data.get('tipo')  # 'entrada' | 'saida'
        descricao = request.data.get('descricao', '').strip()
        valor = request.data.get('valor')
        if tipo not in ('entrada', 'saida') or not descricao or valor is None:
            return Response({'error': 'tipo, descricao e valor obrigatórios'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            v = Decimal(str(valor).replace(',', '.'))
            if v <= 0:
                return Response({'valor': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
            MovimentoBanco.objects.create(conta=conta, tipo=tipo, descricao=descricao, valor=v)
            if tipo == 'entrada':
                conta.saldo_atual += v
            else:
                conta.saldo_atual -= v
            conta.save()
            _api_log(request, tipo.capitalize() + " banco", "MovimentoBanco", f"{conta.nome} - {descricao} R$ {float(v)}")
            return Response({'success': True}, status=status.HTTP_201_CREATED)
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class ContaAtualizarSaldo(APIView):
    def post(self, request, pk):
        conta = ContaBanco.objects.get(pk=pk)
        saldo = request.data.get('saldo')
        try:
            conta.saldo_atual = Decimal(str(saldo).replace(',', '.'))
            conta.save()
            _api_log(request, "Atualizar saldo", "ContaBanco", f"{conta.nome} = R$ {float(conta.saldo_atual)}")
            return Response({'id': conta.id, 'nome': conta.nome, 'saldo': float(conta.saldo_atual)})
        except (ValueError, TypeError):
            return Response({'saldo': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


# --- Cliente detalhe ---
@method_decorator(csrf_exempt, name='dispatch')
class ClienteDetalhe(APIView):
    def get(self, request, pk):
        cliente = Cliente.objects.get(pk=pk)
        vendas = (
            Venda.objects.filter(cliente=cliente, cancelada=False)
            .select_related('cliente')
            .prefetch_related('itens__produto')
            .order_by('-data_lancamento', '-id')
        )
        pagamentos = Pagamento.objects.filter(cliente=cliente).select_related('conta').order_by('-data_pagamento')
        total_vendas = _safe_float(sum(_safe_float(v.total_venda) for v in vendas))
        total_pago = _safe_float(sum(_safe_float(p.valor) for p in pagamentos))
        saldo = _safe_float(total_vendas - total_pago)
        vendas_data = []
        for v in vendas[:50]:
            itens = [{'produto': item.produto.nome, 'quantidade': item.quantidade, 'preco_unitario': _safe_float(item.preco_unitario), 'total_item': _safe_float(item.quantidade * item.preco_unitario)} for item in v.itens.all()]
            vendas_data.append({
                'id': v.id,
                'data': v.data_venda.date().isoformat() if v.data_venda else '',
                'data_lancamento': _lancamento_iso_datetime_br(getattr(v, 'data_lancamento', None)),
                'total': _safe_float(v.total_venda),
                'itens': itens,
                'marcada_paga': bool(getattr(v, 'marcada_paga', False)),
            })
        pagamentos_data = [
            {
                'id': p.id,
                'data': p.data_pagamento.isoformat() if hasattr(p.data_pagamento, 'isoformat') else str(p.data_pagamento)[:10],
                'valor': _safe_float(p.valor),
                'metodo': getattr(p, 'metodo', '') or '',
                'conta_nome': p.conta.nome if p.conta_id and p.conta else '',
                'conta_id': p.conta_id,
                'observacao': (p.observacao or '') if hasattr(p, 'observacao') else '',
            }
            for p in pagamentos[:50]
        ]
        return Response({
            'cliente': {'id': cliente.id, 'nome': cliente.nome, 'telefone': cliente.telefone or '', 'cpf': cliente.cpf or '', 'cnpj': cliente.cnpj or ''},
            'total_vendas': total_vendas, 'total_pago': total_pago, 'saldo_devedor': saldo,
            'vendas': vendas_data, 'pagamentos': pagamentos_data,
        })


# --- Preços por produto (cliente) - só chefe usa no front ---
@method_decorator(csrf_exempt, name='dispatch')
class ClientePrecosProdutos(APIView):
    """Listar e definir preços que este cliente paga por produto (cadastro do chefe)."""
    def get(self, request, pk):
        cliente = Cliente.objects.get(pk=pk)
        precos = PrecoClienteProduto.objects.filter(cliente=cliente).select_related('produto').order_by('produto__nome')
        data = [
            {'id': p.id, 'produto_id': p.produto_id, 'produto_nome': p.produto.nome, 'preco': float(p.preco)}
            for p in precos
        ]
        return Response(data)

    def post(self, request, pk):
        """Um preço: { "produto_id": 1, "preco": 10.50 }
        Vários de uma vez: { "updates": [ {"produto_id": 1, "preco": 10.5}, ... ] } (máx. 500 itens)"""
        try:
            cliente = Cliente.objects.get(pk=pk)
        except Cliente.DoesNotExist:
            return Response({'error': 'Cliente não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        data = getattr(request, 'data', None) or {}
        if not isinstance(data, dict) and hasattr(request, 'body'):
            try:
                data = json.loads(request.body.decode('utf-8')) if request.body else {}
            except Exception:
                data = {}
        if not isinstance(data, dict):
            data = {}

        updates_bulk = data.get('updates')
        if isinstance(updates_bulk, list) and len(updates_bulk) > 0:
            if len(updates_bulk) > 500:
                return Response(
                    {'error': 'No máximo 500 produtos por requisição'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            saved = []
            errors = []
            for idx, u in enumerate(updates_bulk):
                if not isinstance(u, dict):
                    errors.append({'index': idx, 'error': 'Item inválido'})
                    continue
                produto_id = u.get('produto_id')
                preco = u.get('preco')
                if produto_id is None or preco is None:
                    errors.append({'index': idx, 'error': 'produto_id e preco obrigatórios'})
                    continue
                try:
                    produto_id = int(produto_id)
                except (ValueError, TypeError):
                    errors.append({'index': idx, 'produto_id': produto_id, 'error': 'produto_id inválido'})
                    continue
                try:
                    preco_val = Decimal(str(preco).replace(',', '.'))
                    if preco_val < 0:
                        errors.append({'index': idx, 'produto_id': produto_id, 'error': 'preço deve ser >= 0'})
                        continue
                except (ValueError, TypeError):
                    errors.append({'index': idx, 'produto_id': produto_id, 'error': 'preço inválido'})
                    continue
                prod = Produto.objects.filter(pk=produto_id).first()
                if not prod:
                    errors.append({'index': idx, 'produto_id': produto_id, 'error': 'Produto não encontrado'})
                    continue
                if not prod.ativo:
                    errors.append(
                        {'index': idx, 'produto_id': produto_id, 'error': 'Produto inativo no cadastro'}
                    )
                    continue
                try:
                    obj, created = PrecoClienteProduto.objects.update_or_create(
                        cliente=cliente,
                        produto_id=produto_id,
                        defaults={'preco': preco_val},
                    )
                    saved.append(
                        {
                            'id': obj.id,
                            'produto_id': obj.produto_id,
                            'produto_nome': obj.produto.nome,
                            'preco': float(obj.preco),
                            'created': created,
                        }
                    )
                    _api_log(
                        request,
                        'Editar' if not created else 'Criar',
                        'PreçoClienteProduto',
                        f'Cliente {cliente.nome} — {prod.nome}: R$ {float(preco_val)} (lote)',
                    )
                except Exception as e:
                    errors.append({'index': idx, 'produto_id': produto_id, 'error': str(e)})
            return Response(
                {
                    'ok': len(saved),
                    'failed': len(errors),
                    'saved': saved,
                    'errors': errors,
                },
                status=status.HTTP_200_OK,
            )

        produto_id = data.get('produto_id')
        preco = data.get('preco')
        if produto_id is None or preco is None:
            return Response({'error': 'produto_id e preco são obrigatórios'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            produto_id = int(produto_id)
        except (ValueError, TypeError):
            return Response({'produto_id': ['Deve ser um número']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            preco_val = Decimal(str(preco).replace(',', '.'))
            if preco_val < 0:
                return Response({'preco': ['Deve ser >= 0']}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({'preco': ['Valor inválido']}, status=status.HTTP_400_BAD_REQUEST)
        prod = Produto.objects.filter(pk=produto_id).first()
        if not prod:
            return Response({'produto_id': ['Produto não encontrado']}, status=status.HTTP_400_BAD_REQUEST)
        if not prod.ativo:
            return Response(
                {'produto_id': ['Produto inativo no cadastro; reative-o em Cadastro se precisar definir preço.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            obj, created = PrecoClienteProduto.objects.update_or_create(
                cliente=cliente, produto_id=produto_id,
                defaults={'preco': preco_val}
            )
            _api_log(request, "Editar" if not created else "Criar", "PreçoClienteProduto",
                     f"Cliente {cliente.nome} — {prod.nome}: R$ {float(preco_val)}")
            return Response(
                {'id': obj.id, 'produto_id': obj.produto_id, 'produto_nome': obj.produto.nome, 'preco': float(obj.preco)},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {'error': 'Erro ao salvar preço', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def delete(self, request, pk):
        """Remover preço: ?produto_id=1 ou body { "produto_id": 1 }"""
        cliente = Cliente.objects.get(pk=pk)
        produto_id = request.GET.get('produto_id') or (request.data.get('produto_id') if request.data else None)
        if not produto_id:
            return Response({'error': 'produto_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = PrecoClienteProduto.objects.filter(cliente=cliente, produto_id=produto_id).delete()
        if deleted:
            _api_log(request, "Excluir", "PreçoClienteProduto", f"Cliente ID {pk} — produto {produto_id}")
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(status=status.HTTP_404_NOT_FOUND)


# --- Fornecedor: materiais vinculados (fornecedor padrão) ---
@method_decorator(csrf_exempt, name='dispatch')
class FornecedorMateriais(APIView):
    """Lista materiais cujo fornecedor padrão é este (para ajuste rápido de preço na tela do fornecedor)."""
    def get(self, request, pk):
        materiais = Material.objects.filter(fornecedor_padrao_id=pk).order_by('nome')
        data = [
            {'id': m.id, 'nome': m.nome, 'preco_unitario_base': float(m.preco_unitario_base)}
            for m in materiais
        ]
        return Response(data)


# --- Fornecedor: produtos vinculados ---
@method_decorator(csrf_exempt, name='dispatch')
class FornecedorProdutos(APIView):
    """Lista produtos cujo fornecedor é este (para consulta rápida no detalhe do fornecedor)."""
    def get(self, request, pk):
        produtos = Produto.objects.filter(fornecedor_id=pk, ativo=True).order_by('nome')
        data = [
            {
                'id': p.id,
                'nome': p.nome,
                'preco_venda': float(p.preco_venda or 0),
                'estoque_atual': int(p.estoque_atual or 0),
                'ativo': bool(p.ativo),
            }
            for p in produtos
        ]
        return Response(data)


# --- Fornecedor detalhe ---
@method_decorator(csrf_exempt, name='dispatch')
class FornecedorDetalhe(APIView):
    def get(self, request, pk):
        import traceback
        from django.db import connection
        try:
            fornecedor = Fornecedor.objects.get(pk=pk)
            compras_mat = CompraMaterial.objects.filter(fornecedor=fornecedor).select_related('material', 'ordem')
            compras_prod = CompraProduto.objects.filter(fornecedor=fornecedor).select_related('produto', 'ordem')

            def _compra_linha_conta_saldo(c):
                return c.ordem_id is None or not c.ordem.cancelada

            total_compras = _safe_float(
                sum(_safe_float(c.total_compra) for c in compras_mat if _compra_linha_conta_saldo(c))
                + sum(_safe_float(c.total_compra) for c in compras_prod if _compra_linha_conta_saldo(c))
            )
            # Pagamentos: usar raw SQL para evitar decimal.InvalidOperation ao ler valor fora do range do Decimal
            table = PagamentoFornecedor._meta.db_table
            conta_table = ContaBanco._meta.db_table
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT COALESCE(SUM(CAST(valor AS REAL)), 0) FROM {table} WHERE fornecedor_id = %s",
                    [pk]
                )
                row = cursor.fetchone()
                total_pago = _safe_float(row[0] if row else 0)
                cursor.execute(
                    f"SELECT pf.id, pf.data_pagamento, pf.valor, COALESCE(pf.metodo, ''), cb.nome, pf.conta_id, COALESCE(pf.observacao, '') FROM {table} pf "
                    f"LEFT JOIN {conta_table} cb ON cb.id = pf.conta_id WHERE pf.fornecedor_id = %s ORDER BY pf.data_pagamento DESC LIMIT 50",
                    [pk]
                )
                rows = cursor.fetchall()
            pagamentos_data = []
            for r in rows:
                id_, data_pag, val, metodo, conta_nome = r[0], r[1], r[2], (r[3] or ''), (r[4] or '')
                conta_id_raw = r[5] if len(r) > 5 else None
                obs = (r[6] or '') if len(r) > 6 else ''
                data_str = _data_historico_iso(data_pag)
                pagamentos_data.append({
                    'id': id_, 'data': data_str, 'valor': _safe_float(val), 'metodo': metodo, 'conta_nome': conta_nome,
                    'conta_id': int(conta_id_raw) if conta_id_raw is not None else None,
                    'observacao': obs,
                })
            saldo = _safe_float(total_compras - total_pago)
            linhas = []
            for c in compras_mat:
                if c.ordem_id and c.ordem:
                    linha_mp = bool(c.ordem.marcada_paga)
                else:
                    linha_mp = bool(getattr(c, 'marcada_paga', False))
                linhas.append(
                    {
                        'sort_dt': c.data_compra,
                        'id': f'mat-{c.id}',
                        'ordem_id': c.ordem_id,
                        'ordem_cancelada': bool(c.ordem_id and c.ordem.cancelada),
                        'data': c.data_compra.date().isoformat() if c.data_compra else '',
                        'material': c.material.nome,
                        'quantidade': int(c.quantidade),
                        'preco_unitario': _safe_float(c.preco_no_dia),
                        'total': _safe_float(c.total_compra),
                        'marcada_paga': linha_mp,
                    }
                )
            for c in compras_prod:
                if c.ordem_id and c.ordem:
                    linha_mp = bool(c.ordem.marcada_paga)
                else:
                    linha_mp = bool(getattr(c, 'marcada_paga', False))
                linhas.append(
                    {
                        'sort_dt': c.data_compra,
                        'id': f'prod-{c.id}',
                        'ordem_id': c.ordem_id,
                        'ordem_cancelada': bool(c.ordem_id and c.ordem.cancelada),
                        'data': c.data_compra.date().isoformat() if c.data_compra else '',
                        'material': c.produto.nome,
                        'quantidade': int(c.quantidade),
                        'preco_unitario': _safe_float(c.preco_no_dia),
                        'total': _safe_float(c.total_compra),
                        'marcada_paga': linha_mp,
                    }
                )
            linhas.sort(
                key=lambda x: x["sort_dt"].timestamp() if x["sort_dt"] is not None else 0.0,
                reverse=True,
            )
            compras_data = [{k: v for k, v in row.items() if k != 'sort_dt'} for row in linhas[:50]]
            return Response({
                'fornecedor': {'id': fornecedor.id, 'nome': fornecedor.nome, 'telefone': fornecedor.telefone or ''},
                'total_compras': total_compras, 'total_pago': total_pago, 'saldo_devedor': saldo,
                'compras': compras_data, 'pagamentos': pagamentos_data,
            })
        except Fornecedor.DoesNotExist:
            return Response({'error': 'Fornecedor não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            try:
                log_path = os.path.join(os.path.dirname(__file__), '..', 'debug-46f6aa.log')
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({'message': 'FornecedorDetalhe.get error', 'pk': pk, 'error': str(e), 'traceback': traceback.format_exc()}) + '\n')
            except Exception:
                pass
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request, pk):
        """Registrar pagamento ao fornecedor"""
        valor = request.data.get('valor')
        metodo = request.data.get('metodo')
        observacao = (request.data.get('observacao') or '').strip()[:255]
        if valor is None:
            return Response({'valor': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        if not metodo or metodo not in METODO_PAGAMENTO_CHOICES:
            return Response({'error': 'Forma de pagamento obrigatória. Opções: Pix, Dinheiro, Cartão crédito, Cartão débito, Cheque.'}, status=status.HTTP_400_BAD_REQUEST)
        conta_id = request.data.get('conta_id')
        conta_obj = ContaBanco.objects.filter(pk=conta_id).first() if conta_id else None
        data_enviada = _parse_data_request(request.data.get('data'))
        try:
            v = Decimal(str(valor).replace(',', '.'))
            fornecedor = Fornecedor.objects.get(pk=pk)
            data_hoje = data_enviada or _data_hora_negocio()[0]
            tz_br = ZoneInfo('America/Sao_Paulo')
            data_hora_gravar = datetime.combine(data_hoje, datetime.min.time().replace(hour=12), tzinfo=tz_br)
            PagamentoFornecedor.objects.create(fornecedor_id=pk, valor=v, metodo=metodo, observacao=observacao, conta=conta_obj, data_pagamento=data_hora_gravar)
            _api_log(request, "Pagamento (fornecedor)", "Caixa", f"Fornecedor {fornecedor.nome} (ID {pk}) - R$ {float(v)}")
            return Response({'success': True}, status=status.HTTP_201_CREATED)
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(csrf_exempt, name='dispatch')
class FornecedorCompraMarcacaoPaga(APIView):
    """Marca ordem ou linha avulsa como paga (controle manual; não substitui pagamento lançado)."""

    def patch(self, request, pk):
        try:
            from .views_auth import _is_chefe

            if not _is_chefe(request):
                return Response({'error': 'Apenas o chefe pode alterar.'}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            return Response({'error': 'Apenas o chefe pode alterar.'}, status=status.HTTP_403_FORBIDDEN)
        fornecedor_ctx = Fornecedor.objects.filter(pk=pk).first()
        if not fornecedor_ctx:
            return Response({'error': 'Fornecedor não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        fnome = fornecedor_ctx.nome or 'Fornecedor'
        body = getattr(request, 'data', None) or {}
        if not isinstance(body, dict) and hasattr(request, 'body'):
            try:
                body = json.loads(request.body.decode('utf-8')) if request.body else {}
            except Exception:
                body = {}
        if not isinstance(body, dict):
            body = {}
        if 'marcada_paga' not in body:
            return Response({'error': 'marcada_paga é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        mp = bool(body.get('marcada_paga'))
        est_paga = 'marcada como paga' if mp else 'desmarcada (em aberto)'
        ordem_id = body.get('ordem_id')
        linha_id = body.get('linha_id')
        if ordem_id is not None and linha_id is not None:
            return Response(
                {'error': 'Use ordem_id ou linha_id, não os dois'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ordem_id is not None:
            try:
                oid = int(ordem_id)
            except (ValueError, TypeError):
                return Response({'error': 'ordem_id inválido'}, status=status.HTTP_400_BAD_REQUEST)
            o = OrdemCompra.objects.filter(pk=oid, fornecedor_id=pk).first()
            if not o:
                return Response({'error': 'Ordem não encontrada neste fornecedor'}, status=status.HTTP_404_NOT_FOUND)
            o.marcada_paga = mp
            o.save(update_fields=['marcada_paga'])
            _api_log(
                request,
                'Editar',
                'OrdemCompra',
                f'Fornecedor «{fnome}» — Ordem nº {oid} — {est_paga}',
            )
            return Response({'ok': True, 'ordem_id': oid, 'marcada_paga': mp})
        if linha_id is not None:
            s = str(linha_id).strip()
            if s.startswith('mat-'):
                try:
                    cid = int(s[4:])
                except ValueError:
                    return Response({'error': 'linha_id inválido'}, status=status.HTTP_400_BAD_REQUEST)
                c = CompraMaterial.objects.filter(pk=cid, fornecedor_id=pk).select_related('ordem', 'material').first()
                if not c:
                    return Response({'error': 'Linha não encontrada'}, status=status.HTTP_404_NOT_FOUND)
                if c.ordem_id and c.ordem:
                    c.ordem.marcada_paga = mp
                    c.ordem.save(update_fields=['marcada_paga'])
                    log_msg = f'Fornecedor «{fnome}» — Ordem nº {c.ordem.id} — {est_paga}'
                else:
                    c.marcada_paga = mp
                    c.save(update_fields=['marcada_paga'])
                    mat_nome = c.material.nome if getattr(c, 'material', None) else 'material'
                    log_msg = f'Fornecedor «{fnome}» — Compra avulsa (material: {mat_nome}) — {est_paga}'
            elif s.startswith('prod-'):
                try:
                    cid = int(s[5:])
                except ValueError:
                    return Response({'error': 'linha_id inválido'}, status=status.HTTP_400_BAD_REQUEST)
                c = CompraProduto.objects.filter(pk=cid, fornecedor_id=pk).select_related('ordem', 'produto').first()
                if not c:
                    return Response({'error': 'Linha não encontrada'}, status=status.HTTP_404_NOT_FOUND)
                if c.ordem_id and c.ordem:
                    c.ordem.marcada_paga = mp
                    c.ordem.save(update_fields=['marcada_paga'])
                    log_msg = f'Fornecedor «{fnome}» — Ordem nº {c.ordem.id} — {est_paga}'
                else:
                    c.marcada_paga = mp
                    c.save(update_fields=['marcada_paga'])
                    prod_nome = c.produto.nome if getattr(c, 'produto', None) else 'produto'
                    log_msg = f'Fornecedor «{fnome}» — Compra avulsa (produto: {prod_nome}) — {est_paga}'
            else:
                return Response(
                    {'error': 'linha_id deve ser mat-<id> ou prod-<id>'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            _api_log(request, 'Editar', 'Compra', log_msg)
            return Response({'ok': True, 'linha_id': s, 'marcada_paga': mp})
        return Response({'error': 'Informe ordem_id ou linha_id'}, status=status.HTTP_400_BAD_REQUEST)


# --- Funcionários ---
def _funcionario_para_json(f):
    total_he = f.total_horas_extras
    total_pago = f.total_pago
    saldo = (Decimal(f.salario) + total_he) - total_pago
    return {
        'id': f.id,
        'nome': f.nome,
        'ativo': f.ativo,
        'salario': float(f.salario),
        'observacao': f.observacao or '',
        'total_horas_extras': float(total_he),
        'total_pago': float(total_pago),
        'saldo_devedor': float(saldo),
    }


@method_decorator(csrf_exempt, name='dispatch')
class FuncionarioListCreate(APIView):
    def get(self, request):
        qs = Funcionario.objects.filter(ativo=True).order_by('nome')
        out = [_funcionario_para_json(f) for f in qs]
        return Response(out)

    def post(self, request):
        data = request.data
        nome = (data.get('nome') or '').strip()
        if not nome:
            return Response({'nome': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        salario = data.get('salario', 0)
        try:
            salario = Decimal(str(salario).replace(',', '.'))
        except (ValueError, TypeError):
            salario = Decimal('0')
        obs = (data.get('observacao') or '').strip()[:2000]
        f = Funcionario.objects.create(nome=nome, salario=salario, observacao=obs or None)
        return Response(_funcionario_para_json(f), status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class FuncionarioDetail(APIView):
    def get(self, request, pk):
        try:
            f = Funcionario.objects.get(pk=pk)
        except Funcionario.DoesNotExist:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        out = _funcionario_para_json(f)
        out['horas_extras'] = [
            {
                'id': he.id,
                'quantidade_horas': float(he.quantidade_horas),
                'valor_hora': float(he.valor_hora),
                'valor_total': float(he.valor_total),
                'data_referencia': he.data_referencia.isoformat() if he.data_referencia else None,
                'observacao': he.observacao or '',
            }
            for he in f.horas_extras.all()[:100]
        ]
        out['pagamentos'] = [
            {
                'id': p.id,
                'data_pagamento': p.data_pagamento.isoformat() if p.data_pagamento else '',
                'valor': float(p.valor),
                'observacao': p.observacao or '',
            }
            for p in f.pagamentos.all()[:100]
        ]
        return Response(out)

    def put(self, request, pk):
        try:
            f = Funcionario.objects.get(pk=pk)
        except Funcionario.DoesNotExist:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        if data.get('nome') is not None:
            f.nome = (data.get('nome') or '').strip() or f.nome
        if 'salario' in data:
            try:
                f.salario = Decimal(str(data['salario']).replace(',', '.'))
            except (ValueError, TypeError):
                pass
        if 'observacao' in data:
            f.observacao = (data.get('observacao') or '').strip()[:2000] or None
        if 'ativo' in data:
            f.ativo = bool(data['ativo'])
        f.save()
        return Response(_funcionario_para_json(f))

    def delete(self, request, pk):
        try:
            f = Funcionario.objects.get(pk=pk)
        except Funcionario.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        f.ativo = False
        f.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class FuncionarioHoraExtraCreate(APIView):
    def post(self, request, pk):
        try:
            f = Funcionario.objects.get(pk=pk)
        except Funcionario.DoesNotExist:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        qtd = data.get('quantidade_horas') or 0
        valor_hora = data.get('valor_hora') or 0
        valor_total = data.get('valor_total') or 0
        try:
            qtd = Decimal(str(qtd).replace(',', '.'))
            valor_hora = Decimal(str(valor_hora).replace(',', '.'))
            valor_total = Decimal(str(valor_total).replace(',', '.'))
        except (ValueError, TypeError):
            return Response({'quantidade_horas': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        if valor_total == 0 and qtd and valor_hora:
            valor_total = qtd * valor_hora
        data_ref = data.get('data_referencia')
        if data_ref:
            try:
                from datetime import date
                data_ref = date.fromisoformat(str(data_ref)[:10])
            except (ValueError, TypeError):
                data_ref = None
        else:
            data_ref = None
        obs = (data.get('observacao') or '')[:255]
        he = FuncionarioHoraExtra.objects.create(
            funcionario=f,
            quantidade_horas=qtd,
            valor_hora=valor_hora,
            valor_total=valor_total,
            data_referencia=data_ref,
            observacao=obs,
        )
        return Response({
            'id': he.id,
            'quantidade_horas': float(he.quantidade_horas),
            'valor_hora': float(he.valor_hora),
            'valor_total': float(he.valor_total),
            'data_referencia': he.data_referencia.isoformat() if he.data_referencia else None,
            'observacao': he.observacao or '',
        }, status=status.HTTP_201_CREATED)


@method_decorator(csrf_exempt, name='dispatch')
class FuncionarioHoraExtraDelete(APIView):
    def delete(self, request, pk, he_pk):
        try:
            he = FuncionarioHoraExtra.objects.get(pk=he_pk, funcionario_id=pk)
        except FuncionarioHoraExtra.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        he.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class FuncionarioPagamentoCreate(APIView):
    def post(self, request, pk):
        try:
            f = Funcionario.objects.get(pk=pk)
        except Funcionario.DoesNotExist:
            return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        data = request.data
        valor = data.get('valor')
        data_pag = data.get('data_pagamento')
        if valor is None:
            return Response({'valor': ['Obrigatório']}, status=status.HTTP_400_BAD_REQUEST)
        try:
            valor = Decimal(str(valor).replace(',', '.'))
        except (ValueError, TypeError):
            return Response({'valor': ['Inválido']}, status=status.HTTP_400_BAD_REQUEST)
        if valor <= 0:
            return Response({'valor': ['Deve ser positivo']}, status=status.HTTP_400_BAD_REQUEST)
        from datetime import date
        from django.utils import timezone
        if data_pag:
            try:
                data_pag = date.fromisoformat(str(data_pag)[:10])
            except (ValueError, TypeError):
                data_pag = timezone.now().date()
        else:
            data_pag = timezone.now().date()
        obs = (data.get('observacao') or '')[:255]
        p = FuncionarioPagamento.objects.create(funcionario=f, data_pagamento=data_pag, valor=valor, observacao=obs)
        return Response({
            'id': p.id,
            'data_pagamento': p.data_pagamento.isoformat(),
            'valor': float(p.valor),
            'observacao': p.observacao or '',
        }, status=status.HTTP_201_CREATED)


def _requer_chefe_precificacao_shopee(request):
    if not getattr(request.user, "is_authenticated", False):
        return Response({"error": "Não autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        from .views_auth import _is_chefe

        if not _is_chefe(request):
            return Response(
                {"error": "Apenas o chefe pode acessar a precificação Shopee."},
                status=status.HTTP_403_FORBIDDEN,
            )
    except Exception:
        return Response(
            {"error": "Apenas o chefe pode acessar a precificação Shopee."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _precificacao_shopee_payload(obj):
    return {
        "id": obj.id,
        "nome": obj.nome,
        "dataIso": obj.atualizado_em.isoformat(),
        "mesReferencia": obj.mes_referencia or "",
        "nfPercent": obj.nf_percent or "70",
        "impostoPercent": obj.imposto_percent or "10",
        "linhas": obj.linhas if isinstance(obj.linhas, list) else [],
    }


@method_decorator(csrf_exempt, name="dispatch")
class PrecificacaoShopeeListCreate(APIView):
    """Lista e grava precificações Shopee no SQLite (substitui localStorage)."""

    def get(self, request):
        err = _requer_chefe_precificacao_shopee(request)
        if err:
            return err
        qs = PrecificacaoShopee.objects.order_by("-atualizado_em")
        return Response([_precificacao_shopee_payload(p) for p in qs])

    def post(self, request):
        err = _requer_chefe_precificacao_shopee(request)
        if err:
            return err
        body = request.data or {}
        nome = (body.get("nome") or "").strip()
        if not nome:
            return Response({"nome": ["Informe o nome da precificação."]}, status=status.HTTP_400_BAD_REQUEST)
        mes_ref = (body.get("mesReferencia") or body.get("mes_referencia") or "")[:7]
        nf_p = str(body.get("nfPercent") or body.get("nf_percent") or "70")[:20]
        imp_p = str(body.get("impostoPercent") or body.get("imposto_percent") or "10")[:20]
        linhas = body.get("linhas")
        if not isinstance(linhas, list):
            linhas = []
        if not mes_ref:
            mes_ref = timezone.now().strftime("%Y-%m")
        obj, created = PrecificacaoShopee.objects.update_or_create(
            nome=nome,
            defaults={
                "mes_referencia": mes_ref,
                "nf_percent": nf_p,
                "imposto_percent": imp_p,
                "linhas": linhas,
            },
        )
        _api_log(
            request,
            "Salvar precificação Shopee",
            "PrecificacaoShopee",
            f"{obj.nome} (ID {obj.id})",
        )
        return Response(
            _precificacao_shopee_payload(obj),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
