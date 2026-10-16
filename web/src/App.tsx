import {
  Bot,
  CircleAlert,
  FileText,
  KeyRound,
  LayoutDashboard,
  Menu,
  PlugZap,
  RefreshCw,
  Send,
  Settings2,
  TerminalSquare,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";

import { fetchAuthMe } from "./api/auth";
import { getDashboard } from "./api/dashboard";
import { getHealth, type Health } from "./api/health";
import { restartService } from "./api/ops";
import { getDevtoolsEntry } from "./api/snowluma";
import { AccountBlock } from "./components/AccountBlock";
import { NotificationBell } from "./components/NotificationBell";
import { StatusDot } from "./components/StatusDot";
import { UpdateBadge } from "./components/UpdateBadge";
import { BroadcastPage } from "./pages/BroadcastPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { KeywordPage } from "./pages/KeywordPage";
import { LoginPage } from "./pages/LoginPage";
import { LogsPage } from "./pages/LogsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import {
  AutoLoginSection,
  OrderDedupSection,
  SmtpSection,
  SystemSettingsPage,
} from "./pages/SystemSettingsPage";
import type { Dashboard, ServiceName } from "./types/api";
import { usePoll } from "./hooks/usePoll";

/** Sidebar entries. `to` is the history URL each page is served from. */
type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only match the exact URL (used by the index route). */
  end?: boolean;
  /** Optional badge rendered next to the label. */
  pill?: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/keywords", label: "关键词", icon: KeyRound },
  { to: "/history", label: "历史记录", icon: FileText },
  { to: "/broadcast", label: "群发任务", icon: Send },
  { to: "/connect", label: "连接与 SnowLuma", icon: PlugZap },
  { to: "/logs", label: "运行日志", icon: TerminalSquare, pill: "LIVE" },
  { to: "/settings", label: "系统设置", icon: Settings2 },
];

export function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");

  const refresh = async () => {
    try {
      setDashboard(await getDashboard());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "服务不可用");
    }
  };

  useEffect(() => {
    void fetchAuthMe()
      .then(setAuthenticated)
      .catch(() => setAuthenticated(false));
    // build metadata is static per image; fetch once per page load
    void getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  usePoll(refresh, 5000);

  if (authenticated === false) return <LoginPage onLogin={() => setAuthenticated(true)} />;

  const restart = async (service: ServiceName) => {
    setAction(service);
    try {
      await restartService(service);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重启失败");
    } finally {
      setAction("");
    }
  };

  const openDevtools = async () => {
    setMobileOpen(false);
    // 先同步开一个空白标签页，拿到令牌后再设置地址 —— 否则 await 之后的
    // window.open 会被浏览器当作非用户触发的弹窗而拦截。
    const tab = window.open("", "_blank");
    try {
      const entry = await getDevtoolsEntry();
      if (tab) {
        tab.location.replace(entry.url);
      } else {
        window.open(entry.url, "_blank");
      }
    } catch (reason) {
      tab?.close();
      setError(reason instanceof Error ? reason.message : "开发者工具入口获取失败");
    }
  };

  const snowlumaOnline = Boolean(dashboard?.snowluma?.logged_in);
  const title = NAV_ITEMS.find((item) => item.to === pathname)?.label ?? "页面不存在";

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="关闭导航" />
      )}
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <Bot size={20} />
          </div>
          <div>
            <strong>QQ Bot</strong>
            <span>Control Plane</span>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 左上角：有新版本时在这里提示，点击后才部署（后端默认只检测不部署） */}
        <UpdateBadge onError={setError} />

        <div className="sidebar-caption">管理台</div>
        <nav>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, pill }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {pill && <span className="nav-pill">{pill}</span>}
            </NavLink>
          ))}
          {/* 开发者工具：SnowLuma WebUI 不允许被 iframe 内嵌（X-Frame-Options/CSP），
              所以直接在新标签页打开同域名的 /snowluma/（自带令牌自动登录）。 */}
          <button
            type="button"
            className="nav-item"
            onClick={() => void openDevtools()}
          >
            <Wrench size={17} />
            <span>开发者工具</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          {/* 左下角：当前登录 QQ 的头像与昵称，点击查看账号信息 */}
          <AccountBlock />
          <div className="connection-row">
            <StatusDot online={snowlumaOnline} />
            <span>{snowlumaOnline ? "QQ 已连接" : "QQ 待连接"}</span>
          </div>
          <div className="connection-row">
            <StatusDot online={Boolean(dashboard)} />
            <span>{dashboard ? "WebUI 正常" : "WebUI 离线"}</span>
          </div>
          <div
            className="sidebar-version"
            title={health?.build_time ? `构建于 ${health.build_time}` : undefined}
          >
            v{health?.version || "dev"}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
          >
            <Menu size={19} />
          </button>
          <div>
            <div className="eyebrow">QQ 群管理机器人</div>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <span className="revision">配置版本 {dashboard?.config_revision ?? "-"}</span>
            <button className="button secondary" onClick={() => void refresh()}>
              <RefreshCw size={15} />
              刷新
            </button>
            <NotificationBell />
          </div>
        </header>

        {error && (
          <div className="alert error">
            <CircleAlert size={17} />
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError("")} aria-label="关闭错误">
              <X size={16} />
            </button>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={<DashboardPage dashboard={dashboard} action={action} restart={restart} />}
          />
          <Route path="/keywords" element={<KeywordPage onError={setError} />} />
          <Route path="/history" element={<HistoryPage onError={setError} />} />
          <Route path="/broadcast" element={<BroadcastPage onError={setError} />} />
          <Route path="/connect" element={<ConnectionPage onError={setError} />} />
          <Route path="/logs" element={<LogsPage onError={setError} />} />
          <Route path="/settings" element={<SystemSettingsPage />}>
            <Route index element={<Navigate to="dedup" replace />} />
            <Route path="dedup" element={<OrderDedupSection onError={setError} />} />
            <Route path="auto-login" element={<AutoLoginSection onError={setError} />} />
            <Route path="smtp" element={<SmtpSection onError={setError} />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
