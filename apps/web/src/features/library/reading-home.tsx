"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";
import { StoryCard } from "../catalog/story-card";
import { type Story } from "../../lib/types";

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
