import type { SnowLumaAccount, SnowLumaStatus } from "../types/api";
import { apiJson, apiText } from "./client";

export function getSnowLumaStatus(): Promise<SnowLumaStatus> {
  return apiJson<SnowLumaStatus>("/api/snowluma/status");
}

/** 当前登录的 QQ 账号（uin / 昵称 / 头像）；未登录时各字段为空串。 */
export function getSnowLumaAccount(): Promise<SnowLumaAccount> {
  return apiJson<SnowLumaAccount>("/api/snowluma/account");
}

/**
 * 初始化 SnowLuma WebUI：登录 → 同意协议 → 改密 → 落库，并直接登录控制台。
 * web 端首次部署时传一次性初始密码；新密码留空则由后端生成强密码。
 */
export function initSnowLuma(
  password?: string,
  newPassword?: string,
): Promise<{ initialized: boolean; source: string }> {
  const body: Record<string, string> = {};
  if (password) body.password = password;
  if (newPassword) body.new_password = newPassword;
  return apiJson("/api/snowluma/init", { method: "POST", body: JSON.stringify(body) });
}

/** 远程桌面入口参数：控制台据此内嵌 noVNC（走网关 /novnc/，无需单独暴露 VNC 端口）。 */
export function getVncEntry(): Promise<{ password: string; path: string; websocket_path: string }> {
  return apiJson("/api/snowluma/vnc");
}

/** 内置开发者工具（SnowLuma WebUI）的自动登录地址。 */
export function getDevtoolsEntry(): Promise<{ url: string }> {
  return apiJson("/api/snowluma/devtools");
}

/** 立即把当前 OneBot 反向 WS 配置写入 SnowLuma 并重启进程。 */
export function connectSnowLuma(): Promise<{ applied: boolean; uin: string; onebot_ws_url: string }> {
  return apiJson("/api/snowluma/connect", { method: "POST" });
}

export function fetchSnowLumaLogs(tail = 200): Promise<string> {
  return apiText(`/api/ops/logs/snowluma?tail=${tail}`, "日志读取失败");
}

/** 机器人是否已登录，用于群发页面的未连接告警。 */
export async function isBotOnline(): Promise<boolean> {
  const status = await apiJson<{ logged_in: boolean }>("/api/snowluma/status");
  return Boolean(status.logged_in);
}
