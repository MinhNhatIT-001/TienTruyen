"use client";
import {NotificationsPage,PurchasesPage} from "./reading-tools";
import { CatalogPage } from "./catalog";
import { StoryPage, Reader, ReaderPreferences } from "./reader";
import {
  AuthPage,
  Library,
  Wallet,
  Levels,
  AuthorApplication,
} from "./accounts";
import { Studio, Admin } from "./studio";
import { SecurityPage, RecoveryPage } from "./security";
import { ChapterEdit, ConfigPage } from "./management";
import { ProfilePage } from "./profile";
import { Empty } from "./shell";
export function RoutePage({ path }: { path: string[] }) {
  const first = path[0];
  if(first === "thong-bao")return <NotificationsPage/>;
  if(first === "chuong-da-mua")return <PurchasesPage/>;
  if (first === "tai-khoan") return <ProfilePage />;
  if (first === "bao-mat") return <SecurityPage />;
  if (["xac-minh", "quen-mat-khau", "dat-lai-mat-khau"].includes(first))
    return (
      <RecoveryPage
        mode={
          first === "xac-minh"
            ? "verify"
            : first === "quen-mat-khau"
              ? "forgot"
              : "reset"
        }
      />
    );
  if (first === "truyen" && path[1])
    return path[2] ? (
      <Reader key={path.join("/")} slug={path[1]} number={Number(path[2])} />
    ) : (
      <StoryPage slug={path[1]} />
    );
  if (first === "tim-kiem") return <CatalogPage />;
  if (first === "the-loai") {
    const genre =
      (
        {
          "tien-hiep": "Tiên hiệp",
          "kiem-hiep": "Kiếm hiệp",
          "huyen-huyen": "Huyền huyễn",
          "co-dai": "Cổ đại",
          "ngon-tinh": "Ngôn tình",
          "do-thi": "Đô thị",
        } as Record<string, string>
      )[path[1]] || "Tất cả";
    return <CatalogPage initialGenre={genre} />;
  }
  if (first === "bang-xep-hang") return <CatalogPage ranking />;
  if (first === "dang-nhap" || first === "dang-ky")
    return <AuthPage key={first} register={first === "dang-ky"} />;
  if (first === "tu-truyen" || first === "lich-su")
    return <Library history={first === "lich-su"} />;
  if (first === "nap-hong-ngoc" || first === "lich-su-giao-dich")
    return <Wallet transactions={first === "lich-su-giao-dich"} />;
  if (first === "cap-bac") return <Levels />;
  if (first === "cai-dat") return <ReaderPreferences />;
  if (first === "tro-thanh-tac-gia") return <AuthorApplication />;
  if (first === "tac-gia" && path[1] === "sua-chuong" && path[2])
    return <ChapterEdit id={path[2]} />;
  if (first === "admin" && path[1] === "cau-hinh") return <ConfigPage />;
  if (first === "tac-gia") return <Studio path={path} />;
  if (first === "admin") return <Admin path={path} />;
  return (
    <main className="container not-found">
      <Empty
        title="Trang này chưa có câu chuyện"
        text="Trở về thư viện để tiếp tục khám phá nhé."
        href="/"
        label="Về trang chủ"
      />
    </main>
  );
}
