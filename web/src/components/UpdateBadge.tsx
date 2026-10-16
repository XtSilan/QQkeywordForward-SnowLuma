import { ArrowUpCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";

import { deployUpdater, getUpdaterStatus } from "../api/updater";
import type { UpdaterStatus } from "../types/api";
import { usePoll } from "../hooks/usePoll";

/**
 * 左上角更新提示：只提示有新版本，点了才部署（后端 updater 默认「只检测不部署」）。
 * 部署期间显示进行中；完成后由状态轮询自动切回。
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

  usePoll(load, 15000);

  const available = Boolean(status?.update_available);
  const running = deploying || Boolean(status?.active);

  if (!status || (!available && !running)) return null;

  const deploy = async () => {
    setDeploying(true);
    try {
      await deployUpdater();
      await load();
      setOpen(false);
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
        className={available ? "update-badge available" : "update-badge running"}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {running ? <Loader2 size={14} className="spin" /> : <ArrowUpCircle size={14} />}
        <span>{running ? "正在部署更新" : "有新版本"}</span>
      </button>

      {open && (
        <div className="update-panel">
          <div className="update-panel-head">
            <strong>发现新版本</strong>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭">
              <X size={15} />
            </button>
          </div>
          <div className="update-panel-body">
            <div>
              当前版本 <code>{status.local_short || "-"}</code>
            </div>
            <div>
              远端版本 <code>{status.remote_short || "-"}</code>
            </div>
            {status.last_run && (
              <div className="muted">
                上次更新：
                {status.last_run.ok ? (
                  <>
                    <CheckCircle2 size={12} /> 成功
                  </>
                ) : (
                  "失败"
                )}
              </div>
            )}
          </div>
          <button
            className="button primary full-button"
            onClick={() => void deploy()}
            disabled={deploying || running}
          >
            {deploying || running ? "部署中" : "立即更新"}
          </button>
        </div>
      )}
    </div>
  );
}
