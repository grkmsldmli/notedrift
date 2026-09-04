// Zoom / fit math and render-scale safety. Pure — unit-tested. All page sizes
// are in PDF points (1pt = 1/72"); scale maps points → CSS pixels.

import { MAX_RENDER_EDGE, MAX_ZOOM, MIN_ZOOM } from "./limits.ts";

export function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
}

/** Largest scale that fits a page fully inside the viewport (minus padding). */
export function fitPageScale(
  pageW: number,
  pageH: number,
  viewW: number,
  viewH: number,
  pad = 40,
): number {
  if (pageW <= 0 || pageH <= 0) return 1;
  const availW = Math.max(1, viewW - pad * 2);
  const availH = Math.max(1, viewH - pad * 2);
  return clampZoom(Math.min(availW / pageW, availH / pageH));
}

/** Scale so the page width fills the viewport width (minus padding). */
export function fitWidthScale(pageW: number, viewW: number, pad = 40): number {
  if (pageW <= 0) return 1;
  const availW = Math.max(1, viewW - pad * 2);
  return clampZoom(availW / pageW);
}

/**
 * Cap the effective render scale so a rendered page bitmap's longest edge never
 * exceeds MAX_RENDER_EDGE (protects memory on huge pages / high zoom / retina).
 * Returns the scale to actually pass to the renderer (≤ requested scale).
 */
export function safeRenderScale(
  pageW: number,
  pageH: number,
  scale: number,
  dpr: number,
): number {
  const longestPts = Math.max(pageW, pageH);
  if (longestPts <= 0) return scale;
  const longestPx = longestPts * scale * dpr;
  if (longestPx > MAX_RENDER_EDGE) {
    return MAX_RENDER_EDGE / (longestPts * dpr);
  }
  return scale;
}
