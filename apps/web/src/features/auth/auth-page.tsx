"use client";
import Link from "next/link";
import { Button, Input, Card } from "../../components/ui/primitives";

import { SocialLogin, PhoneLogin, useAuthOptions } from "./auth-methods";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Eye, EyeOff } from "lucide-react";
import { api } from "../../lib/api";

import { useApp } from "../../components/layout/app-shell";

export function AuthPage({ register = false }: { register?: boolean }) {
  const router = useRouter(),
    { refresh } = useApp();
  const authOptions = useAuthOptions();
  const [showPassword, setShowPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null);
  useEffect(() => {
    const issue = new URLSearchParams(window.location.search).get("authError");
    if (issue)
      setError(
        issue === "email_exists"
          ? "Email này đã có tài khoản. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong hồ sơ."
          : issue === "unavailable"
            ? "Cách đăng nhập này chưa khả dụng."
            : "Không hoàn tất được đăng nhập. Vui lòng thử lại.",
      );
  }, []);
  return (
    <main className="auth-layout auth-centered">
      <aside className="auth-art">
        <span className="auth-emblem" aria-hidden="true">
          <BookOpen size={28} />
        </span>
        <h2>
          Mở một trang sách.
          <br />
          Bước vào thế giới mới.
        </h2>
        <p>Lưu truyện yêu thích và tiếp tục đọc trên mọi thiết bị.</p>
        <span className="auth-note">Tiên Truyện · Góc đọc của bạn</span>
      </aside>
      <Card className="form-card">
        <h1>{register ? "Tạo tài khoản" : "Đăng nhập"}</h1>
        <p>
          {register
            ? "Tạo tài khoản để có một góc đọc của riêng mình."
            : "Đăng nhập để tiếp tục những trang sách còn dang dở."}
        </p>
        {authOptions?.phone && (
          <div className="login-tabs" role="group" aria-label="Cách đăng nhập">
            <Button
              type="button"
              aria-pressed={loginMode === "email"}
              onClick={() => setLoginMode("email")}
            >
              Email và mật khẩu
            </Button>
            <Button
              type="button"
              aria-pressed={loginMode === "phone"}
              onClick={() => setLoginMode("phone")}
            >
              Số điện thoại
            </Button>
          </div>
        )}
        {loginMode === "phone" ? (
          <PhoneLogin />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const form = new FormData(e.currentTarget);
              try {
                const body = {
                  email: form.get("email"),
                  password: form.get("password"),
                  ...(register ? { name: form.get("name") } : {}),
                };
                const r = await api(
                  `/auth/${register ? "register" : "login"}`,
                  {
                    method: "POST",
                    body: JSON.stringify(body),
                  },
                );
                if (register) setResult(r);
                else {
                  await refresh();
                  const next =
                    new URLSearchParams(window.location.search).get("next") ||
                    "/";
                  router.push(
                    next.startsWith("/") &&
                      !next.startsWith("//") &&
                      !next.includes("\\")
                      ? next
                      : "/",
                  );
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <label className="field">
                Tên hiển thị
                <Input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={8}
                  maxLength={15}
                  placeholder="Tên của bạn · 8–15 ký tự"
                />
              </label>
            )}
            <label className="field">
              Email
              <Input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="ban@example.com"
              />
            </label>
            <label className="field">
              Mật khẩu
              <span className="password-control">
                <Input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  id="auth-password"
                  aria-label="Mật khẩu"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={128}
                  placeholder={
                    register ? "Ít nhất 10 ký tự" : "Nhập mật khẩu của bạn"
                  }
                />
                <Button
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={showPassword}
                  aria-controls="auth-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </span>
            </label>
            {!register && (
              <>
                <Link className="form-caption" href="/quen-mat-khau">
                  Quên mật khẩu?
                </Link>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {result && (
              <div className="success">
                {result.message}
                {result.devVerifyToken && (
                  <Button
                    type="button"
                    className="btn secondary"
                    onClick={async () => {
                      try {
                        setResult(
                          await api("/auth/verify", {
                            method: "POST",
                            body: JSON.stringify({
                              token: result.devVerifyToken,
                            }),
                          }),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Xác minh email (local)
                  </Button>
                )}
              </div>
            )}
            <Button disabled={busy} className="btn primary">
              {busy ? "Đang xử lý…" : register ? "Tạo tài khoản" : "Đăng nhập"}
              <ArrowRight size={17} />
            </Button>
            {register && (
              <p className="form-caption">
                Chúng mình trân trọng quyền riêng tư và những sáng tạo có bản
                quyền. Hãy dùng một mật khẩu riêng cho tài khoản này.
              </p>
            )}
          </form>
        )}
        <div className="auth-social-section">
          <div className="auth-divider">
            <span>hoặc đăng nhập bằng</span>
          </div>
          <SocialLogin />
        </div>
        <div className="form-switch">
          {register ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
          <Link href={register ? "/dang-nhap" : "/dang-ky"}>
            {register ? "Đăng nhập" : "Tạo tài khoản mới"}
          </Link>
        </div>
      </Card>
    </main>
  );
}
