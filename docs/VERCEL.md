# Tiên Truyện trên Vercel Services

Import repository với Root Directory là thư mục gốc chứa vercel.json, không chọn apps/web.
Hai dịch vụ: api (NestJS), web (Next.js). API giữ nguyên @Controller("api").
Public /api/* đi trực tiếp đến api; mọi đường dẫn còn lại đến web.
Web gọi API ở server qua API_SERVICE_URL do binding Vercel tự cấp lúc runtime.
Không tự đặt API_SERVICE_URL trong .env hoặc Dashboard. API_INTERNAL_URL chỉ dùng
cho chạy local/Docker thông thường. Không dùng binding trong middleware hay build.
Next.js API proxy được giữ lại cho môi trường local/Docker; Vercel chuyển /api/*
thẳng đến NestJS, bao gồm OAuth callback và webhook payOS.

Build API tạo Prisma client trước khi compile; không chạy migration hay seed trong build.
Chạy prisma migrate deploy riêng sau khi đã cấu hình và sao lưu database cloud.

Các biến phải cấu hình trước khi chạy thật: DATABASE_URL (PostgreSQL cloud),
REDIS_URL (Redis cloud), JWT_SECRET ngẫu nhiên ít nhất 32 ký tự, APP_ORIGIN là
origin HTTPS của deployment. Cấu hình OAuth, SMTP và payOS theo INTEGRATIONS.md.
Các URL localhost và hostname Docker không truy cập được từ Vercel.

Kiểm tra toàn bộ dịch vụ bằng vercel dev từ repository root. Lệnh tự cấp binding;
cần database và Redis phù hợp. Kiểm tra /api/health, trang truyện, đăng nhập,
cookie, OAuth callback và webhook trên deployment preview trước khi production.

Avatar upload: SDK @vercel/blob tự đọc BLOB_STORE_ID/OIDC hoặc BLOB_READ_WRITE_TOKEN.
Tạo Blob store Public và kết nối với project. Chỉ ảnh avatar đã xử lý thành WebP
256x256 được upload; không upload file gốc. URL blob được lưu trong tài khoản.
Trên Vercel, thiếu cấu hình Blob sẽ từ chối upload, không ghi vào filesystem tạm.
Ảnh upload cũ trên máy không tự chuyển sang cloud: cần sao lưu và chuyển riêng
trước khi dùng database local trên cloud. Thư viện avatar mặc định vẫn là asset của web.

Các endpoint GET có bảo vệ bằng Authorization: Bearer <CRON_SECRET>:
- /api/jobs/publish: đăng tối đa 20 chương đến lịch.
- /api/jobs/payments: kiểm tra tối đa 30 đơn payOS trong 7 ngày gần nhất.
- /api/jobs/ledger: kiểm tra chênh lệch ví, chỉ ghi log, không sửa số dư.

CRON_SECRET phải ngẫu nhiên ít nhất 32 ký tự, chỉ lưu server/scheduler.
Mỗi job khóa Redis 5 phút để hạn chế request đồng thời và gọi lặp.
Lock tự hết hạn; nếu job lỗi, scheduler cần thử lại sau 5 phút và theo dõi logs.
Vercel không chạy timer nền; local/Docker vẫn giữ timer như trước.

vercel.json bật cron ledger mỗi ngày tại 02:00 UTC (09:00 giờ Việt Nam).
Hobby có thể gọi bất kỳ lúc nào trong giờ đó. Cron tự thêm Bearer CRON_SECRET.
Hobby không hỗ trợ lịch mỗi phút; dùng scheduler bên ngoài gọi publish/payments
mỗi 5 phút hoặc thường xuyên hơn trên gói có hỗ trợ. Chưa tạo scheduler cloud.
Điều chỉnh TTL/batch/time budget cùng nhau nếu cần tải lớn hơn; chưa bảo đảm khóa
không hết hạn khi job chạy quá 5 phút. Việc đăng chương/thanh toán vẫn kiểm tra
trạng thái và dùng transaction để tránh phát hành/cộng số dư hai lần.

Kiểm tra biến bằng node scripts/check-cloud.mjs sau khi đã cấp env an toàn.
Script không in giá trị khóa. Cần kiểm tra kết nối thật sau bước này.

Tài liệu: https://vercel.com/docs/services,
https://vercel.com/docs/vercel-blob/using-blob-sdk,
https://vercel.com/docs/cron-jobs/manage-cron-jobs

## Database preview đã chuẩn bị

Neon project: young-field-88974605 (TienTruyen).
Nhánh preview: br-crimson-brook-b4f39c46 (tientruyen-preview).
Migration chỉ áp dụng lên preview; chưa áp dụng lên production.
File .env.cloud.local được gitignore, quyền 600, chứa DATABASE_URL pooled cho API
và DATABASE_URL_UNPOOLED direct để migrate. Không commit hoặc gửi file này.
Không thay thế .env local hiện có.

Đã xác minh trên Neon preview: 6 migration thành công, nạp 8 truyện mẫu;
kiểm tra tích hợp tác giả/admin đạt; kiểm tra đăng nhập/phiên, nạp thử local,
mua chương đồng thời và quyền đọc đạt sau khi tăng maxWait transaction lên 10s.
Không xác minh Google/Facebook/payOS thật (chưa có khóa); chưa có Redis/Blob
cloud hay deployment Vercel. API tạm cổng 4100 đã dừng sau kiểm tra.
