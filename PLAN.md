# TienTruyen: Kế hoạch v3

> Web đọc truyện chữ, tối giản hiện đại pha chút tiên hiệp. Tác giả tự quyết định chương khóa và giá. Độc giả nạp **Hồng Ngọc** để mua từng chương. Có hệ thống cấp bậc cho cả độc giả và tác giả. Chạy bằng Docker. Bảo mật là ưu tiên hàng đầu.

---

## 1. Các quyết định đã chốt

| Mục | Quyết định |
|---|---|
| Đơn vị tiền | **Hồng Ngọc (HN)** |
| Khóa chương và giá | **Tác giả quyết định** từng chương: miễn phí hay khóa, giá bao nhiêu |
| Cách mua | **Mua lẻ từng chương** bằng HN trong ví |
| Ví | Nạp trước, HN lưu trong tài khoản; **số dư hiển thị cạnh avatar** |
| Khách chưa đăng nhập | Chỉ đọc chương miễn phí |
| Quyền tác giả | Phải **xin quyền tác giả** (admin duyệt hồ sơ) mới được tạo truyện và đăng chương |
| Truyện mới | Tác giả đã có quyền vẫn phải **chờ admin duyệt từng truyện mới** |
| Cấp bậc | Độc giả lên cấp theo **tổng tiền đã nạp**; tác giả lên cấp theo **số chương đã đăng** |
| Thuế | Giai đoạn phát triển, chưa tính; dùng số liệu tạm hợp lý (mục 4) |
| Kiến trúc | Next.js (web) + NestJS (API) + PostgreSQL + Redis + Meilisearch |
| Triển khai | Docker + Docker Compose |
| Giao diện | Tối giản hiện đại, pha chút tiên hiệp; tùy chỉnh cỡ chữ, kiểu chữ, màu |

---

## 2. Vai trò và quyền

| Vai trò | Quyền |
|---|---|
| **Khách** | Xem trang chủ, tìm kiếm, đọc chương miễn phí, tùy chỉnh giao diện đọc (lưu trên trình duyệt) |
| **Độc giả** | Như khách + nạp HN, mua chương, tủ truyện, lịch sử, bình luận, đánh giá, đồng bộ cài đặt, có cấp bậc độc giả |
| **Tác giả** | Như độc giả + tạo truyện (chờ duyệt), đăng/sửa chương, đặt khóa và giá, xem doanh thu, có cấp bậc tác giả |
| **Admin** | Duyệt hồ sơ tác giả, duyệt truyện, xử lý báo cáo, quản lý người dùng, xem giao dịch, hoàn tiền, chỉnh cấu hình |

### 2.1. Quy trình xin quyền tác giả
```
Độc giả bấm "Trở thành tác giả"
   -> điền hồ sơ: bút danh, giới thiệu, thể loại sở trường,
      đoạn văn mẫu (từ 1.000 chữ), tick cam kết bản quyền
   -> AuthorApplication = PENDING
        |- Admin duyệt   -> role thêm AUTHOR, vào khu tác giả
        |- Admin từ chối -> kèm lý do, được nộp lại sau 7 ngày
```

### 2.2. Quy trình duyệt truyện
```
Tác giả tạo truyện -> PENDING
     |- Admin duyệt   -> APPROVED: công khai, tác giả đăng chương tự do
     |- Admin từ chối -> REJECTED (kèm lý do, sửa và gửi lại)
```
Chương đăng sau khi truyện đã duyệt hiện ngay; độc giả có thể báo cáo, admin có quyền gỡ.

---

## 3. Cơ chế Hồng Ngọc, chương khóa và mua chương

### 3.1. Tác giả quyết định khóa và giá
- Mỗi chương có hai trường: `isFree` và `price` (HN).
- Có công cụ đặt hàng loạt, ví dụ "từ chương 11 trở đi khóa, giá 20 HN".
- **Giới hạn giá theo cấp tác giả** (xem mục 5.2) để tránh đặt giá phi lý.
- **Quy tắc bảo vệ độc giả (đề xuất):**
  - Truyện phải có tối thiểu **5 chương miễn phí đầu** để độc giả đọc thử (admin chỉnh được).
  - Không được chuyển chương **miễn phí đã công khai quá 24 giờ** thành chương khóa.
  - Đổi giá chỉ áp dụng cho lượt mua sau; người đã mua giữ nguyên quyền đọc, không phải trả thêm.
  - Chương chuyển từ khóa sang miễn phí thì người đã mua **không** được hoàn tiền (nêu rõ trong điều khoản).

