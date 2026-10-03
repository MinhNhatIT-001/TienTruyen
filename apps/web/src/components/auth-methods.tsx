"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Phone, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "./shell";
export type AuthOptions = {
  google: boolean;
  facebook: boolean;
  phone: boolean;
  payment: string;
  paymentReady: boolean;
  simulate: boolean;
};
export function useAuthOptions() {
  const [options, setOptions] = useState<AuthOptions | null>(null);
  useEffect(() => {
    api<AuthOptions>("/auth/options")
      .then(setOptions)
      .catch(() =>
        setOptions({
          google: false,
          facebook: false,
          phone: false,
          payment: "local",
          paymentReady: false,
          simulate: false,
        }),
      );
  }, []);
  return options;
}
function ProviderLogo({ provider }: { provider: "google" | "facebook" }) {
  return provider === "google" ? (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
      />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3.01 1.8-4.67 4.55-4.67 1.32 0 2.69.24 2.69.24v2.95h-1.52c-1.5 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12Z"
      />
    </svg>
  );
}
export function SocialLogin({ link = false }: { link?: boolean }) {
  const options = useAuthOptions(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  async function start(provider: "google" | "facebook") {
    setError("");
    if (!options?.[provider]) {
      setError(
        `Đăng nhập ${provider === "google" ? "Google" : "Facebook"} đang được chuẩn bị. Bạn vui lòng dùng email lúc này.`,
      );
      return;
    }
    // Open synchronously so browsers recognize this as a user-initiated popup.
    const popup = window.open(
      "about:blank",
      "tientruyen-oauth",
      "popup,width=520,height=680",
    );
    setBusy(true);
    try {
      const url = link
        ? (
            await api<{ url: string }>(`/auth/oauth/${provider}/link`, {
              method: "POST",
            })
          ).url
        : `/api/auth/oauth/${provider}/start`;
      if (!popup) {
        window.location.assign(url);
        return;
      }
      popup.location.href = url;
      const started = Date.now();
      timer.current = setInterval(() => {
        if (popup.closed || Date.now() - started > 300000) {
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
          return;
        }
        try {
          if (popup.location.origin !== window.location.origin) return;
          if (popup.location.pathname === "/tai-khoan") {
            if (timer.current) clearInterval(timer.current);
            popup.close();
            window.location.assign(link ? "/tai-khoan" : "/");
          } else if (popup.location.pathname === "/dang-nhap") {
            if (timer.current) clearInterval(timer.current);
            const issue = new URLSearchParams(popup.location.search).get(
              "authError",
            );
            popup.close();
            setBusy(false);
            setError(
              issue === "email_exists"
                ? "Email đã có tài khoản. Đăng nhập bằng mật khẩu rồi liên kết trong hồ sơ."
                : "Không hoàn tất được đăng nhập. Vui lòng thử lại.",
            );
          }
        } catch {
          /* Provider pages are cross-origin until the OAuth callback completes. */
        }
      }, 500);
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="social-login">
      <div className="social-buttons">
        {(["google", "facebook"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            className="btn secondary"
            disabled={busy || !options}
            onClick={() => void start(provider)}
          >
            <ProviderLogo provider={provider} />
            {link ? "Liên kết " : ""}
            {provider === "google" ? "Google" : "Facebook"}
          </button>
        ))}
      </div>
      {busy && (
        <p role="status" className="form-caption">
          Hoàn tất đăng nhập trong cửa sổ vừa mở.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
export function PhoneLogin({ link = false }: { link?: boolean }) {
  const options = useAuthOptions(),
    { refresh, notify } = useApp(),
    router = useRouter();
  const [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState<{
      challengeId: string;
      phone: string;
    } | null>(null),
    [until, setUntil] = useState(0),
    [remaining, setRemaining] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [until]);
  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        challengeId: string;
        phone: string;
        resendAfter: number;
      }>("/auth/phone/request", {
        method: "POST",
        body: JSON.stringify({ phone, link }),
      });
      setChallenge(r);
      setCode("");
      setUntil(Date.now() + r.resendAfter * 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="standard-form phone-login"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!challenge) {
          await send();
          return;
        }
        setBusy(true);
        setError("");
        try {
          await api("/auth/phone/verify", {
            method: "POST",
            body: JSON.stringify({ challengeId: challenge.challengeId, code }),
          });
          await refresh();
          notify(link ? "Đã liên kết số điện thoại." : "Đăng nhập thành công.");
          if (link) {
            setChallenge(null);
            setCode("");
          } else router.push("/tai-khoan");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Số điện thoại
        <input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          maxLength={20}
          placeholder="09xxxxxxxx"
          disabled={busy || !!challenge}
        />
      </label>
      {challenge && (
        <>
          <p className="form-caption" role="status">
            Đã gửi mã đến {challenge.phone}. Mã có hiệu lực 5 phút.
          </p>
          <label className="field">
            Mã OTP từ SMS
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              minLength={6}
              maxLength={6}
              placeholder="Nhập 6 chữ số"
              disabled={busy}
            />
          </label>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {options && !options.phone && (
        <p className="notice">
          Đăng nhập SMS chưa khả dụng. Bạn có thể đăng nhập bằng email.
        </p>
      )}
      <button className="btn primary" disabled={busy || !options?.phone}>
        {busy
          ? "Đang xử lý…"
          : challenge
            ? link
              ? "Xác nhận liên kết"
              : "Xác nhận đăng nhập"
            : "Gửi mã OTP"}
        <ArrowRight size={16} />
      </button>
      {challenge && (
        <div className="otp-actions">
          <button
            type="button"
            className="text-button"
            disabled={busy || remaining > 0}
            onClick={() => void send()}
          >
            {remaining > 0 ? `Gửi lại sau ${remaining}s` : "Gửi lại mã"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              setChallenge(null);
              setCode("");
              setError("");
            }}
          >
            Đổi số điện thoại
          </button>
        </div>
      )}
      {!link && (
        <p className="form-caption">
          <Phone size={13} /> Số điện thoại mới sẽ được tạo tài khoản sau khi
          xác minh.
        </p>
      )}
    </form>
  );
}
export function LinkedLoginSettings() {
  const { user } = useApp();
  const [showPhone, setShowPhone] = useState(false);
  if (!user) return null;
  return (
    <section className="profile-card" style={{ marginTop: 24 }}>
      <h2>Cách đăng nhập</h2>
      <p>
        {user.phoneVerified
          ? `Số điện thoại đã xác minh: ${user.phone}`
          : "Liên kết số điện thoại để đăng nhập bằng mã SMS."}
      </p>
      <SocialLogin link />
      <button
        type="button"
        className="btn secondary"
        onClick={() => setShowPhone(!showPhone)}
      >
        {showPhone ? "Thu gọn" : "Liên kết số điện thoại"}
      </button>
      {showPhone && <PhoneLogin link />}
    </section>
  );
}
