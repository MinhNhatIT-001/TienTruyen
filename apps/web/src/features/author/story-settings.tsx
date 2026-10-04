"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";
export function StorySettings({
  story,
  onUpdated,
}: {
  story: any;
  onUpdated: (s: any) => void;
}) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!story) return null;
  return (
    <details className="panel story-settings">
      <summary>Thông tin & tình trạng truyện</summary>
      <form
        className="standard-form"
        key={story.updatedAt}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const updated = await api(`/author/stories/${story.id}`, {
              method: "PUT",
              body: JSON.stringify({
                title: f.get("title"),
                description: f.get("description"),
                progress: f.get("progress"),
              }),
            });
            onUpdated(updated);
            notify("Đã cập nhật thông tin truyện.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Tên truyện
          <input
            name="title"
            defaultValue={story.title}
            required
            minLength={3}
            maxLength={120}
          />
        </label>
        <label className="field">
          Giới thiệu
          <textarea
            name="description"
            defaultValue={story.description}
            required
            minLength={30}
            maxLength={5000}
          />
        </label>
        <label className="field">
          Tình trạng
          <select name="progress" defaultValue={story.progress}>
            <option>Đang ra</option>
            <option>Hoàn thành</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu thông tin truyện"}
        </button>
      </form>
    </details>
  );
}
