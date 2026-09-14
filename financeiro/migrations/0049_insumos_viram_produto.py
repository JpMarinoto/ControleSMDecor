# Converte todos os Produto.eh_insumo=True em produtos comuns.

from django.db import migrations


def zerar_eh_insumo(apps, schema_editor):
    Produto = apps.get_model("financeiro", "Produto")
    Produto.objects.filter(eh_insumo=True).update(eh_insumo=False)


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0048_unifica_material_em_produto"),
    ]

    operations = [
        migrations.RunPython(zerar_eh_insumo, migrations.RunPython.noop),
    ]
