import type { MetadataRoute } from "next";
import { publicApi, siteOrigin } from "../lib/server-api";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stories =
    (await publicApi<{ slug: string; updatedAt: string }[]>("/stories")) || [];
  return [
    { url: siteOrigin, changeFrequency: "daily", priority: 1 },
    ...stories.map((s) => ({
      url: `${siteOrigin}/truyen/${encodeURIComponent(s.slug)}`,
      lastModified: s.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
