import type { Metadata } from "next";
import { SecurityPage } from "../../../features/auth/security";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <SecurityPage />;
}
