from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0038_alter_compramaterial_marcada_paga_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="PrecificacaoTiktok",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nome", models.CharField(max_length=200, unique=True)),
                ("mes_referencia", models.CharField(blank=True, default="", max_length=7)),
                ("nf_percent", models.CharField(default="70", max_length=20)),
                ("imposto_percent", models.CharField(default="10", max_length=20)),
                ("afiliado_percent", models.CharField(default="0", max_length=20)),
                ("comissao_percent", models.CharField(default="6", max_length=20)),
                ("comissao_cap", models.CharField(default="50", max_length=20)),
                ("tarifa_item", models.CharField(default="4", max_length=20)),
                ("pte_percent", models.CharField(default="6", max_length=20)),
                ("pte_cap", models.CharField(default="50", max_length=20)),
                ("participar_pte", models.BooleanField(default=True)),
                ("linhas", models.JSONField(default=list)),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
                ("atualizado_em", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Precificação TikTok Shop",
                "verbose_name_plural": "Precificações TikTok Shop",
                "ordering": ["-atualizado_em"],
            },
        ),
    ]