### 3.2. Luồng mua chương
1. Độc giả mở chương khóa -> thấy tên chương, đoạn mở đầu ngắn (tùy chọn), giá và số dư hiện tại.
2. Chưa đăng nhập -> chuyển tới đăng nhập, xong quay lại đúng chương.
3. Đủ HN -> bấm **Mở khóa** -> hộp xác nhận một chạm -> trừ HN, ghi quyền đọc, hiện nội dung ngay.
4. Thiếu HN -> hiện nút **Nạp thêm** với số HN còn thiếu.
5. Sau khi mua, số dư cạnh avatar cập nhật tức thì.

### 3.3. Hiển thị số dư cạnh avatar
```
Header:  [Logo]  Thể loại  Xếp hạng  [Tìm kiếm]        [ 💎 1.250 HN ] [ Avatar ▾ ]
                                                                         |
                                                    Dropdown: Tên + huy hiệu cấp bậc
                                                              Số dư: 1.250 HN   [Nạp thêm]
                                                              Tủ truyện · Lịch sử mua · Cài đặt · Đăng xuất
```
- Chip số dư luôn hiện trên desktop; trên mobile hiện dạng gọn (biểu tượng + số rút gọn như `1,2k`).
- Bấm vào chip đi thẳng tới trang nạp.
- Khi số dư thay đổi: hiệu ứng số chạy nhẹ và đổi màu ngắn.
- Số dư hiển thị lấy từ server (không tin số lưu ở client).

---

## 4. Số liệu tạm cho giai đoạn phát triển (không tính thuế)

Tất cả nằm trong bảng cấu hình (config) để admin đổi được, không hard-code.

### 4.1. Quy đổi và gói nạp
**1 Hồng Ngọc = 100 VNĐ.**

| Gói | Tiền nạp | HN cơ bản | Thưởng | Tổng nhận |
|---|---|---|---|---|
| Nhỏ | 20.000đ | 200 | 0 | 200 |
| Vừa | 50.000đ | 500 | +25 (5%) | 525 |
| Lớn | 100.000đ | 1.000 | +80 (8%) | 1.080 |
| Siêu | 200.000đ | 2.000 | +200 (10%) | 2.200 |
| Tối thượng | 500.000đ | 5.000 | +750 (15%) | 5.750 |

Nạp tối thiểu 10.000đ, tối đa 5.000.000đ mỗi giao dịch và 20.000.000đ mỗi ngày mỗi tài khoản (chống gian lận).

### 4.2. Giá chương
- Giá tối thiểu **5 HN** (500đ), tối đa theo cấp tác giả (mục 5.2), mặc định gợi ý **20 HN** (2.000đ).

### 4.3. Chia doanh thu
- Mỗi lượt mua: tác giả nhận theo tỉ lệ của cấp tác giả (**70% - 80%**), nền tảng giữ phần còn lại.
- Doanh thu tác giả quy đổi khi rút: 1 HN = 100đ; rút tối thiểu **200.000đ**; admin duyệt chi trả (thủ công ở giai đoạn đầu).
- Ghi lại tỉ lệ chia **tại thời điểm mua** trong từng giao dịch để không bị sai khi tỉ lệ thay đổi sau này.

---

## 5. Hệ thống cấp bậc

Tên cấp lấy từ cảnh giới tiên hiệp để vừa chủ đề vừa dễ nhớ. Mọi mốc đều nằm trong bảng cấu hình.

### 5.1. Cấp độc giả (theo tổng tiền đã nạp, tính trọn đời)

