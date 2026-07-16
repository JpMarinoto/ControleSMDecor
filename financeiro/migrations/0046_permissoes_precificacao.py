# Generated manually for permissões de precificação

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_usuario_precificacao(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL)
    PerfilUsuario = apps.get_model("financeiro", "PerfilUsuario")
    PrecificacaoShopee = apps.get_model("financeiro", "PrecificacaoShopee")
    PrecificacaoTiktok = apps.get_model("financeiro", "PrecificacaoTiktok")

    # Preferir Chefe ativo — o primeiro Chefe por id pode estar inativo (ex.: mestao).
    owner = None
    for perfil in PerfilUsuario.objects.filter(role="1").select_related("user").order_by("user_id"):
        if perfil.user_id and getattr(perfil.user, "is_active", True):
            owner = perfil.user
            break
    if owner is None:
        perfil_chefe = PerfilUsuario.objects.filter(role="1").select_related("user").first()
        if perfil_chefe:
            owner = perfil_chefe.user
    if owner is None:
        owner = User.objects.filter(is_superuser=True, is_active=True).first()
    if owner is None:
        owner = User.objects.filter(is_superuser=True).first()
    if owner is None:
        owner = User.objects.filter(is_staff=True, is_active=True).first()
    if owner is None:
        owner = User.objects.filter(is_staff=True).first()
    if owner is None:
        owner = User.objects.filter(is_active=True).order_by("id").first()
    if owner is None:
        owner = User.objects.order_by("id").first()
    if owner is None:
        return

    PrecificacaoShopee.objects.filter(usuario__isnull=True).update(usuario=owner)
    PrecificacaoTiktok.objects.filter(usuario__isnull=True).update(usuario=owner)

    # Clientes devem poder precificar
    PerfilUsuario.objects.filter(role="3").update(pode_precificar=True)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("financeiro", "0045_shopee_ambiente_producao_default"),
    ]

    operations = [
        migrations.AddField(
            model_name="perfilusuario",
            name="pode_precificar",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="perfilusuario",
            name="role",
            field=models.CharField(
                choices=[("1", "Chefe"), ("2", "Funcionário"), ("3", "Cliente")],
                default="2",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="precificacaoshopee",
            name="usuario",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="precificacoes_shopee",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="precificacaotiktok",
            name="usuario",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="precificacoes_tiktok",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_usuario_precificacao, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="precificacaoshopee",
            name="usuario",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="precificacoes_shopee",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="precificacaotiktok",
            name="usuario",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="precificacoes_tiktok",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="precificacaoshopee",
            name="nome",
            field=models.CharField(max_length=200),
        ),
        migrations.AlterField(
            model_name="precificacaotiktok",
            name="nome",
            field=models.CharField(max_length=200),
        ),
        migrations.AlterUniqueTogether(
            name="precificacaoshopee",
            unique_together={("usuario", "nome")},
        ),
        migrations.AlterUniqueTogether(
            name="precificacaotiktok",
            unique_together={("usuario", "nome")},
        ),
    ]
