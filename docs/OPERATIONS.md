# Vận hành và kiểm tra Tiên Truyện

## Kiểm tra trên Vercel, không cần Docker

- `pnpm typecheck`, `pnpm test`, `pnpm test:backup`: kiểm tra mã và chính sách. Test integration mặc định bỏ qua nếu không có `INTEGRATION_URL`; không trỏ bộ test local vào production.
- `pnpm test:vercel`: kiểm tra HTTPS, API/DB health, trang công khai, quyền guest, không rò nội dung chương có phí. Chỉ đọc dữ liệu, không tạo giao dịch.
- Có thể đặt `VERCEL_TEST_ORIGIN=https://<preview-domain>` để kiểm tra Preview. Deployment có bảo vệ cần đăng nhập Vercel trong trình duyệt, không tắt bảo vệ.
- GitHub workflow `production-smoke` chạy sau deployment thành công và có thể chạy thủ công. Nó không cần khóa database hoặc khóa dịch vụ.
- Kiểm tra trình duyệt desktop và mobile: lọc/tải lại, tủ truyện, vị trí đọc, cài đặt, QR thử nghiệm, tác giả và quản trị bằng tài khoản đúng vai trò.

## Sao lưu có mã hóa

Snapshot gồm tất cả bảng Prisma (tài khoản, truyện, nháp, ví và lịch sử), đọc trong một transaction RepeatableRead. AES-256-GCM mã hóa và xác thực nội dung; quyền file 0600. Không đưa backup/key lên GitHub. Đây là sao lưu logic cho quy mô hiện tại, không thay thế PostgreSQL PITR.

1. Chuẩn bị `.env.backup.local` (bị gitignore) với `BACKUP_PASSPHRASE` ngẫu nhiên ít nhất 32 ký tự. Giữ bản khóa ở nơi riêng an toàn.
2. Node 22+: `node --env-file=.env.cloud.local --env-file=.env.backup.local scripts/backup/backup.mjs create`.
3. Xác minh: `node --env-file=.env.backup.local scripts/backup/backup.mjs verify backups/<file>.ttbackup`.
4. Lưu bản sao mã hóa và khóa tách biệt. Backup không bao gồm file ảnh trong Blob/đĩa uploads, cấu hình Vercel hoặc OAuth secrets; cần sao lưu riêng.

Khôi phục chỉ vào database trống có schema đã migrate, dùng đúng phiên bản mã tạo snapshot. Tạo Neon branch/database riêng, đặt `DATABASE_URL` của **đích** trong `.env.restore.local`. Chạy `node --env-file=.env.restore.local --env-file=.env.backup.local scripts/backup/backup.mjs restore backups/<file>.ttbackup` với `RESTORE_EMPTY_DATABASE=I_UNDERSTAND` trong env đích. Script từ chối database có dữ liệu, toàn bộ restore nằm trong transaction; phiên đăng nhập và token cũ được vô hiệu hóa. Kiểm tra ví/đơn/chương ở đích trước khi đổi cấu hình production. Không chạy restore thẳng trên database đang hoạt động.

Chưa tự động tải backup tới kho ngoài hoặc đăng ký lịch backup: cần chọn nơi lưu và chính sách giữ bản sao trước. Kiểm tra decrypt thành công không chứng minh khôi phục DB thành công. Công cụ `scripts/backup/check-restore.mjs <file>` diễn tập vào schema riêng ngẫu nhiên, migrate và restore, đối chiếu số bản ghi/tổng ví và dọn schema kiểm thử. Không thay đổi schema production.

## Lịch đăng trên Vercel Hobby

Cron hiện có `/api/jobs/ledger` lúc 02:00 UTC mỗi ngày (khoảng 09:00–10:00 Việt Nam trên Hobby) xử lý nháp đến hạn, đối soát payOS nếu có cấu hình và kiểm tra sổ ví. Không thể cam kết đăng đúng phút; có thể trễ tới 24 giờ. Muốn lịch chính xác cần scheduler tần suất cao hoặc gói hỗ trợ. Không tạo thêm cron tính phí tự động.

## Theo dõi và xử lý lỗi

Vercel Runtime Logs: lọc deployment mới và lỗi 5xx; không copy cookies/tokens/khóa vào ticket. Kiểm tra `/api/health`, Postgres, Redis và môi trường trước khi thay đổi dữ liệu. GitHub smoke báo fail giúp phát hiện sự cố sau deployment; không thay thế giám sát liên tục hay dịch vụ cảnh báo bên ngoài.

Nếu lỗi sau deploy: kiểm tra log và commit, rollback về deployment Ready trước đó trên Vercel; không rollback database tùy tiện. Không sửa trực tiếp balance để “chữa” giao dịch. Dùng chức năng đối soát quản trị và ghi chú kiểm tra.

Trang hỗ trợ/chính sách là nội dung của sản phẩm hiện tại. Chủ website cần rà soát và cập nhật trước vận hành thương mại hoặc thanh toán thật. Chế độ thử nghiệm không có giá trị tiền thật.
