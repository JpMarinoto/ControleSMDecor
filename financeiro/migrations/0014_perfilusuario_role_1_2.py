# Migração: role 1 = Chefe, 2 = Funcionário (valores no banco)

from django.db import migrations, models


def role_para_1_2(apps, schema_editor):
    PerfilUsuario = apps.get_model("financeiro", "PerfilUsuario")
    PerfilUsuario.objects.filter(role="chefe").update(role="1")
    PerfilUsuario.objects.filter(role="funcionario").update(role="2")


def role_para_chefe_funcionario(apps, schema_editor):
    PerfilUsuario = apps.get_model("financeiro", "PerfilUsuario")
    PerfilUsuario.objects.filter(role="1").update(role="chefe")
    PerfilUsuario.objects.filter(role="2").update(role="funcionario")


class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0013_perfilusuario"),
    ]

    operations = [
        migrations.RunPython(role_para_1_2, role_para_chefe_funcionario),
        migrations.AlterField(
            model_name="perfilusuario",
            name="role",
            field=models.CharField(
                choices=[("1", "Chefe"), ("2", "Funcionário")],
                default="2",
                max_length=20,
            ),
        ),
    ]
