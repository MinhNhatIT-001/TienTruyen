import type { Metadata } from "next";
import "../styles/base.css";
import "../styles/theme.css";
import "../styles/overrides.css";
import { AppProvider, Header, Footer } from "../components/layout/app-shell";
export const metadata: Metadata = {
  title: {
    default: "Tiên Truyện — Một trang sách, vạn dặm nhân gian",
    template: "%s · Tiên Truyện",
  },
  description:
    "Khám phá những thế giới mới qua từng trang truyện. Không gian đọc tinh tế dành cho bạn.",
  robots: { index: true, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AppProvider>
          <a className="skip-content" href="#page-content">
            Đến nội dung chính
          </a>
          <Header />
          <div id="page-content" tabIndex={-1}>
            {children}
          </div>
          <Footer />
        </AppProvider>
      </body>
    </html>
  );
}
