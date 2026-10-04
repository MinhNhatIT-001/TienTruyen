"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";
export function ChapterEdit({ id }: { id: string }) {
  const [chapter, setChapter] = useState<any>(null),
    [error, setError] = useState("");
  const { notify } = useApp();
  useEffect(() => {
    api(`/author/chapters/${id}`)
      .then(setChapter)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <h1>Chỉnh sửa chương</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {chapter && (
        <form
          className="standard-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await api(`/author/chapters/${id}`, {
                method: "PUT",
                body: JSON.stringify({
                  title: f.get("title"),
                  content: f.get("content"),
                }),
              });
              notify("Đã lưu nội dung chương.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label className="field">
            Tên chương
            <input
              name="title"
              required
              defaultValue={chapter.title}
              minLength={2}
              maxLength={150}
            />
          </label>
          <label className="field">
            Nội dung
            <textarea
              name="content"
              required
              minLength={100}
              maxLength={200000}
              defaultValue={chapter.content}
              className="editor-area"
            />
          </label>
          <button className="btn primary">Lưu thay đổi</button>
          <Link href={`/tac-gia/truyen/${chapter.storyId}`}>
            Về quản lý truyện →
          </Link>
        </form>
      )}
    </main>
  );
}
