import json
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from financeiro.models import Cliente, Produto, Venda, Fornecedor, Material, OrdemCompra
from financeiro.views_api import VendaListCreate, VendaDetail, CompraListCreate, CompraDetail
from rest_framework import status


class VendaDataApiTest(TestCase):
    """Garante que POST /api/vendas/ grava data_venda conforme o corpo (não só o dia atual)."""

    def setUp(self):
        self.cliente = Cliente.objects.create(nome="Cliente Teste API")
        self.produto = Produto.objects.create(nome="Produto Teste", preco_venda=10)

    def test_post_com_data_grava_dia_correto(self):
        factory = APIRequestFactory()
        body = {
            "cliente": self.cliente.id,
            "itens": [
                {
                    "produto": self.produto.id,
                    "quantidade": 1,
                    "preco_unitario": 10,
                }
            ],
            "data": "2024-07-01",
            "data_venda": "2024-07-01",
        }
        request = factory.post(
            "/api/vendas/",
            data=json.dumps(body),
            content_type="application/json",
        )
        response = VendaListCreate.as_view()(request)
        if response.status_code != 201:
            self.fail(
                f"esperado 201, veio {response.status_code}: "
                f"{getattr(response, 'data', None)!r}"
            )
        payload = response.data
        self.assertEqual(payload.get("data"), "2024-07-01")
        v = Venda.objects.get(pk=payload["id"])
        self.assertEqual(v.data_venda.date().isoformat(), "2024-07-01")

    def test_post_so_data_venda_funciona(self):
        factory = APIRequestFactory()
        body = {
            "cliente": self.cliente.id,
            "itens": [{"produto": self.produto.id, "quantidade": 1, "preco_unitario": 5}],
            "data_venda": "2019-06-20",
        }
        request = factory.post(
            "/api/vendas/",
            data=json.dumps(body),
            content_type="application/json",
        )
        response = VendaListCreate.as_view()(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("data"), "2019-06-20")

    def test_patch_altera_somente_data_venda(self):
        factory = APIRequestFactory()
        body_create = {
            "cliente": self.cliente.id,
            "itens": [{"produto": self.produto.id, "quantidade": 1, "preco_unitario": 10}],
            "data": "2025-01-10",
        }
        r0 = VendaListCreate.as_view()(
            factory.post(
                "/api/vendas/",
                data=json.dumps(body_create),
                content_type="application/json",
            )
        )
        self.assertEqual(r0.status_code, 201)
        vid = r0.data["id"]
        v = Venda.objects.get(pk=vid)
        lanc_iso = v.data_lancamento.date().isoformat() if v.data_lancamento else ""
        body_patch = {"data": "2025-06-01"}
        r1 = VendaDetail.as_view()(
            factory.patch(
                f"/api/vendas/{vid}/",
                data=json.dumps(body_patch),
                content_type="application/json",
            ),
            pk=vid,
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.data.get("data"), "2025-06-01")
        self.assertEqual(r1.data.get("data_lancamento"), lanc_iso)
        v.refresh_from_db()
        self.assertEqual(v.data_venda.date().isoformat(), "2025-06-01")
        self.assertEqual(v.data_lancamento.date().isoformat(), lanc_iso)


class CompraDataApiTest(TestCase):
    """Garante que POST /api/compras/ grava data_compra conforme o corpo."""

    def setUp(self):
        self.fornecedor = Fornecedor.objects.create(nome="Fornecedor Teste Compra")
        self.material = Material.objects.create(nome="Material Teste", preco_unitario_base=Decimal("5.0000"))

    def test_post_com_data_grava_ordem_e_itens(self):
        factory = APIRequestFactory()
        body = {
            "fornecedor_id": self.fornecedor.id,
            "itens": [
                {
                    "tipo": "material",
                    "material": self.material.id,
                    "quantidade": 2,
                    "preco_no_dia": "3.50",
                }
            ],
            "data": "2024-11-10",
            "data_compra": "2024-11-10",
        }
        request = factory.post(
            "/api/compras/",
            data=json.dumps(body),
            content_type="application/json",
        )
        response = CompraListCreate.as_view()(request)
        if response.status_code != 201:
            self.fail(
                f"esperado 201, veio {response.status_code}: "
                f"{getattr(response, 'data', None)!r}"
            )
        payload = response.data
        self.assertEqual(payload.get("data"), "2024-11-10")
        ordem = OrdemCompra.objects.get(pk=payload["id"])
        self.assertEqual(ordem.data_compra.date().isoformat(), "2024-11-10")
        item = ordem.itens.first()
        self.assertIsNotNone(item)
        self.assertEqual(item.data_compra.date().isoformat(), "2024-11-10")

    def test_patch_ordem_altera_data_compra_nos_itens(self):
        factory = APIRequestFactory()
        body_create = {
            "fornecedor_id": self.fornecedor.id,
            "itens": [
                {
                    "tipo": "material",
                    "material": self.material.id,
                    "quantidade": 1,
                    "preco_no_dia": "2.00",
                }
            ],
            "data": "2025-03-01",
        }
        r0 = CompraListCreate.as_view()(
            factory.post(
                "/api/compras/",
                data=json.dumps(body_create),
                content_type="application/json",
            )
        )
        self.assertEqual(r0.status_code, 201)
        oid = r0.data["id"]
        ordem = OrdemCompra.objects.get(pk=oid)
        lanc_iso = ordem.data_lancamento.date().isoformat() if ordem.data_lancamento else ""
        r1 = CompraDetail.as_view()(
            factory.patch(
                f"/api/compras/{oid}/",
                data=json.dumps({"data": "2025-04-15"}),
                content_type="application/json",
            ),
            pk=oid,
        )
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r1.data.get("data"), "2025-04-15")
        self.assertEqual(r1.data.get("data_lancamento"), lanc_iso)
        ordem.refresh_from_db()
        self.assertEqual(ordem.data_compra.date().isoformat(), "2025-04-15")
        self.assertEqual(ordem.data_lancamento.date().isoformat(), lanc_iso)
        it = ordem.itens.first()
        self.assertEqual(it.data_compra.date().isoformat(), "2025-04-15")

    def test_delete_ordem_cancela_logicamente(self):
        factory = APIRequestFactory()
        body_create = {
            "fornecedor_id": self.fornecedor.id,
            "itens": [
                {
                    "tipo": "material",
                    "material": self.material.id,
                    "quantidade": 1,
                    "preco_no_dia": "5.00",
                }
            ],
            "data": "2025-01-01",
        }
        r0 = CompraListCreate.as_view()(
            factory.post(
                "/api/compras/",
                data=json.dumps(body_create),
                content_type="application/json",
            )
        )
        self.assertEqual(r0.status_code, 201)
        oid = r0.data["id"]
        r1 = CompraDetail.as_view()(
            factory.delete(
                f"/api/compras/{oid}/",
                data=json.dumps({"motivo": "Cancelamento de teste"}),
                content_type="application/json",
            ),
            pk=oid,
        )
        self.assertEqual(r1.status_code, status.HTTP_204_NO_CONTENT)
        ordem = OrdemCompra.objects.get(pk=oid)
        self.assertTrue(ordem.cancelada)
        self.assertTrue(ordem.itens.exists())
        r2 = CompraDetail.as_view()(factory.get(f"/api/compras/{oid}/"), pk=oid)
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.data.get("cancelada"))