| Cấp | Cảnh giới | Tổng nạp tích lũy | Đặc quyền |
|---|---|---|---|
| 1 | Phàm Nhân | 0đ | Huy hiệu cơ bản |
| 2 | Luyện Khí | 50.000đ | Huy hiệu màu |
| 3 | Trúc Cơ | 200.000đ | Khung avatar đồng |
| 4 | Kim Đan | 500.000đ | Thưởng nạp thêm +2% |
| 5 | Nguyên Anh | 1.000.000đ | Khung avatar bạc, +3% |
| 6 | Hóa Thần | 2.000.000đ | Màu tên khi bình luận, +4% |
| 7 | Luyện Hư | 5.000.000đ | Khung avatar vàng, +5% |
| 8 | Hợp Thể | 10.000.000đ | Hiệu ứng avatar, +6% |
| 9 | Đại Thừa | 20.000.000đ | Danh hiệu đặc biệt, +8% |
| 10 | Chân Tiên | 50.000.000đ | Danh hiệu cao nhất, +10% |

- Chỉ tính tiền **nạp thành công**; hoàn tiền thì trừ lại khỏi tổng.
- Cấp **không bị giảm** khi tiêu HN (tính theo tiền nạp, không phải số dư).
- Giao diện: thanh tiến độ "còn X đ để lên Trúc Cơ" trong trang tài khoản.

### 5.2. Cấp tác giả (theo số chương đã đăng hợp lệ)

| Cấp | Danh hiệu | Số chương | Tối đa giá/chương | Truyện đăng song song | Tỉ lệ nhận doanh thu | Đặc quyền |
|---|---|---|---|---|---|---|
| 1 | Tân Thủ | 0 | 20 HN | 1 | 70% | Huy hiệu cơ bản |
| 2 | Học Đồ | 20 | 30 HN | 2 | 70% | Huy hiệu màu |
| 3 | Chấp Bút | 100 | 40 HN | 3 | 72% | Khung avatar đồng |
| 4 | Văn Sĩ | 300 | 50 HN | 4 | 74% | Ưu tiên duyệt truyện |
| 5 | Văn Hào | 700 | 60 HN | 5 | 76% | Khung bạc, có cơ hội lên mục đề cử |
| 6 | Đại Gia | 1.500 | 80 HN | 6 | 78% | Khung vàng, huy hiệu nổi bật |
| 7 | Tông Sư | 3.000 | 100 HN | 8 | 80% | Danh hiệu cao nhất, ưu tiên hỗ trợ |

**Chống gian lận cấp bậc tác giả** (bắt buộc, nếu không sẽ có người đăng chương rác để lên cấp):
- Chỉ tính chương **từ 1.000 chữ trở lên**, đã công khai, không bị gỡ hoặc báo cáo vi phạm đã xác nhận.
- Tối đa **5 chương/ngày** được tính vào cấp.
- Phát hiện nội dung trùng lặp (hash/độ tương đồng) thì không tính.
- Chương bị gỡ sau đó thì **trừ lại** khỏi tổng và có thể hạ cấp.
- Admin có quyền điều chỉnh/khóa cấp của tài khoản vi phạm.

---

## 6. Bảo mật

Đây là phần bắt buộc, đặc biệt vì web có tiền (HN). Mục tiêu: không ai đọc chương khóa khi chưa mua, không ai tạo hoặc sửa số dư trái phép, không ai chiếm quyền tài khoản.

### 6.1. Xác thực và phiên đăng nhập
- Mật khẩu băm bằng **Argon2id** (không bao giờ lưu thô, không dùng MD5/SHA đơn thuần).
- Yêu cầu mật khẩu tối thiểu 10 ký tự, kiểm tra với danh sách mật khẩu bị lộ phổ biến.
- **Access token** sống ngắn (15 phút), **refresh token** sống dài; cả hai nằm trong cookie `HttpOnly + Secure + SameSite=Lax`, không để trong localStorage.
- Refresh token **xoay vòng** (mỗi lần dùng phát token mới, token cũ vô hiệu); lưu bản băm trong DB; phát hiện dùng lại token cũ thì thu hồi toàn bộ phiên của người đó.
- Xác minh email khi đăng ký; đặt lại mật khẩu bằng token dùng một lần, hết hạn nhanh.
- **Admin và tác giả: bắt buộc 2FA (TOTP)**; độc giả có thể bật tùy chọn.
- Giới hạn đăng nhập sai (khóa tạm theo IP + tài khoản), thông báo lỗi chung chung để không lộ tài khoản có tồn tại hay không.
- Cloudflare Turnstile (hoặc reCAPTCHA) ở đăng ký, đăng nhập, quên mật khẩu.
- Cho người dùng xem và đăng xuất khỏi các thiết bị đang đăng nhập.

