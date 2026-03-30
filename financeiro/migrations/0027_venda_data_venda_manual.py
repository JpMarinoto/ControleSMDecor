# data_venda deixa de ser auto_now_add para permitir data enviada pelo frontend (YYYY-MM-DD).

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0026_decimal_quatro_casas_precos"),
    ]

    operations = [
        migrations.AlterField(
            model_name="venda",
            name="data_venda",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
