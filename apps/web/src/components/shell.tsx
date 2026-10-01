"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  Search,
  Diamond,
  Menu,
  X,
  ChevronDown,
  BookOpen,
  ArrowUpRight,
  LogOut,
  Feather,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import { format, type User } from "../lib/types";
type State = {
  user: User | null;
  ready: boolean;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
};
const Context = createContext<State>({
  user: null,
  ready: false,
  refresh: async () => {},
  notify: () => {},
});
export const useApp = () => useContext(Context);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  async function refresh() {
    try {
      setUser(await api("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 4500);
      return () => clearTimeout(t);
    }
  }, [message]);
  return (
    <Context.Provider value={{ user, ready, refresh, notify: setMessage }}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
          <button aria-label="Đóng thông báo" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function Header() {
  const { user, refresh } = useApp(),
    path = usePathname(),
    router = useRouter();
  const [mobile, setMobile] = useState(false),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    setMobile(false);
    setMenu(false);
  }, [path]);
  return (
    <>
      <div className="announcement">
        Mỗi câu chuyện, một thế giới chờ bạn khám phá <span>✦</span>
      </div>
      <header className="header">
        <div className={`header-inner ${user ? "has-user" : ""}`}>
          <Link href="/" className="brand">
            <span className="seal">仙</span>
            <span>
              Tiên <span className="brand-light">Truyện</span>
              <small>CHẠM VÀO MỘT THẾ GIỚI KHÁC</small>
            </span>
          </Link>
          <nav className="desktop-nav">
            <Link className={path === "/" ? "active" : ""} href="/">
              Khám phá
            </Link>
            <Link
              className={path.startsWith("/the-loai") ? "active" : ""}
              href="/the-loai/tat-ca"
            >
              Thể loại <ChevronDown size={12} />
            </Link>
            <Link
              className={path === "/bang-xep-hang" ? "active" : ""}
              href="/bang-xep-hang"
            >
              Xếp hạng
            </Link>
            <Link href="/tu-truyen">Tủ truyện</Link>
          </nav>
          <div className="header-actions">
            <Link className="icon-btn" href="/tim-kiem" aria-label="Tìm truyện">
              <Search size={20} />
            </Link>
            <span className="header-divider" />
            {user ? (
              <>
                <Link className="wallet-chip" href="/nap-hong-ngoc">
                  <Diamond size={16} />
                  {format(user.balance)}
                  <span>HN</span>
                </Link>
                <div className="user-wrap">
                  <button
                    className="account-trigger"
                    aria-label="Mở menu tài khoản"
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" width={34} height={34} />
                      ) : (
                        user.name.charAt(0)
                      )}
                    </span>
                    <span className="account-name" title={user.name}>
                      {Array.from(user.name.normalize("NFC"))
                        .slice(0, 15)
                        .join("")}
                      {Array.from(user.name.normalize("NFC")).length > 15
                        ? "…"
                        : ""}
                    </span>
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                  {menu && (
                    <div className="user-menu">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                      <Link href="/tai-khoan">Hồ sơ tài khoản</Link>
                      <Link href="/cap-bac">Cảnh giới của tôi</Link>
                      <Link href="/lich-su-giao-dich">Lịch sử giao dịch</Link>
                      <Link href="/cai-dat">Cài đặt đọc</Link>
                      <Link href="/bao-mat">Bảo mật tài khoản</Link>
                      {user.roles.includes("AUTHOR") ? (
                        <Link href="/tac-gia">Góc tác giả</Link>
                      ) : (
                        <Link href="/tro-thanh-tac-gia">Trở thành tác giả</Link>
                      )}
                      {user.roles.includes("ADMIN") && (
                        <Link href="/admin">Quản trị</Link>
                      )}
                      <button
                        onClick={async () => {
                          await api("/auth/logout", { method: "POST" });
                          await refresh();
                          setMenu(false);
                          router.push("/");
                        }}
                      >
                        <LogOut size={15} /> Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link className="login-link" href="/dang-nhap">
                <UserRound size={17} /> Đăng nhập
              </Link>
            )}
            <button
              className="icon-btn mobile-toggle"
              aria-label="Mở điều hướng"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobile && (
          <nav className="mobile-nav">
            <Link href="/">Khám phá</Link>
            <Link href="/the-loai/tat-ca">Thể loại</Link>
            <Link href="/bang-xep-hang">Xếp hạng</Link>
            <Link href="/tu-truyen">Tủ truyện</Link>
          </nav>
        )}
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <Link className="brand" href="/">
          <span className="seal">仙</span>
          <span>
            Tiên <span className="brand-light">Truyện</span>
          </span>
        </Link>
        <p>Một trang sách, vạn dặm nhân gian.</p>
        <Link href="/tim-kiem">
          Khám phá thư viện <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Tiên Truyện. Nơi câu chuyện bắt đầu.
        </span>
        <span>Tôn trọng sáng tạo · Trân trọng từng con chữ</span>
      </div>
    </footer>
  );
}
export function Empty({
  title,
  text,
  href = "/dang-nhap",
  label = "Đăng nhập",
}: {
  title: string;
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <BookOpen size={40} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="btn primary" href={href}>
        {label}
        <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
