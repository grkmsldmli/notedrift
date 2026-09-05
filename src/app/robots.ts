import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Production robots.txt (App Router metadata route). Public pages are crawlable;
// the API and auth-callback routes are not indexable content, so they are
// disallowed. The homepage, /tools (and every tool), /privacy and /terms stay
// allowed. Points crawlers at the generated sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
