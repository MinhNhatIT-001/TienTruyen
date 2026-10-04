"use client";
import Link from "next/link";

import { StoryReadingActions } from "../library/story-reading-actions";
import { BatchUnlock } from "../wallet/batch-unlock";
import { StoryComments } from "../community/comments";
import { useEffect, useState } from "react";
import {
  Bookmark,
  BookOpen,
  Check,
  ChevronRight,
  List,
  Lock,
  Star,
  Flag,
} from "lucide-react";
import { Cover } from "../catalog/cover";
import { useCatalog } from "../catalog/use-catalog";
import { useApp, Empty } from "../../components/layout/app-shell";
import { api } from "../../lib/api";

import type { Chapter, PublicStory } from "../reader/types";
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
