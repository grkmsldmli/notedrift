import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/convert/registry";
import { AUDIO_TOOLS } from "@/lib/audio/tools";

// Generated sitemap (App Router metadata route). Public routes only — no API
// routes and no auth callbacks. Converter and audio tool routes are DERIVED from
// their registries, so a tool added there appears here automatically and never
// silently drops out of the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const url = (path: string) => `${SITE_URL}${path}`;

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: url("/tools"), lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/tools/edit-pdf"), lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];

  // Converter tools (derived from the registry).
  for (const t of TOOLS) {
    entries.push({
      url: url(`/tools/${t.slug}`),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  // Audio tools (derived from their registry).
  for (const t of AUDIO_TOOLS) {
    entries.push({
      url: url(`/tools/${t.slug}`),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
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
