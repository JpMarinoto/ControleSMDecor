"""
Cria o primeiro usuário Mestão (admin do sistema).
Uso: python manage.py criar_mestao
     python manage.py criar_mestao --username admin --password sua_senha
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from financeiro.models import PerfilUsuario

User = get_user_model()


class Command(BaseCommand):
    help = "Cria um usuário com perfil Mestão/Chefe (pode criar e editar funcionários)."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="mestao", help="Nome de usuário para login")
        parser.add_argument("--password", default="mestao123", help="Senha (mín. 6 caracteres)")

    def handle(self, *args, **options):
        username = options["username"]
        password = options["password"]
        if len(password) < 6:
            self.stderr.write("Senha deve ter no mínimo 6 caracteres.")
            return
        if User.objects.filter(username=username).exists():
            user = User.objects.get(username=username)
            user.is_staff = True
            user.save(update_fields=["is_staff"])
            perfil, created = PerfilUsuario.objects.get_or_create(
                user=user,
                defaults={"role": PerfilUsuario.ROLE_CHEFE, "nome_exibicao": username},
            )
            if not created:
                perfil.role = PerfilUsuario.ROLE_CHEFE
                perfil.save()
            self.stdout.write(self.style.SUCCESS(f"Usuário '{username}' já existe. Perfil definido como Mestão."))
            return
        user = User.objects.create_user(username=username, password=password)
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        PerfilUsuario.objects.create(
            user=user,
            role=PerfilUsuario.ROLE_CHEFE,
            nome_exibicao=username,
        )
        self.stdout.write(self.style.SUCCESS(f"Mestão criado: usuário '{username}'. Faça login na aplicação."))
