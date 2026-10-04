import type { Metadata } from "next";
import { AuthPage } from "../../../features/auth/auth-page";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <AuthPage />;
}
