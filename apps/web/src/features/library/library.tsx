"use client";
import Link from "next/link";
import { Input } from "../../components/ui/primitives";

import { useEffect, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { api } from "../../lib/api";
import { normalizeSearch } from "../../lib/search";
import { Select } from "../../components/ui/select";

import { useApp, Empty } from "../../components/layout/app-shell";
import { StoryCard } from "../catalog/story-card";
export function Library({ history = false }: { history?: boolean }) {
  const { user, ready, notify } = useApp();
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [query, setQuery] = useState(""),
    [reading, setReading] = useState<any[]>([]),
    [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    api<any[]>(history ? "/history" : "/library")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    setRows([]);
    setError("");
    setReading([]);
    if (user) {
      void load();
      if (!history)
        api<any[]>("/history")
          .then(setReading)
          .catch(() => {});
    }
  }, [user?.id, history]);
  const filtered = rows.filter(
    (r) =>
      (filter === "ALL" ||
        (filter === "FOLLOWED" ? r.followed : r.shelf === filter)) &&
      normalizeSearch(
        `${r.story?.title || ""} ${r.story?.penName || ""}`,
      ).includes(normalizeSearch(query.trim())),
  );
  async function update(id: string, data: any) {
    setBusy(id);
    try {
      await api(`/library/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      await load();
      notify("Đã cập nhật tủ truyện.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">GÓC NHỎ CỦA BẠN</span>
        <h1>{history ? "Lịch sử đọc" : "Tủ truyện"}</h1>
        <p>Giữ lại những câu chuyện khiến bạn muốn quay về.</p>
      </div>
      <nav className="dashboard-nav">
        <Link className={!history ? "active" : ""} href="/tu-truyen">
          Truyện đã lưu
        </Link>
        <Link className={history ? "active" : ""} href="/lich-su">
          Đọc gần đây
        </Link>
        <Link href="/chuong-da-mua">Chương đã mua</Link>
        <Link href="/thong-bao">Thông báo</Link>
      </nav>
      {user && (
        <label className="library-search field">
          Tìm trong {history ? "lịch sử đọc" : "tủ truyện"}
          <Input
            type="search"
            placeholder="Tên truyện hoặc tác giả…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {!history && user && (
        <div className="genre-tabs shelf-tabs">
          {[
            ["ALL", "Tất cả"],
            ["READING", "Đang đọc"],
            ["FAVORITE", "Yêu thích"],
            ["FINISHED", "Đã hoàn thành"],
            ["FOLLOWED", "Đang theo dõi"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p>Đang tải…</p>
      ) : !user ? (
        <Empty
          title="Một góc nhỏ dành riêng cho bạn"
          text="Đăng nhập để lưu truyện và đồng bộ hành trình đọc."
        />
      ) : history ? (
        <div className="data-list">
          {rows
            .filter(
              (r) =>
                r.story &&
                normalizeSearch(`${r.story.title} ${r.story.penName}`).includes(
                  normalizeSearch(query.trim()),
                ),
            )
            .map((r) => (
              <Link
                className="data-row"
                href={`/truyen/${r.story.slug}/${r.chapter}`}
                key={r.storyId}
              >
                <div>
                  <h3>{r.story.title}</h3>
                  <p>
                    Chương {r.chapter} ·{" "}
                    {r.finished
                      ? "Đã đọc hết chương"
                      : `${Math.round(r.position * 100)}% chương`}
                  </p>
                </div>
                <span className="more-link">
                  Đọc tiếp <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          {!rows.length && (
            <Empty
              title="Trang đầu tiên đang chờ bạn"
              text="Mở một truyện để bắt đầu hành trình đọc."
              href="/the-loai/tat-ca"
              label="Khám phá truyện"
            />
          )}
        </div>
      ) : filtered.length ? (
        <div className="catalog-grid">
          {filtered.map((r) => (
            <div className="shelf-card" key={r.storyId}>
              <StoryCard
                story={{
                  ...r.story,
                  chapterCount: r.story._count.chapters,
                  rating: 0,
                  readers: 0,
                }}
              />
              <div className="shelf-controls">
                <Link
                  className="btn primary"
                  href={`/truyen/${r.story.slug}/${reading.find((x) => x.storyId === r.storyId)?.chapter || 1}`}
                >
                  <BookOpen size={16} />{" "}
                  {reading.some((x) => x.storyId === r.storyId)
                    ? "Tiếp tục đọc"
                    : "Bắt đầu đọc"}
                </Link>
                <label>
                  Ngăn tủ
                  <Select
                    label={`Ngăn tủ của ${r.story.title}`}
                    value={r.shelf}
                    disabled={busy === r.storyId}
                    onValueChange={(shelf) => void update(r.storyId, { shelf })}
                    options={[
                      { value: "READING", label: "Đang đọc" },
                      { value: "FAVORITE", label: "Yêu thích" },
                      { value: "FINISHED", label: "Đã hoàn thành" },
                    ]}
                  />
                </label>
                <button
                  className="text-button"
                  disabled={busy === r.storyId}
                  onClick={() =>
                    void update(r.storyId, { followed: !r.followed })
                  }
                >
                  {r.followed
                    ? "Đang theo dõi · Bỏ theo dõi"
                    : "Theo dõi chương mới"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === r.storyId}
                  onClick={async () => {
                    setBusy(r.storyId);
                    try {
                      await api(`/library/${r.storyId}`, { method: "DELETE" });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Bỏ khỏi tủ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Ngăn tủ này còn trống"
          text="Lưu và sắp xếp những câu chuyện bạn yêu thích."
          href="/the-loai/tat-ca"
          label="Khám phá truyện"
        />
      )}
    </main>
  );
}
