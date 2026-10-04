"use client";

import { Select } from "../../components/ui/select";

import { useEffect, useState } from "react";
import { normalizeSearch } from "../../lib/search";
import { BookOpen, Search } from "lucide-react";

import { genres } from "../../lib/types";

import { useCatalog } from "./use-catalog";
import { StoryCard } from "./story-card";
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
  const [filtersReady, setFiltersReady] = useState("");
  const [page, setPage] = useState(1);
  const filterKey = `tt-catalog:${ranking ? "ranking" : initialGenre}`;
  useEffect(() => {
    let params = new URLSearchParams(window.location.search);
    if (
      !["q", "genre", "status", "sort", "length", "updated"].some((key) =>
        params.has(key),
      )
    ) {
      try {
        params = new URLSearchParams(localStorage.getItem(filterKey) || "");
      } catch {}
    }
    setQuery((params.get("q") || "").slice(0, 100));
    setGenre(
      genres.includes(params.get("genre") || "")
        ? params.get("genre")!
        : initialGenre,
    );
    setStatus(
      ["Tất cả", "Đang ra", "Hoàn thành"].includes(params.get("status") || "")
        ? params.get("status")!
        : "Tất cả",
    );
    setSort(
      ["new", "rating", "length"].includes(params.get("sort") || "")
        ? params.get("sort")!
        : ranking
          ? "rating"
          : "new",
    );
    setLength(
      ["all", "short", "medium", "long"].includes(params.get("length") || "")
        ? params.get("length")!
        : "all",
    );
    setUpdated(
      ["all", "1", "7", "30"].includes(params.get("updated") || "")
        ? params.get("updated")!
        : "all",
    );
    setPage(1);
    setFiltersReady(filterKey);
  }, [filterKey, initialGenre, ranking]);
  useEffect(() => {
    if (filtersReady !== filterKey) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        genre,
        status,
        sort,
        length,
        updated,
      });
      if (query.trim()) params.set("q", query.trim());
      try {
        localStorage.setItem(filterKey, params.toString());
      } catch {}
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${params}${window.location.hash}`,
      );
    }, 300);
    setPage(1);
    return () => clearTimeout(timer);
  }, [query, genre, status, sort, length, updated, filtersReady, filterKey]);

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
      normalizeSearch(`${s.title} ${s.penName}`).includes(
        normalizeSearch(query.trim()),
      ),
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
          {filtered.slice((page - 1) * 12, page * 12).map((s) => (
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
      {filtered.length > 12 && (
        <nav className="pagination" aria-label="Phân trang thư viện">
          <button
            className="btn secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </button>
          <span aria-live="polite">
            Trang {page} / {Math.ceil(filtered.length / 12)}
          </span>
          <button
            className="btn secondary"
            disabled={page >= Math.ceil(filtered.length / 12)}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </button>
        </nav>
      )}
    </main>
  );
}
