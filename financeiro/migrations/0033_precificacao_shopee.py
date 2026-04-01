from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0032_pagamento_data_pagamento_edited"),
    ]

    operations = [
        migrations.CreateModel(
            name="PrecificacaoShopee",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nome", models.CharField(max_length=200, unique=True)),
                ("mes_referencia", models.CharField(blank=True, default="", max_length=7)),
                ("nf_percent", models.CharField(default="70", max_length=20)),
                ("imposto_percent", models.CharField(default="10", max_length=20)),
                ("linhas", models.JSONField(default=list)),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
                ("atualizado_em", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Precificação Shopee",
                "verbose_name_plural": "Precificações Shopee",
                "ordering": ["-atualizado_em"],
            },
        ),
    ]
