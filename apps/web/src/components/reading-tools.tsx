"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BookOpen, ArrowRight, Check, List } from "lucide-react";
import { api } from "../lib/api";
import { useApp, Empty } from "./shell";
import { StoryCard } from "./catalog";
import { format, type Story } from "../lib/types";
import type { Chapter } from "./reader";
export function ReadingHome({ stories }: { stories: Story[] }) {
  const { user } = useApp();
  const [history, setHistory] = useState<any[]>([]),
    [recommended, setRecommended] = useState<Story[]>([]);
  useEffect(() => {
    let active = true;
    setHistory([]);
    setRecommended([]);
    if (user) {
      api<any[]>("/history")
        .then((r) => {
          if (active) setHistory(r.filter((x) => x.story).slice(0, 3));
        })
        .catch(() => {});
      api<Story[]>("/recommendations")
        .then((r) => {
          if (active) setRecommended(r);
        })
        .catch(() => {});
    } else {
      try {
        const local = stories
          .flatMap((story) => {
            const chapter = Number(
              localStorage.getItem(`tt-last:guest:${story.slug}`),
            );
            if (
              !Number.isInteger(chapter) ||
              chapter < 1 ||
              chapter > story.chapterCount
            )
              return [];
            const saved = JSON.parse(
              localStorage.getItem(
                `tt-position:guest:${story.slug}:${chapter}`,
              ) || "0",
            );
            const position = Math.max(
              0,
              Math.min(
                1,
                Number(typeof saved === "number" ? saved : saved.position) || 0,
              ),
            );
            return [
              {
                storyId: story.id,
                story,
                chapter,
                position,
                finished: position >= 0.98,
                updatedAt: Number(saved.updatedAt) || 0,
              },
            ];
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 3);
        setHistory(local);
      } catch {}
    }
    return () => {
      active = false;
    };
  }, [user?.id, stories]);
  return (
    <>
      {history.length > 0 && (
        <section className="reading-home">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HÀNH TRÌNH CỦA BẠN</span>
              <h2>Tiếp tục trang sách đang mở</h2>
            </div>
            <Link href={user ? "/lich-su" : "/dang-nhap"} className="more-link">
              {user ? "Lịch sử đọc" : "Đăng nhập để đồng bộ"}{" "}
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="continue-grid">
            {history.map((r) => (
              <Link
                key={r.storyId}
                href={`/truyen/${r.story.slug}/${r.chapter}`}
                className="continue-card"
              >
                <BookOpen size={24} />
                <div>
                  <h3>{r.story.title}</h3>
                  <p>
                    Chương {r.chapter} ·{" "}
                    {r.finished
                      ? "Đã đọc xong chương"
                      : `${Math.round(r.position * 100)}% chương`}
                  </p>
                  <div className="reading-track">
                    <span
                      style={{ width: `${Math.max(3, r.position * 100)}%` }}
                    />
                  </div>
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {recommended.length > 0 && (
        <section className="reading-home">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THEO SỞ THÍCH ĐỌC</span>
              <h2>Dành cho bạn</h2>
            </div>
          </div>
          <div className="catalog-grid">
            {recommended.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
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
export function BatchUnlock({
  slug,
  chapters,
  onOwnershipChange,
}: {
  slug: string;
  chapters: Chapter[];
  onOwnershipChange?: (ids: Set<string>) => void;
}) {
  const { user, refresh, notify } = useApp();
  const [owned, setOwned] = useState<Set<string>>(new Set()),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const rows = await api<{ chapterId: string }[]>(
      `/stories/${slug}/ownership`,
    );
    const ids = new Set(rows.map((r) => r.chapterId));
    setOwned(ids);
    onOwnershipChange?.(ids);
  }
  useEffect(() => {
    setSelected([]);
    setOwned(new Set());
    onOwnershipChange?.(new Set());
    if (user) void load().catch(() => {});
  }, [slug, user?.id]);
  const available = chapters.filter((c) => !c.isFree && !owned.has(c.id)),
    total = available
      .filter((c) => selected.includes(c.id))
      .reduce((n, c) => n + c.price, 0);
  if (!user || !available.length) return null;
  return (
    <section className="batch-unlock panel">
      <h2>Mở khóa nhiều chương</h2>
      <p>Chỉ tính các chương chưa mua. Tối đa 50 chương mỗi lần.</p>
      <details>
        <summary>Chọn chương · {selected.length} đã chọn</summary>
        <div className="batch-chapters">
          {available.map((c) => (
            <label className="checkbox" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                disabled={
                  busy || (!selected.includes(c.id) && selected.length >= 50)
                }
                onChange={(e) => {
                  setConfirm(false);
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, c.id]
                      : s.filter((id) => id !== c.id),
                  );
                }}
              />
              Chương {c.number}: {c.title}
              <strong>{c.price} HN</strong>
            </label>
          ))}
        </div>
      </details>
      <p>
        Tổng <strong>{format(total)} HN</strong> · Số dư {format(user.balance)}{" "}
        HN
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="purchase-confirm">
          <p>
            Xác nhận mở {selected.length} chương với {format(total)} Hồng Ngọc?
          </p>
          <button
            className="btn primary"
            disabled={busy || total > user.balance}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/purchases/batch", {
                  method: "POST",
                  headers: { "Idempotency-Key": crypto.randomUUID() },
                  body: JSON.stringify({
                    chapterIds: selected,
                    expectedTotal: total,
                  }),
                });
                await refresh();
                await load();
                setSelected([]);
                setConfirm(false);
                notify("Đã mở khóa các chương đã chọn.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang mở khóa…" : "Xác nhận mua"}
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Quay lại
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          disabled={!selected.length || total > user.balance || busy}
          onClick={() => setConfirm(true)}
        >
          Mở khóa {selected.length} chương
        </button>
      )}
      {total > user.balance && (
        <Link href="/nap-hong-ngoc">Nạp thêm Hồng Ngọc</Link>
      )}
    </section>
  );
}
export function PurchasesPage() {
  const { user, ready } = useApp();
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api<any[]>("/purchases")
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [user?.id]);
  return (
    <main className="container page">
      <div className="page-intro">
        <h1>Các chương đã mua</h1>
        <p>Giá đã thanh toán được giữ lại trong lịch sử của bạn.</p>
      </div>
      <nav className="dashboard-nav">
        <Link href="/tu-truyen">Tủ truyện</Link>
        <Link className="active" href="/chuong-da-mua">
          Chương đã mua
        </Link>
        <Link href="/lich-su-giao-dich">Lịch sử Hồng Ngọc</Link>
      </nav>
      {error && <p className="error">{error}</p>}
      {!ready ? (
        <p>Đang tải…</p>
      ) : !user ? (
        <Empty
          title="Đăng nhập để xem các chương đã mua"
          text="Chương được mở khóa gắn với tài khoản của bạn."
        />
      ) : (
        <div className="data-list">
          {rows.map((r) => (
            <Link
              key={r.id}
              className="data-row"
              href={`/truyen/${r.chapter.story.slug}/${r.chapter.number}`}
            >
              <div>
                <h3>
                  {r.chapter.story.title} · Chương {r.chapter.number}
                </h3>
                <p>
                  {r.chapter.title} ·{" "}
                  {new Date(r.createdAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <strong>{format(r.pricePaid)} HN</strong>
            </Link>
          ))}
          {!rows.length && (
            <Empty
              title="Chưa có chương đã mua"
              text="Bạn có thể đọc chương miễn phí và mở khóa những chương tiếp theo."
              href="/the-loai/tat-ca"
              label="Khám phá"
            />
          )}
        </div>
      )}
    </main>
  );
}
export function useReadingPosition(
  slug: string,
  number: number,
  content?: string,
  serverPosition = 0,
  demo = false,
  serverUpdatedAt?: string,
) {
  const { user } = useApp();
  const restored = useRef("");
  useEffect(() => {
    if (!content) return;
    const key = `tt-position:${user?.id || "guest"}:${slug}:${number}`;
    let dirty = false,
      latest = 0,
      disposed = false;
    const position = () => {
      const article = document.querySelector(".reader-prose");
      if (!article) return 0;
      const rect = article.getBoundingClientRect();
      if (rect.bottom <= window.innerHeight * 0.9) return 1;
      const start = rect.top + window.scrollY;
      const distance = Math.max(
        1,
        article.scrollHeight - window.innerHeight * 0.65,
      );
      return Math.max(0, Math.min(1, (window.scrollY - start) / distance));
    };
    const save = () => {
      if (!dirty) return;
      dirty = false;
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ position: latest, updatedAt: Date.now() }),
        );
        localStorage.setItem(
          `tt-last:${user?.id || "guest"}:${slug}`,
          String(number),
        );
      } catch {}
      if (user && !demo)
        void api(`/reading/${slug}/${number}`, {
          method: "PUT",
          body: JSON.stringify({ position: latest, finished: latest >= 0.98 }),
        }).catch(() => {});
    };
    const scroll = () => {
      latest = position();
      dirty = true;
    };
    let local = 0,
      localTime = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "0");
      if (typeof stored === "number") local = stored;
      else {
        local = Number(stored.position);
        localTime = Number(stored.updatedAt) || 0;
      }
    } catch {}
    const value = Math.max(
      0,
      Math.min(1, Number.isFinite(local) ? local : 0, 1),
    );
    const restore = async () => {
      await document.fonts.ready;
      if (disposed || restored.current === key) return;
      restored.current = key;
      const article = document.querySelector(".reader-prose");
      const target =
        Date.parse(serverUpdatedAt || "") > localTime
          ? serverPosition
          : value || serverPosition;
      if (article && target > 0)
        window.scrollTo({
          top:
            article.getBoundingClientRect().top +
            window.scrollY +
            target *
              Math.max(1, article.scrollHeight - window.innerHeight * 0.65),
          behavior: "instant",
        });
      latest = position();
      dirty = true;
    };
    void restore();
    const timer = setInterval(save, 5000);
    window.addEventListener("scroll", scroll, { passive: true });
    const hide = () => {
      if (document.hidden) save();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      disposed = true;
      save();
      clearInterval(timer);
      window.removeEventListener("scroll", scroll);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [slug, number, content, user?.id, demo, serverPosition, serverUpdatedAt]);
}
export function ReaderContents({
  slug,
  current,
}: {
  slug: string;
  current: number;
}) {
  const [open, setOpen] = useState(false),
    [chapters, setChapters] = useState<Chapter[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (open)
      api<{ chapters: Chapter[] }>(`/stories/${slug}`)
        .then((r) => setChapters(r.chapters))
        .catch((e) => setError(e.message));
  }, [open, slug]);
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <List size={18} /> Mục lục
      </button>
      {open && (
        <div className="reader-toc" role="dialog" aria-label="Mục lục chương">
          <button className="text-button" onClick={() => setOpen(false)}>
            Đóng mục lục
          </button>
          {error && <p className="error">{error}</p>}
          {chapters.map((c) => (
            <Link
              key={c.id}
              href={`/truyen/${slug}/${c.number}`}
              aria-current={current === c.number ? "page" : undefined}
            >
              Chương {c.number} · {c.title}
              <small>{c.isFree ? "Miễn phí" : `${c.price} HN`}</small>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
