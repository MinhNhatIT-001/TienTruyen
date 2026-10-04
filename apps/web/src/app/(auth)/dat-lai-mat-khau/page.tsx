import type { Metadata } from "next";
import { RecoveryPage } from "../../../features/auth/security";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <RecoveryPage mode="reset" />;
}
