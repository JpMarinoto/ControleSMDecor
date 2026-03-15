import csv
from django.core.management.base import BaseCommand
from financeiro.models import Cliente, Produto, Variacao, Venda, ItemVenda, Pagamento
from decimal import Decimal
from datetime import datetime

class Command(BaseCommand):
    help = 'Importa CSVs detectando colunas automaticamente'

    def add_arguments(self, parser):
        parser.add_argument('caminho_csv', type=str)

    def handle(self, *args, **options):
        caminho = options['caminho_csv']
        
        # Tenta abrir com latin-1 (comum em CSVs do Excel brasileiro/português)
        try:
            with open(caminho, 'r', encoding='latin-1') as f:
                reader = list(csv.reader(f))
        except:
            with open(caminho, 'r', encoding='utf-8') as f:
                reader = list(csv.reader(f))

        # 1. LOCALIZAR CLIENTE E CABEÇALHOS
        nome_cliente = ""
        linha_header = -1
        linha_precos = -1
        
        for i, row in enumerate(reader):
            row_str = "".join(row)
            # A linha do cliente geralmente é a única com um nome isolado antes da tabela
            if i == 4: # Padrão observado nos teus ficheiros
                nome_cliente = next((val for val in row if val.strip()), "Cliente Desconhecido")
            
            # Localiza a linha que contém os títulos das colunas
            if "Data" in row and "Pagou" in row:
                linha_header = i
                linha_precos = i - 3 # Os preços estão 3 linhas acima do header
                break

        if linha_header == -1:
            self.stdout.write(self.style.ERROR("Não foi possível encontrar a coluna 'Data' ou 'Pagou'."))
            return

        # 2. MAPEAMENTO DE COLUNAS
        cols = {val: idx for idx, val in enumerate(reader[linha_header]) if val}
        precos_row = reader[linha_precos]
        
        cliente, _ = Cliente.objects.get_or_create(nome=nome_cliente.strip())
        self.stdout.write(f"A processar: {cliente.nome}")

        # 3. PROCESSAR LINHAS DE DADOS
        for row in reader[linha_header + 1:]:
            if not row or len(row) <= max(cols.values()): continue
            
            data_str = row[cols['Data']].strip()
            # Tenta validar se é uma data válida (YYYY-MM-DD ou DD/MM/YYYY)
            data_venda = None
            for fmt in ('%Y-%m-%d', '%d/%m/%Y'):
                try:
                    data_venda = datetime.strptime(data_str, fmt)
                    break
                except: continue
            
            if not data_venda: continue # Ignora linhas de "Soma", "Semana", etc.

            # Criar Venda e Itens
            venda = None
            
            # Itera pelos produtos (Ripado, Led, etc.)
            for prod_nome in ['Ripado', 'Ripado Embalado', 'Embalagem', 'Cabe. Ripa', 'Cabe. Nuvem', 'Arandela', 'Varal', 'Almofada', 'Led']:
                if prod_nome in cols:
                    idx = cols[prod_nome]
                    qtd_str = row[idx].strip()
                    preco_str = precos_row[idx].strip().replace(',', '.')

                    if qtd_str.isdigit() and int(qtd_str) > 0:
                        if not venda:
                            venda = Venda.objects.create(cliente=cliente)
                            venda.data_venda = data_venda
                            venda.save()
                        
                        # Criar Produto e Variacao
                        prod_obj, _ = Produto.objects.get_or_create(nome=prod_nome)
                        var_obj, _ = Variacao.objects.get_or_create(produto_pai=prod_obj, cor="Padrão")
                        
                        ItemVenda.objects.create(
                            venda=venda,
                            variacao=var_obj,
                            quantidade=int(qtd_str),
                            preco_unitario=Decimal(preco_str if preco_str else 0)
                        )

            # Processar Pagamento
            pagou_str = row[cols['Pagou']].strip().replace(',', '.')
            if pagou_str and pagou_str.replace('.', '', 1).replace('-', '', 1).isdigit():
                valor_pago = Decimal(pagou_str)
                if valor_pago != 0:
                    Pagamento.objects.create(
                        cliente=cliente,
                        valor=valor_pago,
                        data_pagamento=data_venda
                    )

        self.stdout.write(self.style.SUCCESS(f"Finalizado: {cliente.nome}"))