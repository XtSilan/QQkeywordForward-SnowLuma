"""SnowLuma 运维路由：初始化、状态、账号信息、VNC 入口、连接同步。"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import admin_guard, snowluma
from app.control import DockerControl
from app.services.snowluma_sync import ensure_initialized, read_bootstrap_token
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
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """初始化 SnowLuma WebUI：登录 → 同意协议 → 改密 → 落库。

    不签发控制台会话 —— 初始化只是"设置你自己的密码"，完成后回到登录页用新密码登录。
    传 `password`（初始令牌）与可选 `new_password`；都不传时自动从容器日志抓初始令牌。
    """
    password = str(payload.get("password") or "").strip()
    new_password = str(payload.get("new_password") or "").strip()
    if not password:
        password = await read_bootstrap_token(settings)
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

            target = new_password or _new_password()
            await client.change_password(password, target)
            client.store_password(target)
            SnowLumaClient._shared_token = ""
            SnowLumaClient._onebot_token_cache = None
        else:
            client.store_password(password)
        return {"initialized": True, "source": "manual"}

    ok = await ensure_initialized(settings, SnowLumaClient(settings))
    if not ok:
        raise HTTPException(status_code=400, detail="无法自动初始化：请先在 snowluma 容器日志里拿到初始令牌")
    return {"initialized": True, "source": "log"}


@router.post("/password")
async def snowluma_reset_password(
    payload: dict[str, Any] = Body(default_factory=dict),
    client: SnowLumaClient = Depends(snowluma),
) -> dict[str, Any]:
    """重置 SnowLuma WebUI 令牌 —— 它同时也是控制台的登录密码。

    当前密码由后端代持，用户只需给出新密码。
    """
    new_password = str(payload.get("new_password") or "").strip()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="新密码至少 8 位")
    current = client.stored_password()
    if not current:
        raise HTTPException(status_code=409, detail="SnowLuma WebUI 尚未初始化")
    try:
        await client.login(current)
        await client.change_password(current, new_password)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    client.store_password(new_password)
    # 旧 token 已失效，清缓存后用新密码重新登录
    SnowLumaClient._shared_token = ""
    SnowLumaClient._onebot_token_cache = None
    try:
        await client.login(new_password)
    except Exception:  # noqa: BLE001 - 改密已成功，重新登录失败不影响结果
        pass
    return {"ok": True}


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


@router.get("/devtools")
async def snowluma_devtools(client: SnowLumaClient = Depends(snowluma)) -> dict[str, Any]:
    """SnowLuma WebUI 的自动登录地址：同域名 `/snowluma/`，自带一次性令牌。

    控制台「开发者工具」直接内嵌这个地址，不跳到别的域名。
    """
    from urllib.parse import quote

    password = client.stored_password()
    if not password:
        raise HTTPException(status_code=409, detail="SnowLuma WebUI 尚未初始化")
    return {"url": f"/snowluma/?token={quote(password, safe='')}"}


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
