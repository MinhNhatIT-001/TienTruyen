import type { Metadata } from "next";
import { ProfilePage } from "../../../features/account/profile";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <ProfilePage />;
}
