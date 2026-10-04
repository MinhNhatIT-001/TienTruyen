import type { Metadata } from "next";
import { Wallet } from "../../../features/wallet/wallet";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <Wallet transactions />;
}
