# Trạng thái triển khai theo kế hoạch v3

## Đã triển khai trong bản local

- Monorepo Next.js + NestJS, PostgreSQL, Redis; cấu hình service Meilisearch; Docker Compose development và mẫu production riêng.
- Giao diện responsive: trang chủ, thư viện/tìm kiếm/lọc, xếp hạng theo điểm, chi tiết, danh sách chương, đọc truyện, tủ truyện, lịch sử.
- Trình đọc: cỡ chữ 14–32, giãn dòng 1.4–2.4, serif/sans/mono/Lexend, 4 độ rộng, 6 nền, màu tùy chỉnh, cảnh báo tương phản, lưu local và đồng bộ tài khoản.
- Đăng ký/đăng nhập, Argon2id, xác minh email, reset một lần, JWT cookie HttpOnly, refresh token băm và xoay vòng, thu hồi toàn bộ phiên khi replay, danh sách thiết bị.
- TOTP theo RFC 6238, bí mật mã hóa AES-GCM; mã chống dùng lại. Thao tác tác giả/quản trị có kiểm tra quyền và 2FA ở server.
- Ví server, chip Hồng Ngọc, đơn nạp có hạn, giả lập chỉ development, webhook HMAC mẫu, hạn mức nạp, ledger chỉ thêm.
- Mua chương transactional: khóa ví, retry serialization conflict, không âm, không mua trùng, ghi tỷ lệ tác giả tại thời điểm mua.
- Hồ sơ tác giả, duyệt hồ sơ/truyện, đăng và sửa chương, đổi giá hàng loạt; bảo vệ 5 chương đầu và chương đã miễn phí trên 24 giờ.
- Cấp độc giả theo tổng nạp; cấp tác giả theo chương hợp lệ, hash trùng chính xác, giới hạn 5 chương tính cấp/ngày.
- Bình luận văn bản thuần, đánh giá, báo cáo, ẩn nội dung, audit log, hoàn HN lượt mua, giữ doanh thu và yêu cầu rút, admin xác nhận chi trả thủ công.
- Cấu hình gói nạp, tỷ giá, mức miễn phí và mốc cấp bậc qua admin; đối soát sổ cái bằng lệnh.
- Kiểm thử chính sách, TOTP vector, chữ ký; integration PostgreSQL/Redis với mua đồng thời, quyền đọc, CSRF, IDOR, MFA và quy trình duyệt.

## Cần hoàn thiện trước vận hành thật

- Chọn và tích hợp adapter cổng thanh toán sandbox/production cụ thể (hiện chỉ có webhook chung và nạp local); thử đối soát nhà cung cấp, hoàn tiền nạp và rút tiền thực tế.
- Cấu hình SMTP/domain thật, thử deliverability; tích hợp Turnstile, kiểm tra danh sách mật khẩu bị lộ đầy đủ và khóa tăng dần theo số lần thất bại. Hiện rate limit theo nhóm endpoint/IP và 10 lần đăng nhập/email trong 15 phút; danh sách mật khẩu phổ biến còn ngắn.
- Meilisearch mới được provision; tìm kiếm hiện lọc thư viện từ API (tối đa 100 truyện). Cần index metadata, đồng bộ khi duyệt/gỡ và phân trang server cho thư viện lớn.
- Bìa truyện hiện là minh họa CSS có sẵn. Chưa nhận upload bìa; cần pipeline kiểm tra magic bytes, sharp, bucket riêng trước khi bật upload.
- Chống trùng hiện hash sau normalize, chưa so độ tương đồng; bổ sung điều chỉnh/khóa cấp thủ công và nhận diện spam nâng cao.
- Đã bổ sung Lexend; bìa/huy hiệu hiện là CSS, chưa đủ đặc quyền khung avatar/màu tên theo mọi cảnh giới.
- Đã bổ sung metadata từng truyện/chương, canonical, Open Graph, robots và sitemap (hiện theo 100 truyện API). Chi tiết truyện và chương miễn phí đã render từ server, không chuyển cookie sang API nên nội dung khóa không lộ qua SSR. Cần sitemap phân trang và kiểm thử tránh nháy theme.
- CSP cần chuyển script inline sang nonce; giới hạn quyền DB cho runtime/migrations riêng, chuẩn hóa secrets/image digest, healthchecks cho search, thử khôi phục backup và giám sát cảnh báo.
- Cần quy trình khôi phục 2FA, mã dự phòng; đặt lại mật khẩu không bỏ qua 2FA hiện có.
- Xóa/ẩn danh tài khoản, điều khoản/pháp lý, thông báo trong ứng dụng, kiểm duyệt từ khóa và pagination các danh sách chưa hoàn thiện.
- Đối soát có CLI nhưng chưa lên lịch hằng ngày; cần scheduler và kênh cảnh báo do chủ hệ thống chọn.
- Production Compose là nền móng, không phải xác nhận đủ tiêu chuẩn OWASP ASVS L2. Cần review bảo mật độc lập, kiểm thử tải/pentest và thử backup/restore trước nhận tiền thật.

