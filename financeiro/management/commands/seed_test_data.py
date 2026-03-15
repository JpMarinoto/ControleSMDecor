"""
Comando para popular o banco com dados de teste.
Uso: python manage.py seed_test_data
"""
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from financeiro.models import (
    Cliente,
    Fornecedor,
    CategoriaProduto,
    Produto,
    Material,
    Venda,
    ItemVenda,
    Pagamento,
    CompraMaterial,
    PagamentoFornecedor,
    ContaBanco,
    MovimentoBanco,
    DividaGeral,
    OutrosAReceber,
    MovimentoCaixa,
)


class Command(BaseCommand):
    help = "Insere dados de teste: clientes, fornecedores, produtos, materiais, vendas, compras, etc."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Limpar dados existentes antes de inserir (opcional)",
        )

    def handle(self, *args, **options):
        if options.get("clear"):
            self.stdout.write("Limpando dados existentes...")
            ItemVenda.objects.all().delete()
            Venda.objects.all().delete()
            Pagamento.objects.all().delete()
            CompraMaterial.objects.all().delete()
            PagamentoFornecedor.objects.all().delete()
            MovimentoCaixa.objects.all().delete()
            MovimentoBanco.objects.all().delete()
            Produto.objects.all().delete()
            Material.objects.all().delete()
            ContaBanco.objects.all().delete()
            DividaGeral.objects.all().delete()
            OutrosAReceber.objects.all().delete()
            Cliente.objects.all().delete()
            Fornecedor.objects.all().delete()
            CategoriaProduto.objects.all().delete()
            self.stdout.write("Dados limpos.")

        self.stdout.write("Criando categorias...")
        cat_prod1, _ = CategoriaProduto.objects.get_or_create(
            nome="Móveis", tipo="produto", defaults={"descricao": "Móveis planejados"}
        )
        cat_prod2, _ = CategoriaProduto.objects.get_or_create(
            nome="Decoração", tipo="produto", defaults={"descricao": "Itens de decoração"}
        )
        cat_mat1, _ = CategoriaProduto.objects.get_or_create(
            nome="Madeira", tipo="material", defaults={"descricao": "Madeiras"}
        )
        cat_mat2, _ = CategoriaProduto.objects.get_or_create(
            nome="Ferragens", tipo="material", defaults={"descricao": "Ferragens e parafusos"}
        )

        self.stdout.write("Criando 5 clientes...")
        clientes_data = [
            {"nome": "Maria Silva", "telefone": "11999991111", "cpf": "111.111.111-11"},
            {"nome": "João Santos", "telefone": "11999992222", "cpf": "222.222.222-22"},
            {"nome": "Ana Oliveira", "telefone": "11999993333", "cpf": "333.333.333-33"},
            {"nome": "Pedro Costa", "telefone": "11999994444", "cnpj": "44.444.444/0001-44"},
            {"nome": "Carla Lima", "telefone": "11999995555", "cpf": "555.555.555-55"},
        ]
        clientes = []
        for d in clientes_data:
            c, _ = Cliente.objects.get_or_create(
                nome=d["nome"],
                defaults={"telefone": d.get("telefone", ""), "cpf": d.get("cpf"), "cnpj": d.get("cnpj")},
            )
            clientes.append(c)

        self.stdout.write("Criando 5 fornecedores...")
        forn_data = [
            {"nome": "Madeireira Norte", "telefone": "11888881111"},
            {"nome": "Ferragens Center", "telefone": "11888882222"},
            {"nome": "Distribuidora Sul", "telefone": "11888883333"},
            {"nome": "Atacado Leste", "telefone": "11888884444"},
            {"nome": "Materiais Premium", "telefone": "11888885555"},
        ]
        fornecedores = []
        for d in forn_data:
            f, _ = Fornecedor.objects.get_or_create(
                nome=d["nome"], defaults={"telefone": d.get("telefone", "")}
            )
            fornecedores.append(f)

        self.stdout.write("Criando produtos...")
        produtos_data = [
            ("Mesa 6 lugares", cat_prod1, Decimal("850.00")),
            ("Cadeira estofada", cat_prod1, Decimal("320.00")),
            ("Estante 2m", cat_prod1, Decimal("1200.00")),
            ("Quadro decorativo", cat_prod2, Decimal("89.90")),
            ("Abajur", cat_prod2, Decimal("145.00")),
        ]
        produtos = []
        for nome, cat, preco in produtos_data:
            p, _ = Produto.objects.get_or_create(
                nome=nome, defaults={"categoria": cat, "preco_venda": preco}
            )
            produtos.append(p)

        self.stdout.write("Criando materiais...")
        materiais_data = [
            ("Frejó 45x11", cat_mat1, fornecedores[0], Decimal("0.64")),
            ("MDF 18mm", cat_mat1, fornecedores[0], Decimal("1.20")),
            ("Parafuso 4x40", cat_mat2, fornecedores[1], Decimal("0.05")),
            ("Dobradiça 35mm", cat_mat2, fornecedores[1], Decimal("3.50")),
            ("Cola PVA", cat_mat2, fornecedores[2], Decimal("28.00")),
        ]
        materiais = []
        for nome, cat, forn, preco in materiais_data:
            m, _ = Material.objects.get_or_create(
                nome=nome,
                defaults={
                    "categoria": cat,
                    "fornecedor_padrao": forn,
                    "preco_unitario_base": preco,
                    "estoque_atual": 100,
                },
            )
            materiais.append(m)

        self.stdout.write("Criando vendas e itens...")
        hoje = timezone.now()
        vendas_config = [
            (clientes[0], [(produtos[0], 1, Decimal("850.00")), (produtos[1], 4, Decimal("320.00"))]),
            (clientes[1], [(produtos[2], 1, Decimal("1200.00"))]),
            (clientes[2], [(produtos[3], 3, Decimal("89.90")), (produtos[4], 2, Decimal("145.00"))]),
            (clientes[0], [(produtos[4], 1, Decimal("145.00"))]),
            (clientes[3], [(produtos[0], 2, Decimal("850.00"))]),
        ]
        for cliente, itens in vendas_config:
            v = Venda.objects.create(cliente=cliente)
            for prod, qtd, preco_un in itens:
                ItemVenda.objects.create(venda=v, produto=prod, quantidade=qtd, preco_unitario=preco_un)

        self.stdout.write("Criando pagamentos de clientes...")
        Pagamento.objects.create(cliente=clientes[0], valor=Decimal("500.00"))
        Pagamento.objects.create(cliente=clientes[1], valor=Decimal("600.00"))

        self.stdout.write("Criando compras de materiais...")
        for i, mat in enumerate(materiais[:4]):
            CompraMaterial.objects.create(
                material=mat,
                fornecedor=mat.fornecedor_padrao or fornecedores[0],
                quantidade=50 + i * 10,
                preco_no_dia=mat.preco_unitario_base,
            )

        self.stdout.write("Criando pagamentos a fornecedores...")
        PagamentoFornecedor.objects.create(fornecedor=fornecedores[0], valor=Decimal("200.00"))
        PagamentoFornecedor.objects.create(fornecedor=fornecedores[1], valor=Decimal("150.00"))

        self.stdout.write("Criando contas bancárias...")
        ContaBanco.objects.get_or_create(
            nome="Conta Corrente", defaults={"saldo_atual": Decimal("5000.00")}
        )
        ContaBanco.objects.get_or_create(
            nome="Caixa", defaults={"saldo_atual": Decimal("1200.00")}
        )

        self.stdout.write("Criando dívidas gerais...")
        DividaGeral.objects.get_or_create(nome="Aluguel", defaults={"valor": Decimal("1800.00")})
        DividaGeral.objects.get_or_create(nome="Energia", defaults={"valor": Decimal("350.00")})

        self.stdout.write("Criando outros a receber...")
        OutrosAReceber.objects.create(
            descricao="Venda marketplace", valor=Decimal("450.00"), data_prevista=date.today() + timedelta(days=7)
        )

        self.stdout.write("Criando movimentações de caixa...")
        MovimentoCaixa.objects.create(tipo="entrada", descricao="Venda avulsa", valor=Decimal("100.00"))
        MovimentoCaixa.objects.create(tipo="saida", descricao="Material escritório", valor=Decimal("45.00"))

        self.stdout.write(self.style.SUCCESS("Dados de teste inseridos com sucesso."))
        self.stdout.write(
            f"  - {Cliente.objects.count()} clientes, {Fornecedor.objects.count()} fornecedores"
        )
        self.stdout.write(
            f"  - {Produto.objects.count()} produtos, {Material.objects.count()} materiais"
        )
        self.stdout.write(f"  - {Venda.objects.count()} vendas, {CompraMaterial.objects.count()} compras")
