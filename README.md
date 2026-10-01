# Tiên Truyện

Nền tảng đọc truyện chữ với giao diện giấy ấm, xanh ngọc, ví Hồng Ngọc và không gian sáng tác. Bản local triển khai các luồng chính của [kế hoạch v3](PLAN.md). Đây là bản phát triển; xem [trạng thái triển khai](docs/READINESS.md) trước khi vận hành thật.

## Chạy bằng Docker

Cần Docker Desktop đang chạy. Không cần cài Node trên máy để dùng cách này.

```sh
cp .env.example .env
docker compose up -d --build
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

Mở http://localhost:3000. PostgreSQL local dùng cổng `55432`, Redis `56379`; chỉ bind vào loopback. Seed có 8 truyện mẫu do dự án biên soạn, mỗi truyện 12 chương, 5 chương đầu miễn phí. Không có tài khoản đăng nhập mặc định.

Muốn thử nạp giả lập, đặt `DEV_TOPUP_ENABLED=true` trong `.env`, sau đó `docker compose up -d api`. Chế độ này bị tắt vô điều kiện khi `NODE_ENV=production`. Hồng Ngọc giả lập không phải tiền thật.

## Luồng dùng thử

1. Đăng ký tại `/dang-ky`. Bản local hiển thị nút xác minh email để thử mà không cần SMTP.
2. Đăng nhập, chọn gói Hồng Ngọc, tạo đơn rồi xác nhận giả lập nếu đã bật.
3. Mở chương 6 của một truyện, xác nhận mua. Số dư được cập nhật từ API, có bản ghi trong lịch sử giao dịch.
4. `/bao-mat`: nhập mật khẩu để thiết lập 2FA, thêm khóa vào ứng dụng Authenticator và nhập mã xác nhận. Mỗi mã chỉ dùng một lần.
5. `/tro-thanh-tac-gia`: gửi hồ sơ có mẫu văn từ 1.000 chữ và cam kết bản quyền.

Để khởi tạo quản trị local, đăng ký/xác minh tài khoản của bạn rồi chạy:

```sh
docker compose exec api node dist/bootstrap-admin.js email-cua-ban@example.com
```

Bật 2FA tại `/bao-mat` trước khi truy cập chức năng quản trị. Script bootstrap từ chối chạy trong production. Admin duyệt hồ sơ ở `/admin`, sau đó tác giả tạo truyện tại `/tac-gia/truyen-moi`, chờ duyệt truyện và đăng chương.

## Phát triển với hot reload

Cần Node 22.16+ và pnpm 11.19.0. `.env.example` chứa cấu hình cho PostgreSQL/Redis local.

```sh
pnpm install
pnpm db:generate
docker compose up -d db redis
# Nạp biến môi trường bằng công cụ quản lý env của bạn, hoặc dùng runner bên dưới:
pnpm local migrate
pnpm local seed
pnpm local dev
```

`pnpm local ...` dùng `scripts/local.mjs` để đọc `.env` mà không thực thi nội dung file như shell. Có thể chạy `pnpm local web` để chỉ xem giao diện; khi API không hoạt động, trang công khai hiển thị thư viện mẫu có nhãn rõ ràng. Tài khoản, ví và mở khóa yêu cầu API thật.

## Kiểm tra

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm local test:integration
pnpm local reconcile
```

Integration cần API và database local đã seed; mặc định gọi `http://127.0.0.1:4000/api`. Nó tạo tài khoản kiểm thử riêng và giao dịch giả lập, không sử dụng tài khoản người dùng. Test truyện được ẩn sau kiểm tra. `reconcile` đối chiếu sổ cái với số dư, trả exit code 1 nếu lệch, và đánh dấu đơn nạp hết hạn.

## Cấu trúc

