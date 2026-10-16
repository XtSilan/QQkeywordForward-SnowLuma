from urllib.parse import urlencode

import httpx

from app.settings import Settings


class DockerControl:
    """通过 Docker socket 控制容器：重启、读日志、容器内执行命令。"""

    allowed = {
        "snowluma": "snowluma_container_name",
        "nonebot": "nonebot_container_name",
        "webui": "webui_container_name",
    }

    def __init__(self, settings: Settings):
        self.settings = settings

    def _container(self, service: str) -> str:
        field = self.allowed.get(service)
        if not field:
            raise ValueError("service is not allowed")
        return getattr(self.settings, field)

    def _client(self) -> httpx.AsyncClient:
        if not self.settings.control_enabled:
            raise RuntimeError("service control is disabled")
        transport = httpx.AsyncHTTPTransport(uds=self.settings.docker_socket)
        return httpx.AsyncClient(transport=transport, timeout=60)

    async def restart(self, service: str) -> dict:
        container = self._container(service)
        query = urlencode({"t": "20"})
        async with self._client() as client:
            response = await client.post(
                f"http://docker/v1.45/containers/{container}/restart?{query}"
            )
        if response.status_code not in (204, 304):
            raise RuntimeError(f"docker restart failed: {response.status_code}")
        return {"service": service, "container": container, "restarted": True}

    async def logs(self, service: str, tail: int = 200) -> str:
        container = self._container(service)
        tail = max(1, min(tail, 2000))
        query = urlencode({"stdout": "1", "stderr": "1", "tail": str(tail)})
        async with self._client() as client:
            response = await client.get(
                f"http://docker/v1.45/containers/{container}/logs?{query}"
            )
        if response.status_code != 200:
            raise RuntimeError(f"docker logs failed: {response.status_code}")
        return self._decode_log_stream(response.content)

    async def exec_run(self, service: str, cmd: list[str]) -> str:
        """在容器内执行命令并返回合并后的输出。

        用于两件 SnowLuma 运维动作：写入 OneBot 配置、重启 snowluma 进程
        （`supervisorctl restart snowluma`，只重启进程不重启容器，避免 QQ 重新登录）。
        """
        container = self._container(service)
        async with self._client() as client:
            created = await client.post(
                f"http://docker/v1.45/containers/{container}/exec",
                json={"AttachStdout": True, "AttachStderr": True, "Tty": False, "Cmd": cmd},
            )
            if created.status_code >= 400:
                raise RuntimeError(f"docker exec create failed: {created.status_code}")
            exec_id = str(created.json().get("Id") or "")
            started = await client.post(
                f"http://docker/v1.45/exec/{exec_id}/start", json={"Detach": False, "Tty": False}
            )
            if started.status_code >= 400:
                raise RuntimeError(f"docker exec start failed: {started.status_code}")
            return self._decode_log_stream(started.content)

    @staticmethod
    def _decode_log_stream(payload: bytes) -> str:
        """Decode Docker's multiplexed stdout/stderr stream into readable text."""
        chunks: list[bytes] = []
        offset = 0
        while offset + 8 <= len(payload):
            size = int.from_bytes(payload[offset + 4:offset + 8], "big")
            start = offset + 8
            end = start + size
            if end > len(payload):
                break
            chunks.append(payload[start:end])
            offset = end
        if chunks and offset == len(payload):
            return b"".join(chunks).decode("utf-8", errors="replace")
        return payload.decode("utf-8", errors="replace")
