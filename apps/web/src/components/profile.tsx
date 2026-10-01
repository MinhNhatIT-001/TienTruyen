"use client";
import Link from "next/link";
import { AvatarSettings } from "./avatar-settings";
import { ArrowRight, Diamond, Feather, ShieldCheck } from "lucide-react";
import { useApp, Empty } from "./shell";
import { format } from "../lib/types";
export function ProfilePage() {
  const { user, ready } = useApp();
  if (!ready)
    return (
      <main className="container page">
        <p>Đang tải hồ sơ…</p>
      </main>
    );
  if (!user)
    return (
      <main className="container page">
        <Empty
          title="Hồ sơ của bạn"
          text="Đăng nhập để quản lý tài khoản và khám phá góc tác giả."
        />
      </main>
    );
  const author = user.roles.includes("AUTHOR");
  return (
    <main className="container page">
      <div className="page-heading">
        <span className="eyebrow">KHÔNG GIAN CỦA BẠN</span>
        <h1>Hồ sơ tài khoản</h1>
        <p>Xin chào {user.name}. Chúc bạn có một hành trình đọc thú vị.</p>
      </div>
      <div className="profile-grid">
        <section className="profile-card">
          <AvatarSettings />
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <p>
            {user.emailVerified ? "Email đã xác minh" : "Email chưa xác minh"} ·{" "}
            {user.roles.includes("ADMIN")
              ? "Quản trị viên"
              : author
                ? "Tác giả"
                : "Độc giả"}
          </p>
          <div className="profile-links">
            <Link href="/tu-truyen">
              Tủ truyện <ArrowRight size={16} />
            </Link>
            <Link href="/lich-su">
              Lịch sử đọc <ArrowRight size={16} />
            </Link>
            <Link href="/cap-bac">
              Cảnh giới của tôi <ArrowRight size={16} />
            </Link>
            <Link href="/cai-dat">
              Cài đặt đọc <ArrowRight size={16} />
            </Link>
            <Link href="/bao-mat">
              <span>
                <ShieldCheck size={14} /> Bảo mật và 2FA
              </span>
              <ArrowRight size={16} />
            </Link>
            {user.roles.includes("ADMIN") && (
              <Link href="/admin">
                Khu quản trị <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </section>
        <div>
          <section className="profile-card">
            <h2>
              <Diamond size={20} /> Ví Hồng Ngọc
            </h2>
            <strong className="profile-wallet">
              {format(user.balance)} HN
            </strong>
            <p>Số dư hiện tại trong tài khoản của bạn.</p>
            <Link className="btn primary" href="/nap-hong-ngoc">
              Nạp Hồng Ngọc <ArrowRight size={16} />
            </Link>
          </section>
          <section className="profile-card" style={{ marginTop: 24 }}>
            <h2>
              <Feather size={20} />{" "}
              {author ? "Góc tác giả" : "Kể câu chuyện của bạn"}
            </h2>
            <p>
              {author
                ? "Quản lý truyện, đăng chương mới và theo dõi doanh thu."
                : "Bạn có một thế giới muốn chia sẻ? Gửi hồ sơ để trở thành tác giả của Tiên Truyện."}
            </p>
            <Link
              className="btn primary"
              href={author ? "/tac-gia" : "/tro-thanh-tac-gia"}
            >
              {author ? "Vào khu tác giả" : "Trở thành tác giả"}
              <ArrowRight size={16} />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
