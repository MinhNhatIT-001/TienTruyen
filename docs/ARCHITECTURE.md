# Cấu trúc mã nguồn Tiên Truyện

## Tìm đúng chỗ để sửa

| Công việc                                         | Thư mục                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| URL, layout, metadata, trang lỗi                  | `apps/web/src/app/`                                                    |
| Trang chủ, tìm kiếm, thể loại, xếp hạng           | `apps/web/src/features/catalog/`                                       |
| Chi tiết truyện và tải dữ liệu public phía server | `apps/web/src/features/stories/`, `apps/web/src/lib/story-routing.tsx` |
| Trang đọc, mục lục, cài đặt và lưu vị trí         | `apps/web/src/features/reader/`                                        |
| Đăng nhập, Google/Facebook, điện thoại, bảo mật   | `apps/web/src/features/auth/`                                          |
| Hồ sơ, avatar, cấp bậc                            | `apps/web/src/features/account/`                                       |
| Tủ truyện, lịch sử và theo dõi                    | `apps/web/src/features/library/`                                       |
| Nạp Hồng Ngọc, đơn nạp, chương đã mua             | `apps/web/src/features/wallet/`                                        |
| Viết nháp, xuất bản, quản lý truyện/chương        | `apps/web/src/features/author/`                                        |
| Duyệt nội dung và cấu hình quản trị               | `apps/web/src/features/admin/`                                         |
| Header, footer và trạng thái tài khoản chung      | `apps/web/src/components/layout/`                                      |
| Nút, input, select và card dùng chung             | `apps/web/src/components/ui/`                                          |
| API và tiện ích không thuộc riêng một giao diện   | `apps/web/src/lib/`                                                    |
| API nghiệp vụ theo chức năng                      | `apps/api/src/modules/`                                                |
| Prisma client và transaction                      | `apps/api/src/database/`                                               |
| Biến môi trường và điều kiện khởi động            | `apps/api/src/config/`                                                 |
| HTTP, quyền truy cập, audit và giới hạn tần suất  | `apps/api/src/common/`                                                 |
| Gọi dịch vụ bên ngoài                             | `apps/api/src/integrations/`                                           |
| Schema, migrations và dữ liệu seed                | `apps/api/prisma/`                                                     |
| Backup và diễn tập khôi phục                      | `scripts/backup/`                                                      |
| Kiểm tra cloud, Vercel và hợp đồng route          | `scripts/checks/`                                                      |
| Công cụ chạy local                                | `scripts/local/`                                                       |

## Quy ước

- `app/` chỉ nối URL với component của chức năng và xử lý metadata; không gom nghiệp vụ vào một router lớn. Các nhóm `(public)`, `(auth)`, `(account)` không làm đổi URL. Khu tác giả và quản trị giữ route phụ trong phạm vi riêng.
- Mỗi chức năng import trực tiếp file cần dùng. Không tạo `index.ts` chỉ để gom lại mọi export: dễ kéo theo phụ thuộc không cần thiết và vòng import.
- Component riêng của ví nằm trong `features/wallet/`, không đưa vào `components/ui/`. Chỉ thành phần thật sự dùng chung mới ở `components/`.
- API controller nhận request và kiểm tra đầu vào/quyền truy cập. Các nghiệp vụ dùng lại như xuất bản, quyết toán, truy vấn payOS và tác vụ lịch nằm trong service riêng. Một số controller vẫn xử lý nghiệp vụ đơn giản trực tiếp; không cần tạo thêm tầng chỉ để chuyển tiếp lời gọi.
- `apps/api/src/main.ts` chỉ khởi động ứng dụng. `bootstrap.ts` cấu hình middleware và timer local. `app.module.ts` đăng ký các controller; entrypoint `index.js` của Vercel và `dist/main.js` vẫn giữ nguyên.
- Chỉ có một Prisma client dùng chung trong runtime. Giữ toàn bộ cập nhật số dư và sổ giao dịch trong transaction; không tách transaction thành nhiều lời gọi độc lập khi thêm chức năng.
- Test frontend ở `apps/web/test/`, test backend ở `apps/api/test/`. Bộ integration dùng database kiểm thử, không chạy trực tiếp vào production.
- `styles/base.css` → `theme.css` → `overrides.css` giữ nguyên thứ tự cascade của giao diện hiện có. Chưa chuyển các selector cũ sang CSS Modules. Khi thêm giao diện độc lập mới, ưu tiên CSS Modules đặt cạnh component; việc hợp nhất CSS cũ cần một đợt kiểm tra ảnh riêng.
- Hai catalog JSON hiện phục vụ seed API và dữ liệu minh họa web. Không dùng catalog minh họa để quyết định giá, quyền mở chương hoặc số dư.
- Không đưa `.env`, khóa, backup, bản build hay `node_modules` lên GitHub. Thư mục `packages/shared/` chưa là một workspace package hoạt động; chỉ thêm package chia sẻ khi có mã thực sự dùng ở cả hai ứng dụng.

## Kiểm tra

```sh
pnpm typecheck
pnpm test
pnpm test:backup
pnpm test:structure
pnpm build
pnpm test:vercel
```

`test:structure` build API, khởi tạo Nest mà không mở cổng hoặc kết nối database, đối chiếu 79 endpoint hiện có và kiểm tra một số guard tài khoản/quản trị. Khi chủ động thêm hoặc đổi endpoint, cập nhật `apps/api/test/fixtures/routes.json` cùng thay đổi và review hợp đồng route.

`test:vercel` chỉ kiểm tra đọc trên website triển khai. Thay đổi cấu trúc không cần migrate dữ liệu. Xem `OPERATIONS.md` về backup và `VERCEL.md` về triển khai.
