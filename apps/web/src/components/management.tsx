"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp, Empty } from "./shell";
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
export function ConfigPage() {
  const { user, notify } = useApp();
  const [config, setConfig] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (user?.roles.includes("ADMIN"))
      api("/config")
        .then(setConfig)
        .catch((e) => setError(e.message));
  }, [user]);
  if (!user?.roles.includes("ADMIN"))
    return (
      <Empty
        title="Cần quyền quản trị"
        text="Đăng nhập bằng tài khoản quản trị để chỉnh cấu hình."
      />
    );
  return (
    <main className="container page">
      <div className="page-intro">
        <h1>Cấu hình nền tảng</h1>
        <p>
          Thay đổi áp dụng cho giao dịch mới; tỷ lệ đã ghi nhận trong giao dịch
          cũ được giữ nguyên.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {config && (
        <form
          className="standard-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/admin/config", {
                method: "PUT",
                body: JSON.stringify(config),
              });
              notify("Đã lưu cấu hình nền tảng.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="form-columns">
            {[
              ["exchangeRate", "VNĐ cho mỗi Hồng Ngọc"],
              ["minFreeChapters", "Số chương đầu miễn phí"],
              ["minPrice", "Giá chương tối thiểu (HN)"],
              ["defaultPrice", "Giá gợi ý (HN)"],
              ["minimumPayoutVnd", "Rút tối thiểu (VNĐ)"],
            ].map(([key, label]) => (
              <label key={key} className="field">
                {label}
                <input
                  type="number"
                  required
                  min="1"
                  value={config[key]}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <h2>Các gói nạp</h2>
          {config.packages.map((p: any, i: number) => (
            <div className="panel form-columns" key={i}>
              {[
                ["name", "Tên gói"],
                ["amount", "Tiền nạp (VNĐ)"],
                ["base", "HN cơ bản"],
                ["bonus", "HN thưởng"],
              ].map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type={key === "name" ? "text" : "number"}
                    value={p[key]}
                    required
                    min="0"
                    onChange={(e) => {
                      const packages = [...config.packages];
                      packages[i] = {
                        ...p,
                        [key]:
                          key === "name"
                            ? e.target.value
                            : Number(e.target.value),
                      };
                      setConfig({ ...config, packages });
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
          {[
            [
              "readerLevels",
              "Cảnh giới độc giả",
              ["Danh hiệu", "Tổng nạp (VNĐ)", "Thưởng thêm (%)"],
            ],
            [
              "authorLevels",
              "Cấp tác giả",
              [
                "Danh hiệu",
                "Số chương",
                "Giá tối đa (HN)",
                "Truyện song song",
                "Doanh thu (%)",
              ],
            ],
          ].map(([key, title, labels]: any) => (
            <section key={key}>
              <h2>{title}</h2>
              {config[key].map((row: any[], i: number) => (
                <div
                  className="panel form-columns"
                  key={i}
                  style={{ marginTop: 12 }}
                >
                  {labels.map((label: string, j: number) => (
                    <label className="field" key={label}>
                      {label}
                      <input
                        required
                        type={j ? "number" : "text"}
                        min="0"
                        value={row[j]}
                        onChange={(e) => {
                          const list = config[key].map((r: any[]) => [...r]);
                          list[i][j] = j
                            ? Number(e.target.value)
                            : e.target.value;
                          setConfig({ ...config, [key]: list });
                        }}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </section>
          ))}
          <button className="btn primary">Lưu cấu hình</button>
        </form>
      )}
    </main>
  );
}

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
