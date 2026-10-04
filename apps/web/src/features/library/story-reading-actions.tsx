"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BookOpen } from "lucide-react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";

export function StoryReadingActions({
  storyId,
  slug,
}: {
  storyId: string;
  slug: string;
}) {
  const { user, notify } = useApp();
  const [followed, setFollowed] = useState(false),
    [chapter, setChapter] = useState<number | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setChapter(null);
    setFollowed(false);
    if (user) {
      api<any[]>("/library")
        .then((r) => {
          if (active)
            setFollowed(!!r.find((x) => x.storyId === storyId)?.followed);
        })
        .catch(() => {});
      api<any[]>("/history")
        .then((r) => {
          if (active)
            setChapter(r.find((x) => x.storyId === storyId)?.chapter || null);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [user?.id, storyId]);
  return (
    <div className="hero-buttons">
      {chapter && (
        <Link className="btn primary" href={`/truyen/${slug}/${chapter}`}>
          <BookOpen size={17} /> Đọc tiếp chương {chapter}
        </Link>
      )}
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          if (!user) return notify("Đăng nhập để theo dõi chương mới.");
          setBusy(true);
          try {
            await api(`/library/${storyId}`, {
              method: "PUT",
              body: JSON.stringify({ followed: !followed }),
            });
            setFollowed(!followed);
            notify(
              followed
                ? "Đã ngừng theo dõi."
                : "Bạn sẽ nhận thông báo khi có chương mới.",
            );
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Bell size={17} />
        {followed ? "Đang theo dõi" : "Theo dõi chương mới"}
      </button>
    </div>
  );
}
