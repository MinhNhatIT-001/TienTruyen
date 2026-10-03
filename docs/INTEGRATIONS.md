# Đăng nhập và thanh toán

Code dùng Google OAuth, Facebook Login, Twilio Verify (SMS) và payOS (QR/chuyển khoản). Không còn xác thực TOTP/2FA khi đăng nhập email hoặc thao tác quản trị. OTP SMS là phương thức đăng nhập riêng, không phải bước bổ sung sau mật khẩu.

## Cấu hình

Sao chép các biến trong `.env.example` vào `.env` riêng tư. Không đưa khóa thật lên GitHub. `APP_ORIGIN` là URL website, không có dấu `/` cuối. Mọi client secret, khóa SMS và thanh toán chỉ dùng ở API.

- Google: tạo OAuth client loại Web application, điền `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`. Đăng ký redirect URI `http://localhost:3000/api/auth/oauth/google/callback` cho local và `https://TEN-MIEN/api/auth/oauth/google/callback` cho production. Khai báo người thử khi ứng dụng ở chế độ testing.
- Facebook: bật Facebook Login, điền `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_GRAPH_VERSION` theo phiên bản được app Meta hỗ trợ. Đăng ký `https://TEN-MIEN/api/auth/oauth/facebook/callback` làm Valid OAuth Redirect URI; tuân theo các yêu cầu miền/HTTPS và chế độ phát hành của Meta. Trong development chỉ các tài khoản được cấp vai trò trong app có thể thử. Website dùng ID Facebook; không coi email Facebook là bằng chứng sở hữu tài khoản cũ.
- SMS: tạo Verify Service trong Twilio, điền `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Bật quyền gửi SMS đến Việt Nam, kiểm tra giới hạn tài khoản trial và chi phí trong console. Chấp nhận số di động `0…` hoặc `+84…`. Mã có hiệu lực tối đa 5 phút, tối đa 5 lần nhập mỗi phiên; gửi lại sau 60 giây, có giới hạn theo IP/số điện thoại. Không có mã SMS giả hay mã cố định trong giao diện.
- Thanh toán: chọn `PAYMENT_PROVIDER=payos`; điền `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` lấy từ kênh thanh toán payOS. Đăng ký webhook công khai HTTPS `https://TEN-MIEN/api/payments/payos/webhook` trong payOS. Local cần URL HTTPS công khai được chuyển tiếp về ứng dụng để nhận webhook thật. Server kiểm tra chữ ký webhook và phản hồi API, số tiền và trạng thái qua API payOS trước khi cộng ví; chuyển hướng về website không tự cộng Hồng Ngọc. Đơn nạp hết hạn sau 15 phút; giao diện cho kiểm tra, mở lại thanh toán và hủy đơn. Webhook gửi lặp không cộng ví lần nữa.
- Nạp thử: giữ `PAYMENT_PROVIDER=local`, `DEV_TOPUP_ENABLED=true`, `NODE_ENV=development`. Production luôn tắt nạp giả lập. Hai chế độ không được sử dụng đồng thời cho đơn mới.

Các nút Google/Facebook luôn hiển thị và báo chưa khả dụng khi chưa cấu hình. Khi kích hoạt, nút mở cửa sổ OAuth; nếu trình duyệt chặn popup sẽ chuyển hướng trong tab hiện tại. Không cần bật các dịch vụ này để đăng nhập bằng email và mật khẩu.

## Tài khoản và liên kết

Số điện thoại hoặc danh tính mạng xã hội mới tạo tài khoản độc lập, avatar ngẫu nhiên, ví ban đầu 0 Hồng Ngọc. Có thể liên kết với tài khoản đang đăng nhập trong hồ sơ. Google trùng email tài khoản cũ yêu cầu đăng nhập bằng mật khẩu rồi liên kết, nhằm tránh gộp ví hoặc chuyển quyền ngoài ý muốn. Tên mới nằm trong giới hạn 8–15 ký tự. Tài khoản chỉ có SMS/Facebook dùng địa chỉ nội bộ không nhận thư; đăng nhập bằng phương thức đã liên kết.

