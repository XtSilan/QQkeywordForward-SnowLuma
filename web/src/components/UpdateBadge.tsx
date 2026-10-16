import { ArrowUpCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";

import { deployUpdater, getUpdaterStatus } from "../api/updater";
import type { UpdaterStatus } from "../types/api";
import { usePoll } from "../hooks/usePoll";

/**
 * 左上角更新提示。
 *
 * 只在**远端（GitHub）真的有了新提交**时才亮，或部署进行中时显示进度 —— 这样不会因为
 * "本地手动构建导致镜像版本落后于 HEAD"（build_stale）而一直误报"有新版本"。
 * 部署期间面板会实时显示 updater helper 的拉取/构建日志尾部。
 */
export function UpdateBadge({ onError }: { onError: (message: string) => void }) {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const load = async () => {
    try {
      setStatus(await getUpdaterStatus());
    } catch {
      setStatus(null); // 更新服务不可用时静默隐藏，不影响主界面
    }
  };

  // 部署期间需要看到进度，轮询频率固定得高一些；理想情况应随状态自适应，这里图简单。
  usePoll(load, 4000);

  const running = deploying || Boolean(status?.active) || Boolean(status?.helper_running);
  const behind = status?.behind_remote === true;

  if (!status || (!behind && !running)) return null;

  const progress = (status.active_log || "").split("\n").filter(Boolean).slice(-12);

  const deploy = async () => {
    setDeploying(true);
    try {
      await deployUpdater();
      await load();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "部署失败");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="update-badge-shell">
      <button
        type="button"
        className={running ? "update-badge running" : "update-badge available"}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {running ? <Loader2 size={14} className="spin" /> : <ArrowUpCircle size={14} />}
        <span>{running ? "正在部署更新" : "GitHub 有新提交"}</span>
      </button>

      {open && (
        <div className="update-panel">
          <div className="update-panel-head">
            <strong>{running ? "正在部署更新" : "GitHub 上有新提交"}</strong>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭">
              <X size={15} />
            </button>
          </div>
          <div className="update-panel-body">
            <div>
              当前运行 <code>{status.local_short || "-"}</code>
            </div>
            <div>
              远端最新 <code>{status.remote_short || "-"}</code>
            </div>
          </div>

          {running && progress.length > 0 && (
            <pre className="update-progress">{progress.join("\n")}</pre>
          )}

          {!running && status.last_run && (
            <div className="update-panel-body muted">
              <div>
                上次更新：
                {status.last_run.ok ? (
                  <>
                    <CheckCircle2 size={12} /> 成功
                  </>
                ) : (
                  `失败（exit ${status.last_run.exit_code ?? "-"}）`
                )}
              </div>
            </div>
          )}

          <button
            className="button primary full-button"
            onClick={() => void deploy()}
            disabled={deploying || running}
          >
            {running ? "部署中" : "立即拉取并更新"}
          </button>
        </div>
      )}
    </div>
  );
}
