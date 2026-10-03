"use client";
import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../lib/api";
import { useApp } from "./shell";
import { format } from "../lib/types";
export type PaymentOrderData = {
  id: string;
  amountVnd: number;
  coinsBase: number;
  coinsBonus: number;
  status: string;
  provider: string;
  checkoutUrl?: string | null;
  expiresAt: string;
  qrCode?: string | null;
  reviewReason?: string | null;
  checkoutPending?: boolean;
};
export const paymentStatus = (s: string) =>
  ({
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    CANCELLED: "Đã hủy",
    EXPIRED: "Đã hết hạn",
    NEEDS_REVIEW: "Cần kiểm tra",
    REFUNDED: "Đã hoàn tiền thủ công",
  })[s] || s;
export function PaymentOrder({
  order,
  onUpdate,
  simulate,
}: {
  order: PaymentOrderData;
  onUpdate: (o: PaymentOrderData) => void;
  simulate: boolean;
}) {
  const { refresh, notify } = useApp(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil((Date.parse(order.expiresAt) - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [order.id, order.expiresAt]);
  const paid = useRef<string | null>(null);
  useEffect(() => {
    if (order.status === "PAID" && paid.current !== order.id) {
      paid.current = order.id;
      void refresh();
      notify("Thanh toán đã được xác nhận. Hồng Ngọc đã cộng vào ví.");
    }
  }, [order.id, order.status, refresh, notify]);
  useEffect(() => {
    if (order.status !== "PENDING") return;
    let active = true,
      running = false;
    const timer = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const r = await api<PaymentOrderData>(`/wallet/orders/${order.id}`);
        if (active) onUpdate(r);
      } catch {
        /* Manual status check gives actionable feedback. */
      } finally {
        running = false;
      }
    }, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order.id, order.status, order.expiresAt, onUpdate]);
  async function action(kind: "check" | "checkout" | "cancel" | "simulate") {
    setBusy(true);
    setError("");
    try {
      const path = `/wallet/orders/${order.id}${kind === "check" ? "" : `/${kind}`}`;
      const r = await api<PaymentOrderData>(path, {
        method: kind === "check" ? "GET" : "POST",
      });
      if (kind === "simulate") {
        await refresh();
        onUpdate({ ...order, status: "PAID" });
      } else onUpdate(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      style={{ marginTop: 25 }}
      aria-label="Đơn nạp Hồng Ngọc"
    >
      <h2>Đơn nạp Hồng Ngọc</h2>
      <p>Mã đơn: {order.id}</p>
      <p>
        Nhận <strong>{format(order.coinsBase + order.coinsBonus)} HN</strong> ·{" "}
        {format(order.amountVnd)}đ
      </p>
      <p>Hết hạn lúc {new Date(order.expiresAt).toLocaleString("vi-VN")}</p>
      <div className="payment-status" role="status">
        {paymentStatus(order.status)}
      </div>
      {order.status === "PENDING" && order.provider === "LOCAL" && simulate && seconds > 0 && (
        <div className="payment-qr">
          <QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/nap-hong-ngoc?order=${encodeURIComponent(order.id)}`} size={220} level="M" title="QR thử nghiệm, không chuyển tiền thật" />
          <strong>QR THANH TOÁN THỬ NGHIỆM</strong>
          <p>Quét bằng camera điện thoại, đăng nhập cùng tài khoản rồi xác nhận thanh toán thử. Hoặc bấm nút xác nhận bên dưới để thử ngay.</p>
        </div>
      )}
      {order.status === "PAID" && <p className="notice" role="status">Thanh toán thành công · Đã cộng {format(order.coinsBase + order.coinsBonus)} Hồng Ngọc vào ví.</p>}
      {order.status === "PENDING" &&
        order.provider === "PAYOS" &&
        order.qrCode &&
        seconds > 0 && (
          <div className="payment-qr">
            <QRCodeSVG
              value={order.qrCode}
              size={220}
              level="M"
              title="Mã QR chuyển khoản cho đơn nạp Hồng Ngọc"
            />
            <p>
              Quét bằng ứng dụng ngân hàng. Kiểm tra đúng số tiền trước khi xác
              nhận.
            </p>
          </div>
        )}
      {order.status === "PENDING" && (
        <p className="payment-countdown">
          {seconds > 0
            ? `Còn ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
            : "Đã qua thời hạn thanh toán. Đang chờ đối soát."}
        </p>
      )}
      {order.status === "NEEDS_REVIEW" && (
        <p className="notice">
          {order.reviewReason}. Đơn đang chờ quản trị kiểm tra, chưa cộng Hồng
          Ngọc.
        </p>
      )}
      {order.status === "PENDING" && (
        <p>
          {order.provider === "PAYOS"
            ? "Mở trang payOS để quét QR hoặc chuyển khoản. Ví sẽ cập nhật khi thanh toán được xác nhận."
            : "Đơn thử nghiệm — không chuyển tiền thật."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="payment-actions">
        {order.status === "PENDING" &&
          order.provider === "PAYOS" &&
          seconds > 0 &&
          (order.checkoutUrl ? (
            <a
              href={order.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary"
            >
              Thanh toán qua payOS ↗
            </a>
          ) : (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void action("checkout")}
            >
              Tạo lại liên kết thanh toán
            </button>
          ))}
        {order.status === "PENDING" &&
          order.provider === "LOCAL" &&
          simulate && seconds > 0 && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void action("simulate")}
            >
              Xác nhận thanh toán thử
            </button>
          )}
        {order.status !== "PAID" && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void action("check")}
          >
            {busy ? "Đang xử lý…" : "Kiểm tra thanh toán"}
          </button>
        )}
        {order.status === "PENDING" && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void action("cancel")}
          >
            Hủy đơn
          </button>
        )}
      </div>
    </section>
  );
}
