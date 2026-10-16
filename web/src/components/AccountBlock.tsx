import { ChevronsUpDown, CircleUserRound, LogOut, Settings2, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { getSnowLumaAccount } from "../api/snowluma";
import type { SnowLumaAccount } from "../types/api";
import { usePoll } from "../hooks/usePoll";

/**
 * 左下角账号块：圆形头像 + 昵称 + 副标题（QQ 号），点击弹出菜单。
 * 数据来自 SnowLuma（uin / 昵称 / 头像），未登录时展示占位。
 */
export function AccountBlock() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<SnowLumaAccount | null>(null);
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  usePoll(async () => {
    try {
      setAccount(await getSnowLumaAccount());
    } catch {
      setAccount(null);
    }
  }, 15000);

  useEffect(() => {
    if (!open) {
      setShowInfo(false);
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const uin = account?.uin ?? "";
  const name = account?.nickname || (uin ? `QQ ${uin}` : "未登录 QQ");
  const subtitle = uin || "尚未登录";

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    window.location.reload();
  };

  return (
    <div className="account-block-shell" ref={shellRef}>
      <button
        type="button"
        className="account-block"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {account?.avatar ? (
          <img className="account-avatar" src={account.avatar} alt={name} referrerPolicy="no-referrer" />
        ) : (
          <span className="account-avatar placeholder">
            <UserRound size={14} />
          </span>
        )}
        <span className="account-meta">
          <strong>{name}</strong>
          <span>{subtitle}</span>
        </span>
        <ChevronsUpDown className="account-chevron" size={13} />
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-menu-head">
            {account?.avatar ? (
              <img className="account-avatar large" src={account.avatar} alt={name} referrerPolicy="no-referrer" />
            ) : (
              <span className="account-avatar large placeholder">
                <UserRound size={16} />
              </span>
            )}
            <div>
              <strong>{name}</strong>
              <span>{subtitle}</span>
            </div>
          </div>

          <button type="button" className="account-menu-item" onClick={() => setShowInfo((v) => !v)}>
            <CircleUserRound size={14} />
            账号信息
          </button>
          {showInfo && (
            <div className="account-menu-info">
              <div>
                <span>QQ 号</span>
                <code>{uin || "-"}</code>
              </div>
              <div>
                <span>昵称</span>
                <code>{account?.nickname || "-"}</code>
              </div>
              {!uin && <p className="muted">到「连接」页接入远程桌面并登录 QQ 后即可显示。</p>}
            </div>
          )}

          <button
            type="button"
            className="account-menu-item"
            onClick={() => {
              setOpen(false);
              navigate("/settings");
            }}
          >
            <Settings2 size={14} />
            设置
          </button>

          <button type="button" className="account-menu-item" onClick={() => void logout()}>
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
