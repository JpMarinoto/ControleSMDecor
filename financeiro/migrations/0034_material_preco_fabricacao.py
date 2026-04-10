# Preço usado só no cálculo de insumos/fabricação; compras e estoque seguem preco_unitario_base.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0033_precificacao_shopee"),
    ]

    operations = [
        migrations.AddField(
            model_name="material",
            name="preco_fabricacao",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text="Se preenchido, usado no custo de insumos dos produtos fabricados. Compras e valor de estoque usam preco_unitario_base.",
                max_digits=12,
                null=True,
            ),
        ),
    ]
