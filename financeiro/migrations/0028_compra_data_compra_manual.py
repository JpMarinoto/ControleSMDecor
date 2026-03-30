# data_compra deixa de ser auto_now_add para permitir data enviada pelo frontend (YYYY-MM-DD).

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0027_venda_data_venda_manual"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ordemcompra",
            name="data_compra",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AlterField(
            model_name="compramaterial",
            name="data_compra",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AlterField(
            model_name="compraproduto",
            name="data_compra",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
