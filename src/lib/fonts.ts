// Curated canvas font families — four clear, paper-first choices. Only the
// "Handwritten" face is a real web font (self-hosted Patrick Hand, SIL OFL 1.1);
// the others are strong system stacks that need no loading.

import { CANVAS_FONT } from "./constants";

export type FontFamilyKey = "sans" | "serif" | "mono" | "hand";

/** The handwriting stack — falls back cleanly if Patrick Hand fails to load. */
export const HAND_FONT = '"Patrick Hand", "Segoe Print", "Bradley Hand", cursive';

/** Concrete CSS font-family value for each key. `sans` equals CANVAS_FONT so
 *  legacy text (created before the font system) already maps to Sans. */
export const FONT_STACKS: Record<FontFamilyKey, string> = {
  sans: CANVAS_FONT,
  serif:
    'Georgia, Cambria, "Iowan Old Style", "Times New Roman", "Noto Serif", serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, monospace',
  hand: HAND_FONT,
};

export const FONT_OPTIONS: { key: FontFamilyKey; label: string }[] = [
  { key: "sans", label: "Sans" },
  { key: "serif", label: "Serif" },
  { key: "mono", label: "Mono" },
  { key: "hand", label: "Handwritten" },
];

/** Map a stored fontFamily string back to its key, for the UI's active state. */
export function fontKeyOf(fontFamily: string | undefined): FontFamilyKey {
  if (!fontFamily) return "sans";
  const f = fontFamily.toLowerCase();
  if (f.includes("patrick") || f.includes("cursive") || f.includes("hand"))
    return "hand";
  if (f.includes("mono") || f.includes("consol") || f.includes("menlo"))
    return "mono";
  // Check sans BEFORE serif — the system sans stack ends in "sans-serif", whose
  // "serif" substring would otherwise misclassify the default/legacy font.
  if (f.includes("sans") || f.includes("system-ui") || f.includes("-apple-system"))
    return "sans";
  if (f.includes("georgia") || f.includes("serif") || f.includes("times") || f.includes("cambria"))
    return "serif";
  return "sans";
}

/** Ensure the self-hosted handwriting font is ready before any canvas text using
 *  it is measured, so a saved note never reflows when the font arrives late.
 *  Resolves (never rejects) — on failure/timeout the fallback stack is used. */
export async function ensureCanvasFonts(): Promise<void> {
  const d = typeof document !== "undefined" ? document : undefined;
  if (!d || !("fonts" in d)) return;
  try {
    await Promise.race([
      Promise.all([
        d.fonts.load('16px "Patrick Hand"'),
        d.fonts.load('24px "Patrick Hand"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* fall back to the cursive stack — no throw */
  }
}
