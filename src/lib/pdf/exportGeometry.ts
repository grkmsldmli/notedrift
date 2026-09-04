// Pure geometry + helpers for exporting overlays into a real PDF (P3). No
// pdf-lib, no DOM — so the coordinate mapping, colour/font resolution and shape
// point generation are all unit-tested. export.ts orchestrates pdf-lib using
// these.
//
// Overlays are drawn by generating their outline as points in DISPLAY space
// (scale-1, top-left, y-down), mapping each point through displayToPdf() (which
// applies the page's rotation + the y-flip to PDF user space), then emitting a
// path. Because that single mapping owns all rotation, every shape is correct on
// portrait, landscape and rotated pages without per-shape rotation math.

import { displayToPdf, type PageGeometry, type Pt } from "./coordinates.ts";
import { hexToRgb } from "../colors.ts";
import type { FontFamilyKey } from "./overlays.ts";

export function exportFilename(originalName: string): string {
  const base = originalName.replace(/\.pdf$/i, "").trim() || "document";
  return `${base}-edited.pdf`;
}

/** hex → pdf-lib rgb components in 0..1. */
export function pdfColor(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = hexToRgb(hex);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

/** The StandardFonts key for a family/weight/style. */
export function standardFontKey(family: FontFamilyKey, bold: boolean, italic: boolean): string {
  if (family === "serif") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  if (family === "mono") {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

/** The Liberation Sans TTF (Unicode fallback) for a weight/style. */
export function liberationFile(bold: boolean, italic: boolean): string {
  if (bold && italic) return "LiberationSans-BoldItalic.ttf";
  if (bold) return "LiberationSans-Bold.ttf";
  if (italic) return "LiberationSans-Italic.ttf";
  return "LiberationSans-Regular.ttf";
}

/* ------------------------------ WinAnsi set ------------------------------ */
// Code points CP1252 (WinAnsi) can encode beyond ASCII + Latin-1.
const WINANSI_EXTRA = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

export function isWinAnsiCodePoint(cp: number): boolean {
  if (cp === 0x0a || cp === 0x09) return true; // newline / tab handled by caller
  if (cp >= 0x20 && cp <= 0x7e) return true;
  if (cp >= 0xa0 && cp <= 0xff) return true;
  return WINANSI_EXTRA.has(cp);
}

export function isWinAnsiText(text: string): boolean {
  for (const ch of text) {
    if (!isWinAnsiCodePoint(ch.codePointAt(0)!)) return false;
  }
  return true;
}

/* ------------------------------ shape points ----------------------------- */

/** Rotate a point about a centre by a display-space (clockwise) angle. */
export function rotateDisplay(p: Pt, center: Pt, angleDeg: number): Pt {
  if (!angleDeg) return p;
  const t = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + (dx * cos - dy * sin), y: center.y + (dx * sin + dy * cos) };
}

/** The 4 corners (display space) of a centre-based, angled box, clockwise. */
export function boxCorners(cx: number, cy: number, w: number, h: number, angle: number): Pt[] {
  const c = { x: cx, y: cy };
  const hw = w / 2;
  const hh = h / 2;
  return [
    rotateDisplay({ x: cx - hw, y: cy - hh }, c, angle),
    rotateDisplay({ x: cx + hw, y: cy - hh }, c, angle),
    rotateDisplay({ x: cx + hw, y: cy + hh }, c, angle),
    rotateDisplay({ x: cx - hw, y: cy + hh }, c, angle),
  ];
}

const KAPPA = 0.5522847498307936;

/** Cubic-bezier segments approximating an angled ellipse, in display space.
 *  Returns { start, segments:[{c1,c2,end}] } — 4 arcs. */
export function ellipseBeziers(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
): { start: Pt; segments: { c1: Pt; c2: Pt; end: Pt }[] } {
  const c = { x: cx, y: cy };
  const R = (x: number, y: number) => rotateDisplay({ x, y }, c, angle);
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  const start = R(cx + rx, cy);
  const segments = [
    { c1: R(cx + rx, cy + oy), c2: R(cx + ox, cy + ry), end: R(cx, cy + ry) },
    { c1: R(cx - ox, cy + ry), c2: R(cx - rx, cy + oy), end: R(cx - rx, cy) },
    { c1: R(cx - rx, cy - oy), c2: R(cx - ox, cy - ry), end: R(cx, cy - ry) },
    { c1: R(cx + ox, cy - ry), c2: R(cx + rx, cy - oy), end: R(cx + rx, cy) },
  ];
  return { start, segments };
}

/** The 3 vertices (display space) of an arrowhead at (x2,y2), pointing along
 *  the segment (x1,y1)->(x2,y2), sized from stroke width. */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
): { tip: Pt; left: Pt; right: Pt } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = Math.max(9, Math.min(strokeWidth * 3.4 + 5, 42));
  // base centre is `size` back from the tip along the shaft
  const bx = x2 - ux * size;
  const by = y2 - uy * size;
  const half = size * 0.5;
  // perpendicular
  const px = -uy;
  const py = ux;
  return {
    tip: { x: x2, y: y2 },
    left: { x: bx + px * half, y: by + py * half },
    right: { x: bx - px * half, y: by - py * half },
  };
}

/** displayToPdf then negate y — the point form pdf-lib's drawSvgPath expects so
 *  that drawSvgPath({x:0,y:0}) lands it at the intended PDF user-space point. */
export function toSvgPoint(displayPt: Pt, page: PageGeometry): Pt {
  const pdf = displayToPdf(displayPt, page);
  const y = -pdf.y;
  return { x: pdf.x === 0 ? 0 : pdf.x, y: y === 0 ? 0 : y };
}
