"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../../lib/api";
import { useApp } from "../../components/layout/app-shell";

import { format } from "../../lib/types";
import type { Chapter } from "../reader/types";
export function BatchUnlock({
  slug,
  chapters,
  onOwnershipChange,
}: {
  slug: string;
  chapters: Chapter[];
  onOwnershipChange?: (ids: Set<string>) => void;
}) {
  const { user, refresh, notify } = useApp();
  const [owned, setOwned] = useState<Set<string>>(new Set()),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  async function load() {
    const rows = await api<{ chapterId: string }[]>(
      `/stories/${slug}/ownership`,
    );
    const ids = new Set(rows.map((r) => r.chapterId));
    setOwned(ids);
    onOwnershipChange?.(ids);
  }
  useEffect(() => {
    setSelected([]);
    setOwned(new Set());
    onOwnershipChange?.(new Set());
    if (user) void load().catch(() => {});
  }, [slug, user?.id]);
  const available = chapters.filter((c) => !c.isFree && !owned.has(c.id)),
    total = available
      .filter((c) => selected.includes(c.id))
      .reduce((n, c) => n + c.price, 0);
  if (!user || !available.length) return null;
  return (
    <section className="batch-unlock panel">
      <h2>Mở khóa nhiều chương</h2>
      <p>Chỉ tính các chương chưa mua. Tối đa 50 chương mỗi lần.</p>
      <details>
        <summary>Chọn chương · {selected.length} đã chọn</summary>
        <div className="batch-chapters">
          {available.map((c) => (
            <label className="checkbox" key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                disabled={
                  busy || (!selected.includes(c.id) && selected.length >= 50)
                }
                onChange={(e) => {
                  setConfirm(false);
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, c.id]
                      : s.filter((id) => id !== c.id),
                  );
                }}
              />
              Chương {c.number}: {c.title}
              <strong>{c.price} HN</strong>
            </label>
          ))}
        </div>
      </details>
      <p>
        Tổng <strong>{format(total)} HN</strong> · Số dư {format(user.balance)}{" "}
        HN
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="purchase-confirm">
          <p>
            Xác nhận mở {selected.length} chương với {format(total)} Hồng Ngọc?
          </p>
          <button
            className="btn primary"
            disabled={busy || total > user.balance}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/purchases/batch", {
                  method: "POST",
                  headers: { "Idempotency-Key": crypto.randomUUID() },
                  body: JSON.stringify({
                    chapterIds: selected,
                    expectedTotal: total,
                  }),
                });
                await refresh();
                await load();
                setSelected([]);
                setConfirm(false);
                notify("Đã mở khóa các chương đã chọn.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang mở khóa…" : "Xác nhận mua"}
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Quay lại
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          disabled={!selected.length || total > user.balance || busy}
          onClick={() => setConfirm(true)}
        >
          Mở khóa {selected.length} chương
        </button>
      )}
      {total > user.balance && (
        <Link href="/nap-hong-ngoc">Nạp thêm Hồng Ngọc</Link>
      )}
    </section>
  );
}
