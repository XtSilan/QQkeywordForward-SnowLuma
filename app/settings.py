from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8080
    database_path: str = "/app/data/nonebot/bot.sqlite3"
    log_dir: str = "/app/data/logs/nonebot"

    # --- SnowLuma（OneBot 实现，替代 NapCat） ---
    snowluma_webui_url: str = "http://snowluma:5099"
    # WebUI 管理员密码。留空表示尚未初始化：控制台会引导用容器日志里的初始密码完成
    # 初始化，并把新密码落到 app_meta（见 app/services/snowluma_sync.py）。
    snowluma_webui_password: str = ""
    snowluma_container_name: str = "qq-bot-snowluma"
    # 远程桌面密码，控制台据此自动填密；与容器 env VNC_PASSWD 保持一致。
    vnc_passwd: str = ""

    nonebot_container_name: str = "qq-bot-nonebot"
    webui_container_name: str = "qq-bot-webui"
    docker_socket: str = "/var/run/docker.sock"
    control_enabled: bool = False

    # --- 更新服务（deploy/updater） ---
    updater_base_url: str = "http://updater:18081"
    updater_token: str = ""

    admin_token: str = "change-me"
    environment: str = "prod"
    driver: str = "~fastapi"
    onebot_access_token: str = ""
    onebot_ws_url: str = "ws://nonebot:8081/onebot/v11/ws"
    onebot_http_url: str = "http://snowluma:3000"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    smtp_ssl: bool = False
    smtp_timeout: int = 15
    auth_session_secret: str = "change-me-session-secret"
    auth_session_ttl: int = 86400
    upload_dir: str = "/app/data/nonebot/uploads"
    public_base_url: str = "http://localhost:8080"
    max_upload_size_mb: int = 10
    # Baked into the image at build time (compose build arg, maintained by the
    # updater helper). Shown in the WebUI sidebar so the running build is
    # identifiable after every deploy.
    app_version: str = "dev"
    app_build_time: str = ""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.prod"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
