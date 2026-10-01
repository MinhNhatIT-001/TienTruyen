import type { MetadataRoute } from "next";
import { siteOrigin } from "../lib/server-api";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/tac-gia",
        "/bao-mat",
        "/nap-hong-ngoc",
        "/lich-su",
        "/tu-truyen",
        "/dat-lai-mat-khau",
        "/xac-minh",
      ],
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
