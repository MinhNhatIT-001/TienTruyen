import type { Metadata } from "next";
import { HelpPage } from "../../../features/support/help";
export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <HelpPage section="chinh-sach-bao-mat" />;
}
