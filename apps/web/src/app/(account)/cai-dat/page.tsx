import type { Metadata } from "next";
import { ReaderPreferences } from "../../../features/reader/preferences";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <ReaderPreferences />;
}