### 6.2. Phân quyền
- Mặc định **từ chối**; mỗi endpoint khai báo rõ vai trò được phép (RBAC bằng Guard).
- Kiểm tra **quyền sở hữu ở server** cho mọi thao tác (chống IDOR): tác giả chỉ sửa truyện/chương của mình, độc giả chỉ xem ví và giao dịch của mình.
- Khu admin tách riêng, bắt buộc 2FA, mọi hành động ghi nhật ký.
- Không tin bất kỳ dữ liệu quyền nào do client gửi (role, userId, giá, số dư).

### 6.3. Bảo vệ nội dung chương khóa
- API chỉ trả `content` khi chương **miễn phí** hoặc người dùng **đã có bản ghi mua**; ngược lại chỉ trả tên chương, giá, đoạn mở đầu ngắn.
- Chương khóa **không** đưa vào SSG/ISR/cache công khai/CDN. Phản hồi chương trả phí dùng `Cache-Control: private, no-store`.
- Chỉ chương miễn phí mới render sẵn để tối ưu SEO.
- Giới hạn tốc độ đọc chương theo tài khoản/IP để chống cào hàng loạt; cảnh báo tài khoản đọc bất thường.
- Tùy chọn giai đoạn sau: **watermark ẩn** (ký tự vô hình mã hóa ID người đọc) để truy vết khi nội dung bị phát tán.
- Thừa nhận giới hạn: không thể chống sao chép 100% với nội dung văn bản đã hiển thị; mục tiêu là làm khó và truy vết được.

### 6.4. Toàn vẹn ví và giao dịch
- **Số tiền dùng số nguyên** (HN và VNĐ), không dùng số thực.
- **Giá lấy từ database ở server**, không bao giờ lấy từ request của client.
- Mua chương chạy trong **một transaction**: khóa dòng ví (`SELECT ... FOR UPDATE`), kiểm tra đủ số dư, trừ HN, ghi `ChapterPurchase`, ghi sổ cái, cộng doanh thu tác giả; lỗi bước nào thì hoàn tác toàn bộ.
- Ràng buộc ở tầng DB: `CHECK (balance >= 0)`, `UNIQUE (userId, chapterId)` cho bản ghi mua (không mua hai lần, chống bấm đúp).
- **Idempotency key** cho yêu cầu mua và nạp: gửi lặp lại không tạo giao dịch mới.
- **Sổ cái chỉ thêm** (`WalletTransaction`): không sửa/xóa; hoàn tiền là một bút toán đảo ngược mới.
- Job đối soát hằng ngày: tổng sổ cái phải khớp số dư ví; lệch thì cảnh báo ngay.
- Kiểm thử cạnh tranh (concurrency): nhiều yêu cầu mua đồng thời không được làm số dư âm hoặc trừ hai lần.

### 6.5. Thanh toán
- Webhook cổng thanh toán: **xác thực chữ ký (HMAC)**, kiểm tra số tiền khớp đơn, kiểm tra đơn còn hạn.
- Xử lý **idempotent** theo `providerTxnId`: nhận webhook trùng vẫn chỉ cộng HN một lần.
- **Không tin trang "thanh toán thành công" phía client**; chỉ cộng HN khi webhook (hoặc truy vấn lại cổng) xác nhận.
- Đơn nạp có thời hạn, trạng thái rõ ràng (PENDING / PAID / EXPIRED / FAILED).
- Giai đoạn phát triển dùng môi trường sandbox của cổng thanh toán; có chế độ nạp giả lập chỉ bật ở môi trường dev, **tự động tắt ở production**.

