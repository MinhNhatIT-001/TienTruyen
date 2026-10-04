"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { useApp, Empty } from "../../components/layout/app-shell";

import { format } from "../../lib/types";

export function PurchasesPage() {
  const { user, ready } = useApp();
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api<any[]>("/purchases")
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [user?.id]);
  return (
    <main className="container page">
      <div className="page-intro">
        <h1>Các chương đã mua</h1>
        <p>Giá đã thanh toán được giữ lại trong lịch sử của bạn.</p>
      </div>
      <nav className="dashboard-nav">
        <Link href="/tu-truyen">Tủ truyện</Link>
        <Link className="active" href="/chuong-da-mua">
          Chương đã mua
        </Link>
        <Link href="/lich-su-giao-dich">Lịch sử Hồng Ngọc</Link>
      </nav>
      {error && <p className="error">{error}</p>}
      {!ready ? (
        <p>Đang tải…</p>
      ) : !user ? (
        <Empty
          title="Đăng nhập để xem các chương đã mua"
          text="Chương được mở khóa gắn với tài khoản của bạn."
        />
      ) : (
        <div className="data-list">
          {rows.map((r) => (
            <Link
              key={r.id}
              className="data-row"
              href={`/truyen/${r.chapter.story.slug}/${r.chapter.number}`}
            >
              <div>
                <h3>
                  {r.chapter.story.title} · Chương {r.chapter.number}
                </h3>
                <p>
                  {r.chapter.title} ·{" "}
                  {new Date(r.createdAt).toLocaleString("vi-VN")}
                </p>
              </div>
              <strong>{format(r.pricePaid)} HN</strong>
            </Link>
          ))}
          {!rows.length && (
            <Empty
              title="Chưa có chương đã mua"
              text="Bạn có thể đọc chương miễn phí và mở khóa những chương tiếp theo."
              href="/the-loai/tat-ca"
              label="Khám phá"
            />
          )}
        </div>
      )}
    </main>
  );
}
