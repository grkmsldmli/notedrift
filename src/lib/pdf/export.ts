// P3 export: turn the immutable original PDF + the NoteDrift overlay model into
// a real, newly-generated PDF. Uses pdf-lib to LOAD the original (preserving its
// text/vectors/images — never rasterizing whole pages) and draws each overlay as
// vector content / real text. Runs entirely in the browser; no bytes leave.

import {
  BlendMode,
  degrees,
  LineCapStyle,
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getStroke } from "perfect-freehand";
import { displayToPdf, type PageGeometry, type Pt } from "./coordinates.ts";
import { overlaysForPage, type OverlayState, type PdfOverlay } from "./overlays.ts";
import {
  arrowHead,
  boxCorners,
  ellipseBeziers,
  exportFilename,
  isWinAnsiText,
  liberationFile,
  pdfColor,
  standardFontKey,
  toSvgPoint,
} from "./exportGeometry.ts";

export interface ExportResult {
  bytes: Uint8Array;
  filename: string;
  /** Some added-text characters aren't in the available fonts and were omitted. */
  unsupportedText: boolean;
}

type FkFont = { hasGlyphForCodePoint(cp: number): boolean };

const STANDARD_ENUM: Record<string, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  "Times-Roman": StandardFonts.TimesRoman,
  "Times-Bold": StandardFonts.TimesRomanBold,
  "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  "Courier-Bold": StandardFonts.CourierBold,
  "Courier-Oblique": StandardFonts.CourierOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
};

/** Per-export font cache + a page coordinate mapper. */
class ExportCtx {
  private std = new Map<string, PDFFont>();
  private lib = new Map<string, PDFFont>();
  private libCov: FkFont | null = null;
  constructor(private doc: PDFDocument) {}

  async standard(key: string): Promise<PDFFont> {
    let f = this.std.get(key);
    if (!f) {
      f = await this.doc.embedFont(STANDARD_ENUM[key] ?? StandardFonts.Helvetica);
      this.std.set(key, f);
    }
    return f;
  }

  async liberation(bold: boolean, italic: boolean): Promise<PDFFont> {
    const file = liberationFile(bold, italic);
    let f = this.lib.get(file);
    if (!f) {
      const bytes = await fetchFont(file);
      f = await this.doc.embedFont(bytes, { subset: true });
      this.lib.set(file, f);
    }
    return f;
  }

  /** Coverage probe (regular variant — all Liberation weights share the cmap). */
  async coverage(): Promise<FkFont> {
    if (!this.libCov) {
      const bytes = await fetchFont("LiberationSans-Regular.ttf");
      this.libCov = fontkit.create(bytes) as unknown as FkFont;
    }
    return this.libCov;
  }
}

