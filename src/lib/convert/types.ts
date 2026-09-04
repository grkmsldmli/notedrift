// Types for the public, browser-side file-conversion tools (Free Tools Phase 1).
// Every conversion happens in the browser — no file bytes ever leave the device.

export type ToolCategory = "image-format" | "image-utility" | "pdf" | "favicon";

/** Which converter UI/engine a tool page renders. */
export type ConverterKind =
  | "raster" // format change (png→jpg, svg→png, …)
  | "compress"
  | "resize"
  | "images-to-pdf"
  | "png-to-ico";

export type RasterOutput = "png" | "jpeg";
export type OutputKind = RasterOutput | "pdf" | "ico";

export interface ToolDef {
  /** URL slug under /tools/. */
  readonly slug: string;
  /** Short human name (H1, cards, nav). */
  readonly title: string;
  /** Full <title> for SEO. */
  readonly seoTitle: string;
  /** One-sentence description (meta + subhead). */
  readonly description: string;
  readonly category: ToolCategory;
  readonly kind: ConverterKind;
  /** Accepted MIME types. */
  readonly accept: readonly string[];
  /** Accepted file extensions (lowercase, no dot) — a fallback when MIME is blank. */
  readonly acceptExts: readonly string[];
  /** Friendly label for accepted input, e.g. "PNG", "PNG or JPG", "PDF". */
  readonly acceptLabel: string;
  readonly output: OutputKind;
  /** Output file extension (no dot), e.g. "jpg", "png", "pdf", "ico". */
  readonly outputExt: string;
  /** Slugs of related tools shown at the bottom of the page. */
  readonly related: readonly string[];
}

/** A finished conversion ready to download. */
export interface ConvertResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
}
