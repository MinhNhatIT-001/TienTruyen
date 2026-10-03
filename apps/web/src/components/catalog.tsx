"use client";
import Link from "next/link";
import { Select } from "./ui/select";
import { ReadingHome } from "./reading-tools";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Feather,
  Flame,
  Star,
  TrendingUp,
  Search,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import sample from "../lib/catalog.json";
import { type Story, genres, format } from "../lib/types";
import { api } from "../lib/api";
export function Cover({
  story,
  large = false,
}: {
  story: Story;
  large?: boolean;
}) {
  return (
    <div
      className={`book-cover ${story.cover} ${large ? "large" : ""}`}
      role="img"
      aria-label={`Bìa ${story.title}`}
    >
      <div className="cover-orbit" />
      <div className="cover-mountain mountain-back" />
      <div className="cover-mountain mountain-front" />
      <div className="cover-mist" />
      <span className="cover-series">TIÊN TRUYỆN · ORIGINAL</span>
      <span className="cover-title">{story.title}</span>
      <span className="cover-author">{story.penName}</span>
      <span className="cover-seal">仙</span>
    </div>
  );
}
export function useCatalog() {
  const [stories, setStories] = useState<Story[]>(sample),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    api<Story[]>("/stories")
      .then(setStories)
      .catch(() => setDemo(true));
  }, []);
  return { stories, demo };
}
export function StoryCard({ story }: { story: Story }) {
  return (
    <Link className="story-card" href={`/truyen/${story.slug}`}>
      <div className="cover-wrap">
        <Cover story={story} />
        <span
          className={`status-tag ${story.progress === "Hoàn thành" ? "completed" : ""}`}
        >
          {story.progress}
        </span>
        <span className="cover-open">
          <BookOpen size={18} /> Khám phá truyện
        </span>
      </div>
      <span className="eyebrow genre-label">{story.genre}</span>
      <h3>{story.title}</h3>
      <p className="author">{story.penName}</p>
      <div className="card-meta">
        <span>
          <Star size={12} fill="currentColor" />
          {story.rating ? story.rating.toFixed(1) : "Mới"}
        </span>
        <span>{format(story.chapterCount)} chương</span>
      </div>
    </Link>
  );
}
export function Home() {
  const { stories, demo } = useCatalog();
  const [genre, setGenre] = useState("Tất cả");
  const featured =
    stories.find((s) => s.slug === "van-dao-truong-sinh") ||
    stories[0] ||
    sample[0];
  const shown = stories
    .filter((s) => genre === "Tất cả" || s.genre === genre)
    .slice(0, 6);
  const ranked = [...stories].sort((a, b) => b.rating - a.rating).slice(0, 5);
  const completed = stories
    .filter((s) => s.progress === "Hoàn thành")
    .slice(0, 3);
  return (
    <main className="home library-home container">
      {demo && (
        <div className="demo-note">
          Đang xem dữ liệu mẫu. Một số chức năng chưa khả dụng.
        </div>
      )}
      <div className="home-intro">
        <div>
          <span className="eyebrow">KHÁM PHÁ TRUYỆN</span>
          <h1>Hôm nay bạn muốn đọc gì?</h1>
        </div>
        <form action="/tim-kiem" className="home-search">
          <Search size={19} />
          <input
            name="q"
            aria-label="Tìm tên truyện hoặc tác giả"
            placeholder="Tên truyện, tác giả…"
            maxLength={100}
          />
          <button aria-label="Tìm kiếm">
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
      <section className="home-feature-layout" aria-label="Truyện nổi bật">
        <div className="spotlight">
          <div className="spotlight-halo" />
          <div className="spotlight-copy">
            <span className="spotlight-label">
              <Sparkles size={14} /> TRUYỆN NỔI BẬT
            </span>
            <span className="spotlight-genre">
              {featured.genre} / {featured.progress}
            </span>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <div className="spotlight-meta">
              <span>{featured.penName}</span>
              <span>·</span>
              <span>{format(featured.chapterCount)} chương</span>
            </div>
            <Link
              className="btn spotlight-cta"
              href={`/truyen/${featured.slug}/1`}
            >
              <BookOpen size={17} /> Bắt đầu đọc <ArrowUpRight size={17} />
            </Link>
          </div>
          <Link
            className="spotlight-book"
            href={`/truyen/${featured.slug}`}
            aria-label={`Khám phá ${featured.title}`}
          >
            <Cover story={featured} large />
          </Link>
          <span className="spotlight-index" aria-hidden="true">
            01 / TIÊN TRUYỆN
          </span>
        </div>
        <aside className="home-completed">
          <div className="home-aside-heading">
            <span className="eyebrow">ĐỌC TRỌN MỘT HÀNH TRÌNH</span>
            <h2>
              Đã hoàn thành <CheckCircle2 size={18} />
            </h2>
          </div>
          {completed.map((s) => (
            <Link
              className="completed-row"
              key={s.id}
              href={`/truyen/${s.slug}`}
            >
              <div className="completed-cover">
                <Cover story={s} />
              </div>
              <div>
                <span>{s.genre}</span>
                <h3>{s.title}</h3>
                <p>{s.penName}</p>
                <small>{format(s.chapterCount)} chương</small>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
          {!completed.length && (
            <p className="home-empty">
              Những câu chuyện trọn vẹn sẽ sớm có mặt.
            </p>
          )}
          <Link className="home-aside-link" href="/tim-kiem">
            Khám phá thư viện <ArrowRight size={15} />
          </Link>
        </aside>
      </section>
      <ReadingHome stories={stories} />
      <section className="home-shelf">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CHỌN MỘT THẾ GIỚI</span>
            <h2>Trên kệ hôm nay</h2>
          </div>
          <Link className="more-link" href="/the-loai/tat-ca">
            Tất cả truyện <ArrowRight size={16} />
          </Link>
        </div>
        <div className="genre-tabs" role="group" aria-label="Lọc theo thể loại">
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => setGenre(g)}
              aria-pressed={genre === g}
              className={genre === g ? "selected" : ""}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="home-book-grid">
          {shown.map((s) => (
            <StoryCard story={s} key={s.id} />
          ))}
        </div>
        {!shown.length && (
          <p className="home-empty">
            Chưa có truyện thuộc thể loại này. Bạn thử một thế giới khác nhé.
          </p>
        )}
      </section>
      <div className="home-bottom-grid">
        <section className="home-updates">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TIẾP NỐI NHỮNG CÂU CHUYỆN</span>
              <h2>Mới cập nhật</h2>
            </div>
            <Link className="more-link" href="/tim-kiem">
              Xem thêm <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="updates">
            {stories.slice(0, 6).map((s) => (
              <Link
                className="update-row"
                key={s.id}
                href={`/truyen/${s.slug}`}
              >
                <div className="mini-cover">
                  <Cover story={s} />
                </div>
                <div>
                  <h3>{s.title}</h3>
                  <p>
                    {s.penName} <span>· {s.genre}</span>
                  </p>
                </div>
                <span className="update-chapter">
                  {format(s.chapterCount)} chương
                </span>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </section>
        <section className="home-ranking">
          <div className="section-heading">
            <div>
              <span className="eyebrow">GÓC ĐỘC GIẢ</span>
              <h2>Đánh giá cao</h2>
            </div>
            <TrendingUp size={22} />
          </div>
          {ranked.map((s, i) => (
            <Link className="rank-item" key={s.id} href={`/truyen/${s.slug}`}>
              <span className={`rank-number rank-${i}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>
                  {s.penName} · {s.genre}
                </small>
              </div>
              <span className="home-score">
                <Star size={12} />
                {s.rating ? s.rating.toFixed(1) : "Mới"}
              </span>
            </Link>
          ))}
          <Link className="home-aside-link" href="/bang-xep-hang">
            Xem bảng xếp hạng <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="home-reading-note">
        <BookOpen size={22} />
        <p>Một chương mới. Một khoảng lặng cho riêng bạn.</p>
        <Link href="/tu-truyen">
          Mở tủ truyện <ArrowRight size={15} />
        </Link>
      </div>
    </main>
  );
}
export function CatalogPage({
  initialGenre = "Tất cả",
  ranking = false,
}: {
  initialGenre?: string;
  ranking?: boolean;
}) {
  const { stories, demo } = useCatalog();
  const [query, setQuery] = useState(""),
    [genre, setGenre] = useState(initialGenre),
    [status, setStatus] = useState("Tất cả"),
    [sort, setSort] = useState(ranking ? "rating" : "new"),
    [length, setLength] = useState("all"),
    [updated, setUpdated] = useState("all");
  useEffect(() => {
    setGenre(initialGenre);
  }, [initialGenre]);
  useEffect(() => {
    setSort(ranking ? "rating" : "new");
  }, [ranking]);
  useEffect(() => {
    setQuery(
      new URLSearchParams(window.location.search).get("q")?.slice(0, 100) || "",
    );
  }, []);
  let filtered = stories.filter(
    (s) =>
      (genre === "Tất cả" || s.genre === genre) &&
      (status === "Tất cả" || s.progress === status) &&
      (length === "all" ||
        (length === "short"
          ? s.chapterCount < 50
          : length === "medium"
            ? s.chapterCount >= 50 && s.chapterCount <= 200
            : s.chapterCount > 200)) &&
      (updated === "all" ||
        (!!s.updatedAt &&
          Date.now() - Date.parse(s.updatedAt) <=
            Number(updated) * 86400000)) &&
      `${s.title} ${s.penName}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  if (sort === "rating")
    filtered = [...filtered].sort((a, b) => b.rating - a.rating);
  if (sort === "length")
    filtered = [...filtered].sort((a, b) => b.chapterCount - a.chapterCount);
  if (sort === "new")
    filtered = [...filtered].sort(
      (a, b) =>
        Date.parse(b.updatedAt || "1970-01-01") -
        Date.parse(a.updatedAt || "1970-01-01"),
    );
  return (
    <main className="container page catalog-page">
      <div className="page-intro catalog-intro">
        <span className="eyebrow">THƯ VIỆN TIÊN TRUYỆN</span>
        <h1>
          {ranking
            ? "Những câu chuyện được yêu thích"
            : genre === "Tất cả"
              ? "Thư viện truyện"
              : genre}
        </h1>
        <p>Khám phá những thế giới mới, theo cách của bạn.</p>
        <div className="catalog-summary">
          <BookOpen size={17} />
          <span>{stories.length} câu chuyện trong thư viện</span>
        </div>
      </div>
      <section
        className="catalog-discovery"
        aria-label="Tìm kiếm và lọc truyện"
      >
        <div className="search-box">
          <Search size={21} />
          <input
            aria-label="Tìm tên truyện hoặc tác giả"
            placeholder="Tên truyện, tác giả bạn đang tìm…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="filters">
          <div className="genre-tabs" role="group" aria-label="Thể loại truyện">
            {genres.map((g) => (
              <button
                aria-pressed={genre === g}
                className={genre === g ? "selected" : ""}
                key={g}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="catalog-extra-filters">
          <label>
            <span>Trạng thái</span>
            <Select
              label="Trạng thái truyện"
              value={status}
              onValueChange={setStatus}
              options={["Tất cả", "Đang ra", "Hoàn thành"].map((value) => ({
                value,
                label: value,
              }))}
            />
          </label>
          <label>
            <span>Sắp xếp</span>
            <Select
              label="Sắp xếp"
              value={sort}
              onValueChange={setSort}
              options={[
                { value: "new", label: "Mới cập nhật" },
                { value: "rating", label: "Đánh giá cao" },
                { value: "length", label: "Nhiều chương nhất" },
              ]}
            />
          </label>
          <label>
            <span>Độ dài</span>
            <Select
              label="Độ dài"
              value={length}
              onValueChange={setLength}
              options={[
                { value: "all", label: "Mọi độ dài" },
                { value: "short", label: "Dưới 50 chương" },
                { value: "medium", label: "50–200 chương" },
                { value: "long", label: "Trên 200 chương" },
              ]}
            />
          </label>
          <label>
            <span>Cập nhật trong</span>
            <Select
              label="Cập nhật trong"
              value={updated}
              onValueChange={setUpdated}
              options={[
                { value: "all", label: "Mọi thời điểm" },
                { value: "1", label: "24 giờ" },
                { value: "7", label: "7 ngày" },
                { value: "30", label: "30 ngày" },
              ]}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setGenre("Tất cả");
              setStatus("Tất cả");
              setLength("all");
              setUpdated("all");
              setSort(ranking ? "rating" : "new");
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      </section>
      <div className="catalog-results-heading">
        <h2>
          {ranking
            ? "Bảng xếp hạng"
            : genre === "Tất cả"
              ? "Tất cả truyện"
              : `Truyện ${genre.toLocaleLowerCase("vi")}`}
        </h2>
        <p className="result-count" role="status">
          {filtered.length} câu chuyện {demo && "· Thư viện mẫu"}
        </p>
      </div>
      {filtered.length ? (
        <div className="catalog-grid">
          {filtered.map((s) => (
            <StoryCard story={s} key={s.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Search size={36} />
          <h2>Chưa tìm thấy câu chuyện phù hợp</h2>
          <p>Thử một tên truyện khác hoặc chọn thêm thể loại nhé.</p>
          <button
            className="btn primary"
            onClick={() => {
              setQuery("");
              setGenre("Tất cả");
              setStatus("Tất cả");
              setLength("all");
              setUpdated("all");
              setSort(ranking ? "rating" : "new");
            }}
          >
            Xóa bộ lọc
          </button>
        </div>
      )}
    </main>
  );
}
