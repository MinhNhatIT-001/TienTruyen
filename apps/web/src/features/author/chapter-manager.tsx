"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";
export function ChapterManager({ story }: { story: any }) {
  const { notify } = useApp();
  const [error, setError] = useState("");
  if (!story) return null;
  return (
    <section className="panel" style={{ marginTop: 30 }}>
      <h2>Quản lý các chương đã đăng</h2>
      <form
        className="standard-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await api(`/author/stories/${story.id}/prices`, {
              method: "PUT",
              body: JSON.stringify({
                from: Number(f.get("from")),
                to: Number(f.get("to")),
                isFree: f.get("free") === "on",
                price: Number(f.get("price")),
              }),
            });
            notify(`Đã cập nhật ${r.count} chương.`);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <div className="form-columns">
          <label className="field">
            Từ chương
            <input
              name="from"
              type="number"
              min="1"
              defaultValue="6"
              required
            />
          </label>
          <label className="field">
            Đến chương
            <input
              name="to"
              type="number"
              min="1"
              defaultValue={Math.max(6, story.chapters.length)}
              required
            />
          </label>
          <label className="field">
            Giá (HN)
            <input
              name="price"
              type="number"
              min="5"
              max="100"
              defaultValue="20"
              required
            />
          </label>
          <label className="checkbox">
            <input name="free" type="checkbox" />
            Chuyển sang miễn phí
          </label>
        </div>
        <p className="form-caption">
          Giá mới chỉ áp dụng cho lượt mua sau. Chuyển sang miễn phí không tự
          hoàn tiền người đã mua. Chương miễn phí quá 24 giờ không thể khóa.
        </p>
        <button className="btn secondary">Cập nhật giá hàng loạt</button>
        {error && <p className="error">{error}</p>}
      </form>
      <div className="data-list" style={{ marginTop: 25 }}>
        {story.chapters.map((c: any) => (
          <Link
            className="data-row"
            key={c.id}
            href={`/tac-gia/sua-chuong/${c.id}`}
          >
            <span>
              Chương {c.number} · {c.title}
            </span>
            <span>Sửa nội dung →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
