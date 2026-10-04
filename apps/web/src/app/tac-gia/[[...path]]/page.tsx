import { Studio } from "../../../features/author/studio";
import { ChapterEdit } from "../../../features/author/chapter-editor";
export const metadata = { robots: { index: false, follow: true } };
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  if (path[0] === "sua-chuong" && path[1]) return <ChapterEdit id={path[1]} />;
  return <Studio path={["tac-gia", ...path]} />;
}
