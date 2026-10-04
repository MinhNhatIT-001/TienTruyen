"use client";
import Link from "next/link";

import { ReadingHome } from "../library/reading-home";
import { useState } from "react";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Star,
  TrendingUp,
  Search,
  ChevronRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import sample from "../../lib/catalog.json";
import { genres, format } from "../../lib/types";

import { Cover } from "./cover";
import { useCatalog } from "./use-catalog";
import { StoryCard } from "./story-card";
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
