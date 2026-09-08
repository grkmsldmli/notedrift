import "server-only";

// Server-only Apple IAP configuration. Reads verification material from the
// environment (never NEXT_PUBLIC_, never logged, read lazily). Fails SAFE: when
// unset, isAppleIapConfigured() is false and the verify/notifications routes
// return "unconfigured" rather than crashing — so the build and the offline app
// never depend on these being present.

/** Apple's DER-encoded root certificates, provided as comma-separated base64 in
 *  APPLE_IAP_ROOT_CAS_BASE64. The @apple/app-store-server-library SignedDataVerifier
 *  needs these to validate the JWS certificate chain. (Download from Apple PKI:
 *  AppleRootCA-G3, AppleRootCA-G2, etc.) */
export function appleRootCertificates(): Buffer[] {
  const raw = process.env.APPLE_IAP_ROOT_CAS_BASE64;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((b64) => Buffer.from(b64, "base64"));
}

/** The app's numeric App Store id (App Store Connect → App Information → Apple ID).
 *  Required for Production verification; omitted in Sandbox. */
export function appleAppAppleId(): number | undefined {
  const v = process.env.APPLE_IAP_APP_APPLE_ID?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Whether the verifier performs online revocation + expiration checks against
 *  Apple. Defaults to true; set APPLE_IAP_ONLINE_CHECKS="false" to disable. */
export function appleOnlineChecksEnabled(): boolean {
  return process.env.APPLE_IAP_ONLINE_CHECKS !== "false";
}

/** True when enough is configured to cryptographically verify Apple payloads. */
export function isAppleIapConfigured(): boolean {
  return appleRootCertificates().length > 0;
}
