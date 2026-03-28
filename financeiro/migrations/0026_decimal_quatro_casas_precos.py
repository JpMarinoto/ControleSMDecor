# Generated manually — preços e quantidades de insumo com até 4 casas decimais

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0025_produto_fabricado_insumos"),
    ]

    operations = [
        migrations.AlterField(
            model_name="material",
            name="preco_unitario_base",
            field=models.DecimalField(decimal_places=4, max_digits=12),
        ),
        migrations.AlterField(
            model_name="produto",
            name="preco_custo",
            field=models.DecimalField(decimal_places=4, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name="produto",
            name="mao_obra_unitaria",
            field=models.DecimalField(decimal_places=4, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name="produto",
            name="margem_lucro_percent",
            field=models.DecimalField(decimal_places=4, default=0, max_digits=10),
        ),
        migrations.AlterField(
            model_name="produto",
            name="preco_venda",
            field=models.DecimalField(decimal_places=4, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name="produtoinsumo",
            name="quantidade",
            field=models.DecimalField(decimal_places=4, default=1, max_digits=12),
        ),
    ]
