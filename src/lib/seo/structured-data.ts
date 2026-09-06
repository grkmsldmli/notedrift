// Structured-data (JSON-LD) builders. Pure functions returning plain objects, so
// they are unit-tested and reused across every tool page — no hand-written schema
// scattered per page. Rendered via <JsonLd data={...} />.

import { SITE_URL } from "../site.ts";

/** Absolute URL for a site-relative path (schema.org wants absolute URLs). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export interface Crumb {
  name: string;
  path: string;
}

/** BreadcrumbList JSON-LD (Home › Free Tools › <tool>). */
export function breadcrumbList(items: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** WebApplication JSON-LD for a free, in-browser tool. */
export function webApplication(o: {
  name: string;
  description: string;
  path: string;
  applicationCategory?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: o.name,
    description: o.description,
    url: absoluteUrl(o.path),
    applicationCategory: o.applicationCategory ?? "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  };
}

/** The standard tool-page breadcrumb: Home › Free Tools › <tool title>. */
export function toolBreadcrumb(toolTitle: string, toolPath: string): Record<string, unknown> {
  return breadcrumbList([
    { name: "NoteDrift", path: "/" },
    { name: "Free Tools", path: "/tools" },
    { name: toolTitle, path: toolPath },
  ]);
}
