# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0036_itemvenda_preco_custo_unitario"),
    ]

    operations = [
        migrations.AddField(
            model_name="ordemcompra",
            name="ultima_alteracao_em",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Data da última alteração",
            ),
        ),
        migrations.AddField(
            model_name="ordemcompra",
            name="ultima_alteracao_observacao",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Texto da última alteração (data, itens, exclusão, etc.) para exibição no sistema.",
                verbose_name="Última observação de alteração",
            ),
        ),
    ]
