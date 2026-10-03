"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "./ui/select";
import {
  StoryReadingActions,
  BatchUnlock,
  ReaderContents,
  useReadingPosition,
} from "./reading-tools";
import { StoryComments } from "./community";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  Diamond,
  List,
  Lock,
  Settings2,
  Star,
  X,
  Minus,
  Plus,
  Flag,
} from "lucide-react";
import { Cover, useCatalog } from "./catalog";
import { useApp, Empty } from "./shell";
import { api, ApiError } from "../lib/api";
import { format, type Story } from "../lib/types";
export type Chapter = {
  id: string;
  number: number;
  title: string;
  isFree: boolean;
  price: number;
  content?: string;
  owned?: boolean;
  position?: number;
  progressUpdatedAt?: string;
  previousNumber?: number | null;
  nextNumber?: number | null;
  story?: { title: string; slug: string };
};
export type PublicStory = Story & { chapters: Chapter[]; comments: any[] };
export function StoryPage({
  slug,
  initialStory,
}: {
  slug: string;
  initialStory?: PublicStory;
}) {
  const { stories, demo } = useCatalog(),
    story = initialStory || stories.find((s) => s.slug === slug);
  const [tab, setTab] = useState("intro"),
    [ownedChapters, setOwnedChapters] = useState<Set<string>>(new Set()),
    [chapters, setChapters] = useState<Chapter[]>(initialStory?.chapters || []),
    [saved, setSaved] = useState(false),
    [comments, setComments] = useState<any[]>(initialStory?.comments || []),
    [comment, setComment] = useState("");
  const { user, notify } = useApp();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "comments")
      setTab("comments");
  }, []);
  useEffect(() => {
    api<any>(`/stories/${slug}`)
      .then((d) => {
        setChapters(d.chapters);
        setComments(d.comments || []);
      })
      .catch(() =>
        setChapters(
          Array.from({ length: 12 }, (_, i) => ({
            id: "sample-" + i,
            number: i + 1,
            title: [
              "Sương sớm Thanh Vân",
              "Người khách phương xa",
              "Một lời hẹn cũ",
              "Dưới tán tùng già",
              "Bước qua sơn môn",
              "Ánh đèn trong mưa",
            ][i % 6],
            isFree: i < 5,
            price: i < 5 ? 0 : 20,
          })),
        ),
      );
  }, [slug]);
  useEffect(() => {
    if (user && story)
      api<any[]>("/library")
        .then((rows) => setSaved(rows.some((row) => row.storyId === story.id)))
        .catch(() => {});
  }, [user?.id, story?.id]);
  if (!story)
    return (
      <main className="container page">
        <Empty
          title="Không tìm thấy truyện"
          text="Câu chuyện có thể chưa được xuất bản."
          href="/"
          label="Về trang chủ"
        />
      </main>
    );
  return (
    <main className="container page">
      <div className="breadcrumb">
        <Link href="/">Khám phá</Link>
        <ChevronRight size={13} />
        <Link href="/the-loai/tat-ca">{story.genre}</Link>
        <ChevronRight size={13} />
        <span>{story.title}</span>
      </div>
      <section className="story-detail">
        <div className="detail-cover">
          <Cover story={story} large />
        </div>
        <div className="detail-copy">
          <span className="pill">{story.genre}</span>
          <span className="pill soft">{story.progress}</span>
          <h1>{story.title}</h1>
          <p className="detail-author">
            Một câu chuyện của <strong>{story.penName}</strong>
          </p>
          <div className="detail-stats">
            <span>
              <Star size={18} />
              <strong>{story.rating || "Mới"}</strong> đánh giá
            </span>
            <span>
              <strong>{story.chapterCount}</strong> chương
            </span>
            <span>5 chương đầu miễn phí</span>
          </div>
          <p className="synopsis">{story.description}</p>
          <div className="hero-buttons">
            <Link className="btn primary" href={`/truyen/${slug}/1`}>
              <BookOpen size={18} /> Bắt đầu đọc
            </Link>
            <button
              className="btn secondary"
              onClick={async () => {
                if (!user)
                  return notify("Đăng nhập để lưu truyện vào tủ của bạn.");
                try {
                  await api(`/library/${story.id}`, {
                    method: saved ? "DELETE" : "POST",
                  });
                  setSaved(!saved);
                  notify(
                    saved ? "Đã bỏ lưu truyện." : "Đã thêm vào tủ truyện.",
                  );
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              {saved ? <Check size={17} /> : <Bookmark size={17} />}{" "}
              {saved ? "Đã lưu" : "Thêm vào tủ"}
            </button>
          </div>
          <div className="hero-buttons">
            {user && (
              <>
                <label className="field">
                  Đánh giá của bạn
                  <select
                    aria-label="Đánh giá truyện"
                    defaultValue=""
                    onChange={async (e) => {
                      try {
                        await api(`/stories/${story.id}/rating`, {
                          method: "POST",
                          body: JSON.stringify({
                            score: Number(e.target.value),
                          }),
                        });
                        notify("Cảm ơn bạn đã đánh giá.");
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Chọn số sao
                    </option>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} sao
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn text"
                  onClick={async () => {
                    const reason = window.prompt(
                      "Mô tả vấn đề cần báo cáo (ít nhất 10 ký tự):",
                    );
                    if (!reason) return;
                    try {
                      await api("/reports", {
                        method: "POST",
                        body: JSON.stringify({ targetId: story.id, reason }),
                      });
                      notify("Đã gửi báo cáo đến ban biên tập.");
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <Flag size={15} />
                  Báo cáo truyện
                </button>
              </>
            )}
          </div>
          <StoryReadingActions storyId={story.id} slug={slug} />
          <p className="fine-print">
            {demo
              ? "Truyện mẫu do Tiên Truyện biên soạn để xem giao diện."
              : "Ủng hộ tác giả bằng cách đọc truyện có bản quyền."}
          </p>
        </div>
      </section>
      <div className="detail-tabs">
        <button
          className={tab === "intro" ? "active" : ""}
          onClick={() => setTab("intro")}
        >
          Giới thiệu
        </button>
        <button
          className={tab === "chapters" ? "active" : ""}
          onClick={() => setTab("chapters")}
        >
          Danh sách chương <span>{chapters.length}</span>
        </button>
        <button
          className={tab === "comments" ? "active" : ""}
          onClick={() => setTab("comments")}
        >
          Bình luận <span>{comments.length}</span>
        </button>
      </div>
      {tab === "intro" ? (
        <div className="intro-layout">
          <article>
            <h2>Về câu chuyện này</h2>
            <p>{story.description}</p>
            <blockquote>
              “Có những chuyến đi bắt đầu bằng một bước chân.
              <br />
              Có những thế giới mở ra từ một trang sách.”
            </blockquote>
            <button
              className="btn secondary"
              onClick={() => setTab("chapters")}
            >
              Xem danh sách chương <List size={17} />
            </button>
          </article>
          <aside className="info-panel">
            <h3>Thông tin truyện</h3>
            <p>
              <span>Tác giả</span>
              <strong>{story.penName}</strong>
            </p>
            <p>
              <span>Thể loại</span>
              <strong>{story.genre}</strong>
            </p>
            <p>
              <span>Tình trạng</span>
              <strong>{story.progress}</strong>
            </p>
            <p>
              <span>Ngôn ngữ</span>
              <strong>Tiếng Việt</strong>
            </p>
          </aside>
        </div>
      ) : tab === "chapters" ? (
        <div>
          <BatchUnlock
            slug={slug}
            chapters={chapters}
            onOwnershipChange={setOwnedChapters}
          />
          <div className="chapter-list">
            {chapters.map((c) => (
              <Link href={`/truyen/${slug}/${c.number}`} key={c.number}>
                <span>
                  <small>{String(c.number).padStart(2, "0")}</small>
                  {c.title}
                </span>
                {ownedChapters.has(c.id) ? (
                  <span className="free">
                    <Check size={13} /> Đã mở khóa
                  </span>
                ) : c.isFree ? (
                  <span className="free">Miễn phí</span>
                ) : (
                  <span className="ruby">
                    <Lock size={13} />
                    {c.price} HN
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <StoryComments
          storyId={story.id}
          slug={slug}
          initialComments={comments}
        />
      )}
    </main>
  );
}
export type ReaderSettings = {
  fontSize: number;
  lineHeight: number;
  font: string;
  width: string;
  theme: string;
  bg: string;
  color: string;
};
const defaults: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.9,
  font: "serif",
  width: "medium",
  theme: "paper",
  bg: "#f7f3ea",
  color: "#28332d",
};
const themes: Record<string, { name: string; bg: string; color: string }> = {
  paper: { name: "Giấy", bg: "#f7f3ea", color: "#28332d" },
  light: { name: "Sáng", bg: "#ffffff", color: "#202820" },
  sepia: { name: "Sepia", bg: "#eee0c6", color: "#4a3928" },
  dark: { name: "Tối", bg: "#202724", color: "#dedfd8" },
  oled: { name: "OLED", bg: "#000000", color: "#d5d8d4" },
  green: { name: "Xanh dịu", bg: "#dfeae0", color: "#243c2c" },
};
function contrast(a: string, b: string) {
  const luminance = (v: string) => {
    const c = v
      .match(/[a-f0-9]{2}/gi)
      ?.map((x) => parseInt(x, 16) / 255)
      .map((x) =>
        x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
      ) || [0, 0, 0];
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function SettingsPanel({
  settings: s,
  setSettings,
  close,
}: {
  settings: ReaderSettings;
  setSettings: (s: ReaderSettings) => void;
  close?: () => void;
}) {
  const update = (p: Partial<ReaderSettings>) => setSettings({ ...s, ...p });
  return (
    <div className="settings-panel">
      <div className="panel-heading">
        <h3>Không gian đọc của bạn</h3>
        {close && (
          <button
            className="icon-btn"
            aria-label="Đóng tùy chỉnh"
            onClick={close}
          >
            <X size={19} />
          </button>
        )}
      </div>
      <label>
        Cỡ chữ <strong>{s.fontSize}px</strong>
      </label>
      <div className="size-control">
        <button
          aria-label="Giảm cỡ chữ"
          onClick={() => update({ fontSize: Math.max(14, s.fontSize - 1) })}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label="Cỡ chữ"
          type="range"
          min="14"
          max="32"
          value={s.fontSize}
          onChange={(e) => update({ fontSize: +e.target.value })}
        />
        <button
          aria-label="Tăng cỡ chữ"
          onClick={() => update({ fontSize: Math.min(32, s.fontSize + 1) })}
        >
          <Plus size={16} />
        </button>
      </div>
      <label htmlFor="reader-font">Kiểu chữ</label>
      <Select
        label="Kiểu chữ"
        value={s.font}
        onValueChange={(font) => update({ font })}
        options={[
          { value: "serif", label: "Serif · Trang sách" },
          { value: "sans", label: "Sans · Hiện đại" },
          { value: "lexend", label: "Lexend · Dễ đọc" },
          { value: "mono", label: "Mono · Máy chữ" },
        ]}
      />
      <label>
        Giãn dòng <strong>{s.lineHeight.toFixed(1)}</strong>
      </label>
      <input
        aria-label="Giãn dòng"
        type="range"
        min="1.4"
        max="2.4"
        step="0.1"
        value={s.lineHeight}
        onChange={(e) => update({ lineHeight: +e.target.value })}
      />
      <label htmlFor="reader-width">Độ rộng trang</label>
      <Select
        label="Độ rộng trang"
        value={s.width}
        onValueChange={(width) => update({ width })}
        options={[
          { value: "narrow", label: "Hẹp" },
          { value: "medium", label: "Vừa" },
          { value: "wide", label: "Rộng" },
          { value: "full", label: "Toàn màn hình" },
        ]}
      />
      <label>Màu trang sách</label>
      <div className="theme-grid">
        {Object.entries(themes).map(([key, t]) => (
          <button
            aria-pressed={s.theme === key}
            className={s.theme === key ? "chosen" : ""}
            key={key}
            style={{ background: t.bg, color: t.color }}
            onClick={() => update({ theme: key, bg: t.bg, color: t.color })}
          >
            Aa<small>{t.name}</small>
          </button>
        ))}
      </div>
      <div className="color-controls">
        <label>
          Nền
          <input
            aria-label="Màu nền tùy chỉnh"
            type="color"
            value={s.bg}
            onChange={(e) => update({ theme: "custom", bg: e.target.value })}
          />
        </label>
        <label>
          Chữ
          <input
            aria-label="Màu chữ tùy chỉnh"
            type="color"
            value={s.color}
            onChange={(e) => update({ theme: "custom", color: e.target.value })}
          />
        </label>
      </div>
      {contrast(s.bg, s.color) < 4.5 && (
        <p className="error">
          Độ tương phản thấp. Hãy chọn màu chữ và nền khác nhau hơn.
        </p>
      )}
      <button className="reset-btn" onClick={() => setSettings(defaults)}>
        Khôi phục mặc định
      </button>
    </div>
  );
}
function useReaderSettings() {
  const [settings, set] = useState(defaults),
    [loaded, setLoaded] = useState(false);
  const { user, notify } = useApp();
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("tt-reader") || "null");
      if (
        raw &&
        typeof raw.fontSize === "number" &&
        /^#[0-9a-f]{6}$/i.test(raw.bg) &&
        /^#[0-9a-f]{6}$/i.test(raw.color)
      )
        set({
          ...defaults,
          ...raw,
          fontSize: Math.min(32, Math.max(14, raw.fontSize)),
          lineHeight: Math.min(
            2.4,
            Math.max(1.4, Number(raw.lineHeight) || 1.9),
          ),
        });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (user?.readerSettings && Object.keys(user.readerSettings).length)
      set((s) => ({ ...s, ...user.readerSettings }) as ReaderSettings);
  }, [user?.id]);
  function setSettings(s: ReaderSettings) {
    set(s);
    try {
      localStorage.setItem("tt-reader", JSON.stringify(s));
    } catch {
      notify(
        "Trình duyệt không cho lưu cài đặt. Thay đổi vẫn có hiệu lực trong phiên này.",
      );
    }
  }
  async function sync() {
    try {
      await api("/users/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      notify("Đã đồng bộ cài đặt với tài khoản.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return { settings, setSettings, loaded, sync };
}
export function Reader({
  slug,
  number,
  initialChapter,
}: {
  slug: string;
  number: number;
  initialChapter?: Chapter;
}) {
  const { settings, setSettings, loaded, sync } = useReaderSettings();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [panel, setPanel] = useState(false),
    [positionReady, setPositionReady] = useState(false),
    [chapter, setChapter] = useState<Chapter | null>(initialChapter || null),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const { user, refresh, notify } = useApp();
  const { stories } = useCatalog();
  const story = stories.find((s) => s.slug === slug);
  const load = () =>
    api<Chapter>(`/stories/${slug}/chapters/${number}`).then((c) => {
      setChapter(c);
      setPositionReady(true);
      setError("");
    });
  useEffect(() => {
    setPositionReady(false);
    setChapter(initialChapter || null);
    setDemo(false);
    let active = true;
    api<Chapter>(`/stories/${slug}/chapters/${number}`)
      .then((c) => {
        if (active) {
          setChapter(c);
          setPositionReady(true);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message || "Không mở được chương. Hãy thử lại.");
      });
    return () => {
      active = false;
    };
  }, [slug, number]);
  useReadingPosition(
    slug,
    number,
    positionReady ? chapter?.content : undefined,
    chapter?.position || 0,
    demo,
    chapter?.progressUpdatedAt,
  );
  useEffect(() => {
    if (!chapter?.content) {
      setProgress(0);
      return;
    }
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const article = document.querySelector(".reader-prose");
        if (!article) return;
        const rect = article.getBoundingClientRect();
        const distance = Math.max(
          1,
          article.scrollHeight - window.innerHeight * 0.65,
        );
        setProgress(
          rect.bottom <= window.innerHeight * 0.9
            ? 100
            : Math.round(Math.max(0, Math.min(1, -rect.top / distance)) * 100),
        );
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [chapter?.content, settings]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(false);
        setConfirm(false);
      }
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        panel ||
        confirm
      )
        return;
      const target = event.target as HTMLElement;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], [role=dialog]",
        )
      )
        return;
      const next =
        event.key === "ArrowRight"
          ? chapter?.nextNumber
          : event.key === "ArrowLeft"
            ? chapter?.previousNumber
            : null;
      if (next) {
        event.preventDefault();
        router.push(`/truyen/${slug}/${next}`);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    chapter?.nextNumber,
    chapter?.previousNumber,
    slug,
    router,
    panel,
    confirm,
  ]);
  async function buy() {
    if (!chapter || busy) return;
    setBusy(true);
    try {
      await api(`/purchases/${chapter.id}`, {
        method: "POST",
        body: JSON.stringify({ expectedPrice: chapter.price }),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      await refresh();
      await load();
      setConfirm(false);
      notify("Đã mở khóa. Chúc bạn đọc truyện vui vẻ!");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fonts: Record<string, string> = {
    serif: 'Georgia, "Times New Roman", serif',
    sans: "Arial, sans-serif",
    lexend: "Lexend, Arial, sans-serif",
    mono: "ui-monospace, monospace",
  };
  if (!loaded && !initialChapter)
    return <main className="empty">Đang mở trang sách…</main>;
  return (
    <main
      className="reader"
      style={
        {
          "--reader-bg": settings.bg,
          "--reader-color": settings.color,
          "--reader-size": settings.fontSize + "px",
          "--reader-line": settings.lineHeight,
          "--reader-font": fonts[settings.font] || fonts.serif,
          "--reader-width":
            { narrow: "580px", medium: "720px", wide: "960px", full: "100%" }[
              settings.width
            ] || "720px",
        } as CSSProperties
      }
    >
      <div className="reader-topbar">
        <Link href={`/truyen/${slug}`}>
          <ArrowLeft size={16} />
          <span>{story?.title || "Về trang truyện"}</span>
        </Link>
        <ReaderContents slug={slug} current={number} />
        <button onClick={() => setPanel(!panel)} aria-expanded={panel}>
          <Settings2 size={18} /> Tùy chỉnh
        </button>
      </div>
      {panel && (
        <div className="reader-settings">
          <SettingsPanel
            settings={settings}
            setSettings={setSettings}
            close={() => setPanel(false)}
          />
          {user && (
            <button className="btn primary sync-btn" onClick={sync}>
              Đồng bộ tài khoản
            </button>
          )}
        </div>
      )}
      <article className="reader-article">
        <span className="eyebrow">
          {story?.title} · CHƯƠNG {number}
        </span>
        <h1>{chapter?.title || "Đang mở trang sách…"}</h1>
        <p className="reader-meta">
          {chapter?.content
            ? `${Math.max(1, Math.ceil(chapter.content.trim().split(/\s+/u).length / 220))} phút đọc · `
            : ""}
          Chương {number}
        </p>
        <div className="reader-ornament">— ✦ —</div>
        {demo && (
          <p className="demo-note">
            Bản đọc mẫu · Nội dung minh họa giao diện.
          </p>
        )}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              className="btn secondary"
              onClick={() => void load().catch((e) => setError(e.message))}
            >
              Thử mở lại chương
            </button>
          </div>
        ) : chapter?.content ? (
          <div className="reader-prose">
            {chapter.content.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : chapter ? (
          <div className="locked-chapter">
            <div className="lock-badge">
              <Lock size={26} />
            </div>
            <h2>Tiếp tục hành trình cùng tác giả</h2>
            <p>
              Mở khóa chương này để khám phá những điều đang chờ phía trước.
            </p>
            <strong className="unlock-price">
              <Diamond size={22} />
              {chapter.price} Hồng Ngọc
            </strong>
            {demo ? (
              <p>Kết nối API để sử dụng chức năng mở khóa.</p>
            ) : !user ? (
              <Link
                className="btn primary"
                href={`/dang-nhap?next=${encodeURIComponent(`/truyen/${slug}/${number}`)}`}
              >
                Đăng nhập để đọc tiếp
              </Link>
            ) : user.balance < chapter.price ? (
              <>
                <p>Bạn còn thiếu {format(chapter.price - user.balance)} HN.</p>
                <Link className="btn primary" href="/nap-hong-ngoc">
                  Nạp thêm Hồng Ngọc
                </Link>
              </>
            ) : (
              <button className="btn primary" onClick={() => setConfirm(true)}>
                Mở khóa chương <ArrowRight size={16} />
              </button>
            )}
            <small>Ủng hộ sáng tạo · Mua một lần, đọc lại bất cứ lúc nào</small>
          </div>
        ) : null}
        <div className="reader-end">✦</div>
        <nav className="chapter-nav" aria-label="Chuyển chương">
          {chapter?.previousNumber ? (
            <Link
              className="btn secondary"
              href={`/truyen/${slug}/${chapter.previousNumber}`}
            >
              <ArrowLeft size={16} /> Chương trước
            </Link>
          ) : (
            <span />
          )}
          <Link
            className="icon-btn"
            aria-label="Danh sách chương"
            href={`/truyen/${slug}`}
          >
            <List size={21} />
          </Link>
          {chapter?.nextNumber && (
            <Link
              className="btn primary"
              href={`/truyen/${slug}/${chapter.nextNumber}`}
            >
              Chương sau <ArrowRight size={16} />
            </Link>
          )}
        </nav>
      </article>
      {chapter && (
        <nav className="reader-dock" aria-label="Điều khiển đọc nhanh">
          {chapter.previousNumber ? (
            <Link
              href={`/truyen/${slug}/${chapter.previousNumber}`}
              aria-label="Chương trước"
            >
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <span />
          )}
          <span className="reader-progress-label">
            Chương {number} · {progress}%
          </span>
          <button
            aria-label="Tùy chỉnh trang đọc"
            aria-expanded={panel}
            onClick={() => setPanel(!panel)}
          >
            <Settings2 size={18} />
          </button>
          {chapter.nextNumber ? (
            <Link
              href={`/truyen/${slug}/${chapter.nextNumber}`}
              aria-label="Chương sau"
            >
              <ArrowRight size={18} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-title"
            onClick={(e) => e.stopPropagation()}
          >
            <Diamond className="ruby" size={30} />
            <h2 id="purchase-title">Mở thêm một chương mới</h2>
            <p>
              Chương {number} · {chapter?.title}
            </p>
            <p>
              Giá <strong>{chapter?.price} HN</strong> · Số dư{" "}
              {format(user?.balance || 0)} HN
            </p>
            <div className="hero-buttons">
              <button
                autoFocus
                className="btn primary"
                disabled={busy}
                onClick={buy}
              >
                {busy ? "Đang mở khóa…" : "Xác nhận mở khóa"}
              </button>
              <button
                className="btn secondary"
                onClick={() => setConfirm(false)}
              >
                Để sau
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export function ReaderPreferences() {
  const { settings, setSettings, sync } = useReaderSettings();
  const { user } = useApp();
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">THEO CÁCH CỦA BẠN</span>
        <h1>Một góc đọc thật riêng.</h1>
        <p>Cài đặt được lưu trên trình duyệt này.</p>
      </div>
      <div className="preferences-grid">
        <SettingsPanel settings={settings} setSettings={setSettings} />
        <div
          className="reader-preview"
          style={{
            background: settings.bg,
            color: settings.color,
            fontSize: settings.fontSize,
            lineHeight: settings.lineHeight,
            fontFamily:
              settings.font === "serif"
                ? "Georgia,serif"
                : settings.font === "lexend"
                  ? "Lexend,Arial,sans-serif"
                  : settings.font === "mono"
                    ? "monospace"
                    : "Arial,sans-serif",
          }}
        >
          <h2>Gió qua miền cố sự</h2>
          <p>
            Có những buổi chiều, chỉ cần một tách trà và vài trang sách, ta đã
            có thể đi thật xa. Ngoài cửa sổ, mây vẫn chậm rãi trôi qua những
            đỉnh núi xanh.
          </p>
          <p>
            Mỗi câu chữ là một lối nhỏ. Bạn cứ bước đi, thế giới sẽ dần mở ra.
          </p>
        </div>
      </div>
      {user && (
        <button className="btn primary" onClick={sync}>
          Lưu và đồng bộ tài khoản
        </button>
      )}
    </main>
  );
}
