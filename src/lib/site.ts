// The canonical production origin for absolute URLs (SEO metadata, sitemap,
// robots). Defaults to https://notedrift.com when NEXT_PUBLIC_SITE_URL is unset,
// which is correct for local dev. Trailing slash trimmed so `${SITE_URL}/path`
// never doubles up.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com").replace(
  /\/+$/,
  "",
);
