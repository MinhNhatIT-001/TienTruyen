import type { Metadata } from "next";
import { CatalogPage } from "../../../features/catalog/catalog-page";
export const metadata: Metadata = { robots: { index: true, follow: true } };
export default function Page() {
  return <CatalogPage />;
}
