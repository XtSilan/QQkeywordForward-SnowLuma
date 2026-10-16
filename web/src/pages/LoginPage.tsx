import { Bot, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { login } from "../api/auth";
import { getSnowLumaStatus, initSnowLuma } from "../api/snowluma";

/**
 * 登录页。密码就是 SnowLuma WebUI 的管理员密码（也兼容 ADMIN_TOKEN）。
 * 首次部署（SnowLuma 尚未初始化）时切换为初始化流程：填入容器日志里的一次性
 * 初始密码、设置自己的新密码，完成 同意协议 + 改密 后直接进入控制台。
 */
export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "init">("login");
  const [password, setPassword] = useState("");
  const [bootstrap, setBootstrap] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSnowLumaStatus()
      .then((status) => setMode(status.initialized ? "login" : "init"))
      .catch(() => setMode("login"));
  }, []);

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!(await login(password))) {
        setError("密码不正确");
        return;
      }
      setPassword("");
      onLogin();
    } finally {
      setBusy(false);
    }
  };

  const submitInit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await initSnowLuma(bootstrap, newPassword);
      setBootstrap("");
      setNewPassword("");
      onLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "初始化失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="main login-main">
      <section className="panel login-panel">
        <div className="brand-mark">
          <Bot size={22} />
        </div>
        {mode === "login" ? (
          <>
            <h1>登录控制台</h1>
            <p>请输入 SnowLuma WebUI 的管理员密码。</p>
            <form onSubmit={(event) => void submitLogin(event)}>
              <label className="field">
                <span>管理员密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  required
                />
              </label>
              <button className="button primary" disabled={busy}>
                <ShieldCheck size={15} />
                {busy ? "登录中" : "登录"}
              </button>
              {error && <div className="alert error">{error}</div>}
            </form>
          </>
        ) : (
          <>
            <h1>初始化 SnowLuma</h1>
            <p>
              首次部署需要先初始化。初始密码在 snowluma 容器日志里：
              <code>docker logs qq-bot-snowluma 2&gt;&amp;1 | grep 临时密码</code>
            </p>
            <form onSubmit={(event) => void submitInit(event)}>
              <label className="field">
                <span>初始密码（一次性）</span>
                <input
                  type="password"
                  value={bootstrap}
                  onChange={(event) => setBootstrap(event.target.value)}
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                <span>设置你的新密码（可留空自动生成）</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <button className="button primary" disabled={busy}>
                <KeyRound size={15} />
                {busy ? "初始化中" : "初始化并进入"}
              </button>
              {error && <div className="alert error">{error}</div>}
            </form>
          </>
        )}
      </section>
    </main>
  );
}
