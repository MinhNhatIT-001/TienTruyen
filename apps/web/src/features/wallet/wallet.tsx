"use client";
import Link from "next/link";

import { PaymentOrder, paymentStatus } from "./payment-order";
import { useAuthOptions } from "../auth/auth-methods";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Diamond, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

import { Select } from "../../components/ui/select";
import { format } from "../../lib/types";
import { useApp, Empty } from "../../components/layout/app-shell";

const fallbackPackages = [
  { name: "Khởi hành", amount: 20000, base: 200, bonus: 0 },
  { name: "Du ngoạn", amount: 50000, base: 500, bonus: 25 },
  { name: "Phiêu lưu", amount: 100000, base: 1000, bonus: 80 },
  { name: "Vạn dặm", amount: 200000, base: 2000, bonus: 200 },
  { name: "Trường sinh", amount: 500000, base: 5000, bonus: 750 },
];
export function Wallet({ transactions = false }: { transactions?: boolean }) {
  const { user, refresh } = useApp();
  const paymentOptions = useAuthOptions();
  const [transactionType, setTransactionType] = useState("ALL");
  const [orders, setOrders] = useState<any[]>([]);
  const [packages, setPackages] = useState(fallbackPackages),
    [selected, setSelected] = useState(1),
    [rows, setRows] = useState<any[]>([]),
    [order, setOrder] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/config")
      .then((c) => setPackages(c.packages))
      .catch(() => {});
    if (user && transactions)
      api<any[]>("/wallet/transactions")
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [user, transactions]);
  useEffect(() => {
    if (!user || transactions) return;
    let active = true;
    api<any[]>("/wallet/orders")
      .then(async (rows) => {
        if (!active) return;
        setOrders(rows);
        const id = new URLSearchParams(window.location.search).get("order");
        if (id) {
          try {
            const r = await api(`/wallet/orders/${encodeURIComponent(id)}`);
            if (active) setOrder(r);
          } catch (e) {
            if (active) setError((e as Error).message);
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    const reloadOrders = () => {
      if (document.hidden) return;
      api<any[]>("/wallet/orders")
        .then((rows) => {
          if (active) setOrders(rows);
        })
        .catch(() => {});
    };
    const timer = setInterval(reloadOrders, 15000);
    window.addEventListener("focus", reloadOrders);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", reloadOrders);
    };
  }, [user?.id, transactions]);
  const updateOrder = useCallback((updated: any) => {
    setOrder(updated);
    setOrders((rows) => {
      const existing = rows.find((row) => row.id === updated.id);
      return [
        { ...existing, ...updated },
        ...rows.filter((row) => row.id !== updated.id),
      ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    });
  }, []);
  async function createOrder() {
    setBusy(true);
    setError("");
    try {
      updateOrder(
        await api("/wallet/orders", {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ packageIndex: selected }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">TIẾP NỐI NHỮNG CÂU CHUYỆN</span>
        <h1>{transactions ? "Lịch sử giao dịch" : "Nạp Hồng Ngọc"}</h1>
        <p>Mỗi chương bạn mở là một lời động viên gửi đến tác giả.</p>
      </div>
      {user ? (
        <div className="wallet-summary">
          <Diamond size={35} />
          <div>
            <p>HỒNG NGỌC CỦA BẠN</p>
            <strong>
              {format(user.balance)} <small>HN</small>
            </strong>
          </div>
          <Link href={transactions ? "/nap-hong-ngoc" : "/lich-su-giao-dich"}>
            {transactions ? "Nạp Hồng Ngọc" : "Xem lịch sử giao dịch"} →
          </Link>
        </div>
      ) : (
        <div className="notice">
          Đăng nhập để xem số dư và tạo đơn nạp.{" "}
          <Link href="/dang-nhap">Đăng nhập →</Link>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {transactions ? (
        rows.length ? (
          <>
            <label className="library-search field">
              Loại giao dịch
              <Select
                label="Loại giao dịch"
                value={transactionType}
                onValueChange={setTransactionType}
                options={[
                  { value: "ALL", label: "Tất cả" },
                  { value: "TOPUP", label: "Nạp Hồng Ngọc" },
                  { value: "BONUS", label: "Hồng Ngọc thưởng" },
                  { value: "PURCHASE", label: "Mở khóa chương" },
                  { value: "REFUND", label: "Hoàn tiền" },
                ]}
              />
            </label>
            <div className="data-list">
              {rows
                .filter(
                  (r) =>
                    transactionType === "ALL" || r.type === transactionType,
                )
                .map((r) => (
                  <div className="data-row" key={r.id}>
                    <div>
                      <h3>
                        {{
                          TOPUP: "Nạp Hồng Ngọc",
                          BONUS: "Hồng Ngọc thưởng",
                          PURCHASE: "Mở khóa chương",
                          REFUND: "Hoàn tiền",
                        }[r.type as string] || r.type}
                      </h3>
                      <p>{new Date(r.createdAt).toLocaleString("vi-VN")}</p>
                      {r.type === "TOPUP" && (
                        <Link
                          className="more-link"
                          href={`/nap-hong-ngoc?order=${encodeURIComponent(r.refId)}`}
                        >
                          Xem đơn nạp <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                    <strong className={r.amount > 0 ? "free" : "ruby"}>
                      {r.amount > 0 ? "+" : ""}
                      {format(r.amount)} HN
                    </strong>
                    <small>Số dư: {format(r.balanceAfter)} HN</small>
                  </div>
                ))}
            </div>
            {!rows.some(
              (r) => transactionType === "ALL" || r.type === transactionType,
            ) && <p className="notice">Chưa có giao dịch thuộc loại này.</p>}
          </>
        ) : (
          <Empty
            title="Chưa có giao dịch"
            text="Các lần nạp và mở khóa chương sẽ được ghi lại tại đây."
            href="/nap-hong-ngoc"
            label="Xem gói Hồng Ngọc"
          />
        )
      ) : (
        <>
          {paymentOptions?.simulate && (
            <p className="notice">
              Chế độ thử nghiệm · Không chuyển tiền thật.
            </p>
          )}
          <div className="packages">
            {packages.map((p, i) => (
              <button
                key={p.amount}
                onClick={() => setSelected(i)}
                className={`package ${selected === i ? "selected" : ""}`}
                aria-pressed={selected === i}
              >
                <Diamond size={24} />
                <h3>{p.name}</h3>
                <strong>{format(p.base + p.bonus)}</strong>
                <small>HỒNG NGỌC</small>
                <span className="bonus">
                  {p.bonus
                    ? `Tặng thêm ${format(p.bonus)} HN`
                    : "Một khởi đầu nhỏ"}
                </span>
                <p>{format(p.amount)}đ</p>
              </button>
            ))}
          </div>
          <p className="wallet-note">
            <ShieldCheck size={16} /> 1 Hồng Ngọc = 100đ. Thưởng theo cảnh giới
            được máy chủ tính khi tạo đơn. Đơn nạp có hiệu lực 15 phút.
          </p>
          {user ? (
            <button
              disabled={
                busy ||
                !paymentOptions ||
                !(paymentOptions.paymentReady || paymentOptions.simulate)
              }
              className="btn primary"
              onClick={createOrder}
            >
              {busy ? "Đang tạo đơn…" : "Thanh toán"}
              <ArrowRight size={17} />
            </button>
          ) : (
            <Link className="btn primary" href="/dang-nhap">
              Đăng nhập để tiếp tục
            </Link>
          )}
          {paymentOptions &&
            !paymentOptions.paymentReady &&
            !paymentOptions.simulate && (
              <p className="notice">
                Nạp Hồng Ngọc chưa được kích hoạt. Bạn vẫn có thể xem lịch sử và
                số dư.
              </p>
            )}
          {order && (
            <PaymentOrder
              order={order}
              onUpdate={updateOrder}
              simulate={!!paymentOptions?.simulate}
            />
          )}
          {orders.length > 0 && (
            <section className="topup-orders">
              <div className="topup-orders-heading">
                <h2>Đơn nạp gần đây</h2>
                <Link className="more-link" href="/lich-su-giao-dich">
                  Xem lịch sử <ArrowRight size={16} />
                </Link>
              </div>
              <div className="data-list">
                {orders.slice(0, 5).map((o) => (
                  <button
                    type="button"
                    className="data-row"
                    key={o.id}
                    onClick={() => {
                      setOrder(o);
                      setError("");
                    }}
                  >
                    <span>
                      {format(o.amountVnd)}đ ·{" "}
                      {new Date(o.createdAt).toLocaleString("vi-VN")}
                    </span>
                    <strong>{paymentStatus(o.status)}</strong>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
