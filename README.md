# QQkeywordForward-SnowLuma

QQ 群关键词监听、提醒转发与群发机器人的一体化控制台。OneBot 实现由 **SnowLuma** 提供，控制台为 FastAPI + React。

> 本仓库是 [QQkeywordForward](https://github.com/XtSilan/QQkeywordForward) 的 SnowLuma 版本：OneBot 层由 NapCat 换成 SnowLuma，并把 SnowLuma 的 WebUI / 远程桌面 / 更新服务统一收进同一个域名的不同路径下。

## 架构

单一入口：所有流量先到 **nginx 网关**，宿主机只暴露一个端口，内部服务不发布到宿主机。

```
浏览器 ──► nginx:80（唯一对外端口）
             ├── /                    → webui:8080      控制台（FastAPI + React SPA）
             ├── /api/*               → webui:8080      控制台 API
             ├── /snowluma/           → snowluma:5099   SnowLuma WebUI（子路径托管）
             ├── /snowluma-api/*      → snowluma:5099   SnowLuma WebUI API
             ├── /novnc/              → snowluma:6081   noVNC 远程桌面（需先登录控制台）
             └── /updater/*           → updater:18081   CI/CD 更新服务

snowluma（OneBot v11） ──反向 WS──► nonebot:8081/onebot/v11/ws
```

| 服务 | 容器 | 作用 |
| --- | --- | --- |
| nginx | `qq-bot-nginx` | 网关，唯一对外端口 `${WEBUI_HOST_PORT}` |
| snowluma | `qq-bot-snowluma` | SnowLuma（注入 QQ 进程，产出 OneBot v11） |
| nonebot | `qq-bot-nonebot` | 事件处理、关键词匹配、通知与群发 |
| webui | `qq-bot-webui` | 控制台（FastAPI + React） |
| updater | `qq-bot-updater` | 检测新版本并（经确认后）部署 |

## 运行要求

- Docker Engine 24+ 与 Docker Compose v2+
- 一个用于登录的 QQ 账号
- SMTP 账号（仅在使用邮件通知时需要）
- **SnowLuma 依赖 `ptrace` 注入 QQ 进程**：宿主机/外层环境必须允许 `SYS_PTRACE` 与 `seccomp=unconfined`（受限 LXC 租用机通常不可用）

## 快速开始

```bash
git clone https://github.com/XtSilan/QQkeywordForward-SnowLuma.git
cd QQkeywordForward-SnowLuma
cp .env.example .env.prod
mkdir -p data/snowluma/data data/snowluma/config data/snowluma/share \
         data/nonebot data/logs/nonebot data/updater
```

编辑 `.env.prod`，至少替换 `ADMIN_TOKEN`、`AUTH_SESSION_SECRET`，并按需设置 `VNC_PASSWD`：

```bash
chmod 600 .env.prod
cp .env.prod .env          # compose 靠 .env 做变量插值
docker compose config
docker compose up -d --build
```

控制台：<http://localhost:18080>（端口以 `.env.prod` 的 `WEBUI_HOST_PORT` 为准）

> [!NOTE]
> 国内拉取 Docker Hub 不稳定时，把 `SNOWLUMA_IMAGE` 指向加速源，例如
> `SNOWLUMA_IMAGE=docker.1ms.run/motricseven7/snowluma:latest`。

## 首次使用

### 1. 登录 QQ（远程桌面）

打开控制台 →「连接」，点击「接入远程桌面」，页面内嵌 noVNC（走 `/novnc/`，由网关代理，**不需要单独暴露 VNC 端口**）。
远程桌面里能看到 QQ 已自动启动，扫码或输密码登录。

- 远程桌面密码由 `VNC_PASSWD` 固定，控制台会自动填入，无需手抄容器日志。
- 登录完成后 SnowLuma 的 hook 会自动从被动观察切到工作模式（镜像默认 `SNOWLUMA_HOOK_AUTOLOAD=1`）。

### 2. SnowLuma WebUI

控制台左侧「开发者工具」可直达 SnowLuma WebUI（`/snowluma/`，自带令牌自动登录）。
首次启动的 WebUI 初始密码在 snowluma 容器日志里：

```bash
docker logs qq-bot-snowluma 2>&1 | grep -E "临时密码|initial credentials" | tail -n 1
```

### 3. OneBot 反向 WS（自动）

控制台检测到 QQ 登录后，会自动把 `wsClient` 写进 SnowLuma 的
`data/snowluma/data/config/onebot.json` 并对齐：

```text
url   = ONEBOT_WS_URL      （默认 ws://nonebot:8081/onebot/v11/ws）
token = ONEBOT_ACCESS_TOKEN
```

随后重启 snowluma 进程使配置生效（不重启容器，避免 QQ 重新登录）。改完这两项无需手工进入 SnowLuma。

## 目录与持久化

```text
data/snowluma/data      SnowLuma 配置（含 onebot.json）与缓存
data/snowluma/config    QQ 客户端配置
data/snowluma/share     QQ 用户数据（登录态、缓存）
data/nonebot            SQLite、上传图片
data/logs/nonebot       NoneBot 日志
data/updater            上次更新结果
.env.prod               密钥与运行配置（不入库）
```

普通重建不会丢数据：

```bash
docker compose up -d --build --force-recreate
```

> [!CAUTION]
> 不要执行 `docker compose down -v`，也不要删除 `data/`，否则连同登录态与配置一起清空。

备份：

```bash
docker compose stop
tar --xattrs --acls -czf qq-bot-backup-$(date +%F).tar.gz \
  compose.yaml Dockerfile deploy .env.prod app web data migrations requirements.txt
docker compose start
```

## 更新机制

推送 GitHub 不会直接改动服务器。updater 周期性地（`UPDATER_POLL_INTERVAL`）对 origin 做 `git ls-remote`：

- **只检测**：默认 `UPDATER_AUTO_UPDATE=false`，发现新版本只记录状态，不拉取、不重建。
- 控制台左上角会出现更新提示，**点击确认后**才拉起一次性 helper 容器执行
  `git fetch + merge --ff-only → docker compose build → up -d`。
- 安全边界：只接受 `--ff-only`；工作区有未提交改动时拒绝执行；连续失败会退避。

## 故障排查

| 现象 | 排查方向 |
| --- | --- |
| SnowLuma 注入失败（`COMPONENT_LOAD_FAILED`） | 宿主/外层未放开 ptrace，换有完整 `cap_sys_ptrace` 的机器 |
| `/snowluma/` 打开后 404 或资源 404 | SnowLuma 升级后压缩字面量变化，需回归 `deploy/nginx/nginx.conf` 的子路径改写规则 |
| 远程桌面空白 | 覆盖 `SNOWLUMA_QQ_FLAGS` 使用软件渲染（SwiftShader） |
| wsClient 连不上 | 用容器 IP/服务名而非 `host.docker.internal`；重启 snowluma 进程使配置生效 |
| 群列表为空 | 检查 OneBot URL、QQ 登录状态与 nonebot 日志 |
| 图片发送失败 | 确认 `PUBLIC_BASE_URL` 能被 snowluma 容器访问 |
| 更新按不动/无提示 | `curl http://<host>:18080/updater/api/status` 看 `update_available` 与 `last_run` |

健康检查：

```bash
curl http://localhost:18080/api/health
```

## 安全建议

- 正式环境务必替换 `ADMIN_TOKEN`、`AUTH_SESSION_SECRET`，并设置非空 `VNC_PASSWD`。
- 只对外暴露网关端口；`/novnc/` 已加控制台会话校验，仍建议叠加 HTTPS。
- Docker socket 会让控制台获得容器控制能力；不需要服务重启/日志读取时应移除该挂载并关闭 `CONTROL_ENABLED`。
- 定期加密备份 `data/` 与 `.env.prod`。
- SnowLuma 使用源码可见非商业许可，商业使用需另行授权，详见其仓库 LICENSE。

## 相关文档

- [SnowLuma](https://github.com/SnowLuma/SnowLuma) ・ [部署文档](https://snowluma.github.io/docs/guide/deploy/docker)
- [NoneBot 官方文档](https://nonebot.dev/docs/)