- `apps/web`: Next.js App Router, React, CSS responsive, Lucide; các trang đọc, ví, tài khoản, studio và admin.
- `apps/api`: NestJS, Prisma/PostgreSQL, Argon2id, JWT cookie, refresh xoay vòng, Redis rate limit, TOTP mã hóa AES-GCM.
- `apps/api/prisma`: schema, migrations, ràng buộc tiền nguyên/số dư, trigger sổ cái chỉ thêm, seed.
- `docker`: cấu hình Caddy. Compose production độc lập, chỉ proxy mở cổng.
- `docs/READINESS.md`: chức năng đã có và phần cần hoàn thiện.

## Giao dịch và dữ liệu

Giá và số dư chỉ quyết định tại server. Mua chương chạy trong transaction Serializable, khóa hàng ví, retry xung đột PostgreSQL, kiểm tra idempotency và unique purchase. Webhook mẫu kiểm tra HMAC-SHA256 trên raw body, số tiền và hạn đơn. Đây là giao thức mẫu để nối adapter của cổng thanh toán, không phải tích hợp sẵn với ngân hàng.

Hoàn tiền lượt mua là bút toán mới; bản local giữ quyền đọc sau hoàn tiền. Doanh thu đã giữ để rút/đã chi trả không thể tự hoàn mà cần đối soát. Không sửa/xóa sổ cái. Mốc cảnh giới và gói nạp trong database, có trang chỉnh cấu hình admin.

## Email và production

Đặt `SMTP_URL` và `MAIL_FROM` để gửi email thật. Link xác minh và reset dùng token một lần có hạn. Khi không cấu hình SMTP, chỉ local trả token dùng thử. Không commit `.env` hoặc bí mật.

Không dùng Compose development trên máy công khai. `docker-compose.prod.yml` là cấu hình khởi đầu, cần secrets ngẫu nhiên, domain HTTPS, cấu hình email, cổng thanh toán, backup và các hạng mục trong READINESS trước khi nhận tiền thật.

### Tài khoản thử local

Đã tạo admin `admin@tientruyen.local`, tác giả `author@tientruyen.local` (mỗi tài khoản 2.000 HN), cùng `reader1@tientruyen.local` đến `reader5@tientruyen.local` (mỗi tài khoản 5.000 HN).

Mật khẩu riêng và khóa 2FA được lưu trong `docs/local-accounts.md` trên máy chủ project, quyền đọc chỉ chủ file và đã loại khỏi Git. Thêm khóa của admin/tác giả vào ứng dụng Authenticator để lấy mã đăng nhập. Đây là HN thử, không phải giao dịch tiền thật. Tác giả thử quản lý các truyện mẫu ban đầu.

Trang hồ sơ `/tai-khoan` có ví, bảo mật và mục Trở thành tác giả; vào hồ sơ từ menu avatar. Trang chủ, footer và menu điều hướng chính không quảng bá đăng ký tác giả.

Script `apps/api/src/seed-local-accounts.ts` chỉ chạy khi bật `LOCAL_ACCOUNT_SEED=true` ngoài production và chỉ định `LOCAL_ACCOUNT_OUTPUT`; từ chối ghi đè file mật khẩu hoặc tài khoản hiện có.

### Avatar tài khoản

Bộ 11 avatar trong `apps/web/public/avatars` được nhập từ thư mục ảnh do chủ máy cung cấp, chuẩn hóa 256×256 WebP. Đăng ký mới chọn ngẫu nhiên; migration gán avatar cho các tài khoản hiện có.

Vào **Hồ sơ tài khoản → Đổi avatar** để chọn ảnh có sẵn hoặc tải ảnh JPG/PNG/WebP tối đa 2 MB. Server kiểm tra chữ ký file, giới hạn kích thước ảnh, loại metadata và chuyển sang WebP. Ảnh tải lên được lưu trong volume `avatar-uploads`, nên được giữ qua rebuild/recreate container. Cần backup volume này cùng database.

Tên đăng ký mới giới hạn 8–15 ký tự; tên trên header co theo nội dung, giữ mũi tên gần tên. Khung tìm kiếm cùng chiều rộng cột truyện hoàn thành ở desktop.
