"use client";
import Link from "next/link";
import { Button, Input, Card } from "./ui/primitives";
import { PaymentOrder, paymentStatus } from "./payment-order";
import { SocialLogin, PhoneLogin, useAuthOptions } from "./auth-methods";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Diamond,
  Feather,
  Plus,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { api } from "../lib/api";
import { format } from "../lib/types";
import { useApp, Empty } from "./shell";
import { StoryCard } from "./catalog";
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
export function Library({ history = false }: { history?: boolean }) {
  const { user, ready, notify } = useApp();
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState<string | null>(null);
  const load = () =>
    api<any[]>(history ? "/history" : "/library")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    setRows([]);
    setError("");
    if (user) void load();
  }, [user?.id, history]);
  const filtered = rows.filter(
    (r) =>
      filter === "ALL" ||
      (filter === "FOLLOWED" ? r.followed : r.shelf === filter),
  );
  async function update(id: string, data: any) {
    setBusy(id);
    try {
      await api(`/library/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      await load();
      notify("Đã cập nhật tủ truyện.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">GÓC NHỎ CỦA BẠN</span>
        <h1>{history ? "Lịch sử đọc" : "Tủ truyện"}</h1>
        <p>Giữ lại những câu chuyện khiến bạn muốn quay về.</p>
      </div>
      <nav className="dashboard-nav">
        <Link className={!history ? "active" : ""} href="/tu-truyen">
          Truyện đã lưu
        </Link>
        <Link className={history ? "active" : ""} href="/lich-su">
          Đọc gần đây
        </Link>
        <Link href="/chuong-da-mua">Chương đã mua</Link>
        <Link href="/thong-bao">Thông báo</Link>
      </nav>
      {!history && user && (
        <div className="genre-tabs shelf-tabs">
          {[
            ["ALL", "Tất cả"],
            ["READING", "Đang đọc"],
            ["FAVORITE", "Yêu thích"],
            ["FINISHED", "Đã hoàn thành"],
            ["FOLLOWED", "Đang theo dõi"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p>Đang tải…</p>
      ) : !user ? (
        <Empty
          title="Một góc nhỏ dành riêng cho bạn"
          text="Đăng nhập để lưu truyện và đồng bộ hành trình đọc."
        />
      ) : history ? (
        <div className="data-list">
          {rows
            .filter((r) => r.story)
            .map((r) => (
              <Link
                className="data-row"
                href={`/truyen/${r.story.slug}/${r.chapter}`}
                key={r.storyId}
              >
                <div>
                  <h3>{r.story.title}</h3>
                  <p>
                    Chương {r.chapter} ·{" "}
                    {r.finished
                      ? "Đã đọc hết chương"
                      : `${Math.round(r.position * 100)}% chương`}
                  </p>
                </div>
                <span className="more-link">
                  Đọc tiếp <ArrowRight size={16} />
                </span>
              </Link>
            ))}
          {!rows.length && (
            <Empty
              title="Trang đầu tiên đang chờ bạn"
              text="Mở một truyện để bắt đầu hành trình đọc."
              href="/the-loai/tat-ca"
              label="Khám phá truyện"
            />
          )}
        </div>
      ) : filtered.length ? (
        <div className="catalog-grid">
          {filtered.map((r) => (
            <div className="shelf-card" key={r.storyId}>
              <StoryCard
                story={{
                  ...r.story,
                  chapterCount: r.story._count.chapters,
                  rating: 0,
                  readers: 0,
                }}
              />
              <div className="shelf-controls">
                <label>
                  Ngăn tủ
                  <select
                    aria-label={`Ngăn tủ của ${r.story.title}`}
                    value={r.shelf}
                    disabled={busy === r.storyId}
                    onChange={(e) =>
                      void update(r.storyId, { shelf: e.target.value })
                    }
                  >
                    <option value="READING">Đang đọc</option>
                    <option value="FAVORITE">Yêu thích</option>
                    <option value="FINISHED">Đã hoàn thành</option>
                  </select>
                </label>
                <button
                  className="text-button"
                  disabled={busy === r.storyId}
                  onClick={() =>
                    void update(r.storyId, { followed: !r.followed })
                  }
                >
                  {r.followed
                    ? "Đang theo dõi · Bỏ theo dõi"
                    : "Theo dõi chương mới"}
                </button>
                <button
                  className="text-button"
                  disabled={busy === r.storyId}
                  onClick={async () => {
                    setBusy(r.storyId);
                    try {
                      await api(`/library/${r.storyId}`, { method: "DELETE" });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Bỏ khỏi tủ
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Ngăn tủ này còn trống"
          text="Lưu và sắp xếp những câu chuyện bạn yêu thích."
          href="/the-loai/tat-ca"
          label="Khám phá truyện"
        />
      )}
    </main>
  );
}
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
    return () => {
      active = false;
    };
  }, [user?.id, transactions]);
  const updateOrder = useCallback((updated: any) => {
    setOrder(updated);
    setOrders((rows) =>
      rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
    );
  }, []);
  async function createOrder() {
    setBusy(true);
    setError("");
    try {
      setOrder(
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
          <div className="data-list">
            {rows.map((r) => (
              <div className="data-row" key={r.id}>
                <div>
                  <h3>
                    {{
                      TOPUP: "Nạp Hồng Ngọc",
                      PURCHASE: "Mở khóa chương",
                      REFUND: "Hoàn tiền",
                    }[r.type as string] || r.type}
                  </h3>
                  <p>{new Date(r.createdAt).toLocaleString("vi-VN")}</p>
                </div>
                <strong className={r.amount > 0 ? "free" : "ruby"}>
                  {r.amount > 0 ? "+" : ""}
                  {format(r.amount)} HN
                </strong>
                <small>Số dư: {format(r.balanceAfter)} HN</small>
              </div>
            ))}
          </div>
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
              {busy
                ? "Đang tạo đơn…"
                : `Tạo đơn ${format(packages[selected].amount)}đ`}
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
              <h2>Đơn nạp gần đây</h2>
              <div className="data-list">
                {orders.map((o) => (
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
const levels = [
  ["Phàm Nhân", 0],
  ["Luyện Khí", 50000],
  ["Trúc Cơ", 200000],
  ["Kim Đan", 500000],
  ["Nguyên Anh", 1000000],
  ["Hóa Thần", 2000000],
  ["Luyện Hư", 5000000],
  ["Hợp Thể", 10000000],
  ["Đại Thừa", 20000000],
  ["Chân Tiên", 50000000],
] as [string, number][];
export function Levels() {
  const { user } = useApp();
  const [list, setList] = useState(levels);
  useEffect(() => {
    api("/config")
      .then((c) => setList(c.readerLevels))
      .catch(() => {});
  }, []);
  const total = user?.totalTopupVnd || 0,
    index = Math.max(
      0,
      list.findLastIndex((l) => total >= l[1]),
    ),
    next = list[index + 1],
    progress = next
      ? Math.min(
          100,
          ((total - list[index][1]) / (next[1] - list[index][1])) * 100,
        )
      : 100;
  return (
    <main className="container page">
      <div className="page-intro">
        <span className="eyebrow">MỖI TRANG SÁCH, MỘT BƯỚC TIẾN</span>
        <h1>Cảnh giới của tôi</h1>
        <p>
          Cảnh giới ghi nhận tổng tiền nạp thành công, không giảm khi bạn dùng
          Hồng Ngọc.
        </p>
      </div>
      <div className="account-grid">
        <div className="panel">
          <Sparkles size={26} />
          <h2>{list[index][0]}</h2>
          <p>Tổng nạp tích lũy: {format(total)}đ</p>
          <div className="progress-bar">
            <span style={{ width: progress + "%" }} />
          </div>
          <p>
            {next
              ? `Còn ${format(next[1] - total)}đ để đạt ${next[0]}.`
              : "Bạn đã đạt cảnh giới cao nhất."}
          </p>
        </div>
        <div className="panel">
          <h2>Lớn lên cùng những câu chuyện</h2>
          <p>
            Huy hiệu, khung đại diện và thưởng nạp theo từng cảnh giới. Các
            quyền lợi được tính theo cấu hình hiện tại của nền tảng.
          </p>
          <Link
            className="btn secondary"
            href="/nap-hong-ngoc"
            style={{ marginTop: 20 }}
          >
            Khám phá Hồng Ngọc <Diamond size={16} />
          </Link>
        </div>
      </div>
      <div className="level-list">
        {list.map(([name, amount], i) => (
          <div className="level-card" key={name}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{name}</h3>
            <p>Tổng nạp từ {format(amount)}đ</p>
          </div>
        ))}
      </div>
    </main>
  );
}
export function AuthorApplication() {
  const { user } = useApp();
  const [sample, setSample] = useState(""),
    [result, setResult] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="container page narrow-page">
      <div className="page-intro">
        <span className="eyebrow">GÓC DÀNH CHO NGƯỜI KỂ CHUYỆN</span>
        <h1>Đăng ký tác giả</h1>
        <p>Gửi hồ sơ để gia nhập cộng đồng tác giả Tiên Truyện.</p>
      </div>
      {!user ? (
        <Empty
          title="Chúng mình muốn đọc câu chuyện của bạn"
          text="Đăng nhập để gửi hồ sơ tác giả. Hồ sơ sẽ được ban biên tập duyệt."
        />
      ) : (
        <form
          className="standard-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const d = new FormData(e.currentTarget);
            try {
              await api("/author/applications", {
                method: "POST",
                body: JSON.stringify({
                  penName: d.get("penName"),
                  bio: d.get("bio"),
                  genres: d.get("genres"),
                  sampleText: sample,
                  copyright: d.get("copyright") === "on",
                }),
              });
              setResult(
                "Hồ sơ đã được gửi. Ban biên tập sẽ xem xét và phản hồi.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Bút danh
            <input
              name="penName"
              required
              minLength={2}
              maxLength={60}
              placeholder="Tên sẽ xuất hiện trên những câu chuyện của bạn"
            />
          </label>
          <label className="field">
            Giới thiệu về bạn
            <textarea name="bio" required minLength={20} maxLength={2000} />
          </label>
          <label className="field">
            Thể loại sở trường
            <select name="genres">
              {[
                "Tiên hiệp",
                "Kiếm hiệp",
                "Huyền huyễn",
                "Cổ đại",
                "Ngôn tình",
                "Đô thị",
              ].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Đoạn văn mẫu ·{" "}
            {sample.trim() ? sample.trim().split(/\s+/u).length : 0}/1.000 chữ
            <textarea
              className="editor-area"
              required
              value={sample}
              maxLength={100000}
              onChange={(e) => setSample(e.target.value)}
              placeholder="Hãy cho chúng mình nghe giọng văn của bạn…"
            />
          </label>
          <label className="checkbox">
            <input required type="checkbox" name="copyright" />
            Tôi xác nhận có quyền với nội dung gửi lên và cam kết tôn trọng bản
            quyền tác phẩm.
          </label>
          {error && <p className="error">{error}</p>}
          {result && <p className="success">{result}</p>}
          <button className="btn primary" disabled={busy || !!result}>
            {busy ? "Đang gửi…" : "Gửi hồ sơ tác giả"}
            <Feather size={16} />
          </button>
        </form>
      )}
    </main>
  );
}
