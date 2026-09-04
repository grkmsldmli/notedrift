// Coordinate systems for the PDF editor. Three spaces are in play:
//
//   * PDF user space   — the authoritative document space. Origin bottom-left,
//                        y-up, units = points (1/72"). This is what a page's
//                        content stream uses and what P3 export must produce.
//   * Display space    — the page's viewport at scale 1: origin top-left, y-down,
//                        units = points, with the page's intrinsic rotation
//                        already applied. This is what we STORE overlays in.
//   * View space       — display space × current zoom, in CSS pixels. This is
//                        what Fabric objects live in. Purely transient.
//
// Why store in display space rather than raw PDF user space? The pdf.js viewport
// transform is linear in scale with no residual translation, so:
//
//     viewPoint = displayPoint × scale        (and displayPoint = viewPoint / scale)
//
// exactly. Overlay geometry therefore never mutates under zoom — it's multiplied
// in and divided back out — which is the whole ballgame for zoom invariance.
// Display space is still a faithful, zoom-independent, document-anchored PDF
// coordinate space: displayToPdf() / pdfToDisplay() convert to/from true PDF
// user space (bottom-left) for export, and are unit-tested for pdf.js parity.
//
// All functions here are pure.

export interface PageGeometry {
  /** Unrotated page width in PDF points. */
  readonly width: number;
  /** Unrotated page height in PDF points. */
  readonly height: number;
  /** Page rotation, normalized to 0 | 90 | 180 | 270. */
  readonly rotation: number;
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** 2×3 affine matrix [a, b, c, d, e, f] mapping (x,y) → (ax+cy+e, bx+dy+f). */
export type Matrix = readonly [number, number, number, number, number, number];

export function normalizeRotation(rotation: number): number {
  const r = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return r as 0 | 90 | 180 | 270;
}

export function applyMatrix(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Compose two affine matrices: apply `b` then `a` (a ∘ b). */
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Matrix that re-maps a point from one page-rotation's display space to
 *  another's (used to keep overlays attached to content when a page is rotated).
 */
export function reprojectionMatrix(oldGeom: PageGeometry, newGeom: PageGeometry): Matrix {
  return multiplyMatrix(viewportTransform(newGeom, 1), invertMatrix(viewportTransform(oldGeom, 1)));
}

export function invertMatrix(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  const ia = m[3] / det;
  const ib = -m[1] / det;
  const ic = -m[2] / det;
  const id = m[0] / det;
  return [ia, ib, ic, id, -(ia * m[4] + ic * m[5]), -(ib * m[4] + id * m[5])];
}

/**
 * The pdf.js PageViewport transform for a page, at a given scale. Maps PDF user
 * space (bottom-left) → viewport pixels (top-left). Mirrors pdf.js
 * PageViewport exactly (viewBox [0,0,W,H], no offset, dontFlip=false).
 */
export function viewportTransform(page: PageGeometry, scale: number): Matrix {
  const { width: w, height: h } = page;
  const rotation = normalizeRotation(page.rotation);
  const centerX = w / 2;
  const centerY = h / 2;

  let a: number, b: number, c: number, d: number;
  switch (rotation) {
    case 180:
      a = -1; b = 0; c = 0; d = 1; break;
    case 90:
      a = 0; b = 1; c = 1; d = 0; break;
    case 270:
      a = 0; b = -1; c = -1; d = 0; break;
    default: // 0
      a = 1; b = 0; c = 0; d = -1; break;
  }

  let offsetX: number, offsetY: number;
  if (a === 0) {
    offsetX = centerY * scale;
    offsetY = centerX * scale;
  } else {
    offsetX = centerX * scale;
    offsetY = centerY * scale;
  }

  return [
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    offsetX - a * scale * centerX - c * scale * centerY,
    offsetY - b * scale * centerX - d * scale * centerY,
  ];
}

/** The on-screen size of a page (rotation applied) at a given scale. */
export function viewportSize(page: PageGeometry, scale: number): { width: number; height: number } {
  const rotation = normalizeRotation(page.rotation);
  const swap = rotation === 90 || rotation === 270;
  return {
    width: (swap ? page.height : page.width) * scale,
    height: (swap ? page.width : page.height) * scale,
  };
}

/** Page size in display space (scale 1, rotation applied). */
export function displaySize(page: PageGeometry): { width: number; height: number } {
  return viewportSize(page, 1);
}

/** PDF user-space point (bottom-left) → display-space point (top-left, scale 1). */
export function pdfToDisplay(pt: Pt, page: PageGeometry): Pt {
  return applyMatrix(viewportTransform(page, 1), pt);
}

/** Display-space point (top-left, scale 1) → PDF user-space point (bottom-left). */
export function displayToPdf(pt: Pt, page: PageGeometry): Pt {
  return applyMatrix(invertMatrix(viewportTransform(page, 1)), pt);
}

/* ---- display ↔ view (the zoom-hot path: pure scalar multiply) ---- */

export function displayToView(value: number, scale: number): number {
  return value * scale;
}

export function viewToDisplay(value: number, scale: number): number {
  return scale ? value / scale : value;
}

export function displayPointToView(pt: Pt, scale: number): Pt {
  return { x: pt.x * scale, y: pt.y * scale };
}

export function viewPointToDisplay(pt: Pt, scale: number): Pt {
  return scale ? { x: pt.x / scale, y: pt.y / scale } : pt;
}
