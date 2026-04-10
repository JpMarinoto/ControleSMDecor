# Marcação manual "já paga" em vendas e ordens/compras (controle visual; não substitui lançamento de pagamento).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0034_material_preco_fabricacao"),
    ]

    operations = [
        migrations.AddField(
            model_name="venda",
            name="marcada_paga",
            field=models.BooleanField(
                default=False,
                verbose_name="Marcada como paga",
                help_text="Controle manual no detalhe do cliente; não altera o saldo nem os pagamentos lançados.",
            ),
        ),
        migrations.AddField(
            model_name="ordemcompra",
            name="marcada_paga",
            field=models.BooleanField(
                default=False,
                verbose_name="Marcada como paga",
                help_text="Controle manual no detalhe do fornecedor.",
            ),
        ),
        migrations.AddField(
            model_name="compramaterial",
            name="marcada_paga",
            field=models.BooleanField(
                default=False,
                verbose_name="Marcada como paga (avulsa)",
                help_text="Só para compra sem ordem; se houver ordem, usa a marcação da ordem.",
            ),
        ),
        migrations.AddField(
            model_name="compraproduto",
            name="marcada_paga",
            field=models.BooleanField(
                default=False,
                verbose_name="Marcada como paga (avulsa)",
                help_text="Só para compra sem ordem; se houver ordem, usa a marcação da ordem.",
            ),
        ),
    ]
