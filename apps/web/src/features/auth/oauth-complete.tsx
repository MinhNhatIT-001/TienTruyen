"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

export function OAuthComplete() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let redirect: ReturnType<typeof setTimeout> | undefined;
    let channel: BroadcastChannel | undefined;
    api("/auth/me", { cache: "no-store" }, false).then(() => {
      if (!active) return;
      // Same-origin signals survive OAuth providers severing window.opener.
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("tt-oauth");
        channel.postMessage("complete");
      }
      try { localStorage.setItem("tt-oauth-complete", String(Date.now())); } catch {}
      const destination = new URLSearchParams(window.location.search).get("link") === "1"
        ? "/tai-khoan" : "/";
      redirect = setTimeout(() => {
        // Script-opened windows can close even when their opener was detached.
        window.close();
        window.location.replace(destination);
      }, 600);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; clearTimeout(redirect); channel?.close(); };
  }, []);
  return <main className="container page" style={{ textAlign: "center" }}>
    <h1>{failed ? "Chưa hoàn tất đăng nhập" : "Đang đưa bạn về trang chính…"}</h1>
    <p role="status">{failed ? "Phiên đăng nhập chưa hợp lệ. Vui lòng thử lại." : "Đang xác nhận tài khoản của bạn."}</p>
    <Link className="btn primary" href={failed ? "/dang-nhap" : "/"}>{failed ? "Đăng nhập lại" : "Về trang chủ"}</Link>
  </main>;
}
