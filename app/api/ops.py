"""Operations routes: container service restart and log reading."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from app.api.deps import admin_guard
from app.control import DockerControl
from app.settings import Settings, get_settings


router = APIRouter(prefix="/api/ops", tags=["ops"], dependencies=[Depends(admin_guard)])


@router.post("/services/{service}/restart")
async def service_restart(
    service: str,
    settings: Settings = Depends(get_settings),
) -> Any:
    try:
        return await DockerControl(settings).restart(service)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/logs/{service}")
async def service_logs(
    service: str,
    tail: int = Query(default=200, ge=1, le=2000),
    settings: Settings = Depends(get_settings),
) -> PlainTextResponse:
    try:
        return PlainTextResponse(await DockerControl(settings).logs(service, tail))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
