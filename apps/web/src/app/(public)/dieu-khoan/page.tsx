import type { Metadata } from "next";
import { HelpPage } from "../../../features/support/help";
export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <HelpPage section="dieu-khoan" />;
}
