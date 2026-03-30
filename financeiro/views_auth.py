"""
Autenticação por Token e gestão de usuários (Chefe / Funcionário).
Login devolve um token; o frontend envia header Authorization: Token <key> em todos os pedidos.
"""
import json
import os
import time
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, get_user_model
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from .models import PerfilUsuario, LogSistema

User = get_user_model()


def _user_payload(user):
    """Retorna dict com dados do usuário e perfil para o frontend. Staff/superuser sem perfil ganham perfil Chefe."""
    if not user or not user.is_authenticated:
        return None
    try:
        perfil = user.perfil_financeiro
        role = str(perfil.role) if perfil.role else PerfilUsuario.ROLE_FUNCIONARIO
        nome = (perfil.nome_exibicao or user.get_full_name() or user.username) or ""
    except PerfilUsuario.DoesNotExist:
        if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
            nome_exib = (user.get_full_name() or user.username) or ""
            perfil = PerfilUsuario.objects.create(
                user=user,
                role=PerfilUsuario.ROLE_CHEFE,
                nome_exibicao=nome_exib[:100],
            )
            role = str(perfil.role)
            nome = (perfil.nome_exibicao or user.username) or ""
        else:
            role = PerfilUsuario.ROLE_FUNCIONARIO
            nome = (user.get_full_name() or user.username) or ""
    return {
        "id": int(user.id),
        "username": str(user.username),
        "nome": str(nome),
        "role": str(role),
        "is_chefe": role == PerfilUsuario.ROLE_CHEFE,
    }


