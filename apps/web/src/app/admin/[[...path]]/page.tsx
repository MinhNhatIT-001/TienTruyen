import { Admin } from "../../../features/admin/admin";
import { ConfigPage } from "../../../features/admin/config-page";
export const metadata = { robots: { index: false, follow: true } };
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  if (path[0] === "cau-hinh") return <ConfigPage />;
  return <Admin path={["admin", ...path]} />;
}
