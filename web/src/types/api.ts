/** API-facing types shared by pages, components and the api layer. */

/** 当前登录的 QQ 账号（uin / 昵称 / 头像）。 */
export type SnowLumaAccount = {
  uin: string;
  nickname: string;
  avatar: string;
};

/** SnowLuma 注入的 QQ 进程状态。 */
export type SnowLumaProcess = {
  pid: number;
  name: string;
  injected: boolean;
  connected: boolean;
  loggedIn: boolean;
  uin: string;
  status: string;
  error: string;
};

/** As returned by GET /api/snowluma/status. */
export type SnowLumaStatus = {
  initialized: boolean;
  logged_in: boolean;
  account: SnowLumaAccount;
  processes: SnowLumaProcess[];
  control_enabled: boolean;
  onebot_ws_url: string;
  error: string;
};

export type Dashboard = {
  config_revision: number;
  snowluma: { initialized: boolean; logged_in: boolean; account: SnowLumaAccount; error?: string };
  nonebot: { service: string; config_reload: boolean };
  stats?: { groups: number; keyword_hits_today: number; alerts_sent_today: number };
};

/** 更新服务状态（GET /api/updater/status）。 */
export type UpdaterStatus = {
  ok: boolean;
  errors: string[];
  enabled: boolean;
  auto_update: boolean;
  branch: string;
  local_short: string;
  remote_short: string;
  update_available: boolean | null;
  behind_remote: boolean | null;
  build_version: string;
  build_stale: boolean | null;
  working_tree_dirty: boolean;
  helper_running: boolean;
  /** 部署进行中时 helper 的实时日志尾部；用于显示拉取/构建进度 */
  active_log?: string;
  active?: { trigger?: string; started_at?: string } | null;
  availability?: { update_available?: boolean; remote_sha?: string } | null;
  last_run?: {
    ok?: boolean;
    exit_code?: number | null;
    finished_at?: string;
    sha_after?: string;
    log_tail?: string;
  } | null;
};

export type Group = {
  group_id: string;
  name: string;
  avatar_url: string;
  enabled: number;
};

export type KeywordBinding = {
  group_id: string;
  enabled: number;
  cooldown_seconds: number;
};

export type Keyword = {
  id: number;
  display_text: string;
  group_count: number;
  sort_order?: number;
  destination_ids?: number[];
  bindings: KeywordBinding[];
};

export type HistoryItem = {
  id: number;
  group_id: string;
  group_name: string;
  sender_id: string;
  sender_name: string;
  keyword_text_snapshot: string;
  message_text: string;
  hit_at: string;
  notify_status: string;
};

/** One page of keyword hits, as returned by GET /api/history. */
export type HistoryList = {
  items: HistoryItem[];
  total: number;
  limit: number;
  offset: number;
};

export type Destination = {
  id: number;
  kind: "qq" | "email";
  address: string;
  display_name: string;
  enabled: number;
  group_ids: string[];
};

export type BroadcastTask = {
  id: string;
  title: string;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  interval_seconds: number;
  /** Rounds including the first; 0 means the task never loops. */
  loop_total: number;
  /** Round in flight, 1-based (0 for a non-looping task). */
  loop_current: number;
  loop_interval_seconds: number;
  /** Groups already sent/failed in the round currently in flight. */
  round_sent: number;
  round_failed: number;
  created_at: string;
};

/** Per-group detail inside a broadcast task (from GET /api/broadcast-tasks/:id). */
export type BroadcastTaskGroup = {
  task_id: string;
  group_id: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  message_id: string | null;
  error_code: string | null;
  error_text: string | null;
  attempts: number;
};

export type BroadcastTaskDetail = BroadcastTask & {
  message: MessageSegment[];
  groups: BroadcastTaskGroup[];
};

export type MessageSegment = {
  type: "text" | "image";
  data: { text?: string; file?: string };
};

export type ChannelDraft = {
  kind: "qq" | "email";
  address: string;
  display_name: string;
};

export type ServiceName = "snowluma" | "nonebot";
export type LogService = ServiceName;

export type SmtpSettings = {
  host: string;
  port: number;
  username: string;
  from_address: string;
  password: string;
  starttls: boolean;
  ssl: boolean;
  timeout: number;
};

/** As returned by GET /api/settings/smtp (never includes the password). */
export type SmtpSettingsResponse = Omit<SmtpSettings, "password"> & { password_configured?: boolean };

export type OrderDedupSettings = {
  enabled: boolean;
  similarity: number;
  window_minutes: number;
  max_push_per_order: number;
  new_phone_repush: boolean;
  ad_filter_enabled: boolean;
  ad_keywords: string;
};

/** Auto-recovery target account; empty disables automatic quick-login. */
export type AutoLoginSettings = { uin: string };

/** Human-readable labels for broadcast task statuses. */
export const BROADCAST_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  queued: "排队中",
  running: "发送中",
  paused: "已暂停",
  completed: "已完成",
  completed_with_errors: "完成（有失败）",
  cancelled: "已取消",
};

/** Human-readable labels for keyword-hit notification states. */
export const NOTIFY_STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  queued: "排队中",
  sent: "已发送",
  suppressed: "重复订单已抑制",
  expired: "超时未送达",
  suppressed_cooldown: "重复消息已冷却",
  no_destination: "未配置提醒",
};