import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container empty">
      <span className="eyebrow">404 · LẠC GIỮA NHÂN GIAN</span>
      <h1>Trang này chưa có câu chuyện.</h1>
      <p>Quay về thư viện để bắt đầu một hành trình mới nhé.</p>
      <Link className="btn primary" href="/">
        Về trang chủ
      </Link>
    </main>
  );
}
