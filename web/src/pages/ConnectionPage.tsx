import { MonitorSmartphone, PlugZap, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { restartService } from "../api/ops";
import {
  connectSnowLuma,
  getSnowLumaStatus,
  getVncEntry,
  initSnowLuma,
} from "../api/snowluma";
import { EmptyState } from "../components/EmptyState";
import { InfoRow } from "../components/InfoRow";
import { StatusDot } from "../components/StatusDot";
import type { SnowLumaStatus } from "../types/api";
import { usePoll } from "../hooks/usePoll";

/**
 * 「连接」页：OneBot 由 SnowLuma 提供。
 * 远程桌面走网关 `/novnc/`（由后端代理，不单独暴露 VNC 端口），密码由后端下发自动填入；
 * QQ 登录后后端会自动把 OneBot 反向 WS 写进 SnowLuma 并重启其进程，无需手进 WebUI。
 */
export function ConnectionPage({ onError }: { onError: (message: string) => void }) {
  const [status, setStatus] = useState<SnowLumaStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [vncUrl, setVncUrl] = useState("");

  const load = async () => {
    try {
      setStatus(await getSnowLumaStatus());
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "SnowLuma 状态读取失败");
    }
  };

  usePoll(load, 3000);

  const openVnc = async () => {
    setBusy("vnc");
    try {
      const entry = await getVncEntry();
      const base = `${entry.path}?autoconnect=1&resize=scale&path=${encodeURIComponent(entry.websocket_path)}`;
      setVncUrl(entry.password ? `${base}&password=${encodeURIComponent(entry.password)}` : base);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "远程桌面入口获取失败");
    } finally {
      setBusy("");
    }
  };

  const run = async (tag: string, action: () => Promise<unknown>) => {
    setBusy(tag);
    try {
      await action();
      await load();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy("");
    }
  };

  const online = Boolean(status?.logged_in);
  const account = status?.account;
  const process = status?.processes?.[0];

  return (
    <section className="content">
      <div className="welcome-row">
        <div>
          <h2>连接与 SnowLuma</h2>
          <p>远程桌面与 OneBot 接入都由后端代理，凭据不暴露给浏览器。</p>
        </div>
        <div className={online ? "status-chip good" : "status-chip warn"}>
          <StatusDot online={online} />
          {online ? `QQ 已登录 ${account?.uin ?? ""}` : status?.initialized === false ? "待初始化" : "等待 QQ 登录"}
        </div>
      </div>

      <div className="connect-layout">
        <section className="panel connect-vnc-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">REMOTE DESKTOP</div>
              <h3>接入远程桌面</h3>
            </div>
            {vncUrl && (
              <button className="button secondary" onClick={() => setVncUrl("")} disabled={busy !== ""}>
                <RotateCcw size={15} />
                关闭
              </button>
            )}
          </div>

          {vncUrl ? (
            <iframe
              className="vnc-frame"
              title="SnowLuma 远程桌面"
              src={vncUrl}
            />
          ) : (
            <EmptyState
              icon={<MonitorSmartphone size={22} />}
              title="尚未接入远程桌面"
              hint="点击下方按钮，在同一域名内嵌打开 SnowLuma 的远程桌面（自动填密）。"
            />
          )}

          {!vncUrl && (
            <button
              className="button primary full-button"
              onClick={() => void openVnc()}
              disabled={busy !== ""}
            >
              <MonitorSmartphone size={15} />
              {busy === "vnc" ? "接入中" : "接入远程桌面"}
            </button>
          )}
        </section>

        <section className="panel connect-status-panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">SNOWLUMA STATUS</div>
              <h3>运行状态</h3>
            </div>
            <span className="muted">3 秒刷新</span>
          </div>
          <div className="info-list">
            <InfoRow label="WebUI 初始化" value={status?.initialized ? "已完成" : "未完成"} good={Boolean(status?.initialized)} />
            <InfoRow label="QQ 登录" value={online ? `已登录 ${account?.uin ?? ""}` : "未登录"} good={online} />
            <InfoRow label="昵称" value={account?.nickname || "-"} />
            <InfoRow label="进程注入" value={process ? (process.injected ? `已注入 PID ${process.pid}` : "未注入") : "-"} good={Boolean(process?.injected)} />
            <InfoRow label="OneBot 反向 WS" value={status?.onebot_ws_url || "-"} />
            {status?.error && <InfoRow label="错误" value={status.error} />}
          </div>

          <div className="callout">
            <ShieldCheck size={17} />
            <span>QQ 登录后会自动把 OneBot 反向 WS 写入 SnowLuma 并重启其进程，无需手工进 WebUI 配连接。首次初始化可点下方按钮从容器日志自动完成。</span>
          </div>

          {!status?.initialized && (
            <button
              className="button primary full-button"
              onClick={() => void run("init", () => initSnowLuma())}
              disabled={busy !== ""}
            >
              <ShieldCheck size={15} />
              {busy === "init" ? "初始化中" : "初始化 SnowLuma"}
            </button>
          )}
          <button
            className="button ghost full-button"
            onClick={() => void run("connect", () => connectSnowLuma())}
            disabled={busy !== "" || !online}
            title={online ? "" : "当前未登录 QQ"}
          >
            <PlugZap size={15} />
            {busy === "connect" ? "接入中" : "立即接入 OneBot"}
          </button>
          <button
            className="button ghost full-button"
            onClick={() => void run("restart", () => restartService("snowluma"))}
            disabled={busy !== ""}
          >
            <RotateCcw size={15} />
            {busy === "restart" ? "重启中" : "重启 SnowLuma 容器"}
          </button>
          <button className="button ghost full-button" onClick={() => void load()} disabled={busy !== ""}>
            <RefreshCw size={15} />
            刷新状态
          </button>
        </section>
      </div>
    </section>
  );
}
