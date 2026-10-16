"""Dashboard summary route."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import admin_guard, snowluma
from app.db import config_revision, connection
from app.snowluma import SnowLumaClient
from app.settings import Settings, get_settings


router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(admin_guard)])


def _count(table: str, where: str = "1=1") -> int:
    if table not in {"groups", "keyword_hits", "notification_jobs"}:
        raise ValueError("unsupported table")
    with connection() as conn:
        row = conn.execute(f"SELECT COUNT(*) AS count FROM {table} WHERE {where}").fetchone()
        return int(row["count"])


@router.get("/dashboard")
async def dashboard(
    client: SnowLumaClient = Depends(snowluma),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    status: dict[str, Any] = {"initialized": bool(client.stored_password()), "logged_in": False, "account": {}}
    if status["initialized"]:
        try:
            account = await client.logged_in_account()
            status["logged_in"] = bool(account.get("uin"))
            status["account"] = account
        except Exception as exc:  # noqa: BLE001 - dashboard 不应因状态查询失败而 500
            status["error"] = str(exc)
    return {
        "config_revision": config_revision(),
        "snowluma": status,
        "nonebot": {"service": "nonebot", "config_reload": True},
        "stats": {
            "groups": _count("groups"),
            "keyword_hits_today": _count(
                "keyword_hits", "hit_at >= datetime('now', 'start of day')"
            ),
            # Alert messages actually delivered today: one row per destination,
            # so a hit fanned out to two destinations counts twice. sent_at is
            # written by the dispatcher as CURRENT_TIMESTAMP (UTC).
            "alerts_sent_today": _count(
                "notification_jobs",
                "status='sent' AND sent_at >= datetime('now', 'start of day')",
            ),
        },
    }
