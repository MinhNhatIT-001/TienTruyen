import type { Metadata } from "next";
import { AuthorApplication } from "../../../features/author/author-application";
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() {
  return <AuthorApplication />;
}
