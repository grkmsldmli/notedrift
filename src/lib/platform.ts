// Platform abstraction — the ONE place that answers "are we inside the native
// iOS app?" and what that implies. Web and native share this module so callers
// never sprinkle Capacitor checks through components.
//
// Detection is runtime-only via the `window.Capacitor` bridge the native shell
// injects — we deliberately do NOT import `@capacitor/core` here, so the Next.js
// web bundle takes on no Capacitor dependency and this stays safe to evaluate
// during SSR/prerender (returns the web answers when there is no bridge).

/** Canonical production origin. Native builds boot from LOCAL assets, so every
 *  server-required call must target this explicit absolute origin, never the
 *  (nonexistent) local one. */
export const PRODUCTION_ORIGIN = "https://notedrift.com";

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function bridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
}

/** True inside any Capacitor native shell (iOS today). False on the web, during
 *  SSR, and in tests. */
export function isNative(): boolean {
  try {
    return bridge()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** The native platform id ("ios" | "android") or null on web/SSR. */
export function nativePlatform(): string | null {
  try {
    return isNative() ? bridge()?.getPlatform?.() ?? null : null;
  } catch {
    return null;
  }
}

/** True only inside the native iOS app. */
export function isNativeIos(): boolean {
  return nativePlatform() === "ios";
}

/** Base URL for server-required calls. Web: "" (same-origin relative paths keep
 *  working with the session cookie). Native: the absolute production origin, so
 *  `apiUrl("/api/…")` reaches the real backend from the local bundle. */
export function apiBaseUrl(): string {
  return isNative() ? PRODUCTION_ORIGIN : "";
}

/** Resolve an app-relative server path against the correct base for this
 *  platform. `apiUrl("/api/email/lifecycle")` → same string on web, absolute on
 *  native. Absolute inputs are returned unchanged. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiBaseUrl();
  if (!base) return path;
  return base + (path.startsWith("/") ? path : `/${path}`);
}

/** Which billing system this platform must use. Web sells via Stripe; native iOS
 *  must sell via Apple IAP (StoreKit) for App Store compliance — never Stripe. */
export type BillingPlatform = "stripe" | "apple";

export function billingPlatform(): BillingPlatform {
  return isNativeIos() ? "apple" : "stripe";
}
