import type { MetadataRoute } from "next";

import { SITE_URL } from "./siteUrl";

const BUILD_TIME = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number; changeFrequency: "monthly" | "yearly" }> = [
    { path: "/security", priority: 0.8, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { path: "/privacy/en", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { path: "/terms/en", priority: 0.3, changeFrequency: "yearly" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: BUILD_TIME,
    changeFrequency,
    priority,
  }));
}
