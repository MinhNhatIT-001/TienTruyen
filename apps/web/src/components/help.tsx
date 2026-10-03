"use client";
import { useState } from "react";
import { normalizeSearch } from "../lib/search";
import Link from "next/link";
import {
  BookOpen,
  Mail,
  ShieldCheck,
  ArrowRight,
  Diamond,
  Feather,
  Search,
  ChevronDown,
  MessageCircle,
  LifeBuoy,
  X,
} from "lucide-react";
const contact = "tientruyenweb@gmail.com";
const pages: Record<string, { title: string; subtitle: string }> = {
  "gioi-thieu": {
    title: "Một nơi để câu chuyện tiếp tục",
    subtitle:
      "Tiên Truyện kết nối người đọc và người viết qua những trang sách.",
  },
  "ho-tro": {
    title: "Chúng mình có thể giúp gì?",
    subtitle: "Hướng dẫn nhanh để bạn tiếp tục hành trình đọc.",
  },
  "dieu-khoan": {
    title: "Điều khoản sử dụng",
    subtitle: "Cùng xây dựng một không gian đọc tôn trọng sáng tạo.",
  },
  "chinh-sach-bao-mat": {
    title: "Chính sách bảo mật",
    subtitle: "Hiểu dữ liệu nào được lưu và cách yêu cầu hỗ trợ.",
  },
};
const faqs = [
  [
    "Hồng Ngọc dùng để làm gì?",
    "Hồng Ngọc dùng để mở các chương có phí. Giá được hiển thị trước khi xác nhận. Chương đã mở khóa gắn với tài khoản và có thể đọc lại.",
  ],
  [
    "QR thử nghiệm có chuyển tiền thật không?",
    "Không. Khi trang hiển thị Chế độ thử nghiệm, QR chỉ mở trang đơn nạp. Bạn đăng nhập cùng tài khoản rồi chọn Xác nhận thanh toán thử. Quét QR không tự cộng ví. Không chuyển khoản ngân hàng.",
  ],
  [
    "Ví chưa cập nhật sau khi thanh toán?",
    "Chọn Kiểm tra thanh toán trong đơn nạp. Đơn mới và trạng thái tự cập nhật; danh sách gần đây kiểm tra lại mỗi 15 giây khi trang đang mở. Nếu vẫn chưa cập nhật, gửi mã đơn cho hỗ trợ; không tạo nhiều đơn để thử lại.",
  ],
  [
    "Làm sao đọc tiếp trên thiết bị khác?",
    "Đăng nhập cùng tài khoản, mở Tủ truyện → Đọc gần đây. Vị trí đọc được lưu khi bạn đọc và rời trang. Cài đặt chữ có thể đồng bộ từ phần Tùy chỉnh của trang đọc.",
  ],
  [
    "Làm sao trở thành tác giả?",
    "Mở Hồ sơ tài khoản và gửi hồ sơ tác giả. Khi được duyệt, bạn có thể tạo truyện, viết bản nháp, xem trước và xuất bản chương trong khu tác giả.",
  ],
  [
    "Bản nháp tự lưu và lịch đăng hoạt động thế nào?",
    "Bản nháp tự lưu trên tài khoản mỗi 2 giây khi có thay đổi. Nội dung chưa lưu còn được giữ trên trình duyệt để khôi phục. Trên Vercel Hobby, lịch đăng xử lý một lần mỗi ngày, có thể trễ đến 24 giờ; hãy dùng Xuất bản ngay nếu cần đăng ngay.",
  ],
  [
    "Tôi muốn báo cáo nội dung hoặc vấn đề bản quyền?",
    "Dùng nút báo cáo trên truyện/chương/bình luận hoặc gửi email kèm đường dẫn, lý do và thông tin chứng minh quyền sở hữu nếu có. Ban quản trị sẽ kiểm tra nội dung.",
  ],
];
export function HelpPage({ section }: { section: string }) {
  const page = pages[section] || pages["ho-tro"];
  if (section === "ho-tro") return <SupportCenter />;
  return (
    <main className="container page help-page">
      <div className="page-intro">
        <span className="eyebrow">TIÊN TRUYỆN · LUÔN ĐỒNG HÀNH</span>
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
      </div>
      <nav className="dashboard-nav" aria-label="Thông tin và hỗ trợ">
        {Object.entries(pages).map(([path, item]) => (
          <Link
            key={path}
            href={`/${path}`}
            className={section === path ? "active" : ""}
            aria-current={section === path ? "page" : undefined}
          >
            {path === "gioi-thieu"
              ? "Giới thiệu"
              : path === "ho-tro"
                ? "Hỗ trợ"
                : item.title}
          </Link>
        ))}
      </nav>
      {section === "gioi-thieu" ? (
        <>
          <section className="panel help-story">
            <BookOpen size={32} />
            <h2>Dẫn lối vạn dặm, mở cõi huyền thoại.</h2>
            <p>
              Khám phá tiên hiệp, kiếm hiệp, huyền huyễn và những câu chuyện đời
              thường. Tiên Truyện được xây dựng để bạn tìm truyện dễ hơn, đọc
              thoải mái và giữ lại những trang sách đang mở.
            </p>
            <Link className="btn primary" href="/the-loai/tat-ca">
              Khám phá thư viện <ArrowRight size={16} />
            </Link>
          </section>
          <div className="help-feature-grid">
            {[
              [
                BookOpen,
                "Góc đọc của bạn",
                "Tùy chỉnh chữ, màu trang, lưu vị trí và quản lý tủ truyện.",
              ],
              [
                Feather,
                Search,
                ChevronDown,
                MessageCircle,
                LifeBuoy,
                X,
                "Không gian sáng tác",
                "Viết nháp, xem trước, quản lý chương và theo dõi độc giả.",
              ],
              [
                Diamond,
                "Ủng hộ từng chương",
                "Xem giá trước khi mở khóa và tra cứu lịch sử Hồng Ngọc.",
              ],
            ].map(([Icon, title, text]: any) => (
              <section className="panel" key={title}>
                <Icon size={24} />
                <h2>{title}</h2>
                <p>{text}</p>
              </section>
            ))}
          </div>
        </>
      ) : (
        <article className="panel policy-content">
          <ShieldCheck size={28} />
          <p className="policy-date">Cập nhật ngày 03/10/2026</p>
          {section === "dieu-khoan" ? (
            <>
              <h2>1. Tài khoản và sử dụng dịch vụ</h2>
              <p>
                Bạn chịu trách nhiệm giữ an toàn tài khoản và cung cấp thông tin
                phù hợp. Không sử dụng website để giả mạo, quấy rối, phát tán
                nội dung vi phạm hoặc truy cập tài khoản của người khác.
              </p>
              <h2>2. Nội dung và quyền tác giả</h2>
              <p>
                Tác giả cần có quyền với nội dung đăng tải. Đăng truyện không
                chuyển quyền sở hữu tác phẩm cho Tiên Truyện. Không sao chép,
                đăng lại hoặc khai thác tác phẩm khi chưa có quyền. Nội dung bị
                báo cáo sẽ được kiểm tra và có thể bị ẩn.
              </p>
              <h2>3. Hồng Ngọc và chương có phí</h2>
              <p>
                Giá chương và gói nạp hiển thị trước khi xác nhận. Hồng Ngọc
                dùng trong website, không phải tiền gửi ngân hàng. Khi ở chế độ
                thử nghiệm, Hồng Ngọc được cấp để kiểm tra chức năng, không có
                giá trị quy đổi thành tiền thật. Không thực hiện thanh toán thật
                qua QR thử nghiệm.
              </p>
              <h2>4. Sự cố và yêu cầu hoàn tiền</h2>
              <p>
                Nếu có giao dịch bất thường hoặc chương không truy cập được sau
                khi mở khóa, liên hệ hỗ trợ kèm mã đơn hoặc đường dẫn. Ban quản
                trị kiểm tra lịch sử và xử lý từng trường hợp; website không cam
                kết hoàn tiền tự động.
              </p>
              <h2>5. Liên hệ và cập nhật</h2>
              <p>
                Các thay đổi sẽ được cập nhật tại trang này. Bạn có thể gửi thắc
                mắc về nội dung hoặc tài khoản đến{" "}
                <a href={`mailto:${contact}`}>{contact}</a>.
              </p>
            </>
          ) : (
            <>
              <h2>1. Dữ liệu được lưu</h2>
              <p>
                Website lưu thông tin tài khoản như tên, email, ảnh đại diện; số
                điện thoại nếu bạn cung cấp; liên kết đăng nhập Google; vị trí
                đọc, tủ truyện, thông báo, nội dung bạn đăng và lịch sử Hồng
                Ngọc. Mật khẩu được lưu dưới dạng băm, không lưu nguyên văn.
              </p>
              <h2>2. Mục đích sử dụng</h2>
              <p>
                Dữ liệu phục vụ đăng nhập, đồng bộ trải nghiệm đọc, xuất bản nội
                dung, hỗ trợ giao dịch, xử lý báo cáo và bảo vệ tài khoản. Nhật
                ký quản trị ghi nhận thao tác quản lý quan trọng.
              </p>
              <h2>3. Cookie và trình duyệt</h2>
              <p>
                Cookie giữ phiên đăng nhập và bảo vệ yêu cầu của bạn. Bộ nhớ
                trình duyệt lưu cài đặt đọc, bộ lọc tìm kiếm, tiến độ của khách
                và bản nháp chưa lưu. Trên máy dùng chung, hãy đăng xuất và xóa
                dữ liệu trang khi không sử dụng nữa.
              </p>
              <h2>4. Nhà cung cấp dịch vụ</h2>
              <p>
                Website sử dụng Vercel để vận hành, Neon/PostgreSQL để lưu dữ
                liệu và Upstash/Redis hỗ trợ hoạt động hệ thống. Khi chọn đăng
                nhập Google, thông tin được xử lý theo cấu hình đăng nhập của
                Google. Trang nạp hiện có chế độ thử nghiệm; thông tin tài khoản
                ngân hàng không cần thiết cho QR thử nghiệm.
              </p>
              <h2>5. Quyền và yêu cầu của bạn</h2>
              <p>
                Bạn có thể cập nhật tên, ảnh đại diện và cài đặt trong hồ sơ;
                gửi yêu cầu kiểm tra, xuất hoặc xóa dữ liệu cá nhân đến{" "}
                <a href={`mailto:${contact}`}>{contact}</a>. Chúng mình cần xác
                minh người yêu cầu để bảo vệ tài khoản. Một số lịch sử có thể
                cần giữ lại để giải quyết tranh chấp hoặc nghĩa vụ pháp lý.
              </p>
            </>
          )}
        </article>
      )}
    </main>
  );
}