### 6.6. Chống tấn công ứng dụng web
- **XSS**: nội dung chương/bình luận lưu dạng văn bản thuần hoặc Markdown giới hạn, qua bộ lọc sạch (sanitize) và escape khi hiển thị; thêm **Content-Security-Policy** chặt.
- **SQL injection**: dùng Prisma (tham số hóa); không ghép chuỗi vào câu truy vấn thô.
- **CSRF**: cookie `SameSite`, kiểm tra header `Origin`, kèm CSRF token cho thao tác thay đổi dữ liệu.
- **CORS**: chỉ cho phép đúng domain web, không dùng `*`.
- **Validation**: mọi đầu vào qua DTO/schema (class-validator hoặc zod), chặn trường lạ (`whitelist`), giới hạn kích thước body.
- **Header bảo mật** (Helmet / Caddy): HSTS, `X-Content-Type-Options`, `frame-ancestors 'none'`, `Referrer-Policy`.
- **Rate limit** bằng Redis theo IP và theo tài khoản, siết chặt ở đăng nhập, nạp, mua, bình luận, báo cáo.
- **Upload ảnh**: kiểm tra loại file theo nội dung thực (magic bytes), giới hạn dung lượng, **xử lý lại ảnh** (sharp) để loại metadata và mã độc, đặt tên ngẫu nhiên, lưu ở bucket/domain riêng, không cho thực thi.
- Chống spam bình luận: giới hạn tần suất, lọc từ khóa, tài khoản mới bị giới hạn chặt hơn.

### 6.7. Bảo mật hạ tầng Docker
- Container chạy bằng **user không phải root**, image nhỏ (alpine/distroless), ghim phiên bản, không dùng tag `latest`.
- **Production chỉ mở cổng của proxy (80/443)**. PostgreSQL, Redis, Meilisearch, MinIO nằm trong mạng nội bộ Docker, không publish cổng ra ngoài.
- Bí mật (mật khẩu DB, khóa JWT, khóa webhook) lấy từ biến môi trường/Docker secrets; **không commit `.env`**; mỗi môi trường dùng khóa khác nhau; có quy trình đổi khóa.
- Redis và Meilisearch bắt buộc có mật khẩu/master key.
- Healthcheck, giới hạn CPU/RAM, hệ thống tập tin chỉ đọc khi có thể.
- Quét lỗ hổng image và thư viện (Trivy, `npm audit`, Dependabot) trong CI.
- **Sao lưu** PostgreSQL hằng ngày, mã hóa, lưu nơi khác, **thử khôi phục định kỳ**.

### 6.8. Nhật ký, giám sát và quyền riêng tư
- **Audit log** cho: đăng nhập/đăng xuất, đổi mật khẩu, mọi biến động ví, hành động admin, duyệt/gỡ nội dung, hoàn tiền.
- Không ghi mật khẩu, token, dữ liệu thanh toán nhạy cảm vào log.
- Cảnh báo bất thường: nhiều lần đăng nhập sai, nạp/mua dồn dập, đối soát lệch.
- Thu thập tối thiểu dữ liệu cá nhân; cho phép xóa/ẩn danh tài khoản (giữ nguyên sổ cái tài chính, ẩn thông tin định danh).

### 6.9. Quy trình trước khi mở thật
- Review code theo **OWASP ASVS** (mức 2) cho các module `auth`, `wallet`, `payments`, `chapters`.
- Viết test cho các kịch bản tấn công: IDOR, mua đồng thời, webhook giả/trùng, đọc chương khóa không quyền.
- Kiểm thử xâm nhập (tự làm hoặc thuê) trước khi nhận tiền thật.

---

## 7. Giao diện: tối giản hiện đại + chút tiên hiệp

| Yếu tố | Gợi ý |
|---|---|
| Màu chính | Nền giấy ấm `#F7F3EA`, chữ mực `#1F2421`, nhấn xanh ngọc `#2F7D6D`, phụ vàng đồng `#B8893B` |
| Màu Hồng Ngọc | **Đỏ hồng ngọc `#C2185B`** cho biểu tượng 💎 và số dư; dùng tiết chế để nổi bật |
| Font | Tiêu đề: Noto Serif/Cormorant; nội dung: Be Vietnam Pro hoặc Noto Serif |
| Chi tiết tiên hiệp | Họa tiết mây rất mờ ở header/footer, đường kẻ nét mực, con dấu đỏ nhỏ làm logo, huy hiệu cấp bậc theo cảnh giới |
| Hiệu ứng | Mượt, ít, không lạm dụng |

