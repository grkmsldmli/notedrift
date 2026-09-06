// AdSense configuration — reads PUBLIC publisher identifiers from NEXT_PUBLIC_*
// env. These are publisher IDs, NOT secrets (they ship in the client bundle by
// design). Every accessor fails safe: a missing/malformed value returns
// undefined/false so NoteDrift renders no ad and never crashes.
//
// Kill switch: NEXT_PUBLIC_ADSENSE_ENABLED must be exactly "true" to enable ads.
// Anything else (false / unset) disables all advertising.

/** Format of the AdSense client id, e.g. "ca-pub-1234567890123456". */
const CLIENT_RE = /^ca-pub-\d{10,}$/;
/** Numeric AdSense slot id, e.g. "1234567890". */
const SLOT_RE = /^\d{6,}$/;

/** The kill switch. Only the exact string "true" enables ads. */
export function adsenseEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true";
}

/** The AdSense client id ("ca-pub-…"), or undefined when unset/malformed. */
export function adsenseClientId(): string | undefined {
  const v = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID?.trim();
  return v && CLIENT_RE.test(v) ? v : undefined;
}

const validSlot = (v: string | undefined): string | undefined => {
  const s = v?.trim();
  return s && SLOT_RE.test(s) ? s : undefined;
};

export function adsenseSlotEditorBottom(): string | undefined {
  return validSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_EDITOR_BOTTOM);
}
export function adsenseSlotTools(): string | undefined {
  return validSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOOLS);
}
export function adsenseSlotToolPage(): string | undefined {
  return validSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOOL_PAGE);
}

/** Ads are configured when the kill switch is on AND a valid client id exists.
 *  Eligibility additionally requires a production host (see isProductionAdHost). */
export function adsConfigured(): boolean {
  return adsenseEnabled() && adsenseClientId() !== undefined;
}

/** The ads.txt publisher id ("pub-…"), derived from the client id ("ca-pub-…").
 *  Returns undefined when no valid client id is configured, so ads.txt never
 *  emits a fabricated or invalid publisher line. */
export function adsensePublisherId(): string | undefined {
  const client = adsenseClientId();
  return client ? client.replace(/^ca-/, "") : undefined;
}

/** The production NoteDrift hosts. Ads NEVER load anywhere else (localhost,
 *  preview deployments, staging) so development traffic can't reach the AdSense
 *  account. Client-only: returns false during SSR (window undefined). */
const PRODUCTION_AD_HOSTS = new Set(["notedrift.com", "www.notedrift.com"]);
export function isProductionAdHost(): boolean {
  if (typeof window === "undefined") return false;
  return PRODUCTION_AD_HOSTS.has(window.location.hostname);
}
