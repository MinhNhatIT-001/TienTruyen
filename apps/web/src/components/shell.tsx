"use client";
import Link from "next/link";
import { NotificationBell } from "./reading-tools";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
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
  ReceiptText,
  ShieldCheck,
  Mail,
  Phone,
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
  const refresh = useCallback(async () => {
    try {
      setUser(await api("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
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
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    accountRef.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menu]);
  useEffect(() => {
    setMobile(false);
    setMenu(false);
  }, [path]);
  return (
    <>
      <header
        className="header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobile) {
            setMobile(false);
            mobileTriggerRef.current?.focus();
          }
        }}
      >
        <div className={`header-inner ${user ? "has-user" : ""}`}>
          <Link href="/" className="brand">
            <span className="seal">仙</span>
            <span>
              Tiên <span className="brand-light">Truyện</span>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <Link className={path === "/" ? "active" : ""} href="/">
              Trang chủ
            </Link>
            <Link
              className={path.startsWith("/the-loai") ? "active" : ""}
              href="/the-loai/tat-ca"
            >
              Thể loại
            </Link>
            <Link
              className={path === "/bang-xep-hang" ? "active" : ""}
              href="/bang-xep-hang"
            >
              Xếp hạng
            </Link>
            <Link
              className={path === "/tu-truyen" ? "active" : ""}
              href="/tu-truyen"
            >
              Tủ truyện
            </Link>
          </nav>
          <div className="header-actions">
            <NotificationBell />
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
                <div
                  className="user-wrap"
                  ref={accountRef}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setMenu(false);
                      triggerRef.current?.focus();
                    }
                  }}
                >
                  <button
                    ref={triggerRef}
                    className="account-trigger"
                    aria-controls="account-navigation"
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
                    <nav
                      className="user-menu"
                      id="account-navigation"
                      aria-label="Điều hướng tài khoản"
                    >
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                      <Link href="/tai-khoan">
                        <UserRound size={16} /> Hồ sơ & cài đặt
                      </Link>
                      <Link href="/nap-hong-ngoc">
                        <Diamond size={16} /> Ví Hồng Ngọc ·{" "}
                        {format(user.balance)}
                      </Link>
                      <Link href="/lich-su-giao-dich">
                        <ReceiptText size={16} aria-hidden="true" /> Lịch sử
                        giao dịch
                      </Link>
                      <Link href="/tu-truyen">
                        <BookOpen size={16} /> Tủ truyện
                      </Link>
                      {user.roles.includes("AUTHOR") ? (
                        <Link href="/tac-gia">
                          <Feather size={16} /> Góc tác giả
                        </Link>
                      ) : null}
                      {user.roles.includes("ADMIN") && (
                        <Link href="/admin">
                          <ShieldCheck size={16} aria-hidden="true" /> Quản trị
                        </Link>
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
                    </nav>
                  )}
                </div>
              </>
            ) : (
              <Link className="login-link" href="/dang-nhap">
                <UserRound size={17} /> Đăng nhập
              </Link>
            )}
            <button
              ref={mobileTriggerRef}
              className="icon-btn mobile-toggle"
              aria-label={mobile ? "Đóng menu" : "Mở menu"}
              aria-controls="mobile-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobile && (
          <nav
            className="mobile-nav"
            id="mobile-navigation"
            aria-label="Điều hướng chính trên điện thoại"
          >
            <Link href="/" aria-current={path === "/" ? "page" : undefined}>
              Trang chủ
            </Link>
            <Link
              href="/the-loai/tat-ca"
              aria-current={path.startsWith("/the-loai") ? "page" : undefined}
            >
              Thể loại
            </Link>
            <Link
              href="/bang-xep-hang"
              aria-current={path === "/bang-xep-hang" ? "page" : undefined}
            >
              Xếp hạng
            </Link>
            <Link
              href="/tu-truyen"
              aria-current={path === "/tu-truyen" ? "page" : undefined}
            >
              Tủ truyện
            </Link>
            <Link href="/tim-kiem">Tìm kiếm</Link>
            {user && <Link href="/thong-bao">Thông báo</Link>}
          </nav>
        )}
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer className="literary-footer">
      <svg
        className="footer-cloud footer-cloud-left"
        viewBox="0 0 240 120"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 90c26-20 52-8 73-20-24 2-40-14-29-29 11-16 35-6 29 7-5 11-20 5-15-3M76 70c-4-36 29-58 52-39 18 15 5 38-10 29-13-8 1-22 9-12M111 24c17-26 53-18 56 7 4 27-28 29-29 12M157 66c39-31 49 10 77-3M18 103c40-19 73 7 107-10 40-19 76-6 109-17M87 85c14-7 29-5 37-11" />
      </svg>
      <svg
        className="footer-cloud footer-cloud-right"
        viewBox="0 0 240 120"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 90c26-20 52-8 73-20-24 2-40-14-29-29 11-16 35-6 29 7-5 11-20 5-15-3M76 70c-4-36 29-58 52-39 18 15 5 38-10 29-13-8 1-22 9-12M111 24c17-26 53-18 56 7 4 27-28 29-29 12M157 66c39-31 49 10 77-3M18 103c40-19 73 7 107-10 40-19 76-6 109-17" />
      </svg>
      <div className="footer-top">
        <div className="footer-about">
          <Link className="brand" href="/">
            <span className="seal">仙</span>
            <span>
              Tiên <span className="brand-light">Truyện</span>
            </span>
          </Link>
          <p className="footer-tagline">Dẫn lối vạn dặm, mở cõi huyền thoại.</p>
          <p>
            Đắm mình trong thế giới tiên hiệp, kiếm hiệp và những câu chuyện bạn
            yêu thích.
          </p>
        </div>
        <nav className="footer-explore" aria-label="Khám phá Tiên Truyện">
          <h2>Khám phá</h2>
          <Link href="/the-loai/tat-ca">Thư viện truyện</Link>
          <Link href="/bang-xep-hang">Bảng xếp hạng</Link>
          <Link href="/tim-kiem">Tìm truyện mới</Link>
          <Link href="/gioi-thieu">Về Tiên Truyện</Link>
        </nav>
        <nav className="footer-explore footer-connect" aria-label="Góc của bạn">
          <h2>Góc của bạn</h2>
          <Link href="/tu-truyen">Tủ truyện cá nhân</Link>
          <Link href="/lich-su">Tiếp tục đọc</Link>
          <Link href="/tai-khoan">Tài khoản & cài đặt</Link>
        </nav>
        <div className="footer-support">
          <h2>Hỗ trợ & góp ý</h2>
          <p>Chúng tôi luôn lắng nghe bạn.</p>
          <Link className="footer-help-link" href="/ho-tro">
            Hướng dẫn & câu hỏi thường gặp →
          </Link>
          <a className="footer-contact" href="mailto:tientruyenweb@gmail.com">
            <Mail size={17} aria-hidden="true" />
            <span>tientruyenweb@gmail.com</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <a className="footer-phone" href="tel:0123456789">
            <Phone size={14} aria-hidden="true" /> 0123456789
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} Tiên Truyện. Nơi câu chuyện bắt đầu.
        </span>
        <nav className="footer-policy-links" aria-label="Chính sách">
          <Link href="/dieu-khoan">Điều khoản</Link>
          <Link href="/chinh-sach-bao-mat">Bảo mật</Link>
        </nav>
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
