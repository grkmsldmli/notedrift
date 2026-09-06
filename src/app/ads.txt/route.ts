// Serves /ads.txt for Google AdSense verification. The publisher id is derived
// from the configured NEXT_PUBLIC_ADSENSE_CLIENT_ID ("ca-pub-…" → "pub-…"); when
// no valid client id is configured we return 404 rather than emitting an invalid
// or fabricated line. f08c47fec0942fa0 is Google's public certification-authority
// id for AdSense (a fixed, public value — not a secret).

import { adsensePublisherId } from "@/lib/ads/config";

export const dynamic = "force-static";

export function GET(): Response {
  const pub = adsensePublisherId();
  if (!pub) {
    return new Response("", { status: 404 });
  }
  const body = `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
