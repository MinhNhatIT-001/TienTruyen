import type { Metadata } from "next";
import { Levels } from "../../../features/account/levels";
export const metadata: Metadata = { robots: { index: true, follow: true } };
export default function Page() {
  return <Levels />;
}
