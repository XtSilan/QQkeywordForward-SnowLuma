"""Authentication routes: login / logout / session probe.

控制台登录用 SnowLuma WebUI 的管理员密码（也兼容 ADMIN_TOKEN，便于脚本与 CI）。
这样"初始化 SnowLuma 时设置的密码"就是控制台密码，单一凭据、无需另记一套。
"""
from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.deps import session_token, valid_session
from app.schemas.auth import AdminLoginPayload
from app.settings import Settings, get_settings
from app.snowluma import SnowLumaClient


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session(response: Response, settings: Settings) -> None:
    response.set_cookie(
        "qq_bot_session", session_token(settings), max_age=settings.auth_session_ttl,
        httponly=True, secure=settings.auth_cookie_secure, samesite="lax", path="/",
    )


async def verify_snowluma_password(settings: Settings, password: str) -> bool:
    """校验密码是否是当前 SnowLuma WebUI 的密码；是则记下以便后端自动登录后续调用。"""
    if not password.strip():
        return False
    client = SnowLumaClient(settings)
    try:
        await client.login(password)
    except Exception:  # noqa: BLE001 - 任何失败都视为密码不对
        return False
    client.store_password(password)
    return True


@router.post("/login")
async def auth_login(
    payload: AdminLoginPayload,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if hmac.compare_digest(payload.token, settings.admin_token):
        _set_session(response, settings)
        return {"authenticated": True}
    if await verify_snowluma_password(settings, payload.token):
        _set_session(response, settings)
        return {"authenticated": True}
    raise HTTPException(status_code=401, detail="密码不正确")


@router.post("/logout")
def auth_logout(response: Response) -> dict[str, Any]:
    response.delete_cookie("qq_bot_session", path="/")
    return {"authenticated": False}


@router.get("/me")
def auth_me(request: Request, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    authenticated = settings.app_env == "dev" or valid_session(request.cookies.get("qq_bot_session", ""), settings)
    if not authenticated:
        raise HTTPException(status_code=401, detail="unauthorized")
    return {"authenticated": True}
