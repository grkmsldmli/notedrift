// Pure formatting + dimension math shared by every tool. No browser APIs here,
// so these are unit-tested directly with node's test runner.

import type { ConverterKind, RasterOutput } from "./types.ts";

/** Which encoder the compressor/resizer should use for a given input. Format-
 *  PRESERVING: JPEG stays JPEG, WebP stays WebP, and everything else (PNG, and any
 *  unsupported input) encodes as PNG — a transparency-capable input is NEVER
 *  flattened to JPEG. Pure (reads only the file's declared type), so the
 *  no-silent-conversion guarantee is unit-tested directly. */
export function compressOutputFor(file: File): {
  output: RasterOutput | "webp";
  ext: string;
} {
  const t = file.type;
  if (t === "image/jpeg") return { output: "jpeg", ext: "jpg" };
  if (t === "image/webp") return { output: "webp", ext: "webp" };
  return { output: "png", ext: "png" };
}

/** Human display label for a produced file's format, derived from its ACTUAL MIME
 *  (falling back to the filename extension). The compressor/resizer are
 *  format-preserving, so the real output MIME — never a fixed tool-metadata value
 *  — is the source of truth for what to show. */
export function formatLabel(mime: string, filename?: string): string {
  switch (mime) {
    case "image/png":
      return "PNG";
    case "image/jpeg":
    case "image/jpg":
      return "JPG";
    case "image/webp":
      return "WebP";
    case "image/gif":
      return "GIF";
    case "image/svg+xml":
      return "SVG";
    case "application/pdf":
      return "PDF";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ICO";
  }
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (ext) {
    // Map known extensions to the SAME canonical labels as the MIME branch, so a
    // file's mime-derived and extension-derived labels always agree.
    switch (ext) {
      case "jpg":
      case "jpeg":
        return "JPG";
      case "png":
        return "PNG";
      case "webp":
        return "WebP";
      case "gif":
        return "GIF";
      case "svg":
        return "SVG";
      case "pdf":
        return "PDF";
      case "ico":
        return "ICO";
    }
    return ext.toUpperCase();
  }
  const sub = mime.split("/").pop();
  return sub ? sub.toUpperCase() : "FILE";
}

/** Whether a JPEG/WebP-style quality control actually affects this format's
 *  encoder. PNG (and any lossless format) ignores quality, so a functional
 *  quality slider must never be shown for it. */
export function qualityAppliesToMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/webp";
}

/** The outcome of a compression attempt. `improved` is true ONLY when the result
 *  is strictly smaller — an equal or larger output is never a success. */
export function compressionOutcome(
  originalBytes: number,
  resultBytes: number,
): { improved: boolean; savedBytes: number; percent: number } {
  const savedBytes = originalBytes - resultBytes;
  return {
    improved: savedBytes > 0,
    savedBytes,
    percent: savingsPercent(originalBytes, resultBytes),
  };
}

/** The primary action-button label for a converter tool. Compress/resize are
 *  format-preserving actions (never "Convert to X"). */
export function converterCtaLabel(
  kind: ConverterKind,
  working: boolean,
  outputExt?: string,
): string {
  if (kind === "compress") return working ? "Compressing…" : "Compress Image";
  if (kind === "resize") return working ? "Resizing…" : "Resize Image";
  return working ? "Converting…" : `Convert to ${(outputExt ?? "").toUpperCase()}`;
}

/** The short "output" badge for tool listings / page copy. Format-preserving
 *  tools describe the action, not a (nonexistent) fixed target format. */
export function toolOutputLabel(kind: ConverterKind, outputExt?: string): string {
  if (kind === "compress") return "Compressed";
  if (kind === "resize") return "Resized";
  return outputExt ? outputExt.toUpperCase() : "";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** How much smaller `after` is than `before`, as a rounded percent. Positive =
 *  smaller (a saving); negative = the output grew. */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

export function formatDimensions(w: number, h: number): string {
  return `${Math.round(w)} × ${Math.round(h)}`;
}

/**
 * Compute output dimensions for a resize. With `lock` on, a single provided edge
 * drives the other via the original aspect ratio; with `lock` off, each provided
 * edge is used directly and a missing edge keeps the original. Never returns a
 * dimension below 1.
 */
export function resizeDims(
  origW: number,
  origH: number,
  reqW: number | null,
  reqH: number | null,
  lock: boolean,
): { width: number; height: number } {
  if (origW <= 0 || origH <= 0) return { width: 0, height: 0 };
  const ar = origW / origH;
  const hasW = reqW != null && reqW > 0;
  const hasH = reqH != null && reqH > 0;
  if (lock) {
    if (hasW) return { width: Math.round(reqW!), height: Math.max(1, Math.round(reqW! / ar)) };
    if (hasH) return { width: Math.max(1, Math.round(reqH! * ar)), height: Math.round(reqH!) };
    return { width: origW, height: origH };
  }
  return {
    width: hasW ? Math.max(1, Math.round(reqW!)) : origW,
    height: hasH ? Math.max(1, Math.round(reqH!)) : origH,
  };
}
