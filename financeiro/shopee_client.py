"""
Cliente mínimo da Shopee Open Platform (OAuth + assinatura HMAC-SHA256).

Docs: https://open.shopee.com/developer-guide/20
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HOST_PRODUCAO = "https://partner.shopeemobile.com"
HOST_SANDBOX = "https://openplatform.sandbox.test-stable.shopee.sg"

PATH_AUTH_PARTNER = "/api/v2/shop/auth_partner"
PATH_TOKEN_GET = "/api/v2/auth/token/get"
PATH_TOKEN_REFRESH = "/api/v2/auth/access_token/get"


class ShopeeApiError(Exception):
    def __init__(self, message: str, *, payload: dict | None = None):
        super().__init__(message)
        self.payload = payload or {}


def host_for_ambiente(ambiente: str) -> str:
    """Produção é o padrão (loja real). Sandbox só se marcado explicitamente."""
    amb = (ambiente or "").strip().lower()
    if amb in ("sandbox", "test", "teste", "uat"):
        return HOST_SANDBOX
    return HOST_PRODUCAO


def sign_public(partner_id: int | str, path: str, timestamp: int, partner_key: str) -> str:
    """Sign para Public APIs: partner_id + path + timestamp."""
    base = f"{partner_id}{path}{timestamp}".encode("utf-8")
    key = partner_key.encode("utf-8")
    return hmac.new(key, base, hashlib.sha256).hexdigest()


def build_auth_partner_url(
    *,
    partner_id: str,
    partner_key: str,
    redirect_url: str,
    ambiente: str = "producao",
) -> str:
    """Gera URL OAuth para o vendedor autorizar o app."""
    pid = int(str(partner_id).strip())
    ts = int(time.time())
    host = host_for_ambiente(ambiente)
    sign = sign_public(pid, PATH_AUTH_PARTNER, ts, partner_key)
    qs = urllib.parse.urlencode(
        {
            "partner_id": pid,
            "timestamp": ts,
            "sign": sign,
            "redirect": redirect_url,
        }
    )
    return f"{host}{PATH_AUTH_PARTNER}?{qs}"


def _post_json(url: str, body: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        raise ShopeeApiError(
            payload.get("message") or payload.get("error") or f"HTTP {e.code}",
            payload=payload if isinstance(payload, dict) else {},
        ) from e
    except urllib.error.URLError as e:
        raise ShopeeApiError(f"Falha de rede ao contactar Shopee: {e.reason}") from e

    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError as e:
        raise ShopeeApiError("Resposta inválida da Shopee.", payload={"raw": raw}) from e

    if not isinstance(payload, dict):
        raise ShopeeApiError("Resposta inválida da Shopee.", payload={"raw": payload})

    err = (payload.get("error") or "").strip()
    if err:
        raise ShopeeApiError(payload.get("message") or err, payload=payload)
    return payload


def exchange_code_for_token(
    *,
    partner_id: str,
    partner_key: str,
    code: str,
    shop_id: str | None = None,
    main_account_id: str | None = None,
    ambiente: str = "producao",
) -> dict[str, Any]:
    """Troca o code do callback por access_token / refresh_token."""
    pid = int(str(partner_id).strip())
    ts = int(time.time())
    host = host_for_ambiente(ambiente)
    sign = sign_public(pid, PATH_TOKEN_GET, ts, partner_key)
    qs = urllib.parse.urlencode({"partner_id": pid, "timestamp": ts, "sign": sign})
    url = f"{host}{PATH_TOKEN_GET}?{qs}"

    body: dict[str, Any] = {"code": code, "partner_id": pid}
    if shop_id:
        body["shop_id"] = int(str(shop_id).strip())
    if main_account_id:
        body["main_account_id"] = int(str(main_account_id).strip())

    return _post_json(url, body)


def refresh_access_token(
    *,
    partner_id: str,
    partner_key: str,
    refresh_token: str,
    shop_id: str | None = None,
    merchant_id: str | None = None,
    ambiente: str = "producao",
) -> dict[str, Any]:
    """Renova access_token com refresh_token."""
    pid = int(str(partner_id).strip())
    ts = int(time.time())
    host = host_for_ambiente(ambiente)
    sign = sign_public(pid, PATH_TOKEN_REFRESH, ts, partner_key)
    qs = urllib.parse.urlencode({"partner_id": pid, "timestamp": ts, "sign": sign})
    url = f"{host}{PATH_TOKEN_REFRESH}?{qs}"

    body: dict[str, Any] = {
        "refresh_token": refresh_token,
        "partner_id": pid,
    }
    if shop_id:
        body["shop_id"] = int(str(shop_id).strip())
    if merchant_id:
        body["merchant_id"] = int(str(merchant_id).strip())

    return _post_json(url, body)
