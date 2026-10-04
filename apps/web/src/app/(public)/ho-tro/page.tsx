import type { Metadata } from "next";
import { HelpPage } from "../../../features/support/help";
export const metadata: Metadata = {
  title: "Hỗ trợ",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <HelpPage section="ho-tro" />;
}
