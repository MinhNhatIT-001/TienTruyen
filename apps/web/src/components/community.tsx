"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "./shell";
export function StoryComments({
  storyId,
  slug,
  initialComments = [],
}: {
  storyId: string;
  slug: string;
  initialComments?: any[];
}) {
  const { user, notify } = useApp();
  const [rows, setRows] = useState(initialComments),
    [text, setText] = useState(""),
    [reply, setReply] = useState<{ id: string; name: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const r = await api<{ comments: any[] }>(`/stories/${slug}`);
    setRows(r.comments);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [slug]);
  const roots = rows.filter((r) => !r.parentId),
    children = (id: string) => rows.filter((r) => r.parentId === id);
  async function report(id: string) {
    const reason = window.prompt(
      "Mô tả vấn đề với bình luận này (ít nhất 10 ký tự):",
    );
    if (!reason) return;
    try {
      await api("/reports", {
        method: "POST",
        body: JSON.stringify({ targetId: id, reason }),
      });
      notify("Đã gửi báo cáo.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function comment(c: any, nested = false) {
    return (
      <article
        className={`comment ${nested ? "comment-reply" : ""}`}
        key={c.id}
      >
        <div className="comment-author">
          <img
            src={c.user.avatar || "/avatars/avatar-01.webp"}
            alt=""
            width={32}
            height={32}
          />
          <strong>{c.user.name}</strong>
          <time>{new Date(c.createdAt).toLocaleDateString("vi-VN")}</time>
        </div>
        <p>{c.content}</p>
        {user && (
          <div className="comment-actions">
            {!nested && (
              <button
                className="text-button"
                onClick={() => {
                  setReply({ id: c.id, name: c.user.name });
                  document
                    .querySelector<HTMLTextAreaElement>(".comments textarea")
                    ?.focus();
                }}
              >
                Trả lời
              </button>
            )}
            <button className="text-button" onClick={() => void report(c.id)}>
              Báo cáo
            </button>
            {(user.id === c.user.id || user.roles.includes("ADMIN")) && (
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Ẩn bình luận này cùng các câu trả lời?"))
                    return;
                  setBusy(true);
                  try {
                    await api(`/comments/${c.id}`, { method: "DELETE" });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Ẩn bình luận
              </button>
            )}
          </div>
        )}
        {!nested && children(c.id).map((r) => comment(r, true))}
      </article>
    );
  }
  return (
    <section className="comments">
      <h2>Cùng trò chuyện về câu chuyện</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {user ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`/stories/${storyId}/comments`, {
                method: "POST",
                body: JSON.stringify({
                  content: text,
                  ...(reply ? { parentId: reply.id } : {}),
                }),
              });
              setText("");
              setReply(null);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {reply && (
            <p className="notice">
              Đang trả lời {reply.name}{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => setReply(null)}
              >
                Hủy trả lời
              </button>
            </p>
          )}
          <textarea
            aria-label="Nội dung bình luận"
            required
            minLength={1}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Chia sẻ cảm nhận của bạn…"
          />
          <button className="btn primary" disabled={busy || !text.trim()}>
            {busy ? "Đang gửi…" : "Gửi bình luận"}
          </button>
        </form>
      ) : (
        <p>
          <Link href="/dang-nhap">Đăng nhập</Link> để chia sẻ cảm nhận.
        </p>
      )}
      {roots.length ? (
        roots.map((c) => comment(c))
      ) : (
        <p className="muted">
          Chưa có bình luận. Hãy là người đầu tiên mở lời.
        </p>
      )}
    </section>
  );
}
