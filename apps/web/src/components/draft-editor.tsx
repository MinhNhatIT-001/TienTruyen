"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApp } from "./shell";
type Draft = {
  revision: number;
  id: string;
  storyId: string;
  title: string;
  content: string;
  isFree: boolean;
  price: number;
  status: string;
  scheduledAt: string | null;
  updatedAt: string;
  error?: string;
};
export function DraftEditor({
  storyId,
  onPublished,
}: {
  storyId: string;
  onPublished: () => void;
}) {
  const { notify, user } = useApp();
  const [rows, setRows] = useState<Draft[]>([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [schedule, setSchedule] = useState(""),
    [recovery, setRecovery] = useState<Partial<Draft> | null>(null);
  const recoveryKey = (id: string) => `tt-draft-recovery:${user?.id}:${id}`;
  const current = useRef<Draft | null>(null),
    dirty = useRef(false),
    version = useRef(0),
    pending = useRef<Promise<Draft | null> | null>(null),
    blocked = useRef(false);
  const load = () =>
    api<Draft[]>(`/author/stories/${storyId}/drafts`).then(setRows);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    return () => {
      current.current = null;
    };
  }, [storyId]);
  function choose(value: Draft | null) {
    current.current = value;
    dirty.current = false;
    blocked.current = false;
    version.current = 0;
    setDraft(value);
    setError("");
    setSchedule("");
    setPreview(false);
    setRecovery(null);
    if (value) {
      try {
        const local = JSON.parse(
          localStorage.getItem(recoveryKey(value.id)) || "null",
        );
        if (
          local &&
          local.savedAt > Date.parse(value.updatedAt) &&
          (local.title !== value.title || local.content !== value.content)
        )
          setRecovery(local);
      } catch {}
    }
  }
  function change(values: Partial<Draft>) {
    if (!current.current) return;
    const next = { ...current.current, ...values };
    current.current = next;
    version.current++;
    dirty.current = true;
    try {
      localStorage.setItem(
        recoveryKey(next.id),
        JSON.stringify({
          title: next.title,
          content: next.content,
          isFree: next.isFree,
          price: next.price,
          savedAt: Date.now(),
        }),
      );
    } catch {}
    setDraft(next);
  }
  async function persist(
    scheduledAt: string | null = null,
  ): Promise<Draft | null> {
    if (pending.current) {
      await pending.current;
      return persist(scheduledAt);
    }
    const value = current.current;
    if (!value) return null;
    if (blocked.current)
      throw new Error("Nháp có xung đột. Hãy tải lại trước khi tiếp tục.");
    const savedVersion = version.current;
    setSaving(true);
    const request = api<Draft>(`/author/drafts/${value.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: value.title,
        content: value.content,
        isFree: value.isFree,
        price: value.price,
        scheduledAt,
        expectedUpdatedAt: value.updatedAt,
        expectedRevision: value.revision,
      }),
    })
      .then((saved) => {
        if (current.current?.id === saved.id) {
          const next =
            version.current === savedVersion
              ? saved
              : {
                  ...current.current,
                  updatedAt: saved.updatedAt,
                  revision: saved.revision,
                  status: saved.status,
                  scheduledAt: saved.scheduledAt,
                };
          current.current = next;
          setDraft(next);
          dirty.current = version.current !== savedVersion;
          if (!dirty.current) {
            try {
              localStorage.removeItem(recoveryKey(saved.id));
            } catch {}
          }
          setRows((r) => r.map((x) => (x.id === saved.id ? saved : x)));
          setError("");
        }
        return saved;
      })
      .catch((e) => {
        if (e instanceof ApiError && [403, 404, 409].includes(e.status))
          blocked.current = true;
        setError(e.message);
        throw e;
      })
      .finally(() => {
        pending.current = null;
        setSaving(false);
      });
    pending.current = request;
    return request;
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (dirty.current && !pending.current && !blocked.current)
        void persist().catch(() => {});
    }, 2000);
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  const words = draft?.content.trim().split(/\s+/).filter(Boolean).length || 0;
  return (
    <section className="draft-workspace">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BÀN VIẾT CỦA BẠN</span>
          <h2>Nháp & lịch xuất bản</h2>
        </div>
        <button
          className="btn primary"
          disabled={busy || saving}
          onClick={async () => {
            setBusy(true);
            try {
              if (dirty.current) await persist();
              const d = await api<Draft>(`/author/stories/${storyId}/drafts`, {
                method: "POST",
              });
              choose(d);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          + Bản nháp mới
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="draft-layout">
        <aside className="draft-list">
          {rows.map((d) => (
            <button
              key={d.id}
              type="button"
              className={draft?.id === d.id ? "selected" : ""}
              disabled={busy || saving}
              onClick={async () => {
                try {
                  if (dirty.current) await persist();
                  choose(d);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <strong>{d.title || "Chương chưa đặt tên"}</strong>
              <span>
                {(
                  {
                    DRAFT: "Bản nháp",
                    SCHEDULED: "Đã hẹn giờ",
                    FAILED: "Cần điều chỉnh",
                  } as Record<string, string>
                )[d.status] || d.status}
              </span>
              {d.scheduledAt && (
                <small>{new Date(d.scheduledAt).toLocaleString("vi-VN")}</small>
              )}
            </button>
          ))}
          {!rows.length && <p>Những chương đang viết sẽ nằm ở đây.</p>}
        </aside>
        {draft ? (
          <div className="panel draft-content">
            <div className="draft-status" role="status">
              {saving
                ? "Đang lưu nháp…"
                : dirty.current
                  ? "Có thay đổi chưa lưu"
                  : "Đã lưu trên tài khoản"}{" "}
              · {words.toLocaleString("vi-VN")} chữ
            </div>
            {draft.scheduledAt && (
              <p className="notice">
                Đủ điều kiện đăng từ{" "}
                {new Date(draft.scheduledAt).toLocaleString("vi-VN")}. Vercel
                Hobby xử lý lịch một lần mỗi ngày, có thể trễ tới 24 giờ. Chỉnh
                nội dung sẽ tự chuyển về nháp và bỏ lịch cũ.
              </p>
            )}
            {draft.error && (
              <p className="error">Không đăng được chương: {draft.error}</p>
            )}
            {recovery && (
              <div className="notice draft-recovery" role="status">
                <p>Có nội dung chưa lưu từ phiên trước trên trình duyệt này.</p>
                <button
                  className="btn secondary"
                  disabled={busy || saving}
                  onClick={() => {
                    change({
                      title: String(recovery.title || ""),
                      content: String(recovery.content || ""),
                      isFree: recovery.isFree ?? draft.isFree,
                      price: recovery.price ?? draft.price,
                    });
                    setRecovery(null);
                  }}
                >
                  Khôi phục nội dung
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(recoveryKey(draft.id));
                    } catch {}
                    setRecovery(null);
                  }}
                >
                  Giữ bản trên tài khoản
                </button>
              </div>
            )}
            <label className="field">
              Tên chương
              <input
                value={draft.title}
                maxLength={150}
                disabled={busy}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <div className="draft-toolbar">
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const value = current.current;
                  if (!value) return;
                  const url = URL.createObjectURL(
                    new Blob([value.title + "\n\n" + value.content], {
                      type: "text/plain;charset=utf-8",
                    }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `nhap-${value.id}.txt`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Tải nháp về máy
              </button>
              <button
                className="btn secondary"
                onClick={() => setPreview(!preview)}
              >
                {preview ? "Trở về soạn thảo" : "Xem trước trang đọc"}
              </button>
              <button
                className="text-button"
                disabled={saving || busy}
                onClick={async () => {
                  if (
                    dirty.current &&
                    !window.confirm(
                      "Bỏ thay đổi chưa lưu và tải nháp từ server?",
                    )
                  )
                    return;
                  try {
                    const list = await api<Draft[]>(
                      `/author/stories/${storyId}/drafts`,
                    );
                    setRows(list);
                    choose(list.find((d) => d.id === draft.id) || null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Tải lại nháp
              </button>
            </div>
            {preview ? (
              <article className="draft-preview">
                <h2>{draft.title || "Chương chưa đặt tên"}</h2>
                {draft.content.split(/\n\s*\n/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </article>
            ) : (
              <label className="field">
                Nội dung
                <textarea
                  className="editor-area"
                  value={draft.content}
                  maxLength={200000}
                  disabled={busy}
                  onChange={(e) => change({ content: e.target.value })}
                  placeholder="Viết câu chuyện của bạn… Nháp tự lưu mỗi 2 giây."
                />
              </label>
            )}
            <div className="form-columns">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.isFree}
                  disabled={busy}
                  onChange={(e) => change({ isFree: e.target.checked })}
                />
                Miễn phí
              </label>
              <label className="field">
                Giá (HN)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.price}
                  disabled={draft.isFree || busy}
                  onChange={(e) => change({ price: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="form-caption">
              Chương xuất bản phải có ít nhất 100 ký tự. Chính sách chương miễn
              phí và giá được kiểm tra khi đăng.
            </p>
            <div className="draft-publish">
              <label className="field">
                Đăng từ ngày giờ (giờ trên máy bạn)
                <input
                  type="datetime-local"
                  value={schedule}
                  disabled={busy || saving}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </label>
              <div className="row-actions">
                <button
                  className="btn secondary"
                  disabled={busy || saving}
                  onClick={() => void persist().catch(() => {})}
                >
                  Lưu nháp / bỏ lịch
                </button>
                <button
                  className="btn secondary"
                  disabled={!schedule || busy || saving}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await persist(new Date(schedule).toISOString());
                      notify("Đã hẹn giờ đăng chương.");
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Hẹn giờ đăng
                </button>
                <button
                  className="btn primary"
                  disabled={busy || saving}
                  onClick={async () => {
                    if (!window.confirm("Xuất bản chương này ngay?")) return;
                    setBusy(true);
                    try {
                      await persist();
                      await api(`/author/drafts/${draft.id}/publish`, {
                        method: "POST",
                      });
                      choose(null);
                      await load();
                      onPublished();
                      notify("Chương đã được xuất bản.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Xuất bản ngay
                </button>
                <button
                  className="text-button"
                  disabled={busy || saving}
                  onClick={async () => {
                    if (!window.confirm("Xóa bản nháp này?")) return;
                    setBusy(true);
                    try {
                      await api(`/author/drafts/${draft.id}`, {
                        method: "DELETE",
                      });
                      choose(null);
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Xóa nháp
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel">
            <h3>Một trang giấy dành cho bạn</h3>
            <p>
              Chọn nháp đang viết hoặc tạo nháp mới. Nội dung tự lưu trên tài
              khoản, có thể tiếp tục từ thiết bị khác.
            </p>
            <p>
              Trên Vercel Hobby, lịch đăng được xử lý trong lượt chạy hằng ngày
              khoảng 09:00–10:00 (giờ Việt Nam). Chương đến hạn sau lượt chạy sẽ
              đăng trong lượt kế tiếp. Dùng “Xuất bản ngay” nếu cần đăng chính
              xác lúc này.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