const helpTopics = [
  {
    id: "read",
    icon: BookOpen,
    title: "Đọc truyện & tài khoản",
    text: "Tủ truyện, vị trí đọc và hồ sơ",
    questions: [3, 6],
  },
  {
    id: "wallet",
    icon: Diamond,
    title: "Ví & Hồng Ngọc",
    text: "Nạp thử, QR và lịch sử giao dịch",
    questions: [0, 1, 2],
  },
  {
    id: "write",
    icon: Feather,
    title: "Dành cho tác giả",
    text: "Đăng ký, bản nháp và xuất bản",
    questions: [4, 5],
  },
];
function SupportCenter() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const selected = helpTopics.find((item) => item.id === topic);
  const questions = faqs
    .map(([question, answer], index) => ({ question, answer, index }))
    .filter(
      (item) =>
        (!selected || selected.questions.includes(item.index)) &&
        normalizeSearch(`${item.question} ${item.answer}`).includes(
          normalizeSearch(query.trim()),
        ),
    );
  return (
    <main className="container page support-center">
      <header className="support-hero">
        <span className="support-eyebrow">
          <LifeBuoy size={15} /> TRUNG TÂM HỖ TRỢ
        </span>
        <h1>Để hành trình đọc luôn trọn vẹn.</h1>
        <p>Tìm lời giải nhanh, hoặc gửi lời nhắn cho Tiên Truyện.</p>
        <div className="support-search">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label="Tìm câu hỏi hỗ trợ"
            type="search"
            placeholder="Bạn cần hỗ trợ điều gì?"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              aria-label="Xóa tìm kiếm hỗ trợ"
              onClick={() => setQuery("")}
            >
              <X size={17} />
            </button>
          )}
        </div>
      </header>
      <div className="support-topics" role="group" aria-label="Chủ đề hỗ trợ">
        {helpTopics.map(({ id, icon: Icon, title, text }) => (
          <button
            key={id}
            className={`support-topic ${topic === id ? "selected" : ""}`}
            aria-pressed={topic === id}
            onClick={() => setTopic(topic === id ? "all" : id)}
          >
            <span className="support-topic-icon">
              <Icon size={22} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <ArrowRight size={17} className="support-topic-arrow" />
          </button>
        ))}
      </div>
      <div className="support-body">
        <section className="support-questions" aria-label="Câu hỏi hỗ trợ">
          <div className="support-section-heading">
            <div>
              <span className="support-kicker">GIẢI ĐÁP NHANH</span>
              <h2>{selected?.title || "Câu hỏi thường gặp"}</h2>
            </div>
            {selected && (
              <button className="text-button" onClick={() => setTopic("all")}>
                Tất cả chủ đề
              </button>
            )}
          </div>
          <div className="support-accordion">
            {questions.map(({ question, answer, index }) => (
              <details key={index}>
                <summary>
                  <span>{question}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <p className="support-result-count" role="status">
            {questions.length
              ? `${questions.length} câu hỏi phù hợp`
              : "Chưa có câu hỏi phù hợp. Thử từ khóa khác hoặc gửi email cho chúng mình."}
          </p>
        </section>
        <aside className="support-aside">
          <section className="support-contact-card">
            <span className="support-contact-icon">
              <MessageCircle size={24} />
            </span>
            <h2>Vẫn cần một lời giải?</h2>
            <p>
              Chúng mình luôn lắng nghe. Gửi mô tả và mã đơn nếu có để được hỗ
              trợ.
            </p>
            <a
              className="btn primary"
              href={`mailto:${contact}?subject=${encodeURIComponent("Hỗ trợ Tiên Truyện")}`}
            >
              <Mail size={17} /> Gửi email hỗ trợ <ArrowRight size={16} />
            </a>
            <span className="support-email">{contact}</span>
          </section>
          <nav className="support-shortcuts" aria-label="Truy cập nhanh">
            <h3>Góc của bạn</h3>
            <Link href="/tai-khoan">
              Hồ sơ & cài đặt <ArrowRight size={15} />
            </Link>
            <Link href="/lich-su-giao-dich">
              Lịch sử giao dịch <ArrowRight size={15} />
            </Link>
            <Link href="/tu-truyen">
              Tủ truyện cá nhân <ArrowRight size={15} />
            </Link>
          </nav>
        </aside>
      </div>
      <nav className="support-info-links" aria-label="Thông tin Tiên Truyện">
        <Link href="/gioi-thieu">Về Tiên Truyện</Link>
        <span aria-hidden="true">·</span>
        <Link href="/dieu-khoan">Điều khoản sử dụng</Link>
        <span aria-hidden="true">·</span>
        <Link href="/chinh-sach-bao-mat">Chính sách bảo mật</Link>
      </nav>
    </main>
  );
}
