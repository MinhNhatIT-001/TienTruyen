# Danh mục truyện tham khảo

`apps/api/prisma/reference-catalog.json` chứa 14 tên truyện do chủ website chọn, bút danh tác giả và mô tả tiếng Việt do biên tập viết lại. Không chứa văn bản chương, mô tả sao chép hay ảnh bìa từ nguồn bên ngoài. Bìa dùng thiết kế chữ có sẵn của Tiên Truyện. `Chưa có chương` là trạng thái nội dung tại website, không phải trạng thái xuất bản của nguyên tác.

Các mục này thuộc tài khoản quản lý danh mục `author@example.invalid`; trường `penName` hiển thị tác giả nguyên tác, không phải chủ tài khoản quản lý. Mô tả Tru Tiên là giới thiệu chung tác phẩm; chưa nhập văn bản bản tân tu.

Script `apps/api/prisma/import-reference-catalog.ts` kiểm tra trước khi nhập. Mặc định chỉ kiểm tra; `--apply` thêm danh mục trong một transaction, bỏ qua slug đã tồn tại, không tạo chương và không sửa ví hay dữ liệu truyện cũ. Chạy bằng môi trường DATABASE_URL được chọn rõ ràng, không chạy lại seed toàn bộ để bổ sung danh mục này.

Nguồn đối chiếu tên tác phẩm và tác giả:

- [Trạch Thiên Ký — Qidian](https://acts.qidian.com/zetianji/)
- [Thần Quốc Chi Thượng — Zongheng](https://m.zongheng.com/book/957547)
- [Ta Sẽ Mai Táng Chúng Thần — chỉ mục Qidian](https://daosearch.io/qidian/book/1030882891/i-will-bury-the-gods)
- [Linh Cảnh Hành Giả — Xiaoxiang](https://www.xxsy.net/baike/axdj3teuxtew)
- [Tru Tiên — thông báo sửa bản của Tiêu Đỉnh](https://weibo.com/1196397981/Oe6EkrmV6)
- [Thiên Tằm Thổ Đậu — danh mục tác phẩm](https://zh.wikipedia.org/wiki/天蠶土豆)
- [Ngược Về Thời Minh — chỉ mục Qidian](https://daosearch.io/qidian/book/84024/return-to-the-ming-dynasty-and-become-a-prince)
- [Nhĩ Căn](https://zh.wikipedia.org/wiki/耳根)
- [Thôn Phệ Tinh Không](https://en.wikipedia.org/wiki/Swallowed_Star)
- [Mục Thần Ký — thư mục Thư viện Quốc gia Đài Loan](https://nclfile.ncl.edu.tw/files/202104/f7e692d9-fb48-4ee7-a14e-a70242acf82e.pdf)
