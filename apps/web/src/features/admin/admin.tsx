"use client";
import Link from "next/link";

import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { useApp, Empty } from "../../components/layout/app-shell";
import { format } from "../../lib/types";
export function Admin({ path }: { path: string[] }) {
  const { user, notify } = useApp();
  const section =
    (
      {
        "ho-so-tac-gia": "applications",
        "duyet-truyen": "stories",
        "nguoi-dung": "users",
        "bao-cao": "reports",
        "giao-dich": "transactions",
        "nhat-ky": "audit",
        "rut-tien": "payouts",
        "luot-mua": "purchases",
        "don-nap": "topups",
      } as Record<string, string>
    )[path[1]] || "applications";
  const [rows, setRows] = useState<any[]>([]),
    [summary, setSummary] = useState<Record<string, number> | null>(null),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api<any[]>(`/admin/${section}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    let active = true;
    setRows([]);
    setError("");
    setQuery("");
    if (user?.roles.includes("ADMIN")) {
      setLoading(true);
      api<any[]>(`/admin/${section}`)
        .then((data) => {
          if (active) setRows(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      api<Record<string, number>>("/admin/summary")
        .then((data) => {
          if (active) setSummary(data);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [user?.id, section]);
  const filteredRows = rows.filter((row) =>
    JSON.stringify([
      row.title,
      row.penName,
      row.name,
      row.email,
      row.id,
      row.action,
      row.type,
    ])
      .toLocaleLowerCase("vi")
      .includes(query.toLocaleLowerCase("vi")),
  );
  async function review(id: string, approve: boolean) {
    const reason = approve ? undefined : window.prompt("Lý do từ chối:");
    if (!approve && !reason) return;
    try {
      await api("/admin/review", {
        method: "POST",
        body: JSON.stringify({
          kind: section === "applications" ? "application" : "story",
          id,
          approve,
          reason,
        }),
      });
      notify("Đã cập nhật kết quả duyệt.");
      void load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">BAN BIÊN TẬP</span>
        <h1>Quản trị Tiên Truyện</h1>
        <p>Duyệt nội dung và theo dõi hoạt động của nền tảng.</p>
      </div>
      {!user?.roles.includes("ADMIN") ? (
        <Empty
          title="Khu vực quản trị"
          text="Bạn cần tài khoản có quyền quản trị để truy cập."
        />
      ) : (
        <>
          {summary && (
            <div className="admin-overview">
              {[
                ["applications", "Hồ sơ chờ duyệt", "ho-so-tac-gia"],
                ["stories", "Truyện chờ duyệt", "duyet-truyen"],
                ["reports", "Báo cáo nội dung", "bao-cao"],
                ["topups", "Đơn cần đối soát", "don-nap"],
              ].map(([key, label, href]) => (
                <Link key={key} className="panel" href={`/admin/${href}`}>
                  <span>{label}</span>
                  <strong>{summary[key]}</strong>
                </Link>
              ))}
            </div>
          )}
          <nav className="dashboard-nav">
            {[
              ["ho-so-tac-gia", "Hồ sơ tác giả"],
              ["duyet-truyen", "Duyệt truyện"],
              ["nguoi-dung", "Người dùng"],
              ["bao-cao", "Báo cáo"],
              ["giao-dich", "Giao dịch"],
              ["nhat-ky", "Nhật ký"],
              ["rut-tien", "Rút tiền"],
              ["luot-mua", "Hoàn tiền"],
              ["don-nap", "Đơn nạp cần kiểm tra"],
              ["cau-hinh", "Cấu hình"],
            ].map(([href, label]) => (
              <Link
                key={href}
                className={
                  path[1] === href || (!path[1] && href === "ho-so-tac-gia")
                    ? "active"
                    : ""
                }
                aria-current={path[1] === href ? "page" : undefined}
                href={`/admin/${href}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {error && <p className="error">{error}</p>}
          <label className="library-search field">
            Tìm trong danh sách
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tên, email hoặc mã…"
            />
          </label>
          {loading ? (
            <p role="status">Đang tải danh sách…</p>
          ) : filteredRows.length ? (
            <div className="data-list">
              {filteredRows.map((r) => (
                <div className="data-row" key={r.id}>
                  <div>
                    <h3>
                      {r.title ||
                        r.penName ||
                        r.name ||
                        r.action ||
                        r.type ||
                        r.targetId ||
                        r.id}
                    </h3>
                    <p>
                      {r.email || r.bio || r.description || r.reason || r.id}
                    </p>
                    {r.context && (
                      <div className="moderation-context">
                        <strong>{r.context.title}</strong>
                        <p>{r.context.content}</p>
                        {r.context.slug && (
                          <Link
                            className="more-link"
                            href={`/truyen/${r.context.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Mở truyện →
                          </Link>
                        )}
                      </div>
                    )}
                    {r.sampleText && (
                      <details>
                        <summary>Đọc văn mẫu</summary>
                        <p style={{ whiteSpace: "pre-wrap" }}>{r.sampleText}</p>
                      </details>
                    )}
                    {r.amount !== undefined && <p>{format(r.amount)} HN</p>}
                  </div>
                  {section === "reports" && (
                    <div className="row-actions">
                      <button
                        className="btn secondary"
                        onClick={async () => {
                          try {
                            await api(`/admin/reports/${r.id}`, {
                              method: "POST",
                              body: JSON.stringify({ remove: false }),
                            });
                            void load();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Bỏ qua
                      </button>
                      <button
                        className="btn primary"
                        onClick={async () => {
                          try {
                            await api(`/admin/reports/${r.id}`, {
                              method: "POST",
                              body: JSON.stringify({ remove: true }),
                            });
                            void load();
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Ẩn nội dung vi phạm
                      </button>
                    </div>
                  )}
                  {section === "topups" && (
                    <div>
                      <p>
                        {r.reviewReason} · Đơn {format(r.amountVnd)}đ · Đã nhận{" "}
                        {format(r.receivedVnd || 0)}đ
                      </p>
                      <div className="row-actions">
                        {(["CREDIT", "REFUNDED"] as const).map((action) => (
                          <button
                            key={action}
                            className="btn secondary"
                            onClick={async () => {
                              const note = window.prompt(
                                action === "CREDIT"
                                  ? "Ghi chú đối soát (chỉ cộng khi payOS xác nhận đúng đủ tiền):"
                                  : "Chỉ xác nhận sau khi đã hoàn tiền qua ngân hàng. Nhập mã giao dịch/ghi chú hoàn tiền:",
                              );
                              if (!note) return;
                              try {
                                await api(`/admin/topups/${r.id}`, {
                                  method: "POST",
                                  body: JSON.stringify({ action, note }),
                                });
                                void load();
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            {action === "CREDIT"
                              ? "Đối soát và cộng ví"
                              : "Xác nhận đã hoàn tiền"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {section === "payouts" && (
                    <button
                      className="btn primary"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Chỉ xác nhận khi đã chuyển khoản thủ công thành công. Bạn đã chi trả?",
                          )
                        )
                          return;
                        try {
                          await api(`/admin/payouts/${r.id}`, {
                            method: "POST",
                            body: JSON.stringify({ approve: true }),
                          });
                          void load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Đã chi trả
                    </button>
                  )}
                  {section === "purchases" && (
                    <button
                      className="btn secondary"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Hoàn lại Hồng Ngọc cho độc giả? Quyền đọc vẫn được giữ.",
                          )
                        )
                          return;
                        try {
                          await api(`/admin/refunds/${r.id}`, {
                            method: "POST",
                          });
                          notify("Đã hoàn Hồng Ngọc.");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Hoàn {r.pricePaid} HN
                    </button>
                  )}
                  {["applications", "stories"].includes(section) && (
                    <div className="row-actions">
                      <button
                        className="btn primary"
                        onClick={() => review(r.id, true)}
                      >
                        Duyệt
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => review(r.id, false)}
                      >
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h2>Không có mục chờ xử lý</h2>
              <p>Các yêu cầu mới sẽ xuất hiện tại đây.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
