# Danh mục truyện tham khảo

`apps/api/prisma/reference-catalog.json` chứa 25 tên truyện do chủ website chọn, bút danh tác giả và mô tả tiếng Việt do biên tập viết lại. Không chứa văn bản chương, mô tả sao chép hay ảnh bìa từ nguồn bên ngoài. Bìa dùng thiết kế chữ có sẵn của Tiên Truyện. `Chưa có chương` là trạng thái nội dung tại website, không phải trạng thái xuất bản của nguyên tác.

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


Đợt bổ sung: Phàm Nhân Tu Tiên và 10 tác phẩm khác. Mô tả được viết mới, giới thiệu tiền đề truyện và tránh kể kết thúc. Nguồn đối chiếu bổ sung:

- [Vong Ngữ và tác phẩm — Qidian](https://acts.qidian.com/2022/221019/index.html)
- [Tiên Giới Thiên — Qidian](https://acts.qidian.com/2017/6008661/index.html)
- [Các tác phẩm Nhĩ Căn — Qidian](https://book.qidian.com/booklist/detail/273716/)
- [Khánh Dư Niên — Qidian](https://book.qidian.com/info/114559b)
- [Đấu La Đại Lục — Qidian](https://book.qidian.com/booklist/detail/232971/)
- [Tuyệt Thế Đường Môn — Qidian](https://book.qidian.com/booklist/detail/264532/)
- [Bàn Long — Qidian](https://book.qidian.com/info/1017141/)
- [Đại Phụng Đả Canh Nhân — Qidian](https://h5.if.qidian.com/h5/share/column?columnId=23589)
- [Review Phàm Nhân Tu Tiên — Hội Nhà văn Trung Quốc](https://image.chinawriter.com.cn/n1/2020/0525/c404027-31722302.html)
- [Review Nhất Niệm Vĩnh Hằng — Hội Nhà văn Trung Quốc](https://www.chinawriter.com.cn/n1/2022/1027/c404027-32552932.html)
- [Review Bàn Long — Hội Nhà văn Trung Quốc](https://www.chinawriter.com.cn/n1/2020/0113/c425784-31546541.html)
- [Review Tương Dạ — báo của Hội Nhà văn Trung Quốc](https://image.chinawriter.com.cn/61/2015/0814/U3875P843T61D1468F784DT20150814064816.pdf)
- [Trạch Nhật Phi Thăng — Qidian](https://book.qidian.com/info/1032778366)

- [Tương Dạ — Qidian](https://book.qidian.com/info/2083259/)
- [Quang Âm Chi Ngoại — giới thiệu từ nền tảng thuộc hệ thống của nhà xuất bản](https://www.hongxiu.com/baike/1pcbn19zp4eu0)


Điều chỉnh theo lựa chọn của chủ website: đợt bổ sung gồm Phàm Nhân Tu Tiên và 10 bộ nổi tiếng: Nhất Niệm Vĩnh Hằng, Cầu Ma, Đại Phụng Đả Canh Nhân, Khánh Dư Niên, Tương Dạ, Đấu La Đại Lục, Tuyệt Thế Đường Môn, Bàn Long, Quỷ Bí Chi Chủ và Sưu Thần Ký. Hai mục vừa nhập Tiên Giới Thiên và Quang Âm Chi Ngoại được ẩn khỏi danh mục công khai, không xóa khỏi database.

Sưu Thần Ký ở đây là tiểu thuyết của Thụ Hạ Dã Hồ, không phải tác phẩm chí quái cổ của Can Bảo. Không khẳng định tác phẩm đứng thứ hạng cụ thể trên Qidian: tác giả cho biết tác phẩm khởi đăng tại Huyễn Kiếm Thư Minh.

- [Quỷ Bí Chi Chủ — Qidian](https://book.qidian.com/fansrank/1010868264)
- [Thụ Hạ Dã Hồ kể về quá trình viết Sưu Thần Ký](https://image.chinawriter.com.cn/n1/2022/0325/c404024-32384039.html)
- [Sưu Thần Ký — thư mục xuất bản](https://books.google.com/books/about/搜神记.html?id=dS83xQEACAAJ)
