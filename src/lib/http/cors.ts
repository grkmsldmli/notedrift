// Narrow CORS for the FEW endpoints the native iOS app calls cross-origin
// (its local Capacitor origin -> https://notedrift.com). This is deliberately NOT
// global/permissive middleware: only the native billing/account routes opt in, and
// only a fixed allowlist of Capacitor local origins is ever reflected. Web same-
// origin requests are unaffected (no Origin header echoed for them).

// Capacitor's local WebView origins across iOS scheme configurations.
const ALLOWED_NATIVE_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_NATIVE_ORIGINS.has(origin)) return origin;
  return null;
}

/** CORS response headers for an allowed native origin (empty for anything else,
 *  including same-origin web requests, which don't need CORS). */
export function nativeCorsHeaders(request: Request, methods: string): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Standard preflight handler for a native endpoint. Returns 204 with the CORS
 *  headers when the origin is allowed, else a bare 204 (no CORS = browser blocks). */
export function handleNativePreflight(request: Request, methods: string): Response {
  return new Response(null, { status: 204, headers: nativeCorsHeaders(request, methods) });
}