@method_decorator(csrf_exempt, name="dispatch")
class AuthLogin(APIView):
    """POST: username, password -> faz login por sessão e retorna dados do usuário."""
    authentication_classes = []  # evita CSRF do DRF (SessionAuthentication) no login
    permission_classes = []

    def post(self, request):
        # #region agent log
        def _log(msg, **kw):
            try:
                path = os.path.join(os.path.dirname(__file__), "debug_login.log")
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"message": msg, "data": dict(kw), "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n")
            except Exception:
                pass
        # #endregion agent log
        data = getattr(request, "data", None) or {}
        if not isinstance(data, dict):
            data = {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        if not username or not password:
            _log("login_400", reason="empty", has_username=bool(username), has_password=bool(password))
            return Response(
                {"error": "Usuário e senha obrigatórios"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = authenticate(request, username=username, password=password)

        if user is None:
            _log("login_401", reason="auth_failed", username_len=len(username))
            return Response(
                {"error": "Usuário ou senha incorretos"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            _log("login_403", reason="inactive")
            return Response(
                {"error": "Usuário inativo"},
                status=status.HTTP_403_FORBIDDEN,
            )
        token, _ = Token.objects.get_or_create(user=user)
        payload = _user_payload(user)
        if payload:
            payload["token"] = token.key
        _log("login_200", user_id=user.id, username=user.username)
        LogSistema.objects.create(
            usuario=user,
            acao="Login",
            tabela="Auth",
            detalhes=f"Usuário {user.username} fez login no sistema.",
        )
        return Response(payload or {"token": token.key})


@method_decorator(csrf_exempt, name="dispatch")
class AuthLogout(APIView):
    """Invalida o token (o cliente envia Authorization: Token <key>)."""
    authentication_classes = []  # vamos ler o token do header manualmente para o apagar
    permission_classes = []

    def post(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION") or ""
        user = None
        if auth_header.startswith("Token "):
            key = auth_header[6:].strip()
            t = Token.objects.filter(key=key).select_related("user").first()
            if t:
                user = t.user
            Token.objects.filter(key=key).delete()
        if user:
            LogSistema.objects.create(
                usuario=user,
                acao="Logout",
                tabela="Auth",
                detalhes=f"Usuário {user.username} saiu do sistema.",
            )
        return Response({"ok": True})


@method_decorator(csrf_exempt, name="dispatch")
class AuthVerifyPassword(APIView):
    """POST JSON { \"password\": \"...\" } — confere a senha com o utilizador do token atual."""

    def post(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado.", "detail": "not_authenticated"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = getattr(request, "data", None) or {}
        if not isinstance(data, dict):
            data = {}
        password = data.get("password") or ""
        if not str(password).strip():
            return Response(
                {"password": ["Informe a senha."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(password):
            return Response(
                {"password": ["Senha incorreta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})


class AuthMe(APIView):
    """GET: retorna o usuário atual (via token). PUT: atualiza nome de exibição e/ou senha (qualquer usuário logado)."""
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado. Envie o header Authorization: Token <seu_token>.", "detail": "not_authenticated"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            payload = _user_payload(request.user)
            if payload is None:
                return Response({"error": "Não autenticado"}, status=status.HTTP_401_UNAUTHORIZED)
            return Response(payload)
        except Exception as e:
            if getattr(settings, "DEBUG", False):
                return Response(
                    {"error": "Erro ao obter utilizador", "detail": str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response({"error": "Erro ao obter utilizador"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def put(self, request):
        """Permite ao usuário logado editar seu próprio perfil: nome_exibicao e/ou senha."""
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado.", "detail": "not_authenticated"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        user = request.user
        data = getattr(request, "data", None) or {}
        # Nome de exibição
        nome_exibicao = data.get("nome_exibicao")
        if nome_exibicao is not None:
            nome_exibicao = str(nome_exibicao).strip() or user.username
            perfil, _ = PerfilUsuario.objects.get_or_create(
                user=user,
                defaults={"role": PerfilUsuario.ROLE_FUNCIONARIO, "nome_exibicao": user.username},
            )
            perfil.nome_exibicao = nome_exibicao[:100]
            perfil.save()
        # Trocar senha: exige senha_atual e nova senha
        nova_senha = data.get("nova_senha") or data.get("password")
        if nova_senha:
            from django.contrib.auth import authenticate
            senha_atual = data.get("senha_atual") or data.get("current_password")
            if not senha_atual:
                return Response(
                    {"error": "Para alterar a senha é obrigatório informar a senha atual.", "field": "senha_atual"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not user.check_password(senha_atual):
                return Response(
                    {"error": "Senha atual incorreta.", "field": "senha_atual"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(nova_senha) < 6:
                return Response(
                    {"error": "A nova senha deve ter no mínimo 6 caracteres.", "field": "nova_senha"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(nova_senha)
            user.save()
            LogSistema.objects.create(
                usuario=user,
                acao="Alterar senha",
                tabela="Usuario",
                detalhes=f"Usuário {user.username} alterou a própria senha.",
            )
        if nome_exibicao is not None:
            LogSistema.objects.create(
                usuario=user,
                acao="Editar perfil",
                tabela="Usuario",
                detalhes=f"Usuário {user.username} alterou nome de exibição para: {nome_exibicao}",
            )
        user.refresh_from_db()
        try:
            payload = _user_payload(user)
            return Response(payload or {"id": user.id, "username": user.username})
        except Exception:
            return Response(_user_payload(user))


def _is_chefe(request):
    if not request.user.is_authenticated:
        return False
    # Django staff/superuser sempre podem actuar como chefe (ex.: usuário criado antes do PerfilUsuario)
    if getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False):
        return True
    try:
        return request.user.perfil_financeiro.is_chefe
    except PerfilUsuario.DoesNotExist:
        return False


@method_decorator(csrf_exempt, name="dispatch")
class UsuarioListCreate(APIView):
    """Lista usuários com perfil (chefe) ou cria novo usuário (chefe)."""
    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado. Envie o header Authorization: Token <seu_token>.", "detail": "not_authenticated"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not _is_chefe(request):
            return Response(
                {
                    "error": "Apenas o Chefe (role 1) pode listar usuários.",
                    "detail": "not_chefe",
                    "hint": "Execute: python manage.py criar_mestao --username mestao --password mestao123 e faça login com esse utilizador.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        users = User.objects.filter(is_active=True).order_by("username")
        out = []
        for u in users:
            try:
                p = u.perfil_financeiro
                out.append({
                    "id": u.id,
                    "username": u.username,
                    "nome": p.nome_exibicao or u.get_full_name() or u.username,
                    "role": p.role,
                    "is_chefe": p.is_chefe,
                })
            except PerfilUsuario.DoesNotExist:
                out.append({
                    "id": u.id,
                    "username": u.username,
                    "nome": u.get_full_name() or u.username,
                    "role": PerfilUsuario.ROLE_FUNCIONARIO,
                    "is_chefe": False,
                })
        return Response(out)

    def post(self, request):
        # #region agent log
        def _log(msg: str, data: dict):
            try:
                # Escrever no workspace (pasta pai do app financeiro) para o log ser encontrado
                path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "debug-ca8ad1.log"))
                with open(path, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"sessionId": "ca8ad1", "location": "views_auth.UsuarioListCreate.post", "message": msg, "data": data, "timestamp": int(time.time() * 1000)}, ensure_ascii=False) + "\n")
            except Exception:
                pass
        # #endregion agent log
        _log("create_user_post_entry", {"method": request.method, "has_data": bool(getattr(request, "data", None))})
        if not _is_chefe(request):
            # #region agent log
            _log("create_user_403", {
                "is_authenticated": request.user.is_authenticated,
                "user_id": getattr(request.user, "id", None),
                "is_staff": getattr(request.user, "is_staff", False),
            })
            # #endregion agent log
            if not request.user.is_authenticated:
                return Response(
                    {"error": "Não autenticado. Envie o header Authorization: Token <seu_token>.", "detail": "not_authenticated"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {
                    "error": "Apenas o Chefe pode criar usuários. O seu utilizador não tem perfil Chefe.",
                    "detail": "not_chefe",
                    "hint": "Execute no terminal (pasta do projeto): python manage.py criar_mestao --username mestao --password mestao123 Depois faça logout e login com o utilizador 'mestao'.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        nome_exibicao = (request.data.get("nome_exibicao") or "").strip()
        role = request.data.get("role") or PerfilUsuario.ROLE_FUNCIONARIO
        if role not in (PerfilUsuario.ROLE_CHEFE, PerfilUsuario.ROLE_FUNCIONARIO):
            role = PerfilUsuario.ROLE_FUNCIONARIO
        if not username:
            _log("create_user_400", {"reason": "username_empty"})
            return Response(
                {"error": "Nome de usuário (login) é obrigatório.", "username": ["Obrigatório"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(password) < 6:
            _log("create_user_400", {"reason": "password_short", "len": len(password)})
            return Response(
                {"error": "A senha deve ter no mínimo 6 caracteres.", "password": ["Mínimo 6 caracteres"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if User.objects.filter(username=username).exists():
            _log("create_user_400", {"reason": "username_exists", "username": username})
            return Response(
                {"error": f"Já existe um usuário com o login \"{username}\". Escolha outro nome de usuário.", "username": ["Já existe"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.create_user(username=username, password=password)
            PerfilUsuario.objects.create(
                user=user,
                role=role,
                nome_exibicao=nome_exibicao or username,
            )
            LogSistema.objects.create(
                usuario=request.user,
                acao="Criar",
                tabela="Usuario",
                detalhes=f"Usuário criado: {username} ({role})",
            )
            user.refresh_from_db()  # garante relação perfil_financeiro carregada antes de _user_payload
            # #region agent log
            _log("create_user_201", {"user_id": user.id, "username": username})
            # #endregion agent log
            return Response(_user_payload(user), status=status.HTTP_201_CREATED)
        except Exception as e:
            # #region agent log
            _log("create_user_exception", {"type": type(e).__name__, "str": str(e)})
            # #endregion agent log
            return Response(
                {"error": f"Erro ao criar usuário no servidor: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@method_decorator(csrf_exempt, name="dispatch")
class UsuarioDetail(APIView):
    """GET/PUT/DELETE um usuário (apenas chefe). PUT: role, nome_exibicao, password (opcional)."""
    def get_object(self, pk):
        return User.objects.get(pk=pk)

    def get(self, request, pk):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado.", "detail": "not_authenticated", "hint": "Faça login como Chefe."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not _is_chefe(request):
            return Response(
                {"error": "Apenas o Chefe pode ver este utilizador.", "detail": "not_chefe", "hint": "Execute: python manage.py criar_mestao --username mestao --password mestao123 e faça login de novo."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            user = self.get_object(pk)
        except User.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(_user_payload(user))

    def put(self, request, pk):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado.", "detail": "not_authenticated", "hint": "Faça login como Chefe."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not _is_chefe(request):
            return Response(
                {"error": "Apenas o Chefe pode editar usuários.", "detail": "not_chefe", "hint": "Execute: python manage.py criar_mestao --username mestao --password mestao123 e faça login de novo."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            user = self.get_object(pk)
        except User.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        perfil, _ = PerfilUsuario.objects.get_or_create(
            user=user,
            defaults={"role": PerfilUsuario.ROLE_FUNCIONARIO, "nome_exibicao": user.username},
        )
        if request.data.get("nome_exibicao") is not None:
            perfil.nome_exibicao = (request.data.get("nome_exibicao") or "").strip() or user.username
        if request.data.get("role") in (PerfilUsuario.ROLE_CHEFE, PerfilUsuario.ROLE_FUNCIONARIO):
            perfil.role = request.data["role"]
        perfil.save()
        password = request.data.get("password")
        if password and len(password) >= 6:
            user.set_password(password)
            user.save()
        LogSistema.objects.create(
            usuario=request.user,
            acao="Editar",
            tabela="Usuario",
            detalhes=f"Usuário editado: {user.username}",
        )
        return Response(_user_payload(user))

    def delete(self, request, pk):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Não autenticado.", "detail": "not_authenticated", "hint": "Faça login como Chefe."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not _is_chefe(request):
            return Response(
                {"error": "Apenas o Chefe pode desativar usuários.", "detail": "not_chefe", "hint": "Execute: python manage.py criar_mestao --username mestao --password mestao123 e faça login de novo."},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            user = self.get_object(pk)
        except User.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if user == request.user:
            return Response(
                {"error": "Não pode excluir a si mesmo"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        username = user.username
        user.is_active = False
        user.save()
        LogSistema.objects.create(
            usuario=request.user,
            acao="Excluir",
            tabela="Usuario",
            detalhes=f"Usuário desativado: {username}",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
