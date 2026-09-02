// Geometry generators for the shape family.
//
// Polygon-based shapes (triangle/diamond/regular polygon/star) are built from
// point lists inscribed in a reference box; path-based shapes (cloud, database,
// document) use a fixed SVG path authored at a 100x100 reference. Both are then
// scaled to the drawn size — so geometry stays clean and connector anchors read
// from scene bounds work for all of them.

export interface Pt {
  x: number;
  y: number;
}

/** Reference box all shapes are authored in; drawing scales from here. */
export const SHAPE_REF = 100;

/** Regular n-gon inscribed in [0,w]x[0,h], first vertex at top. */
export function polygonPoints(sides: number, w = SHAPE_REF, h = SHAPE_REF): Pt[] {
  const cx = w / 2;
  const cy = h / 2;
  const n = Math.max(3, Math.min(12, Math.round(sides)));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push({ x: cx + (w / 2) * Math.cos(a), y: cy + (h / 2) * Math.sin(a) });
  }
  return pts;
}

/** Upward triangle filling the box. */
export function trianglePoints(w = SHAPE_REF, h = SHAPE_REF): Pt[] {
  return [
    { x: w / 2, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/** Diamond (rhombus) filling the box. */
export function diamondPoints(w = SHAPE_REF, h = SHAPE_REF): Pt[] {
  return [
    { x: w / 2, y: 0 },
    { x: w, y: h / 2 },
    { x: w / 2, y: h },
    { x: 0, y: h / 2 },
  ];
}

/** Star with `points` spikes and an inner/outer radius ratio (0.2–0.9). */
export function starPoints(
  points: number,
  inner: number,
  w = SHAPE_REF,
  h = SHAPE_REF,
): Pt[] {
  const cx = w / 2;
  const cy = h / 2;
  const p = Math.max(3, Math.min(12, Math.round(points)));
  const ratio = Math.max(0.15, Math.min(0.9, inner));
  const pts: Pt[] = [];
  for (let i = 0; i < p * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / p;
    const rx = (i % 2 ? (w / 2) * ratio : w / 2);
    const ry = (i % 2 ? (h / 2) * ratio : h / 2);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/* --------------------- fixed path shapes (100x100) ------------------------ */

/** A puffy cloud filling the reference box. */
export const CLOUD_PATH =
  "M 26 82 " +
  "C 9 82 4 61 19 55 " +
  "C 13 36 39 27 52 41 " +
  "C 60 24 90 30 86 53 " +
  "C 100 57 98 80 80 82 " +
  "Z";

/** A database cylinder filling the reference box. */
export const DATABASE_PATH =
  "M 8 16 " +
  "C 8 7 92 7 92 16 " +
  "L 92 84 " +
  "C 92 93 8 93 8 84 " +
  "Z " +
  "M 8 16 " +
  "C 8 25 92 25 92 16";

/** A document (rectangle with a wavy bottom) filling the reference box. */
export const DOCUMENT_PATH =
  "M 8 10 " +
  "L 92 10 " +
  "L 92 80 " +
  "C 74 94 66 66 50 80 " +
  "C 34 94 26 66 8 80 " +
  "Z";
