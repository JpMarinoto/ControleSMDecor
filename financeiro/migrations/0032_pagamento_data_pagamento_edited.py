# Generated manually: permite gravar a data escolhida no lançamento (antes auto_now_add sobrescrevia).

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0031_venda_observacao_registro_impressao"),
    ]

    operations = [
        migrations.AlterField(
            model_name="pagamento",
            name="data_pagamento",
            field=models.DateField(default=django.utils.timezone.now),
        ),
    ]
