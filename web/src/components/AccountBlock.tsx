import { UserRound } from "lucide-react";
import { useState } from "react";

import { getSnowLumaAccount } from "../api/snowluma";
import type { SnowLumaAccount } from "../types/api";
import { usePoll } from "../hooks/usePoll";

/**
 * 左下角账号块：显示当前登录 QQ 的头像与昵称，点击展开账号信息。
 * 数据来自 SnowLuma（uin / 昵称 / 头像），未登录时展示占位。
 */
export function AccountBlock() {
  const [account, setAccount] = useState<SnowLumaAccount | null>(null);
  const [open, setOpen] = useState(false);

  usePoll(async () => {
    try {
      setAccount(await getSnowLumaAccount());
    } catch {
      setAccount(null);
    }
  }, 15000);

  const uin = account?.uin ?? "";
  const nickname = account?.nickname || (uin ? `QQ ${uin}` : "未登录 QQ");

  return (
    <div className="account-block-shell">
      <button
        type="button"
        className="account-block"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {account?.avatar ? (
          <img className="account-avatar" src={account.avatar} alt={nickname} referrerPolicy="no-referrer" />
        ) : (
          <span className="account-avatar placeholder">
            <UserRound size={16} />
          </span>
        )}
        <span className="account-meta">
          <strong>{nickname}</strong>
          <span>{uin || "点击查看账号信息"}</span>
        </span>
      </button>

      {open && (
        <div className="account-panel">
          <div className="account-panel-head">
            {account?.avatar ? (
              <img className="account-avatar large" src={account.avatar} alt={nickname} referrerPolicy="no-referrer" />
            ) : (
              <span className="account-avatar large placeholder">
                <UserRound size={20} />
              </span>
            )}
            <div>
              <strong>{nickname}</strong>
              <span>{uin ? `UIN ${uin}` : "尚未登录"}</span>
            </div>
          </div>
          {uin ? (
            <ul className="account-facts">
              <li>
                <span>QQ 号</span>
                <code>{uin}</code>
              </li>
              <li>
                <span>昵称</span>
                <code>{account?.nickname || "-"}</code>
              </li>
            </ul>
          ) : (
            <p className="muted">到「连接」页接入远程桌面并登录 QQ 后，这里会显示账号。</p>
          )}
        </div>
      )}
    </div>
  );
}
