# Tiên Truyện

Tiên Truyện là website đọc và sáng tác truyện chữ, với giao diện lấy cảm hứng từ trang sách, tông giấy ấm và xanh ngọc. Thiết kế thích ứng với máy tính, máy tính bảng và điện thoại.

## Công dụng

- Khám phá, tìm kiếm và lọc truyện theo thể loại; xem truyện mới cập nhật và bảng xếp hạng.
- Đọc từng chương, lưu truyện yêu thích, theo dõi lịch sử và tùy chỉnh giao diện đọc.
- Quản lý hồ sơ, chọn hoặc tải avatar, sử dụng ví Hồng Ngọc để mở khóa chương.
- Gửi hồ sơ tác giả, tạo truyện, đăng chương và theo dõi doanh thu.
- Quản trị tài khoản, duyệt nội dung và xử lý giao dịch.

## Ngôn ngữ và công nghệ

- **TypeScript** cho giao diện và API; **HTML/CSS** cho bố cục và thiết kế; **SQL** cho dữ liệu.
- **Next.js và React** xây dựng giao diện; **NestJS trên Node.js** xử lý phía máy chủ.
- **PostgreSQL và Prisma** lưu trữ, truy vấn dữ liệu; **Redis** hỗ trợ giới hạn tần suất yêu cầu.
- **Docker** đóng gói các dịch vụ để chạy trong môi trường nhất quán.

## Hiệu năng

Website sử dụng bản build tối ưu của Next.js, ảnh avatar WebP kích thước 256×256 và cơ chế cache cho ảnh tải lên để giảm dung lượng truyền tải. Các danh sách truyện được giới hạn số lượng trả về; giao dịch mở khóa chương được xử lý tại máy chủ trong transaction để giữ số dư nhất quán khi có yêu cầu đồng thời.

Hiệu năng thực tế phụ thuộc cấu hình máy chủ, dữ liệu và lượng truy cập. Dự án chưa có benchmark tải lớn để công bố số người dùng đồng thời hoặc tốc độ phản hồi cam kết.
