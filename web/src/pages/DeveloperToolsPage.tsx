import { ExternalLink, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { getDevtoolsEntry } from "../api/snowluma";

/**
 * 「开发者工具」页：同域名内嵌 SnowLuma WebUI（/snowluma/），后端下发一次性令牌，
 * 打开即自动登录，不跳转到其它域名。
 */
export function DeveloperToolsPage({ onError }: { onError: (message: string) => void }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    void getDevtoolsEntry()
      .then((entry) => setUrl(entry.url))
      .catch((reason) => onError(reason instanceof Error ? reason.message : "开发者工具入口获取失败"));
  }, [onError]);

  return (
    <section className="content devtools-content">
      <div className="welcome-row">
        <div>
          <h2>开发者工具</h2>
          <p>SnowLuma WebUI 直接内嵌在本控制台里（自带令牌自动登录），不跳转到其它地址。</p>
        </div>
        <a className="button secondary" href={url || "/snowluma/"} target="_blank" rel="noreferrer">
          <ExternalLink size={15} />
          新标签打开
        </a>
      </div>

      {url ? (
        <iframe className="devtools-frame" title="SnowLuma 开发者工具" src={url} />
      ) : (
        <div className="panel">
          <Wrench size={18} />
          <p className="muted">正在准备 SnowLuma WebUI…</p>
        </div>
      )}
    </section>
  );
}
