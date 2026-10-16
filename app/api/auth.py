"""Authentication routes: login / logout / session probe.

控制台登录用 SnowLuma WebUI 的管理员密码（也兼容 ADMIN_TOKEN，便于脚本与 CI）。
这样"初始化 SnowLuma 时设置的密码"就是控制台密码，单一凭据、无需另记一套。
"""
from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response

from app.api.deps import session_token, valid_session
from app.schemas.auth import AdminLoginPayload
from app.services.snowluma_sync import read_bootstrap_token
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


@router.get("/state")
async def auth_state(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """登录页专用（无需登录）：SnowLuma 是否已初始化、以及未初始化时的一次性初始令牌。

    未初始化时把容器日志里的一次性初始密码直接给到登录页，用户不必再进容器翻日志。
    仅在未初始化阶段返回，初始化后不再暴露。
    """
    client = SnowLumaClient(settings)
    initialized = bool(client.stored_password())
    bootstrap = "" if initialized else await read_bootstrap_token(settings)
    return {
        "dev_mode": settings.app_env == "dev",
        "initialized": initialized,
        "bootstrap_token": bootstrap,
    }


@router.post("/capture")
async def auth_capture(
    response: Response,
    payload: dict[str, Any] = Body(default_factory=dict),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """内嵌的 SnowLuma 页面登录/改密成功后上报访问令牌。

    控制台与 SnowLuma 共用同一个令牌：这里校验并保存它（后端后续调 SnowLuma API 也用它），
    同时签发控制台会话 —— 内嵌页面上一完成登录，外层页面轮询到会话就能进入控制台。
    """
    password = str(payload.get("password") or "").strip()
    if not password:
        raise HTTPException(status_code=400, detail="缺少令牌")
    if not await verify_snowluma_password(settings, password):
        raise HTTPException(status_code=400, detail="令牌校验失败")
    _set_session(response, settings)
    return {"ok": True}


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
