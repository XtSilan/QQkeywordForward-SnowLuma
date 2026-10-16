"""更新服务代理：控制台通过它读取更新状态、触发部署。

浏览器不直接持有 UPDATER_TOKEN —— 由后端代持并向 updater 发请求，
前端只面对已登录会话，避免把更新服务的令牌暴露出去。
"""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import admin_guard
from app.settings import Settings, get_settings


router = APIRouter(prefix="/api/updater", tags=["updater"], dependencies=[Depends(admin_guard)])


def _headers(settings: Settings) -> dict[str, str]:
    if settings.updater_token:
        return {"Authorization": f"Bearer {settings.updater_token}"}
    return {}


async def _call(settings: Settings, method: str, path: str) -> dict[str, Any]:
    url = settings.updater_base_url.rstrip("/") + path
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.request(method, url, headers=_headers(settings))
    except Exception as exc:  # noqa: BLE001 - 更新服务不可达时降级为可读错误
        raise HTTPException(status_code=503, detail=f"更新服务不可达: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text[:300])
    return response.json()


@router.get("/status")
async def updater_status(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """当前版本、远端版本与是否有可用更新（控制台左上角提示读这个）。"""
    return await _call(settings, "GET", "/api/status")


@router.post("/check")
async def updater_check(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """只检测：刷新远端，不部署。"""
    return await _call(settings, "POST", "/api/check")


@router.post("/deploy")
async def updater_deploy(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """点击部署：有新版本则拉取并重建。"""
    return await _call(settings, "POST", "/api/deploy")
