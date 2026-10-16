import { apiJson } from "./client";

export type AuthState = {
  /** 后端处于 dev 模式（跳过登录） */
  dev_mode: boolean;
  /** SnowLuma WebUI 是否已完成初始化 */
  initialized: boolean;
  /** 未初始化时的一次性初始令牌（来自 snowluma 容器日志），初始化后为空 */
  bootstrap_token: string;
};

export async function fetchAuthMe(): Promise<boolean> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  return response.ok;
}

/** 登录页用：判断是走初始化还是登录，并拿一次性初始令牌。 */
export function fetchAuthState(): Promise<AuthState> {
  return apiJson<AuthState>("/api/auth/state");
}

export async function login(token: string): Promise<boolean> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return response.ok;
}
