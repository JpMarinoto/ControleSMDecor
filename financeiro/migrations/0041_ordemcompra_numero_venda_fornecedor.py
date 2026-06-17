from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0040_precos_linha_compra_venda_cinco_decimais"),
    ]

    operations = [
        migrations.AddField(
            model_name="ordemcompra",
            name="numero_venda_fornecedor",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Número do pedido/nota de venda emitida pelo fornecedor (controle anti-duplicidade).",
                max_length=64,
                verbose_name="Nº venda do fornecedor",
            ),
        ),
    ]
