// Shim for `next/script`. The only consumer in the reused graph is the AdSense
// loader, and ads are disabled on native (ads/config.ts), so this renders
// nothing. A native ad SDK, if ever added, would be wired separately.
export default function Script(): null {
  return null;
}
