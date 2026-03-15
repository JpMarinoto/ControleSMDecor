# Generated manually for PerfilUsuario (Chefe / Funcionário)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('financeiro', '0012_remove_fornecedor_endereco_produto_estoque_atual_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PerfilUsuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('chefe', 'Chefe'), ('funcionario', 'Funcionário')], default='funcionario', max_length=20)),
                ('nome_exibicao', models.CharField(blank=True, max_length=100)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='perfil_financeiro', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Perfil usuário',
                'verbose_name_plural': 'Perfis de usuário',
            },
        ),
    ]
