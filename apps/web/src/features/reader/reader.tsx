"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ReaderContents } from "./reader-contents";
import { useReadingPosition } from "./use-reading-position";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Diamond,
  List,
  Lock,
  Settings2,
} from "lucide-react";
import { useCatalog } from "../catalog/use-catalog";
import { useApp } from "../../components/layout/app-shell";
import { api } from "../../lib/api";
import { format } from "../../lib/types";

import type { Chapter } from "./types";

import { useReaderSettings, SettingsPanel } from "./settings";
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
        <Link className="reader-story-name" href={`/truyen/${slug}`}>
          {story?.title}
        </Link>
        <h1>
          {chapter
            ? `Chương ${number}: ${chapter.title}`
            : "Đang mở trang sách…"}
        </h1>
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
            {chapter.content
              .split("\n\n")
              .filter(
                (p, i) =>
                  i !== 0 || p.trim() !== `${story?.title} — Chương ${number}`,
              )
              .map((p, i) => (
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
