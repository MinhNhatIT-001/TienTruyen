import { CatalogPage } from "../../../../features/catalog/catalog-page";
export const metadata = { robots: { index: true, follow: true } };
const genres: Record<string, string> = {
  "tien-hiep": "Tiên hiệp",
  "kiem-hiep": "Kiếm hiệp",
  "huyen-huyen": "Huyền huyễn",
  "co-dai": "Cổ đại",
  "ngon-tinh": "Ngôn tình",
  "do-thi": "Đô thị",
};
export default async function Page({
  params,
}: {
  params: Promise<{ genre: string }>;
}) {
  const { genre } = await params;
  return <CatalogPage initialGenre={genres[genre] || "Tất cả"} />;
}