### Hệ thống tùy chỉnh đọc

| Thiết lập | Giá trị |
|---|---|
| Cỡ chữ | 14 - 32 px |
| Kiểu chữ | Noto Serif, Be Vietnam Pro, Lexend, Mono |
| Giãn dòng | 1.4 - 2.4 |
| Độ rộng cột | Hẹp / Vừa / Rộng / Toàn màn hình |
| Theme | Sáng, Sepia, Tối, Đen OLED, Xanh dịu, Tùy chỉnh |
| Màu tùy chỉnh | Bộ chọn màu nền/chữ, cảnh báo nếu độ tương phản dưới 4.5:1 |

Cơ chế: store -> ghi **CSS variables** (`--reader-font-size`, `--reader-bg`...) -> lưu localStorage (khách) và đồng bộ tài khoản (người đã đăng nhập); chèn script nhỏ trong `<head>` để không bị nháy màu khi tải trang.

---

## 8. Danh sách trang

| Nhóm | Đường dẫn |
|---|---|
| Công khai | `/`, `/the-loai/[slug]`, `/truyen/[slug]`, `/truyen/[slug]/[chuong]`, `/tim-kiem`, `/bang-xep-hang` |
| Tài khoản | `/dang-nhap`, `/dang-ky`, `/tu-truyen`, `/lich-su`, `/cai-dat`, `/nap-hong-ngoc`, `/lich-su-giao-dich`, `/cap-bac` |
| Xin quyền tác giả | `/tro-thanh-tac-gia` |
| Tác giả | `/tac-gia`, `/tac-gia/truyen-moi`, `/tac-gia/truyen/[id]`, `/tac-gia/truyen/[id]/chuong-moi`, `/tac-gia/doanh-thu`, `/tac-gia/cap-bac` |
| Admin | `/admin`, `/admin/ho-so-tac-gia`, `/admin/duyet-truyen`, `/admin/nguoi-dung`, `/admin/bao-cao`, `/admin/giao-dich`, `/admin/cau-hinh` |

---

## 9. Mô hình dữ liệu

```
User                 id, email, name, passwordHash, role, totalTopupVnd, readerLevel,
                     twoFactorSecret?, readerSettings(JSON), createdAt
RefreshToken         id, userId, tokenHash, expiresAt, revokedAt, deviceInfo

AuthorApplication    id, userId, penName, bio, sampleText, status(PENDING|APPROVED|REJECTED),
                     rejectReason, reviewedBy
AuthorProfile        userId, penName, bio, chapterCount, authorLevel, revenueRate

Story                id, slug, title, authorId, description, coverUrl,
                     status(PENDING|APPROVED|REJECTED|HIDDEN), progress, rejectReason
Chapter              id, storyId, number, title, content, wordCount,
                     isFree, price(HN), publishedAt, countedForLevel
Genre / StoryGenre

Wallet               userId, balance(int, CHECK >= 0)
WalletTransaction    id, userId, type(TOPUP|BONUS|PURCHASE|REFUND|PAYOUT|ADJUST),
                     amount(int, +/-), balanceAfter, refType, refId, idempotencyKey, createdAt
                     (chỉ thêm, không sửa)
ChapterPurchase      id, userId, chapterId, pricePaid, authorShare, platformShare,
                     rateApplied, createdAt            UNIQUE(userId, chapterId)
TopupOrder           id, userId, amountVnd, coinsBase, coinsBonus, provider,
                     status, providerTxnId(unique), expiresAt
AuthorEarning        id, authorId, purchaseId, amount, status(AVAILABLE|PAID_OUT)
PayoutRequest        id, authorId, amount, status, reviewedBy

LevelConfig          type(READER|AUTHOR), level, name, threshold, perks(JSON)   <- chỉnh được
SystemConfig         key, value   (tỉ giá, gói nạp, giá tối thiểu, số chương free tối thiểu...)

Bookmark, ReadingProgress, Comment, Rating, Report
AuditLog             id, actorId, action, targetType, targetId, meta(JSON), ip, createdAt
```

---

## 10. Kiến trúc và Docker

