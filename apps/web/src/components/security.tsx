"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { useApp, Empty } from "./shell";
export function SecurityPage() {
  const { user, refresh, notify } = useApp();
  const [setup, setSetup] = useState<any>(null),
    [sessions, setSessions] = useState<any[]>([]),
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
        <p>
          Xác thực hai bước là bắt buộc khi sử dụng quyền tác giả hoặc quản trị.
        </p>
      </div>
      {!user ? (
        <Empty
          title="Đăng nhập để quản lý bảo mật"
          text="Xem các thiết bị đang đăng nhập và bật xác thực hai bước."
        />
      ) : (
        <>
          <section className="panel">
            <h2>Xác thực hai bước</h2>
            {(user as any).twoFactorEnabled ? (
              <p className="success">2FA đã được bật cho tài khoản này.</p>
            ) : setup ? (
              <form
                className="standard-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const code = new FormData(e.currentTarget).get("code");
                    await api("/auth/2fa/enable", {
                      method: "POST",
                      body: JSON.stringify({ code }),
                    });
                    setSetup(null);
                    await refresh();
                    notify("Đã bật xác thực hai bước.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <p>
                  Thêm khóa dưới đây vào ứng dụng xác thực (Google
                  Authenticator, 1Password…), rồi nhập mã 6 số để xác nhận.
                </p>
                <code className="secret-key">{setup.secret}</code>
                <label className="field">
                  Mã xác thực
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    required
                    maxLength={6}
                  />
                </label>
                <button className="btn primary">Xác nhận bật 2FA</button>
              </form>
            ) : (
              <form
                className="standard-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setSetup(
                      await api("/auth/2fa/setup", {
                        method: "POST",
                        body: JSON.stringify({
                          password: new FormData(e.currentTarget).get(
                            "password",
                          ),
                        }),
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label className="field">
                  Xác nhận mật khẩu
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button className="btn primary">
                  Thiết lập xác thực hai bước
                </button>
              </form>
            )}
            {error && <p className="error">{error}</p>}
          </section>
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
              ? "Tìm lại chìa khóa của bạn."
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
