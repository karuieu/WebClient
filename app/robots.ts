import type { MetadataRoute } from "next";

import { SITE_URL } from "./siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/chat",
          "/chats",
          "/new",
          "/projects",
          "/plans",
          "/settings",
          "/onboarding",
          "/verify-email",
          "/delete-account",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
