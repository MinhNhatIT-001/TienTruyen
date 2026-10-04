import type { Metadata } from "next";
import { PurchasesPage } from "../../../features/wallet/purchases";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <PurchasesPage />;
}
