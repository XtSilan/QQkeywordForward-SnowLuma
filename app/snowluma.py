"""SnowLuma WebUI 客户端。

SnowLuma 的 WebUI 提供 OneBot 之外的运维入口（登录状态、进程注入、连接配置、日志）。
控制台通过它完成：初始化（同意协议 + 改密）、读取登录/注入状态、写入 OneBot wsClient、
读取账号信息。凭据由控制台代持，实现自动登录。

数据流：
- 密码：优先 `SNOWLUMA_WEBUI_PASSWORD`，其次 app_meta（初始化后写入），都没有则未初始化。
- token：登录后缓存在进程内，401 时重新登录一次。
"""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from app.db import connection
from app.repositories import meta_repo
from app.settings import Settings

# 初始化完成后写进 app_meta 的键
PASSWORD_META_KEY = "snowluma_webui_password"
TOKEN_TTL_SECONDS = 300


class SnowLumaNotInitialized(RuntimeError):
    """WebUI 尚未完成初始化（无可用密码）。"""


class SnowLumaClient:
    _shared_token = ""
    _shared_token_at = 0.0
    # OneBot HTTP 的 token 从容器配置文件读出后缓存到类上，避免每次状态轮询都 exec 进容器
    _onebot_token_cache: str | None = None

    def __init__(self, settings: Settings):
        self.settings = settings
        self._token = ""

    # ---------- 凭据 ----------
    @property
    def base_url(self) -> str:
        return self.settings.snowluma_webui_url.rstrip("/")

    def stored_password(self) -> str:
        if self.settings.snowluma_webui_password.strip():
            return self.settings.snowluma_webui_password.strip()
        with connection() as conn:
            return (meta_repo.get(conn, PASSWORD_META_KEY) or "").strip()

    def store_password(self, password: str) -> None:
        with connection() as conn:
            meta_repo.set(conn, PASSWORD_META_KEY, password)

    # ---------- 认证 ----------
    async def login(self, password: str) -> dict[str, Any]:
        """用密码换 token。返回 {success, token, mustChangePassword}。"""
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(self.base_url + "/api/login", json={"password": password})
        if response.status_code == 401:
            raise RuntimeError("SnowLuma WebUI 密码不正确")
        response.raise_for_status()
        payload = response.json()
        token = str(payload.get("token") or "")
        if token:
            self._token = token
            self.__class__._shared_token = token
            self.__class__._shared_token_at = time.monotonic()
        return payload

    async def authenticate(self) -> str:
        if self._token:
            return self._token
        if self.__class__._shared_token and time.monotonic() - self.__class__._shared_token_at < TOKEN_TTL_SECONDS:
            self._token = self.__class__._shared_token
            return self._token
        password = self.stored_password()
        if not password:
            raise SnowLumaNotInitialized("SnowLuma WebUI 尚未初始化")
        await self.login(password)
        return self._token

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        token = await self.authenticate()
        headers = {"Authorization": f"Bearer {token}", **kwargs.pop("headers", {})}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(method, self.base_url + path, headers=headers, **kwargs)
            if response.status_code == 401:
                # token 过期：用存好的密码重登一次再试
                password = self.stored_password()
                if not password:
                    raise SnowLumaNotInitialized("SnowLuma WebUI 尚未初始化")
                await self.login(password)
                headers["Authorization"] = f"Bearer {self._token}"
                response = await client.request(method, self.base_url + path, headers=headers, **kwargs)
        response.raise_for_status()
        return response.json()

    # ---------- 初始化流程 ----------
    async def agreements(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(self.base_url + "/api/agreements",
                                        headers={"Authorization": f"Bearer {await self.authenticate()}"})
        response.raise_for_status()
        return response.json()

    async def record_consent(self, version: str) -> Any:
        return await self.request("POST", "/api/agreements/record-consent", json={"version": version})

    async def change_password(self, old: str, new: str) -> Any:
        return await self.request("POST", "/api/auth/change-password",
                                  json={"oldPassword": old, "newPassword": new})

    # ---------- 运行状态 ----------
    async def status(self) -> dict[str, Any]:
        return await self.request("GET", "/api/status")

    async def processes(self) -> dict[str, Any]:
        return await self.request("GET", "/api/processes")

    async def connections(self, uin: str = "") -> dict[str, Any]:
        path = "/api/connections" + (f"?uin={uin}" if uin else "")
        return await self.request("GET", path)

    async def qq_list(self) -> dict[str, Any]:
        return await self.request("GET", "/api/qq-list")

    async def logs(self, tail: int = 200) -> dict[str, Any]:
        return await self.request("GET", "/api/logs", params={"tail": tail})

    async def onebot_config(self, uin: str) -> dict[str, Any]:
        return await self.request("GET", "/api/config/onebot", params={"uin": uin})

    async def save_onebot_config(self, uin: str, config: dict[str, Any]) -> Any:
        return await self.request("POST", "/api/config/onebot", json={"uin": uin, "config": config})

    # ---------- 登录账号 ----------
    def _login_process_uin(self, processes: Any) -> str:
        items = processes.get("list") if isinstance(processes, dict) else processes
        for item in items or []:
            if isinstance(item, dict) and item.get("loggedIn"):
                uin = str(item.get("uin") or "").strip()
                if uin and uin != "0":
                    return uin
        return ""

    async def logged_in_account(self) -> dict[str, str]:
        """返回当前已登录 QQ 的 {uin, nickname, avatar}；未登录返回空 dict。

        uin 以 SnowLuma 的进程状态为准（最可靠）；昵称/头像为尽力而为——OneBot HTTP
        要求它自己的 access token，取不到时只回 uin，绝不能让取昵称失败影响登录判定。
        """
        uin = ""
        try:
            uin = self._login_process_uin(await self.processes())
        except Exception:  # noqa: BLE001 - 进程状态查询失败时退回 OneBot
            uin = ""
        details: dict[str, Any] = {}
        try:
            details = await self._onebot_login_info(uin)
        except Exception:  # noqa: BLE001 - 拿不到昵称不影响判定登录
            details = {}
        if not uin:
            uin = str(details.get("user_id") or "").strip()
        if not uin:
            return {}
        nickname = str(details.get("nickname") or details.get("nick_name") or "")
        return {"uin": uin, "nickname": nickname, "avatar": _avatar_url(uin)}

    async def _onebot_token(self, uin: str = "") -> str:
        """OneBot HTTP 的 access token：优先环境变量，其次从 SnowLuma 配置文件读。

        SnowLuma 会给自己 httpServers 自动生成 token，读不出来就只能拿到 401。
        """
        configured = self.settings.onebot_access_token.strip()
        if configured:
            return configured
        cache = self.__class__._onebot_token_cache
        if cache is not None:
            return cache
        token = ""
        if self.settings.control_enabled:
            from app.control import DockerControl

            paths = ([f"/app/data/config/onebot_{uin}.json"] if uin else []) + [
                "/app/data/config/onebot.json"
            ]
            for path in paths:
                output = ""
                try:
                    output = await DockerControl(self.settings).exec_run(
                        "snowluma", ["sh", "-c", f"cat {path} 2>/dev/null || true"]
                    )
                except Exception:  # noqa: BLE001
                    continue
                try:
                    data = json.loads(output.strip() or "{}")
                except json.JSONDecodeError:
                    continue
                servers = (data.get("networks") or {}).get("httpServers") or []
                for server in servers:
                    if isinstance(server, dict) and server.get("accessToken"):
                        token = str(server["accessToken"]).strip()
                        break
                if token:
                    break
        self.__class__._onebot_token_cache = token
        return token

    async def _onebot_login_info(self, uin: str = "") -> dict[str, Any]:
        headers: dict[str, str] = {}
        token = await self._onebot_token(uin)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        url = self.settings.onebot_http_url.rstrip("/") + "/get_login_info"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json={}, headers=headers)
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        return data if isinstance(data, dict) else {}


def _avatar_url(uin: str) -> str:
    if not uin.isdigit():
        return ""
    return f"https://q1.qlogo.cn/g?b=qq&nk={uin}&s=100"
