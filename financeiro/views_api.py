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
)


def _safe_float(x):
    """Converte para float garantindo valor finito (evita Infinity no JSON que quebra o parse no frontend)."""
    try:
        f = float(x)
        return f if math.isfinite(f) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _api_log(request, acao, tabela, detalhes=""):
    """Registra ação nos logs do sistema (usado pela API)."""
    user = None
    if request and getattr(request, "user", None) and getattr(request.user, "is_authenticated", False):
        user = request.user
    LogSistema.objects.create(usuario=user, acao=acao, tabela=tabela, detalhes=detalhes or "")


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
        qs = Produto.objects.prefetch_related('insumos__material').all().order_by('nome')
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
        obj = self.get_object(pk)
        if ItemVenda.objects.filter(produto=obj).exists():
            return Response(
                {
                    "error": "Não é possível excluir: este produto foi usado em vendas.",
                    "code": "tem_vendas",
                    "hint": "Use 'Inativar' para ocultar o produto da lista sem apagar os dados.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        nome = obj.nome
        obj.delete()
        _api_log(request, "Excluir", "Produto", f"Produto excluído: {nome} (ID {pk})")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if request.data.get('ativo') is False:
            obj.ativo = False
            obj.save()
            _api_log(request, "Inativar", "Produto", f"Produto inativado: {obj.nome} (ID {pk})")
        serializer = ProdutoSerializer(obj)
        return Response(serializer.data)


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
        qs = Venda.objects.select_related('cliente').prefetch_related('itens').order_by('-data_venda')
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
        venda = Venda.objects.create(cliente=cliente)
        for item in itens:
            prod_id = item.get('produto') or item.get('produto_id')
            qty = item.get('quantidade', 1)
            preco = item.get('preco_unitario')
            if preco is None and prod_id:
                preco = Produto.objects.get(pk=prod_id).preco_venda
            ItemVenda.objects.create(venda=venda, produto_id=prod_id, quantidade=qty, preco_unitario=preco)
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
        if request.data.get('cancelada') is True:
            venda.cancelada = True
            venda.save()
            _api_log(request, "Cancelar", "Venda", f"Venda #{pk} cancelada (permanece no banco para histórico)")
        serializer = VendaSerializer(venda)
        return Response(serializer.data)

    def delete(self, request, pk):
        """Soft delete: marca a venda como cancelada em vez de apagar."""
        venda = self.get_object(pk)
        venda.cancelada = True
        venda.save()
        _api_log(request, "Cancelar", "Venda", f"Venda #{pk} cancelada (exclusão lógica)")
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_exempt, name='dispatch')
class VendaAddItem(APIView):
    def post(self, request, pk):
        venda = Venda.objects.get(pk=pk)
        prod_id = request.data.get('produto') or request.data.get('produto_id')
        qty = request.data.get('quantidade', 1)
        preco = request.data.get('preco_unitario')
        if preco is None and prod_id:
            preco = Produto.objects.get(pk=prod_id).preco_venda
        ItemVenda.objects.create(venda=venda, produto_id=prod_id, quantidade=qty, preco_unitario=preco)
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
        origem = Venda.objects.select_related('cliente').prefetch_related('itens').get(pk=pk)
        nova = Venda.objects.create(cliente=origem.cliente)
        for item in origem.itens.all():
            ItemVenda.objects.create(venda=nova, produto=item.produto, quantidade=item.quantidade, preco_unitario=item.preco_unitario)
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
        # 3) Preço padrão do produto
        prod = Produto.objects.filter(pk=produto_id).first()
        if prod:
            return Response({'preco': float(prod.preco_venda)})
        return Response({'preco': None})


# --- Compras (ordem com itens, como Venda) ---
@method_decorator(csrf_exempt, name='dispatch')
class CompraListCreate(APIView):
    def get(self, request):
        try:
            # Retorna lista de ordens (cada ordem com itens); itens sem ordem como ordem de 1 item
            ordens = list(
                OrdemCompra.objects
                .prefetch_related('itens__material', 'itens_produtos__produto')
                .select_related('fornecedor')
                .order_by('-data_compra')
            )
            itens_sem_ordem_mat = CompraMaterial.objects.filter(ordem__isnull=True).select_related('fornecedor', 'material').order_by('-data_compra')
            itens_sem_ordem_prod = CompraProduto.objects.filter(ordem__isnull=True).select_related('fornecedor', 'produto').order_by('-data_compra')
            out = []
            for o in ordens:
                out.append(OrdemCompraSerializer(o).data)
            for c in itens_sem_ordem_mat:
                # Ordem sintética de 1 item (legado)
                out.append({
                    'id': f'item-mat-{c.id}',
                    'fornecedor': c.fornecedor.nome,
                    'fornecedor_id': c.fornecedor_id,
                    'data': c.data_compra.date().isoformat() if c.data_compra else None,
                    'itens': [ItemCompraMaterialSerializer(c).data],
                    'total': float(c.total_compra),
                })
            for c in itens_sem_ordem_prod:
                out.append({
                    'id': f'item-prod-{c.id}',
                    'fornecedor': c.fornecedor.nome,
                    'fornecedor_id': c.fornecedor_id,
                    'data': c.data_compra.date().isoformat() if c.data_compra else None,
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
        ordem = OrdemCompra.objects.create(fornecedor=fornecedor)
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
                from decimal import Decimal
                q = int(qtd)
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
                    prod = Produto.objects.get(pk=produto_id, revenda=True)
                except Produto.DoesNotExist:
                    continue
                c = CompraProduto.objects.create(
                    ordem=ordem,
                    fornecedor=fornecedor,
                    produto=prod,
                    quantidade=q,
                    preco_no_dia=p,
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
                return Response({
                    'id': f'item-mat-{item.id}',
                    'fornecedor': item.fornecedor.nome,
                    'fornecedor_id': item.fornecedor_id,
                    'data': item.data_compra.date().isoformat() if item.data_compra else None,
                    'itens': [ItemCompraMaterialSerializer(item).data],
                    'total': float(item.total_compra),
                })
            itemp = CompraProduto.objects.select_related('fornecedor', 'produto').filter(pk=pk_int).first()
            if itemp:
                if itemp.ordem_id:
                    return Response(OrdemCompraSerializer(itemp.ordem).data)
                return Response({
                    'id': f'item-prod-{itemp.id}',
                    'fornecedor': itemp.fornecedor.nome,
                    'fornecedor_id': itemp.fornecedor_id,
                    'data': itemp.data_compra.date().isoformat() if itemp.data_compra else None,
                    'itens': [ItemCompraProdutoSerializer(itemp).data],
                    'total': float(itemp.total_compra),
                })
        except Exception as e:
            from django.db.utils import OperationalError
            if isinstance(e, OperationalError):
                return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
            raise
        return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk):
        if isinstance(pk, str) and pk.startswith('item-'):
            pk = pk.replace('item-', '')
            pk = pk.replace('mat-', '').replace('prod-', '')
        obj = None
        kind = None
        try:
            obj = CompraMaterial.objects.select_related('fornecedor', 'material').get(pk=pk)
            kind = 'material'
        except (CompraMaterial.DoesNotExist, ValueError):
            obj = None
        if obj is None:
            try:
                obj = CompraProduto.objects.select_related('fornecedor', 'produto').get(pk=pk)
                kind = 'produto'
            except (CompraProduto.DoesNotExist, ValueError):
                return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        if request.data.get('quantidade') is not None:
            try:
                obj.quantidade = int(request.data.get('quantidade'))
            except (ValueError, TypeError):
                pass
        if request.data.get('preco_no_dia') is not None:
            try:
                from decimal import Decimal
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
                obj.produto_id = int(request.data.get('produto'))
            except (ValueError, TypeError):
                pass
        if request.data.get('fornecedor') is not None:
            try:
                obj.fornecedor_id = int(request.data.get('fornecedor'))
            except (ValueError, TypeError):
                pass
        obj.save()
        _api_log(request, "Editar", "Compra", f"Compra #{pk} atualizada")
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
            ordem.delete()
            _api_log(request, "Excluir", "Compra", f"Ordem #{pk} excluída")
            return Response(status=status.HTTP_204_NO_CONTENT)
        try:
            obj = CompraMaterial.objects.get(pk=pk_int)
        except CompraMaterial.DoesNotExist:
            obj = None
        if obj is None:
            try:
                objp = CompraProduto.objects.get(pk=pk_int)
            except CompraProduto.DoesNotExist:
                return Response({'detail': 'Não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
            ordem = objp.ordem
            objp.delete()
            if ordem and (not ordem.itens.exists()) and (not ordem.itens_produtos.exists()):
                ordem.delete()
            _api_log(request, "Excluir", "Compra", f"Compra produto #{pk} excluída")
            return Response(status=status.HTTP_204_NO_CONTENT)
        ordem = obj.ordem
        obj.delete()
        if ordem and (not ordem.itens.exists()) and (not ordem.itens_produtos.exists()):
            ordem.delete()
        _api_log(request, "Excluir", "Compra", f"Compra #{pk} excluída")
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
            nova_ordem = OrdemCompra.objects.create(fornecedor=ordem.fornecedor)
            for item in ordem.itens.all():
                CompraMaterial.objects.create(
                    ordem=nova_ordem,
                    fornecedor=ordem.fornecedor,
                    material=item.material,
                    quantidade=item.quantidade,
                    preco_no_dia=item.preco_no_dia,
                )
            for item in ordem.itens_produtos.all():
                CompraProduto.objects.create(
                    ordem=nova_ordem,
                    fornecedor=ordem.fornecedor,
                    produto=item.produto,
                    quantidade=item.quantidade,
                    preco_no_dia=item.preco_no_dia,
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
            dt = m.data
            date_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)[:10]
            out.append({
                'id': f'mb-{m.id}',
                'description': m.descricao,
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
            preco = float(p.preco_venda or 0)
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
                Pagamento.objects.create(cliente_id=cliente_id, valor=v, metodo=metodo, observacao=observacao, conta=conta_obj, data_pagamento=data_hoje)
                if conta_id:
                    try:
                        conta = ContaBanco.objects.get(pk=conta_id)
                        MovimentoBanco.objects.create(
                            conta=conta, tipo='entrada',
                            descricao=f'Recebimento cliente ID {cliente_id}', valor=v
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
                PagamentoFornecedor.objects.create(fornecedor_id=fornecedor_id, valor=v, metodo=metodo, observacao=observacao, conta=conta_obj, data_pagamento=data_hora_gravar)
                if conta_id:
                    try:
                        conta = ContaBanco.objects.get(pk=conta_id)
                        MovimentoBanco.objects.create(
                            conta=conta, tipo='saida',
                            descricao=f'Pagamento fornecedor ID {fornecedor_id}', valor=v
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
        vendas = Venda.objects.filter(cliente=cliente).select_related('cliente').prefetch_related('itens__produto').order_by('-data_venda')
        pagamentos = Pagamento.objects.filter(cliente=cliente).select_related('conta').order_by('-data_pagamento')
        total_vendas = _safe_float(sum(_safe_float(v.total_venda) for v in vendas))
        total_pago = _safe_float(sum(_safe_float(p.valor) for p in pagamentos))
        saldo = _safe_float(total_vendas - total_pago)
        vendas_data = []
        for v in vendas[:50]:
            itens = [{'produto': item.produto.nome, 'quantidade': item.quantidade, 'preco_unitario': _safe_float(item.preco_unitario), 'total_item': _safe_float(item.quantidade * item.preco_unitario)} for item in v.itens.all()]
            vendas_data.append({'id': v.id, 'data': v.data_venda.date().isoformat() if v.data_venda else '', 'total': _safe_float(v.total_venda), 'itens': itens})
        pagamentos_data = [
            {'id': p.id, 'data': p.data_pagamento.isoformat() if hasattr(p.data_pagamento, 'isoformat') else str(p.data_pagamento)[:10], 'valor': _safe_float(p.valor), 'metodo': getattr(p, 'metodo', '') or '', 'conta_nome': p.conta.nome if p.conta_id and p.conta else ''}
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


# --- Fornecedor detalhe ---
@method_decorator(csrf_exempt, name='dispatch')
class FornecedorDetalhe(APIView):
    def get(self, request, pk):
        import traceback
        from django.db import connection
        try:
            fornecedor = Fornecedor.objects.get(pk=pk)
            compras = CompraMaterial.objects.filter(fornecedor=fornecedor).select_related('material').order_by('-data_compra')
            total_compras = _safe_float(sum(_safe_float(c.total_compra) for c in compras))
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
                    f"SELECT pf.id, pf.data_pagamento, pf.valor, COALESCE(pf.metodo, ''), cb.nome FROM {table} pf "
                    f"LEFT JOIN {conta_table} cb ON cb.id = pf.conta_id WHERE pf.fornecedor_id = %s ORDER BY pf.data_pagamento DESC LIMIT 50",
                    [pk]
                )
                rows = cursor.fetchall()
            pagamentos_data = []
            for r in rows:
                id_, data_pag, val, metodo, conta_nome = r[0], r[1], r[2], (r[3] or '') if len(r) > 3 else '', (r[4] or '') if len(r) > 4 else ''
                data_str = _data_historico_iso(data_pag)
                pagamentos_data.append({'id': id_, 'data': data_str, 'valor': _safe_float(val), 'metodo': metodo, 'conta_nome': conta_nome})
            saldo = _safe_float(total_compras - total_pago)
            compras_data = [
                {
                    'id': c.id,
                    'data': c.data_compra.date().isoformat() if c.data_compra else '',
                    'material': c.material.nome,
                    'total': _safe_float(c.total_compra),
                }
                for c in compras[:50]
            ]
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
