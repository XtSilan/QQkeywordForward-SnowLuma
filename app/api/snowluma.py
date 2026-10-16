"""SnowLuma 运维路由：初始化、状态、账号信息、VNC 入口、连接同步。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import admin_guard, snowluma
from app.control import DockerControl
from app.services.snowluma_sync import ensure_initialized
from app.snowluma import SnowLumaClient, SnowLumaNotInitialized
from app.settings import Settings, get_settings


router = APIRouter(prefix="/api/snowluma", tags=["snowluma"], dependencies=[Depends(admin_guard)])


@router.get("/status")
async def snowluma_status(
    client: SnowLumaClient = Depends(snowluma),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """WebUI 初始化状态 + QQ 登录/注入状态 + 当前账号。"""
    initialized = bool(client.stored_password())
    account: dict[str, str] = {}
    processes: list[dict[str, Any]] = []
    error = ""
    if initialized:
        try:
            state = await client.processes()
            processes = state.get("list") or [] if isinstance(state, dict) else []
            account = await client.logged_in_account()
        except Exception as exc:  # noqa: BLE001
            error = str(exc)
    return {
        "initialized": initialized,
        "logged_in": bool(account.get("uin")),
        "account": account,
        "processes": processes,
        "control_enabled": settings.control_enabled,
        "onebot_ws_url": settings.onebot_ws_url,
        "error": error,
    }


@router.post("/init")
async def snowluma_init(
    payload: dict[str, Any] = Body(default_factory=dict),
    client: SnowLumaClient = Depends(snowluma),
) -> dict[str, Any]:
    """手动初始化：用容器日志里的初始密码完成 登录 → 同意协议 → 改密 → 落库。

    不传 password 时自动从 snowluma 容器日志抓取一次性初始密码。
    """
    password = str(payload.get("password") or "").strip()
    if password:
        try:
            token_payload = await client.login(password)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if token_payload.get("mustChangePassword"):
            agreements = await client.agreements()
            version = str(agreements.get("version") or "")
            if version and agreements.get("consentRequired"):
                await client.record_consent(version)
            from app.services.snowluma_sync import _new_password  # 局部导入避免循环

            new_password = _new_password()
            await client.change_password(password, new_password)
            client.store_password(new_password)
            await client.login(new_password)
        else:
            client.store_password(password)
        return {"initialized": True, "source": "manual"}

    settings = get_settings()
    ok = await ensure_initialized(settings, SnowLumaClient(settings))
    if not ok:
        raise HTTPException(status_code=400, detail="无法自动初始化，请提供初始密码")
    return {"initialized": True, "source": "log"}


@router.get("/account")
async def snowluma_account(client: SnowLumaClient = Depends(snowluma)) -> dict[str, Any]:
    """当前登录的 QQ 账号（uin / 昵称 / 头像）。"""
    return await client.logged_in_account()


@router.get("/vnc")
async def snowluma_vnc(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """远程桌面入口参数：控制台据此内嵌 noVNC 并自动填密。

    noVNC 走网关 `/novnc/`，不需要单独暴露 VNC 端口。
    """
    return {
        "password": settings.vnc_passwd,
        "path": "/novnc/vnc.html",
        "websocket_path": "websockify",
    }


@router.get("/logs")
async def snowluma_logs(
    tail: int = 200,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if not settings.control_enabled:
        raise HTTPException(status_code=503, detail="service control is disabled")
    text = await DockerControl(settings).logs("snowluma", tail)
    return {"text": text}


@router.post("/connect")
async def snowluma_connect(
    client: SnowLumaClient = Depends(snowluma),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """立即把当前 OneBot 反向 WS 配置写入 SnowLuma 并重启进程使其生效。"""
    if not settings.control_enabled:
        raise HTTPException(status_code=503, detail="service control is disabled")
    try:
        account = await client.logged_in_account()
    except SnowLumaNotInitialized as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    uin = str(account.get("uin") or "")
    if not uin:
        raise HTTPException(status_code=409, detail="QQ 尚未登录")
    from app.services.snowluma_sync import _apply_once

    await _apply_once(settings, client, uin)
    return {"applied": True, "uin": uin, "onebot_ws_url": settings.onebot_ws_url}
