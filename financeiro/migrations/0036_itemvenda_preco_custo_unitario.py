# Snapshot de custo unitário por linha de venda (lucro = receita - custo no período).

from decimal import Decimal
from django.db import migrations, models


def backfill_preco_custo(apps, schema_editor):
    ItemVenda = apps.get_model('financeiro', 'ItemVenda')
    for item in ItemVenda.objects.select_related('produto').iterator(chunk_size=500):
        if item.preco_custo_unitario is None and item.produto_id:
            pc = getattr(item.produto, 'preco_custo', None) or Decimal('0')
            ItemVenda.objects.filter(pk=item.pk).update(preco_custo_unitario=pc)


class Migration(migrations.Migration):

    dependencies = [
        ('financeiro', '0035_marcada_paga_venda_ordem_compra'),
    ]

    operations = [
        migrations.AddField(
            model_name='itemvenda',
            name='preco_custo_unitario',
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text='Custo do produto no momento da venda; usado no relatório de lucros.',
                max_digits=14,
                null=True,
                verbose_name='Custo unitário (snapshot)',
            ),
        ),
        migrations.RunPython(backfill_preco_custo, migrations.RunPython.noop),
    ]
