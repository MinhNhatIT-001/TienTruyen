import type { Metadata } from "next";
import { OAuthComplete } from "../../../../features/auth/oauth-complete";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function Page() { return <OAuthComplete />; }