```
Trình duyệt
    |
 [Caddy]  HTTPS, header bảo mật
    |-- /      -> web (Next.js)
    |-- /api   -> api (NestJS)
                   |-- PostgreSQL   (mạng nội bộ)
                   |-- Redis        (mạng nội bộ, có mật khẩu)
                   |-- Meilisearch  (mạng nội bộ, có master key)
                   |-- MinIO / R2   (ảnh bìa)
```

| Service | Vai trò | Mở cổng ra ngoài |
|---|---|---|
| `proxy` (Caddy) | HTTPS, định tuyến | Có (80/443) |
| `web` | Next.js | Không (qua proxy) |
| `api` | NestJS | Không (qua proxy) |
| `db` | PostgreSQL 16 | **Không** (production) |
| `redis` | Cache, rate limit, hàng đợi | **Không** |
| `search` | Meilisearch | **Không** |
| `minio` | Lưu ảnh (dev) | Không |

- **Dev** (`docker-compose.yml`): hot reload, mở cổng debug cục bộ.
- **Production** (`docker-compose.prod.yml`): multi-stage build, user không root, healthcheck, chỉ proxy mở cổng.

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api npx prisma migrate dev
docker compose exec api npx prisma db seed
```

---

## 11. Cấu trúc thư mục (monorepo)

```
tientruyen/
├── apps/
│   ├── web/                                  # Next.js
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── layout.tsx                # script theme, font
│   │   │   │   ├── page.tsx
│   │   │   │   ├── globals.css               # biến CSS, theme
│   │   │   │   ├── the-loai/[slug]/
│   │   │   │   ├── truyen/[slug]/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [chuong]/page.tsx     # trang đọc
│   │   │   │   ├── tim-kiem/
│   │   │   │   ├── nap-hong-ngoc/
│   │   │   │   ├── lich-su-giao-dich/
│   │   │   │   ├── cap-bac/
│   │   │   │   ├── tu-truyen/
│   │   │   │   ├── cai-dat/
│   │   │   │   ├── tro-thanh-tac-gia/        # form xin quyền tác giả
│   │   │   │   ├── (auth)/dang-nhap, dang-ky
│   │   │   │   ├── tac-gia/                  # khu tác giả
│   │   │   │   └── admin/
│   │   │   ├── components/
│   │   │   │   ├── ui/                       # nút, input, dialog
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   ├── UserMenu.tsx          # avatar + dropdown
│   │   │   │   │   ├── WalletChip.tsx        # 💎 số dư cạnh avatar
│   │   │   │   │   └── MobileMenu.tsx
│   │   │   │   ├── level/                    # LevelBadge, LevelProgress, AvatarFrame
│   │   │   │   ├── story/                    # StoryCard, ChapterList
│   │   │   │   ├── reader/
│   │   │   │   │   ├── ReaderContent.tsx
│   │   │   │   │   ├── ReaderToolbar.tsx
│   │   │   │   │   ├── ReaderSettingsPanel.tsx
│   │   │   │   │   ├── FontSizeControl.tsx
│   │   │   │   │   ├── FontFamilyPicker.tsx
│   │   │   │   │   ├── ThemePicker.tsx
│   │   │   │   │   ├── CustomColorPicker.tsx
│   │   │   │   │   ├── LockedChapter.tsx     # chương khóa + nút mở khóa
│   │   │   │   │   └── ChapterNav.tsx
│   │   │   │   ├── wallet/                   # TopupPackages, PurchaseDialog, TxnTable
│   │   │   │   └── author/                   # StoryForm, ChapterEditor, PriceBulkEditor
│   │   │   ├── features/
│   │   │   │   ├── reader-settings/          # store, themes, fonts, applySettings, contrast
│   │   │   │   ├── wallet/                   # useWallet (lấy số dư từ server)
│   │   │   │   ├── auth/
│   │   │   │   ├── library/
│   │   │   │   └── search/
│   │   │   ├── lib/                          # apiClient, seo, format (định dạng HN/VNĐ)
│   │   │   └── hooks/
│   │   ├── public/fonts, images
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── api/                                  # NestJS
│       ├── src/
│       │   ├── main.ts                       # helmet, CORS, validation pipe
│       │   ├── app.module.ts
│       │   ├── common/
│       │   │   ├── guards/                   # JwtAuthGuard, RolesGuard, OwnershipGuard
│       │   │   ├── decorators/
│       │   │   ├── filters/
│       │   │   ├── interceptors/             # audit log, idempotency
│       │   │   └── security/                 # rate-limit, csrf, sanitize
│       │   ├── config/
│       │   ├── prisma/
│       │   └── modules/
│       │       ├── auth/                     # đăng ký, đăng nhập, refresh, 2FA
│       │       ├── users/
│       │       ├── author-applications/      # xin quyền tác giả
│       │       ├── authors/
│       │       ├── stories/                  # CRUD + quy trình duyệt
│       │       ├── chapters/                 # đọc, kiểm tra quyền, khóa/giá
│       │       ├── genres/
│       │       ├── wallet/                   # số dư, sổ cái
│       │       ├── purchases/                # mua chương (transaction)
│       │       ├── payments/                 # đơn nạp, webhook
│       │       ├── levels/                   # tính và cập nhật cấp bậc
│       │       ├── earnings/                 # doanh thu, rút tiền tác giả
│       │       ├── library/
│       │       ├── comments/
│       │       ├── reports/
│       │       ├── search/
│       │       ├── admin/
│       │       ├── audit/
│       │       └── uploads/
│       ├── prisma/ (schema.prisma, migrations/, seed.ts)
│       ├── test/ (e2e, security, concurrency)
│       ├── Dockerfile
│       └── package.json
│
├── packages/shared/                          # kiểu, enum, hằng số dùng chung
├── docker/Caddyfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── pnpm-workspace.yaml
└── README.md
```

**Nguyên tắc:** web chỉ hiển thị và gọi API; mọi quyết định về quyền, giá, số dư nằm ở `apps/api`. Các module `wallet`, `purchases`, `payments`, `auth`, `chapters` là vùng nhạy cảm, bắt buộc có test và review kỹ.

---

## 12. Lộ trình

| Giai đoạn | Nội dung | Ước lượng |
|---|---|---|
| **0. Nền móng** | Monorepo, Docker Compose, Prisma schema, cấu hình bảo mật nền (helmet, rate limit, validation), seed | 1 tuần |
| **1. MVP đọc** | Trang chủ, thể loại, chi tiết truyện, trang đọc + bảng tùy chỉnh, tìm kiếm, chương miễn phí cho khách | 2-3 tuần |
| **2. Tài khoản & ví** | Đăng ký/đăng nhập (JWT cookie, refresh xoay vòng), ví, nạp HN (sandbox), mua chương, chip số dư cạnh avatar, cấp độc giả | 3-4 tuần |
| **3. Tác giả & admin** | Xin quyền tác giả, duyệt hồ sơ, tạo truyện + duyệt, đăng chương, đặt khóa/giá, cấp tác giả, admin cơ bản | 3-4 tuần |
| **4. Hoàn thiện** | Doanh thu và rút tiền tác giả, bình luận, đánh giá, xếp hạng, thông báo, đối soát tự động, 2FA | 3-4 tuần |
| **5. Trước khi mở thật** | Rà soát bảo mật (ASVS), test tấn công, kiểm thử tải, sao lưu/khôi phục | 1-2 tuần |
| **6. Mở rộng** | PWA, đọc offline, TTS, mua combo chương, tự động mua chương kế, khuyến mãi | tùy chọn |

---

## 13. Câu hỏi còn mở

1. Các con số ở mục 4 và 5 (tỉ giá 1 HN = 100đ, gói nạp, mốc cấp bậc, tỉ lệ chia 70-80%) bạn thấy ổn chưa, hay muốn đổi?
2. Có cần **mua combo nhiều chương** (ví dụ mua 10 chương giảm 10%) và **tự động mua chương kế tiếp** ngay từ đầu không? Mình đề xuất để giai đoạn 6.
3. Bước tiếp theo bạn muốn mình làm gì trước: **dựng khung code + Docker Compose**, hay **thiết kế giao diện mẫu** (trang chủ, trang đọc có bảng tùy chỉnh, header có chip Hồng Ngọc)?
