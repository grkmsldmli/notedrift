// Pure export sizing math. No Fabric/DOM — unit tested in node.

import type { RasterRequest } from "./types.ts";

/** Hard safety cap on any output edge (px) so a huge export can't crash the tab. */
export const MAX_EXPORT_EDGE = 12000;
/** Cap on total backing-store pixels (≈ 12000×12000) as a second guard. */
export const MAX_EXPORT_PIXELS = 80_000_000;

/** Target longest edges for the named PNG presets. */
export const PNG_TARGET_LONG_EDGE = {
  hd: 2560,
  k4: 3840,
} as const;

const clampInt = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(n)));

/** Resolve the render scale (output px per canvas unit) for content of raw size
 *  rawW×rawH, honoring the request's sizing mode and clamping so neither edge nor
 *  the total pixel count exceeds the safety caps. Never returns <= 0. */
export function resolveScale(rawW: number, rawH: number, req: RasterRequest): number {
  const w = Math.max(1, rawW);
  const h = Math.max(1, rawH);
  const longEdge = Math.max(w, h);

  let scale: number;
  if (req.targetWidth && req.targetWidth > 0) {
    // Custom by width (height derived elsewhere via aspect); scale from width.
    scale = req.targetWidth / w;
  } else if (req.targetHeight && req.targetHeight > 0) {
    scale = req.targetHeight / h;
  } else if (req.targetLongEdge && req.targetLongEdge > 0) {
    scale = req.targetLongEdge / longEdge;
  } else {
    scale = req.scale && req.scale > 0 ? req.scale : 1;
  }

  // Clamp so the longest output edge stays within MAX_EXPORT_EDGE...
  scale = Math.min(scale, MAX_EXPORT_EDGE / longEdge);
  // ...and the total pixel budget is respected.
  const pixelCapScale = Math.sqrt(MAX_EXPORT_PIXELS / (w * h));
  scale = Math.min(scale, pixelCapScale);
  return scale > 0 ? scale : 1;
}

/** Output pixel dimensions for content raw size at a render scale. */
export function outputPixels(rawW: number, rawH: number, scale: number): { width: number; height: number } {
  return {
    width: clampInt(Math.max(1, rawW) * scale, 1, MAX_EXPORT_EDGE),
    height: clampInt(Math.max(1, rawH) * scale, 1, MAX_EXPORT_EDGE),
  };
}

/** Clamp an explicit custom dimension into the safe range. */
export function clampDimension(px: number): number {
  if (!Number.isFinite(px)) return 1;
  return clampInt(px, 1, MAX_EXPORT_EDGE);
}

/** Scale an explicit width×height down (preserving its ratio) so the total pixel
 *  count stays within budget. Used for custom-size exports, which may stretch. */
export function fitPixelBudget(width: number, height: number): { width: number; height: number } {
  const w = clampDimension(width);
  const h = clampDimension(height);
  if (w * h <= MAX_EXPORT_PIXELS) return { width: w, height: h };
  const factor = Math.sqrt(MAX_EXPORT_PIXELS / (w * h));
  return { width: clampInt(w * factor, 1, MAX_EXPORT_EDGE), height: clampInt(h * factor, 1, MAX_EXPORT_EDGE) };
}

/** Given a content aspect (rawW/rawH) and a locked edit to width or height,
 *  compute the paired dimension when aspect is maintained. */
export function pairedDimension(
  edited: "width" | "height",
  value: number,
  rawW: number,
  rawH: number,
): number {
  const aspect = Math.max(1, rawW) / Math.max(1, rawH);
  const v = clampDimension(value);
  return edited === "width" ? clampDimension(v / aspect) : clampDimension(v * aspect);
}

/** A safe, lower-case, dash-joined filename base derived from a canvas title. */
export function slugify(title: string): string {
  const base = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "notedrift";
}