## Áp dụng bản cập nhật

Bản cập nhật có migration `202610020002_login_payments`: xóa các khóa TOTP cũ, thêm số điện thoại, danh tính OAuth, phiên xác minh và dữ liệu đơn payOS. Sao lưu PostgreSQL trước khi áp dụng lên dữ liệu thật. Chạy migration và khởi động lại API/web bằng quy trình hiện có của dự án khi máy sẵn sàng; ví dụ từ thư mục gốc với dependencies đã cài:

```sh
pnpm --filter @tientruyen/api exec prisma migrate deploy
pnpm --filter @tientruyen/api exec prisma generate
```

Kiểm tra tên package trong `apps/api/package.json` nếu chạy lệnh filter ở môi trường khác. Không chạy seed lại để áp dụng migration: seed có thể thay đổi dữ liệu thử.

Cần kiểm tra luồng thật với khóa dịch vụ: SMS đúng/sai/hết hạn; OAuth mới và liên kết tài khoản; thanh toán thành công/hủy/hết hạn, webhook lặp, sai chữ ký và mất kết nối. Kiểm tra TypeScript không thay thế các bước này.

Tài liệu: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Twilio Verify](https://www.twilio.com/docs/verify/api), [payOS API](https://payos.vn/docs/api/).


## Bắt đầu khi chưa có tài khoản dịch vụ

1. **Google**: đăng nhập Google Cloud Console, tạo project cho Tiên Truyện. Trong Google Auth Platform, khai báo tên ứng dụng, email hỗ trợ và người dùng thử. Tạo OAuth Client loại Web application. Với local, thêm `http://localhost:3000` vào origin và `http://localhost:3000/api/auth/oauth/google/callback` vào redirect URI. Điền hai giá trị Google vào `.env` riêng tư. Khi dùng tên miền, đăng ký thêm callback HTTPS chính xác tương ứng.
2. **Facebook**: trong Meta for Developers tạo ứng dụng có Facebook Login dành cho website. Điền website URL, App Domains, callback `https://TEN-MIEN/api/auth/oauth/facebook/callback` và các trang chính sách Meta yêu cầu. Lấy App ID/App Secret điền vào hai biến Facebook; điền phiên bản Graph API được dashboard hỗ trợ. Thử bằng tài khoản có vai trò trong ứng dụng trước; làm đầy đủ các yêu cầu phát hành/permission của Meta trước khi mở cho mọi người.
3. **payOS**: tạo tài khoản tại my.payos.vn, hoàn tất xác minh cá nhân/doanh nghiệp và liên kết ngân hàng theo hướng dẫn payOS. Tạo kênh thanh toán cho Tiên Truyện. Điền Client ID, API Key, Checksum Key vào `.env`; đổi `PAYMENT_PROVIDER=payos` và `DEV_TOPUP_ENABLED=false`. Đăng ký webhook `https://TEN-MIEN/api/payments/payos/webhook`.
4. **URL công khai**: Facebook và webhook thanh toán nên thử trên một URL HTTPS công khai. Đặt `APP_ORIGIN=https://TEN-MIEN` và đăng ký callback theo đúng URL đó. Docker local đã đọc biến APP_ORIGIN từ `.env`; nếu dùng tunnel, chuyển tiếp về cổng 3000. Không đổi sang URL ví dụ trong tài liệu khi chưa có miền thực tế.
5. **Nạp lại cấu hình**: sau khi điền `.env`, chạy `docker compose up -d --no-deps --force-recreate api`. Không seed lại database. Dùng `GET /api/auth/options` để kiểm tra ba cờ google, facebook, paymentReady; cờ true chỉ xác nhận đủ cấu hình, không xác nhận nhà cung cấp đã duyệt ứng dụng.
6. **Kiểm tra thật**: dùng tài khoản thử của bạn để đăng nhập mới, đăng nhập lại, đóng/hủy cửa sổ OAuth, liên kết từ hồ sơ và kiểm tra email trùng. Với payOS, tạo đơn nhỏ trong gói có sẵn, xác nhận QR/số tiền trước khi bạn tự thanh toán; kiểm tra cộng ví đúng một lần, callback hủy và trạng thái đơn. Không coi tham số URL return là bằng chứng thanh toán.

Bạn tự hoàn tất bước xác minh danh tính, liên kết ngân hàng và chấp nhận điều khoản nhà cung cấp. Không gửi App Secret/API Key/Checksum Key trong chat và không commit `.env`.

Nguồn chính thức: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Meta Facebook Login](https://developers.facebook.com/docs/facebook-login/), [Tạo kênh payOS](https://payos.vn/docs/huong-dan-su-dung/tao-kenh-thanh-toan/), [API payOS](https://payos.vn/docs/api/).

Kiểm thử adapter ngày 03/10/2026: 6 bài đạt (số điện thoại, HMAC, callback/PKCE/account chooser, từ chối Google chưa xác minh, Facebook sai App ID, payOS sai/thiếu chữ ký). Đây là kiểm thử dịch vụ mô phỏng; OAuth thật, chuyển tiền và webhook qua HTTPS còn chờ khóa dịch vụ.


## Bổ sung theo kế hoạch đăng nhập/thanh toán

Migration `202610030001_payment_recovery` thêm QR, thông tin đơn cần kiểm tra, thời điểm đối soát và email đích của token khôi phục. Cần sao lưu rồi áp dụng migration trước khi chạy bản API mới; không seed lại dữ liệu.

- payOS trả QR được hiển thị trực tiếp trong trang nạp, đếm ngược 15 phút. QR/link không được tiếp tục đề nghị thanh toán khi bộ đếm về 0. Trạng thái vẫn hỏi server, không tự cộng ví theo URL return.
- Tác vụ mỗi 3 phút kiểm tra tối đa 30 đơn payOS chưa hoàn tất trong 7 ngày gần nhất; xoay vòng theo lần kiểm tra để tránh bỏ đói đơn mới. Redis giữ khóa giữa các worker. Lỗi nhà cung cấp được thử lại ở vòng sau. Mỗi ngày, và khi API khởi động, so sánh số dư với tổng sổ cái; sai lệch được ghi vào log máy chủ, không tự sửa số dư.
- Thanh toán lệch số tiền, thiếu tiền hoặc xác nhận sau thời hạn chuyển `NEEDS_REVIEW`, không cộng ví. Admin vào **Đơn nạp cần kiểm tra** để đối soát. Chỉ cho cộng ví khi truy vấn payOS xác nhận đúng đủ tiền và đúng đơn; hoàn tiền ngân hàng làm thủ công rồi ghi chú xác nhận. `REFUNDED` không tự gửi lệnh chuyển tiền.
- Trang **Bảo mật tài khoản** có email khôi phục. Chủ tài khoản đăng nhập trong 10 phút gần nhất yêu cầu email, mở link xác minh rồi đặt mật khẩu; token chỉ dùng một lần, gắn với tài khoản, hết hạn 15 phút, email không được thuộc tài khoản khác. Khi hoàn tất thu hồi các phiên khác và token cũ. Production cần SMTP thật; local có đường thử token, không sử dụng trong production.
- Giữ bỏ 2FA và vị trí nút Google/Facebook dưới nút đăng nhập theo yêu cầu của chủ project. Không tự gộp ví theo email Google.

Kiểm tra bản bổ sung: TypeScript API/web và kiểm thử chính sách/adapter. Chưa thay thế kiểm thử PostgreSQL, migration và luồng OAuth/thanh toán thật; các bước này cần Docker và khóa nhà cung cấp.
