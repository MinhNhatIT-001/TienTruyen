import type { Metadata } from "next";
import { Library } from "../../../features/library/library";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <Library />;
}
