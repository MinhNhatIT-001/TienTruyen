import { CatalogPage } from "../../../features/catalog/catalog-page";
export const metadata = { robots: { index: true, follow: true } };
export default function Page() {
  return <CatalogPage initialGenre="Tất cả" />;
}
