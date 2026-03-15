"""
Middleware para isentar rotas /api/ da verificação CSRF (frontend SPA usa sessão/cookie).
"""
import logging
from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware

logger = logging.getLogger(__name__)


class LogApiCookieMiddleware:
    """Em DEBUG, regista se o pedido a /api/ trouxe o header Cookie (para diagnosticar sessão)."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            if getattr(settings, "DEBUG", False) and (request.path or "").startswith("/api/"):
                raw = request.META.get("HTTP_COOKIE") or ""
                has_session = "sessionid=" in raw
                msg = f"[api cookie] path={request.path} cookie_present={bool(raw)} has_sessionid={has_session}"
                logger.warning(msg)
                print(msg)  # visível no terminal do runserver
        except Exception:
            pass
        return self.get_response(request)


class StripSessionCookieOnAuthFailure:
    """
    Em 401/403 em /api/auth/me/, remove Set-Cookie da resposta.
    Evita que uma sessão vazia sobrescreva no browser a sessão válida do login.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        path = (request.path or "").strip()
        if path.startswith("/api/auth/me/") and response.status_code in (401, 403):
            for key in ("Set-Cookie", "set-cookie"):
                if key in response:
                    del response[key]
        return response


class DisableCSRFForAPI(CsrfViewMiddleware):
    """Ignora a verificação CSRF para todos os pedidos a /api/ e a login/logout."""

    def process_view(self, request, callback, callback_args, callback_kwargs):
        path = request.path or ""
        if path.startswith("/api/") or "auth/login" in path or "auth/logout" in path:
            return None
        return super().process_view(request, callback, callback_args, callback_kwargs)
