"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api } from "../../lib/api";
import { useApp, Empty } from "../../components/layout/app-shell";

export function NotificationsPage() {
  const { user, ready } = useApp();
  const [data, setData] = useState<{ rows: any[]; unread: number }>({
      rows: [],
      unread: 0,
    }),
    [error, setError] = useState("");
  const load = () =>
    api<typeof data>("/notifications")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (user) void load();
  }, [user?.id]);
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <span className="eyebrow">TIN TỪ NHỮNG CÂU CHUYỆN</span>
        <h1>Thông báo của bạn</h1>
        <p>Chương mới từ các truyện bạn đang theo dõi.</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p>Đang tải…</p>
      ) : !user ? (
        <Empty
          title="Đăng nhập để nhận thông báo"
          text="Theo dõi truyện để biết khi tác giả đăng chương mới."
        />
      ) : (
        <>
          <button
            className="btn secondary"
            disabled={!data.unread}
            onClick={async () => {
              try {
                await api("/notifications/read", { method: "PUT", body: "{}" });
                window.dispatchEvent(new Event("tt-notifications-read"));
                void load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Check size={16} /> Đánh dấu tất cả đã đọc
          </button>
          <div className="data-list" style={{ marginTop: 24 }}>
            {data.rows.map((n) => (
              <Link
                key={n.id}
                className={`data-row notification-row ${!n.readAt ? "unread" : ""}`}
                href={n.href}
                onClick={() => {
                  void api("/notifications/read", {
                    method: "PUT",
                    body: JSON.stringify({ id: n.id }),
                  })
                    .then(() =>
                      window.dispatchEvent(new Event("tt-notifications-read")),
                    )
                    .catch(() => {});
                }}
              >
                <div>
                  <h3>{n.title}</h3>
                  <p>{new Date(n.createdAt).toLocaleString("vi-VN")}</p>
                </div>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
          {!data.rows.length && (
            <Empty
              title="Chưa có thông báo"
              text="Mở trang truyện yêu thích và bấm Theo dõi chương mới."
              href="/the-loai/tat-ca"
              label="Khám phá truyện"
            />
          )}
        </>
      )}
    </main>
  );
}
