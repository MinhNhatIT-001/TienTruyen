"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { useApp, Empty } from "./shell";
function RecoveryEmailSettings() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { refresh } = useApp();
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("recovery") || "");
  }, []);
  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2>Email khôi phục và mật khẩu</h2>
      <p>
        Xác minh một email bạn sở hữu để có thể đăng nhập bằng mật khẩu hoặc
        khôi phục tài khoản khi mất quyền truy cập mạng xã hội.
      </p>
      <form
        className="standard-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            const r = await api<any>(
              token ? "/auth/recovery-email/confirm" : "/auth/recovery-email",
              {
                method: "POST",
                body: JSON.stringify(
                  token
                    ? { token, password: data.get("password") }
                    : { email: data.get("email") },
                ),
              },
            );
            setMessage(r.message);
            if (r.devRecoveryToken) setToken(r.devRecoveryToken);
            else if (token) {
              setToken("");
              await refresh();
              window.history.replaceState(null, "", "/bao-mat");
            }
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {token ? (
          <label className="field">
            Mật khẩu mới
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              placeholder="Ít nhất 10 ký tự"
            />
          </label>
        ) : (
          <label className="field">
            Email khôi phục
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Email bạn có thể nhận thư"
            />
          </label>
        )}
        <button className="btn primary" disabled={busy}>
          {busy
            ? "Đang xử lý…"
            : token
              ? "Xác minh và đặt mật khẩu"
              : "Gửi liên kết xác minh"}
        </button>
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
export function SecurityPage() {
  const { user, refresh, notify } = useApp();
  const [sessions, setSessions] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      api<any[]>("/auth/sessions")
        .then(setSessions)
        .catch((e) => setError(e.message));
  }, [user]);
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <span className="eyebrow">GIỮ AN TOÀN CHO HÀNH TRÌNH</span>
        <h1>Bảo mật tài khoản</h1>
        <p>Quản lý những thiết bị đang đăng nhập vào tài khoản của bạn.</p>
      </div>
      {!user ? (
        <Empty
          title="Đăng nhập để quản lý bảo mật"
          text="Xem và thu hồi các phiên đăng nhập trên thiết bị khác."
        />
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <RecoveryEmailSettings />
          <section className="panel" style={{ marginTop: 25 }}>
            <h2>Thiết bị đang đăng nhập</h2>
            <div className="data-list">
              {sessions.map((s) => (
                <div className="data-row" key={s.id}>
                  <div>
                    <p style={{ overflowWrap: "anywhere" }}>{s.device}</p>
                    <small>
                      {new Date(s.createdAt).toLocaleString("vi-VN")}
                    </small>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      try {
                        await api(`/auth/sessions/${s.id}`, {
                          method: "DELETE",
                        });
                        setSessions((rows) =>
                          rows.filter((x) => x.id !== s.id),
                        );
                        await refresh();
                        notify("Đã thu hồi phiên đăng nhập.");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Đăng xuất thiết bị
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
export function RecoveryPage({
  mode,
}: {
  mode: "verify" | "forgot" | "reset";
}) {
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [devToken, setDevToken] = useState("");
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <h1>
          {mode === "verify"
            ? "Xác minh email"
            : mode === "forgot"
              ? "Quên mật khẩu"
              : "Đặt mật khẩu mới"}
        </h1>
      </div>
      <form
        className="standard-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            const token = new URLSearchParams(window.location.search).get(
              "token",
            );
            const r = await api(
              mode === "verify"
                ? "/auth/verify"
                : mode === "forgot"
                  ? "/auth/forgot-password"
                  : "/auth/reset-password",
              {
                method: "POST",
                body: JSON.stringify(
                  mode === "verify"
                    ? { token }
                    : mode === "forgot"
                      ? { email: data.get("email") }
                      : { token, password: data.get("password") },
                ),
              },
            );
            setMessage(
              r.message ||
                "Mật khẩu đã được cập nhật. Bạn có thể đăng nhập lại.",
            );
            setDevToken(r.devResetToken || "");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {mode === "forgot" && (
          <label className="field">
            Email tài khoản
            <input type="email" name="email" autoComplete="email" required />
          </label>
        )}
        {mode === "reset" && (
          <label className="field">
            Mật khẩu mới
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
            />
          </label>
        )}
        {mode === "verify" && (
          <p>Xác nhận email để bắt đầu hành trình đọc của bạn.</p>
        )}
        <button className="btn primary">
          {mode === "verify"
            ? "Xác minh email"
            : mode === "forgot"
              ? "Gửi hướng dẫn"
              : "Lưu mật khẩu mới"}
        </button>
        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}
        {devToken && (
          <Link href={`/dat-lai-mat-khau?token=${devToken}`}>
            Đặt lại mật khẩu (local) →
          </Link>
        )}
        <Link href="/dang-nhap">Quay lại đăng nhập →</Link>
      </form>
    </main>
  );
}
