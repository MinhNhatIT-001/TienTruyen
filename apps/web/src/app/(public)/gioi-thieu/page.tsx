import type { Metadata } from "next";
import { HelpPage } from "../../../features/support/help";
export const metadata: Metadata = {
  title: "Giới thiệu",
  robots: { index: true, follow: true },
};
export default function Page() {
  return <HelpPage section="gioi-thieu" />;
}
