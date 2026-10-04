"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";

export function NotificationBell() {
  const { user } = useApp();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!user || document.hidden) return;
      try {
        const r = await api<{ unread: number }>("/notifications");
        if (active) setCount(r.unread);
      } catch {}
    }
    void load();
    const timer = setInterval(load, 60000);
    window.addEventListener("tt-notifications-read", load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("tt-notifications-read", load);
    };
  }, [user?.id]);
  if (!user) return null;
  return (
    <Link
      href="/thong-bao"
      className="notification-bell"
      aria-label={`Thông báo, ${count} chưa đọc`}
    >
      <Bell size={19} />
      {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
