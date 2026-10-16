import { useEffect, useRef } from "react";

import { fetchAuthMe } from "../api/auth";

/**
 * 登录 / 初始化入口：直接内嵌 SnowLuma 的初始化与登录页（同源、全屏），是"复用"而非复刻。
 *
 * 用户在 SnowLuma 页面上完成初始化并设置访问令牌；垫片（deploy/nginx/shim.js）会把该令牌
 * 同步给控制台后端，后端据此签发控制台会话、并用同一令牌调用 SnowLuma API。
 * 外层页面轮询会话，一旦建立就切进控制台。
 */
export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAuthMe().then((authenticated) => {
        if (authenticated) {
          window.clearInterval(timer);
          onLoginRef.current();
        }
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  return <iframe className="login-frame" src="/snowluma/" title="SnowLuma 登录与初始化" />;
}
