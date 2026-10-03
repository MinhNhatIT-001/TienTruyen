import type { Metadata } from "next";
import { publicApi, siteOrigin } from "../../lib/server-api";
import { notFound } from "next/navigation";
import {
  StoryPage,
  Reader,
  type PublicStory,
  type Chapter,
} from "../../components/reader";
import { RoutePage } from "../../components/routes";
const routes = new Set([
  "gioi-thieu",
  "ho-tro",
  "dieu-khoan",
  "chinh-sach-bao-mat",
  "truyen",
  "thong-bao",
  "chuong-da-mua",
  "tai-khoan",
  "tim-kiem",
  "the-loai",
  "bang-xep-hang",
  "dang-nhap",
  "dang-ky",
  "tu-truyen",
  "lich-su",
  "nap-hong-ngoc",
  "lich-su-giao-dich",
  "cap-bac",
  "cai-dat",
  "tro-thanh-tac-gia",
  "tac-gia",
  "admin",
  "bao-mat",
  "xac-minh",
  "quen-mat-khau",
  "dat-lai-mat-khau",
]);
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  if (!routes.has(path[0])) notFound();
  if (
    path[0] === "truyen" &&
    (!path[1] || (path[2] && !/^[1-9][0-9]*$/.test(path[2])) || path.length > 3)
  )
    notFound();
  if (path[0] === "truyen") {
    const detail = await publicApi<PublicStory>(
      `/stories/${encodeURIComponent(path[1])}`,
    );
    if (detail) {
      if (!path[2])
        return (
          <StoryPage
            slug={path[1]}
            initialStory={{
              ...detail,
              chapterCount: detail.chapters.length,
              rating: detail.rating || 0,
              readers: detail.readers || 0,
            }}
          />
        );
      // Never forward cookies: the server response contains only guest-visible content.
      const chapter = await publicApi<Chapter>(
        `/stories/${encodeURIComponent(path[1])}/chapters/${path[2]}`,
      );
      if (chapter)
        return (
          <Reader
            key={path.join("/")}
            slug={path[1]}
            number={Number(path[2])}
            initialChapter={chapter}
          />
        );
    }
  }
  return <RoutePage path={path} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
  const { path } = await params;
  if (path[0] !== "truyen" || !path[1])
    return {
      title: (
        {
          "gioi-thieu": "Giới thiệu",
          "ho-tro": "Hỗ trợ",
          "dieu-khoan": "Điều khoản sử dụng",
          "chinh-sach-bao-mat": "Chính sách bảo mật",
        } as Record<string, string>
      )[path[0]],
      robots: {
        index: [
          "tim-kiem",
          "the-loai",
          "bang-xep-hang",
          "cap-bac",
          "gioi-thieu",
          "ho-tro",
          "dieu-khoan",
          "chinh-sach-bao-mat",
        ].includes(path[0]),
        follow: true,
      },
    };
  const story = await publicApi<{
    title: string;
    description: string;
    penName: string;
  }>(`/stories/${encodeURIComponent(path[1])}`);
  if (!story) return { robots: { index: false, follow: true } };
  const title = path[2] ? `${story.title} — Chương ${path[2]}` : story.title;
  const description = story.description.slice(0, 160);
  const url = `${siteOrigin}/truyen/${encodeURIComponent(path[1])}${path[2] ? `/${path[2]}` : ""}`;
  return {
    title,
    description,
    authors: [{ name: story.penName }],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      locale: "vi_VN",
      type: "website",
      siteName: "Tiên Truyện",
    },
  };
}
