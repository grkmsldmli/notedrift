// Shim for `next/headers` (server-only). The reused CLIENT editor graph never
// reaches it; if some server module were pulled in by mistake, these throw
// loudly at call time rather than silently misbehaving.
export function cookies(): never {
  throw new Error("next/headers is server-only and unavailable in the native bundle");
}
export function headers(): never {
  throw new Error("next/headers is server-only and unavailable in the native bundle");
}
