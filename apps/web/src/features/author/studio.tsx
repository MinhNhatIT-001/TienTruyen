"use client";
import Link from "next/link";
import { DraftEditor } from "./draft-editor";
import { useEffect, useState } from "react";
import { ArrowRight, Feather } from "lucide-react";
import { ChapterManager } from "./chapter-manager";
import { StorySettings } from "./story-settings";
import { api } from "../../lib/api";
import { useApp, Empty } from "../../components/layout/app-shell";
import { format } from "../../lib/types";
export function Studio({ path }: { path: string[] }) {
  const { user, notify } = useApp();
  const [rows, setRows] = useState<any[]>([]),
    [story, setStory] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [earnings, setEarnings] = useState<any>(null);
  const isNew = path[1] === "truyen-moi",
    isChapter = path[1] === "truyen" && path[2],
    isRevenue = path[1] === "doanh-thu" || path[1] === "cap-bac";
  useEffect(() => {
    if (user?.roles.includes("AUTHOR")) {
      if (isChapter)
        api(`/author/stories/${path[2]}`)
          .then(setStory)
          .catch((e) => setError(e.message));
      else if (isRevenue)
        api("/author/earnings")
          .then(setEarnings)
          .catch((e) => setError(e.message));
      else
        api<any[]>("/author/stats")
          .then(setRows)
          .catch((e) => setError(e.message));
    }
  }, [user, isChapter, isRevenue, path[2]]);
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">KHÔNG GIAN SÁNG TÁC</span>
        <h1>
          {isNew
            ? "Tạo truyện mới"
            : isChapter
              ? "Bàn viết"
              : isRevenue
                ? "Doanh thu & cấp bậc"
                : "Truyện của tôi"}
        </h1>
        <p>Quản lý truyện, bản nháp và lịch đăng chương.</p>
      </div>
      <nav className="dashboard-nav">
        <Link className={!isNew && !isRevenue ? "active" : ""} href="/tac-gia">
          Truyện của tôi
        </Link>
        <Link className={isNew ? "active" : ""} href="/tac-gia/truyen-moi">
          Tạo truyện mới
        </Link>
        <Link className={isRevenue ? "active" : ""} href="/tac-gia/doanh-thu">
          Doanh thu & cấp bậc
        </Link>
      </nav>
      {!user?.roles.includes("AUTHOR") ? (
        <Empty
          title="Cánh cửa dành cho tác giả"
          text="Bạn cần hồ sơ tác giả được duyệt để bắt đầu đăng truyện."
          href="/tro-thanh-tac-gia"
          label="Gửi hồ sơ tác giả"
        />
      ) : (
        <>
          {error && <p className="error">{error}</p>}
          {!isNew && !isChapter && !isRevenue && rows.length > 0 && (
            <div className="studio-metrics">
              <div>
                Truyện đang quản lý<strong>{rows.length}</strong>
              </div>
              <div>
                Độc giả đã đọc
                <strong>
                  {format(rows.reduce((n, s) => n + (s.readers || 0), 0))}
                </strong>
              </div>
              <div>
                Lượt mua chương
                <strong>
                  {format(rows.reduce((n, s) => n + (s.sales || 0), 0))}
                </strong>
              </div>
              <div>
                Doanh thu sau hoàn tiền
                <strong>
                  {format(rows.reduce((n, s) => n + (s.revenue || 0), 0))} HN
                </strong>
              </div>
            </div>
          )}

          {isChapter ? (
            <DraftEditor
              key={String(path[2])}
              storyId={String(path[2])}
              onPublished={() => {
                void api(`/author/stories/${path[2]}`)
                  .then(setStory)
                  .catch((e) => setError(e.message));
              }}
            />
          ) : isNew ? (
            <form
              className="standard-form narrow-page"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                const d = new FormData(e.currentTarget),
                  form = e.currentTarget;
                try {
                  const body = isNew
                    ? {
                        title: d.get("title"),
                        description: d.get("description"),
                        genre: d.get("genre"),
                        cover: d.get("cover"),
                      }
                    : {
                        title: d.get("title"),
                        content: d.get("content"),
                        isFree: d.get("free") === "on",
                        price: Number(d.get("price") || 0),
                      };
                  await api(
                    isNew
                      ? "/author/stories"
                      : `/author/stories/${path[2]}/chapters`,
                    { method: "POST", body: JSON.stringify(body) },
                  );
                  notify(
                    isNew
                      ? "Đã gửi truyện để ban biên tập duyệt."
                      : "Chương mới đã được xuất bản.",
                  );
                  form.reset();
                  if (isChapter)
                    setStory(await api(`/author/stories/${path[2]}`));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {isChapter && (
                <div className="notice">
                  {story?.title} · {story?.chapters?.length || 0} chương. Truyện
                  phải được duyệt trước khi xuất bản chương.
                </div>
              )}
              <label className="field">
                {isNew ? "Tên truyện" : "Tên chương"}
                <input name="title" required minLength={3} maxLength={120} />
              </label>
              {isNew ? (
                <>
                  <div className="form-columns">
                    <label className="field">
                      Thể loại
                      <select name="genre">
                        {[
                          "Tiên hiệp",
                          "Kiếm hiệp",
                          "Huyền huyễn",
                          "Cổ đại",
                          "Ngôn tình",
                          "Đô thị",
                        ].map((g) => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Bìa minh họa
                      <select name="cover">
                        <option value="jade">Sơn thủy · Xanh ngọc</option>
                        <option value="ink">Giang hồ · Mực xanh</option>
                        <option value="rose">Cố sự · Hồng phấn</option>
                        <option value="violet">Tinh hà · Tím đêm</option>
                        <option value="amber">Trường An · Vàng đồng</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    Giới thiệu truyện
                    <textarea
                      name="description"
                      required
                      minLength={30}
                      maxLength={5000}
                      className="editor-area"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    Nội dung chương
                    <textarea
                      name="content"
                      required
                      minLength={100}
                      maxLength={200000}
                      className="editor-area"
                    />
                  </label>
                  <div className="form-columns">
                    <label className="checkbox">
                      <input type="checkbox" name="free" defaultChecked />
                      Chương miễn phí
                    </label>
                    <label className="field">
                      Giá khi khóa (HN)
                      <input
                        type="number"
                        name="price"
                        min="5"
                        max="100"
                        defaultValue="20"
                      />
                    </label>
                  </div>
                  <p className="form-caption">
                    5 chương đầu phải miễn phí. Chương từ 1.000 chữ mới đủ điều
                    kiện tính cấp; tối đa 5 chương/ngày, không tính nội dung
                    trùng.
                  </p>
                </>
              )}
              <button className="btn primary" disabled={busy}>
                {busy
                  ? "Đang lưu…"
                  : isNew
                    ? "Gửi truyện để duyệt"
                    : "Xuất bản chương"}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : isRevenue ? (
            <div className="account-grid">
              <div className="panel">
                <h2>Doanh thu khả dụng</h2>
                <p>{format(earnings?.total || 0)} HN</p>
                <p>
                  Rút toàn bộ doanh thu khả dụng, tối thiểu theo cấu hình nền
                  tảng. Ban quản trị xác nhận chi trả thủ công.
                </p>
                <button
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await api("/author/payouts", { method: "POST" });
                      setEarnings(await api("/author/earnings"));
                      notify("Đã gửi yêu cầu rút tiền.");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Yêu cầu rút doanh thu
                </button>
              </div>
              <div className="panel">
                <h2>{earnings?.tier?.[0] || "Đang tải…"}</h2>
                <p>Tỷ lệ doanh thu: {earnings?.tier?.[4] || 70}%</p>
                <p>Giá chương tối đa: {earnings?.tier?.[2] || 20} HN</p>
              </div>
            </div>
          ) : rows.length ? (
            <div className="data-list">
              {rows.map((s) => (
                <div className="data-row" key={s.id}>
                  <div>
                    <h3>{s.title}</h3>
                    <p>
                      {s._count.chapters} chương · {s.readers || 0} độc giả ·{" "}
                      {s.sales || 0} lượt mua · {format(s.revenue || 0)} HN
                      doanh thu ·{" "}
                      {{
                        PENDING: "Chờ duyệt",
                        APPROVED: "Đã duyệt",
                        REJECTED: "Bị từ chối",
                      }[s.status as string] || s.status}
                    </p>
                    {s.rejectReason && (
                      <p className="error">{s.rejectReason}</p>
                    )}
                  </div>
                  <Link
                    className="btn secondary"
                    href={`/tac-gia/truyen/${s.id}`}
                  >
                    <Feather size={14} />
                    Viết chương
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Trang giấy đầu tiên của bạn"
              text="Tạo truyện, gửi ban biên tập duyệt, rồi bắt đầu đăng chương."
              href="/tac-gia/truyen-moi"
              label="Tạo truyện mới"
            />
          )}
          {isRevenue && earnings?.rows?.length > 0 && (
            <section className="panel" style={{ marginTop: 24 }}>
              <h2>Lịch sử doanh thu</h2>
              <div className="data-list">
                {earnings.rows.map((r: any) => (
                  <div className="data-row" key={r.id}>
                    <div>
                      <h3>{format(r.amount)} HN</h3>
                      <p>{new Date(r.createdAt).toLocaleString("vi-VN")}</p>
                    </div>
                    <span>
                      {(
                        {
                          AVAILABLE: "Khả dụng",
                          RESERVED: "Đang chờ chi trả",
                          PAID: "Đã chi trả",
                          REFUNDED: "Đã hoàn tiền",
                        } as Record<string, string>
                      )[r.status] || r.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {isChapter && (
            <StorySettings
              story={story}
              onUpdated={(updated) =>
                setStory((s: any) => ({ ...s, ...updated }))
              }
            />
          )}
          {isChapter && <ChapterManager story={story} />}
        </>
      )}
    </main>
  );
}
