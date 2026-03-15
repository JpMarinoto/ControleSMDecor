# Generated manually to handle ItemVenda.produto null->non-null transition

import django.db.models.deletion
from django.db import migrations, models


def remove_itemvenda_orphans(apps, schema_editor):
    """Remove ItemVenda sem produto (órfãos da antiga estrutura com variação)."""
    ItemVenda = apps.get_model('financeiro', 'ItemVenda')
    ItemVenda.objects.filter(produto__isnull=True).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('financeiro', '0005_remove_variacao_produto_pai_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CategoriaProduto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome', models.CharField(max_length=200, unique=True)),
                ('descricao', models.TextField(blank=True, null=True)),
            ],
        ),
        migrations.AddField(
            model_name='produto',
            name='categoria',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='produtos',
                to='financeiro.categoriaproduto',
            ),
        ),
        migrations.RunPython(remove_itemvenda_orphans, noop),
        migrations.AlterField(
            model_name='itemvenda',
            name='produto',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                to='financeiro.produto',
            ),
        ),
    ]