## Quyết định triển khai bổ sung

- Không tạo admin với mật khẩu mặc định. Chủ máy bootstrap tài khoản đã xác minh bằng CLI local, rồi bật 2FA.
- Hoàn HN lượt mua giữ quyền đọc và đảo trạng thái doanh thu. Hoàn khoản đã trả tác giả cần quy trình đối soát riêng.
- Rút doanh thu yêu cầu toàn bộ khoản khả dụng, chỉ một yêu cầu đang chờ; admin đánh dấu đã chuyển khoản sau khi chi trả bên ngoài. Không tự chuyển tiền.
- Dữ liệu mẫu được ghi rõ trên UI khi API vắng mặt. Không giả lập số dư ở trình duyệt.

## Kiểm chứng bản local ngày 01/10/2026

- 9/9 kiểm thử chính sách và tích hợp PostgreSQL/Redis đạt, không bỏ qua test.
- Build Docker web/API và kiểm tra TypeScript đạt.
- HTML chương miễn phí chứa nội dung; API khách không trả nội dung chương khóa.
- Metadata chương, sitemap, robots và API proxy kiểm tra đạt.
- Đối soát ví: không có chênh lệch ledger.
- Giới hạn email: 10 lần thử trả 401 với tài khoản giả; lần 11 trả 429 cùng Retry-After 900.
- Người dùng chọn giữ nạp thử local; chưa bật thanh toán thật.

## Cập nhật trang chủ và tài khoản thử

- Thiết kế lại trang chủ theo bố cục thư viện: truyện nổi bật, tìm kiếm hoạt động, truyện hoàn thành, kệ theo thể loại, cập nhật và xếp hạng theo điểm.
- Tên thương hiệu header/footer là “Tiên Truyện”.
- Đưa đăng ký tác giả vào hồ sơ và menu tài khoản; bỏ lời mời ở trang chủ/footer/menu điều hướng.
- Trang hồ sơ hiển thị vai trò, ví và các lối vào quản lý tài khoản.
- Tạo 1 admin, 1 tác giả và 5 độc giả thử, có ledger HN và mật khẩu ngẫu nhiên riêng; 2FA bật cho admin/tác giả. File mật khẩu riêng tư, không đưa vào Git.
- Đã kiểm tra đăng nhập, quyền và số dư của cả 7 tài khoản qua API; kiểm tra UI đăng nhập độc giả, hồ sơ, tìm kiếm và mobile 390px.
- Kiểm tra TypeScript, build Docker, 9 kiểm thử và đối soát ví đạt.

## Avatar

- Bộ 11 ảnh có sẵn, avatar ngẫu nhiên khi đăng ký và migration tự gán cho tài khoản cũ.
- Chọn avatar hoặc tải ảnh từ hồ sơ; header cập nhật ngay sau khi lưu.
- Upload nhận JPG/PNG/WebP ≤2 MB, kiểm tra magic bytes, ảnh tĩnh, tối đa 20 triệu pixel, reencode 256×256 và bỏ metadata. Không nhận URL ảnh tùy ý hoặc SVG.
- Giới hạn 5 lần tải/account/giờ; ảnh lưu volume riêng, cần đưa vào quy trình backup.
