# Reatribui precificações de usuários inativos para o primeiro Chefe ativo.

from django.conf import settings
from django.db import migrations


def reassign_precificacoes_inativo_para_chefe_ativo(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL)
    PerfilUsuario = apps.get_model("financeiro", "PerfilUsuario")
    PrecificacaoShopee = apps.get_model("financeiro", "PrecificacaoShopee")
    PrecificacaoTiktok = apps.get_model("financeiro", "PrecificacaoTiktok")

    destino = None
    for perfil in PerfilUsuario.objects.filter(role="1").select_related("user").order_by("user_id"):
        if perfil.user_id and getattr(perfil.user, "is_active", True):
            destino = perfil.user
            break
    if destino is None:
        return

    inactive_ids = list(
        User.objects.filter(is_active=False).values_list("id", flat=True)
    )
    if not inactive_ids:
        return

    PrecificacaoShopee.objects.filter(usuario_id__in=inactive_ids).update(usuario=destino)
    PrecificacaoTiktok.objects.filter(usuario_id__in=inactive_ids).update(usuario=destino)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("financeiro", "0046_permissoes_precificacao"),
    ]

    operations = [
        migrations.RunPython(
            reassign_precificacoes_inativo_para_chefe_ativo,
            migrations.RunPython.noop,
        ),
    ]
