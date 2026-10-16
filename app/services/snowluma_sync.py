"""SnowLuma 运维同步：初始化 WebUI + 自动对齐 OneBot wsClient。

两个职责：
1. 初始化：首次启动时用容器日志里的初始密码登录，同意协议并把密码改成随机强密码
   落库（app_meta），实现"一次初始化、之后自动登录"。
2. 连接同步：QQ 登录后，把控制台配置的 OneBot 反向 WS（wsClient）写入 SnowLuma 的
   `data/config/onebot.json`（存在账号级文件时一并处理），并重启 snowluma 进程使其生效
   （只重启进程、不重启容器，避免 QQ 重新登录）。

写文件与进程重启都通过 Docker socket 在容器内执行，因此需要 CONTROL_ENABLED=true。
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import secrets
import time

from app.control import DockerControl
from app.snowluma import SnowLumaClient, SnowLumaNotInitialized
from app.settings import Settings

SYNC_INTERVAL_SECONDS = 30
BOOTSTRAP_LINE = re.compile(r"initial credentials:\s*user=\S+\s+password=(\S+)")
DEFAULT_HTTP_PORT = 3000
DEFAULT_WS_PORT = 3001
WS_CLIENT_NAME = "nonebot"

logger = logging.getLogger("snowluma_sync")


def _new_password() -> str:
    """生成满足 SnowLuma 强度策略的随机强密码（含大小写、数字、符号）。"""
    return f"Sl{secrets.token_urlsafe(16)}#7Aa"


async def read_bootstrap_token(settings: Settings) -> str:
    """从 snowluma 容器日志里取一次性初始密码（仅在全新数据卷首次启动时出现）。"""
    if not settings.control_enabled:
        return ""
    try:
        logs = await DockerControl(settings).logs("snowluma", tail=400)
    except Exception as exc:  # noqa: BLE001
        logger.warning("read snowluma bootstrap log failed: %s", exc)
        return ""
    match = BOOTSTRAP_LINE.search(logs)
    return match.group(1) if match else ""


async def ensure_initialized(settings: Settings, client: SnowLumaClient) -> bool:
    """确保 WebUI 已初始化（有可用密码）。返回是否处于已初始化状态。

    已有密码时直接返回；否则在允许容器控制时，从容器日志抓一次性初始密码，
    完成登录 → 同意协议 → 改密 → 落库。
    """
    if client.stored_password():
        return True
    initial = await read_bootstrap_token(settings)
    if not initial:
        return False
    try:
        payload = await client.login(initial)
        if payload.get("mustChangePassword"):
            agreements = await client.agreements()
            version = str(agreements.get("version") or "")
            if version and agreements.get("consentRequired"):
                await client.record_consent(version)
            new_password = _new_password()
            await client.change_password(initial, new_password)
            client.store_password(new_password)
            await client.login(new_password)
        else:
            client.store_password(initial)
        logger.info("snowluma webui initialized (password stored)")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("snowluma init failed: %s", exc)
        return False


def _default_networks() -> dict:
    """SnowLuma 归一化后的默认网络配置骨架（保留监听端，只补齐反向 WS 客户端）。"""
    return {
        "httpServers": [{
            "name": "http-default", "enabled": True, "host": "0.0.0.0",
            "port": DEFAULT_HTTP_PORT, "path": "/", "accessToken": "",
            "messageFormat": "array", "reportSelfMessage": False,
        }],
        "httpClients": [],
        "wsServers": [{
            "name": "ws-default", "enabled": True, "host": "0.0.0.0",
            "port": DEFAULT_WS_PORT, "path": "/", "role": "Universal",
            "accessToken": "", "messageFormat": "array", "reportSelfMessage": False,
        }],
        "wsClients": [],
    }


def _merge_ws_client(config: dict, settings: Settings) -> tuple[dict, bool]:
    """把控制台的 OneBot 反向 WS 对齐进配置，返回 (新配置, 是否有改动)。"""
    networks = config.setdefault("networks", {})
    for key, value in _default_networks().items():
        networks.setdefault(key, value)
    clients = networks.setdefault("wsClients", [])
    item = next((c for c in clients if c.get("name") == WS_CLIENT_NAME), None)
    changed = False
    if item is None:
        item = {
            "name": WS_CLIENT_NAME, "role": "Universal",
            "messageFormat": "array", "reportSelfMessage": False,
            "reconnectIntervalMs": 5000,
        }
        clients.append(item)
        changed = True
    if (item.get("url") != settings.onebot_ws_url
            or not item.get("enabled")
            or item.get("accessToken", "") != settings.onebot_access_token):
        item["enabled"] = True
        item["url"] = settings.onebot_ws_url
        item["accessToken"] = settings.onebot_access_token
        changed = True
    return config, changed


async def _read_remote_file(control: DockerControl, path: str) -> dict | None:
    out = await control.exec_run("snowluma", ["sh", "-c", f"cat {path} 2>/dev/null || true"])
    text = out.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("snowluma config %s is not valid JSON; will be replaced", path)
        return None


async def _write_remote_file(control: DockerControl, path: str, payload: dict) -> None:
    raw = json.dumps(payload, ensure_ascii=False, indent=2)
    encoded = base64.b64encode(raw.encode("utf-8")).decode("ascii")
    await control.exec_run("snowluma", [
        "sh", "-c",
        f"echo {encoded} | base64 -d > {path} && chown 1000:1000 {path} && chmod 664 {path}",
    ])


async def _restart_snowluma_process(control: DockerControl) -> str:
    return await control.exec_run("snowluma", ["supervisorctl", "restart", "snowluma"])


async def _apply_once(settings: Settings, client: SnowLumaClient, uin: str) -> None:
    control = DockerControl(settings)
    targets = ["/app/data/config/onebot.json"]
    per_account = f"/app/data/config/onebot_{uin}.json"
    probe = await control.exec_run("snowluma", ["sh", "-c", f"test -f {per_account} && echo yes || echo no"])
    if "yes" in probe:
        targets.append(per_account)

    touched = False
    for path in targets:
        current = await _read_remote_file(control, path)
        config, changed = _merge_ws_client(current or {}, settings)
        if current is None or changed:
            await _write_remote_file(control, path, config)
            touched = True
    if touched:
        out = await _restart_snowluma_process(control)
        logger.info("snowluma onebot config applied; restart: %s", out.strip().splitlines()[-1:] or "")


async def run_snowluma_sync(settings: Settings) -> None:
    client = SnowLumaClient(settings)
    logger.info("snowluma sync loop started (ws url=%s)", settings.onebot_ws_url)
    while True:
        try:
            # 不自动初始化：WebUI 密码由用户在控制台「初始化」向导里自行设置
            # （填入容器日志的一次性初始密码 + 设自己的新密码）。未初始化时这里静默跳过。
            if client.stored_password():
                account = await client.logged_in_account()
                uin = str(account.get("uin") or "")
                if uin and settings.control_enabled:
                    await _apply_once(settings, client, uin)
        except SnowLumaNotInitialized:
            pass
        except Exception as exc:  # noqa: BLE001 - 循环必须存活
            logger.warning("snowluma sync failed: %s", exc)
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)


__all__ = ["run_snowluma_sync", "ensure_initialized", "read_bootstrap_token", "SnowLumaNotInitialized"]
