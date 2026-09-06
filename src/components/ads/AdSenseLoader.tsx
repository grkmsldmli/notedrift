"use client";

// Loads Google's AdSense script — ONCE, client-side, and ONLY when ads are
// eligible AND configured for a production host. Consequences:
//   • A known-Pro (or ineligible) visitor never loads the script at all.
//   • If a Free visitor upgrades to Pro mid-session, `eligible` flips false and
//     this unmounts; the script may already be in memory (acceptable), but no new
//     slots are created (AdSlot stops rendering) and on the NEXT reload as Pro the
//     script is never requested.
//   • next/script dedupes by id, so mounting on multiple routes injects once.
//   • Ad blockers / load failures are swallowed — NoteDrift keeps working.

import Script from "next/script";
import { adsenseClientId, isProductionAdHost } from "@/lib/ads/config";

export function AdSenseLoader({ eligible }: { eligible: boolean }) {
  const client = adsenseClientId();
  // Never request the script off a production host, even if flags say eligible.
  if (!eligible || !client || !isProductionAdHost()) return null;
  return (
    <Script
      id="adsbygoogle-init"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      // Tolerate ad blockers / network failures silently.
      onError={() => {}}
    />
  );
}
