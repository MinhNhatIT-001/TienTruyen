# Đọc truyện, cộng đồng và bàn viết

## Chức năng đã nối vào code

- Trang chủ: đọc tiếp ba truyện gần đây, hiển thị tiến độ chương; gợi ý dựa trên thể loại đã đọc và đã lưu. Các mục khám phá, mới cập nhật và truyện hoàn thành được giữ lại.
- Trang đọc: lưu chương/vị trí cuộn trên thiết bị và tài khoản, ưu tiên vị trí có thời gian lưu mới hơn; mục lục tại trang đọc, chương trước/sau theo danh sách chương thực sự còn hiển thị. Các tùy chỉnh font, cỡ chữ, giãn dòng, độ rộng, sáng/tối/màu giấy tiếp tục dùng cài đặt đọc hiện có.
- Tủ truyện: các ngăn Đang đọc, Yêu thích, Đã hoàn thành và lọc truyện đang theo dõi. Lưu truyện và theo dõi chương mới là hai thao tác riêng; xóa khỏi tủ cũng ngừng theo dõi.
- Thông báo: chuông trên header, trang `/thong-bao`, đánh dấu từng tin hoặc tất cả đã đọc. Khi đăng chương, mỗi người theo dõi nhận một tin; trả lời bình luận cũng tạo thông báo cho người nhận. Header cập nhật định kỳ mỗi phút.
- Mua chương: kiểm tra giá trước khi thanh toán chương đơn; chọn tối đa 50 chương cùng truyện, xem tổng tiền/số dư và xác nhận. Server tính lại giá, bỏ chương miễn phí/đã mua, khóa ví và ghi ledger trong một transaction. Cùng một yêu cầu gửi lặp không trừ tiền lần nữa. Giá thay đổi sẽ yêu cầu tải lại, không tự thu số tiền mới. `/chuong-da-mua` có lịch sử giá đã trả.
- Khám phá: tìm tên truyện/tác giả, thể loại, trạng thái, độ dài và cập nhật trong 24 giờ/7 ngày/30 ngày; sắp xếp mới cập nhật, đánh giá, số chương. Danh mục lấy tối đa 100 truyện cập nhật gần đây ở API hiện tại.
- Tác giả: quản lý nhiều truyện, thống kê độc giả có tài khoản/lượt mua/doanh thu sau hoàn tiền; sửa thông tin và trạng thái hoàn thành; lịch sử doanh thu khả dụng, giữ chỗ, đã chi trả, đã hoàn tiền.
- Bàn viết: nháp tự lưu mỗi 2 giây khi có thay đổi, lưu trên tài khoản, xem trước, tải nháp dạng `.txt`, hẹn giờ, bỏ lịch và xuất bản ngay. Tối đa 100 nháp chưa xuất bản mỗi truyện. Số phiên bản ngăn thiết bị cũ ghi đè nội dung mới. Chương nháp/hẹn giờ không có trong API công khai.
- Cộng đồng: trả lời bình luận một cấp, báo cáo bình luận, chủ bình luận hoặc admin có thể ẩn. Admin thấy nội dung bị báo cáo trong hàng đợi và có thể ẩn cả phần trả lời.

## Lịch xuất bản

API kiểm tra nháp đến hạn mỗi 30 giây, xử lý tối đa 20 nháp mỗi lượt theo giờ đã hẹn. Transaction đảm bảo một nháp chỉ xuất bản một chương dù có nhiều tiến trình. Chương phải đáp ứng quyền tác giả, truyện đã duyệt và chính sách nội dung/giá tại thời điểm đăng. Nếu không đáp ứng, nháp chuyển sang Cần điều chỉnh và giữ nguyên nội dung.

API cần chạy để xử lý lịch. Sau thời gian API tắt, nháp đến hạn sẽ được xử lý ở các lượt kiểm tra tiếp theo khi API bật lại. Thay đổi nội dung một nháp đã hẹn sẽ tự bỏ lịch khi tự lưu; cần hẹn lại sau khi sửa xong.

## Áp dụng và kiểm tra

Ngày 02/10/2026 đã sao lưu PostgreSQL và áp dụng hai migration `202610020002_login_payments`, `202610020003_reading_studio` trên bản local. Không chạy seed lại database chính.

Docker build API/web thành công. Bộ kiểm thử gồm 18 bài đều đạt trên PostgreSQL/Redis với database thử riêng: quyền truy cập, CSRF, tiến độ đọc, bình luận, mua chương đồng thời, webhook nạp thử gửi lặp, xung đột nháp, xuất bản đồng thời, thông báo và chuyển tiếp API. Worker thực tế đã xuất bản nháp đến hạn hợp lệ và giữ nháp của truyện bị ẩn ở trạng thái cần điều chỉnh. Giao diện đăng nhập, mục lục, bộ lọc, lưu nháp/tải lại/xem trước và trang chủ ở chiều rộng 390px đã được kiểm tra.

Client gọi `/api` qua Route Handler, đọc `API_INTERNAL_URL` lúc chạy container. Cấu hình này tránh đóng cứng máy chủ API khi build; proxy giữ riêng từng cookie và các header Origin/CSRF. Kiểm thử proxy nằm trong `apps/api/test/api-proxy.test.ts` và cần source `apps/web/src/lib/api-proxy.ts` khi chạy bộ test trong container API riêng.

Chưa xác minh luồng dịch vụ ngoài với khóa thật (payOS, Google/Facebook, SMS), tình huống mất mạng khi tự lưu và khôi phục lịch sau khi API tắt/bật. Các kiểm thử thanh toán hiện dùng chế độ local, không chuyển tiền thật.
