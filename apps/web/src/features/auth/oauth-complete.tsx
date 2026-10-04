"use client";
import { useEffect } from "react";
import { api } from "../../lib/api";

export function OAuthComplete() {
  useEffect(() => {
    let active = true;
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
      // Close immediately; ordinary tabs fall back to the destination.
      window.close();
      window.location.replace(destination);
    }).catch(() => {
      if (active) window.location.replace("/dang-nhap?authError=oauth_failed");
    });
    return () => { active = false; channel?.close(); };
  }, []);
  return null;
}
