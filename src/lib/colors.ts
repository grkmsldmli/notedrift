// Shared color system for NoteDrift's drawing tools.
//
// A small, well-tuned fast palette plus HSV/HEX conversion helpers for the
// advanced picker. Colors are chosen to read cleanly on the white canvas AND in
// the dark app chrome — no crude CSS primaries.

export interface Swatch {
  name: string;
  value: string;
}

/** The 12 fast-access ink colors. */
export const INK_PALETTE: Swatch[] = [
  { name: "Graphite", value: "#20242e" },
  { name: "Black", value: "#0b0e14" },
  { name: "White", value: "#ffffff" },
  { name: "Blue", value: "#2f6bff" },
  { name: "Cyan", value: "#12b5c9" },
  { name: "Violet", value: "#7c5cff" },
  { name: "Purple", value: "#9b3bd4" },
  { name: "Red", value: "#ef4444" },
  { name: "Pink", value: "#ec4899" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#fbbf24" },
  { name: "Green", value: "#22a95b" },
];

/* ------------------------------ conversions ------------------------------- */

export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return "#" + h.toLowerCase();
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSV {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex) ?? "#000000";
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: HSV): string => rgbToHex(hsvToRgb(hsv));

/** Relative luminance, for choosing a readable check/handle color over a swatch. */
export function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}
