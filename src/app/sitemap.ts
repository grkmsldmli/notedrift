import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { allToolRoutes } from "@/lib/seo/tool-routes";

// Generated sitemap (App Router metadata route). Public routes only — no API
// routes and no auth callbacks. Tool routes are DERIVED from allToolRoutes() —
// the SAME source the SEO guard tests validate — so a finished tool appears here
// automatically, a phantom (unbuilt) route can never leak in, and the two can
// never drift apart.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const url = (path: string) => `${SITE_URL}${path}`;

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: url("/tools"), lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];

  // Every finished tool (converters, audio, and standalone pages like edit-pdf).
  for (const r of allToolRoutes()) {
    entries.push({
      url: url(r.path),
      lastModified,
      changeFrequency: "monthly",
      priority: r.slug === "edit-pdf" ? 0.7 : 0.6,
    });
  }

  // Help + legal pages.
  entries.push(
    { url: url("/help"), lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: url("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: url("/terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  );

  return entries;
}