async function fetchFont(file: string): Promise<Uint8Array> {
  const res = await fetch(`/pdfjs/standard_fonts/${file}`);
  if (!res.ok) throw new Error(`font ${file} unavailable`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function exportEditedPdf(opts: {
  originalBytes: Uint8Array;
  overlays: OverlayState;
  pageIds: readonly string[];
  filename: string;
}): Promise<ExportResult> {
  const doc = await PDFDocument.load(opts.originalBytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  doc.registerFontkit(fontkit);
  const pages = doc.getPages();
  const ctx = new ExportCtx(doc);
  let unsupportedText = false;

  for (let i = 0; i < pages.length; i++) {
    const pageId = opts.pageIds[i];
    if (!pageId) continue;
    const list = overlaysForPage(opts.overlays, pageId);
    if (list.length === 0) continue;

    const page = pages[i];
    const crop = page.getCropBox();
    const geom: PageGeometry = {
      width: crop.width,
      height: crop.height,
      rotation: page.getRotation().angle,
    };
    // Map a display point → PDF user space (adding the crop-box origin so PDFs
    // whose CropBox ≠ MediaBox still land correctly).
    const toPdf = (p: Pt): Pt => {
      const q = displayToPdf(p, geom);
      return { x: q.x + crop.x, y: q.y + crop.y };
    };
    const toSvg = (p: Pt): Pt => {
      const s = toSvgPoint(p, geom);
      return { x: s.x + crop.x, y: s.y - crop.y };
    };

    for (const o of list) {
      if (await drawOverlay(page, geom, o, ctx, toPdf, toSvg)) unsupportedText = true;
    }
  }

  const bytes = await doc.save();
  return { bytes, filename: exportFilename(opts.filename), unsupportedText };
}

function closedPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d + " Z";
}

/** Returns true if some text characters had to be dropped. */
async function drawOverlay(
  page: PDFPage,
  geom: PageGeometry,
  o: PdfOverlay,
  ctx: ExportCtx,
  toPdf: (p: Pt) => Pt,
  toSvg: (p: Pt) => Pt,
): Promise<boolean> {
  switch (o.type) {
    case "freehand": {
      const d = freehandSvgPath(o.points, o.width, toSvg);
      if (d) page.drawSvgPath(d, { x: 0, y: 0, color: rgbOf(o.color), opacity: o.opacity });
      return false;
    }
    case "highlight": {
      const pts = boxCorners(o.cx, o.cy, o.w, o.h, 0).map(toSvg);
      page.drawSvgPath(closedPath(pts), {
        x: 0,
        y: 0,
        color: rgbOf(o.color),
        opacity: o.opacity,
        blendMode: BlendMode.Multiply,
      });
      return false;
    }
    case "rect": {
      const pts = boxCorners(o.cx, o.cy, o.w, o.h, o.angle).map(toSvg);
      page.drawSvgPath(closedPath(pts), {
        x: 0,
        y: 0,
        color: o.fill ? rgbOf(o.fill) : undefined,
        borderColor: rgbOf(o.stroke),
        borderWidth: o.strokeWidth,
        opacity: o.opacity,
        borderOpacity: o.opacity,
      });
      return false;
    }
    case "ellipse": {
      const { start, segments } = ellipseBeziers(o.cx, o.cy, o.w / 2, o.h / 2, o.angle);
      const s0 = toSvg(start);
      let d = `M ${s0.x} ${s0.y}`;
      for (const seg of segments) {
        const c1 = toSvg(seg.c1);
        const c2 = toSvg(seg.c2);
        const e = toSvg(seg.end);
        d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`;
      }
      d += " Z";
      page.drawSvgPath(d, {
        x: 0,
        y: 0,
        color: o.fill ? rgbOf(o.fill) : undefined,
        borderColor: rgbOf(o.stroke),
        borderWidth: o.strokeWidth,
        opacity: o.opacity,
        borderOpacity: o.opacity,
      });
      return false;
    }
    case "line": {
      page.drawLine({
        start: toPdf({ x: o.x1, y: o.y1 }),
        end: toPdf({ x: o.x2, y: o.y2 }),
        thickness: o.strokeWidth,
        color: rgbOf(o.stroke),
        opacity: o.opacity,
        lineCap: LineCapStyle.Round,
      });
      return false;
    }
    case "arrow": {
      page.drawLine({
        start: toPdf({ x: o.x1, y: o.y1 }),
        end: toPdf({ x: o.x2, y: o.y2 }),
        thickness: o.strokeWidth,
        color: rgbOf(o.stroke),
        opacity: o.opacity,
        lineCap: LineCapStyle.Round,
      });
      const { tip, left, right } = arrowHead(o.x1, o.y1, o.x2, o.y2, o.strokeWidth);
      const head = [tip, left, right].map(toSvg);
      page.drawSvgPath(closedPath(head), { x: 0, y: 0, color: rgbOf(o.stroke), opacity: o.opacity });
      return false;
    }
    case "text":
      return drawTextOverlay(page, o, ctx, toPdf);
  }
}

function freehandSvgPath(
  points: readonly (readonly [number, number])[],
  width: number,
  toSvg: (p: Pt) => Pt,
): string | null {
  const out = getStroke(points as unknown as number[][], {
    size: Math.max(1, width),
    thinning: 0,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: false,
    last: true,
  });
  if (out.length < 2) return null;
  const sp = out.map(([x, y]) => toSvg({ x, y }));
  let d = `M ${sp[0].x} ${sp[0].y} Q`;
  for (let i = 0; i < sp.length; i++) {
    const a = sp[i];
    const b = sp[(i + 1) % sp.length];
    d += ` ${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`;
  }
  return d + " Z";
}

async function drawTextOverlay(
  page: PDFPage,
  o: Extract<PdfOverlay, { type: "text" }>,
  ctx: ExportCtx,
  toPdf: (p: Pt) => Pt,
): Promise<boolean> {
  const rawLines = o.text.split("\n");
  let font: PDFFont;
  let lines = rawLines;
  let unsupported = false;

  if (isWinAnsiText(o.text)) {
    font = await ctx.standard(standardFontKey(o.fontFamily, o.bold, o.italic));
  } else {
    font = await ctx.liberation(o.bold, o.italic);
    const cov = await ctx.coverage();
    lines = rawLines.map((line) => {
      let clean = "";
      for (const ch of line) {
        const cp = ch.codePointAt(0)!;
        if (cp === 0x20 || cov.hasGlyphForCodePoint(cp)) clean += ch;
        else unsupported = true;
      }
      return clean;
    });
  }

  const size = o.fontSize;
  const color = rgbOf(o.color);
  const ascent = font.heightAtSize(size, { descender: false });
  const lineHeight = size * 1.16; // Fabric Textbox default

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineWidth = font.widthOfTextAtSize(line, size);
    let xDisp = o.x;
    if (o.align === "center") xDisp = o.x + (o.width - lineWidth) / 2;
    else if (o.align === "right") xDisp = o.x + (o.width - lineWidth);
    const baseline = toPdf({ x: xDisp, y: o.y + ascent + i * lineHeight });
    page.drawText(line, {
      x: baseline.x,
      y: baseline.y,
      size,
      font,
      color,
      opacity: o.opacity,
      rotate: degrees(-o.angle),
    });
  }
  return unsupported;
}

function rgbOf(hex: string) {
  const { r, g, b } = pdfColor(hex);
  return rgb(r, g, b);
}
