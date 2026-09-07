// Browser-side image engine. Every function runs entirely on the device — decode
// with createImageBitmap (raster) or a sandboxed <img> (SVG, so embedded scripts
// never run), draw onto a <canvas>, and re-encode to a Blob. No file bytes are
// ever sent anywhere.

import { extensionOf } from "./filenames";
import {
  MAX_CANVAS_EDGE,
  checkMegapixels,
} from "./limits";
import { compressOutputFor } from "./format";
import { estimateDownscale, pickBestCandidate } from "./target";
import type { ConvertResult, RasterOutput } from "./types";

export { compressOutputFor };

interface Decoded {
  readonly width: number;
  readonly height: number;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  close(): void;
}

function loadImageEl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file could not be read as an image."));
    img.src = url;
  });
}

function isSvg(file: File): boolean {
  return file.type === "image/svg+xml" || extensionOf(file.name) === "svg";
}

async function decodeRaster(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file);
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
    close: () => bitmap.close(),
  };
}

// SVG is rendered through an <img> element (a blob URL), which the browser treats
// as an image: scripts embedded in the SVG do NOT execute in this context. We
// never inject SVG markup into the DOM.
async function decodeSvg(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageEl(url);
    const width = img.naturalWidth || 512;
    const height = img.naturalHeight || 512;
    return {
      width,
      height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function decodeImageFile(file: File): Promise<Decoded> {
  return isSvg(file) ? decodeSvg(file) : decodeRaster(file);
}

/** Read a file's intrinsic pixel dimensions (used for metadata before convert). */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const dec = await decodeImageFile(file);
  try {
    return { width: dec.width, height: dec.height };
  } finally {
    dec.close();
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("The image could not be encoded."))),
      mime,
      quality,
    );
  });
}

/** Free a canvas's backing store promptly. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

const MIME: Record<RasterOutput | "webp", string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

interface DrawOptions {
  width?: number;
  height?: number;
  /** Output encoding. */
  output: RasterOutput | "webp";
  /** JPEG/WebP quality 0..1 (ignored for PNG). */
  quality?: number;
  /** Fill color under transparency for opaque outputs (JPEG). Default white. */
  background?: string;
}

/** Core: decode → draw to a sized canvas → encode. Shared by every image tool. */
async function renderToBlob(
  file: File,
  opts: DrawOptions,
): Promise<{ blob: Blob; width: number; height: number; mime: string }> {
  const dec = await decodeImageFile(file);
  try {
    const mpErr = checkMegapixels(dec.width, dec.height);
    if (mpErr) throw new Error(mpErr);

    let w = Math.max(1, Math.round(opts.width ?? dec.width));
    let h = Math.max(1, Math.round(opts.height ?? dec.height));
    if (w > MAX_CANVAS_EDGE || h > MAX_CANVAS_EDGE) {
      const s = MAX_CANVAS_EDGE / Math.max(w, h);
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not create a drawing canvas.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Opaque formats can't carry alpha — paint a background first.
    if (opts.output === "jpeg") {
      ctx.fillStyle = opts.background ?? "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    dec.draw(ctx, w, h);

    const mime = MIME[opts.output];
    const quality = opts.output === "png" ? undefined : opts.quality ?? 0.92;
    const blob = await canvasToBlob(canvas, mime, quality);
    releaseCanvas(canvas);
    return { blob, width: w, height: h, mime };
  } finally {
    dec.close();
  }
}

/** Change format (png↔jpg, webp→…, svg→png). */
export async function convertRaster(
  file: File,
  output: RasterOutput,
  opts: { filename: string; quality?: number; background?: string; width?: number; height?: number },
): Promise<ConvertResult> {
  const r = await renderToBlob(file, {
    output,
    quality: opts.quality,
    background: opts.background,
    width: opts.width,
    height: opts.height,
  });
  return {
    blob: r.blob,
    filename: opts.filename,
    mime: r.mime,
    bytes: r.blob.size,
    width: r.width,
    height: r.height,
  };
}

export async function compressImage(
  file: File,
  quality: number,
  filename: string,
): Promise<ConvertResult> {
  const { output } = compressOutputFor(file);
  const r = await renderToBlob(file, { output, quality });
  return {
    blob: r.blob,
    filename,
    mime: r.mime,
    bytes: r.blob.size,
    width: r.width,
    height: r.height,
  };
}

export interface TargetCompressResult extends ConvertResult {
  /** JPEG/WebP encoder quality of the chosen candidate (absent for PNG). */
  readonly quality?: number;
  readonly targetBytes: number;
  /** True when the chosen result is at or below the target size. */
  readonly reachedTarget: boolean;
}

/** Never shrink the long edge below this — a smaller image stops being usable. */
const MIN_TARGET_DIM = 24;

/** Compress to AT MOST `targetBytes`, preserving format. Decodes the source ONCE
 *  and re-encodes candidates from it: JPEG/WebP use a bounded quality binary
 *  search at full resolution, then dimension reduction if quality alone can't
 *  reach the target; PNG (no quality control) uses a bounded dimension binary
 *  search, preserving PNG + alpha. Returns the best candidate ≤ target (highest
 *  resolution, then quality); if the target is unreachable it returns the closest
 *  smaller-than-attempted result with reachedTarget=false. */
export async function compressImageToTarget(
  file: File,
  targetBytes: number,
  filename: string,
): Promise<TargetCompressResult> {
  const { output } = compressOutputFor(file);
  const mime = MIME[output];
  const isPng = output === "png";
  const dec = await decodeImageFile(file);
  try {
    const mpErr = checkMegapixels(dec.width, dec.height);
    if (mpErr) throw new Error(mpErr);
    const srcW = dec.width;
    const srcH = dec.height;
    const minScale = MIN_TARGET_DIM / Math.max(srcW, srcH);

    const kept: { blob: Blob; width: number; height: number; quality?: number }[] = [];
    const encode = async (scale: number, quality?: number) => {
      let w = Math.max(1, Math.round(srcW * scale));
      let h = Math.max(1, Math.round(srcH * scale));
      if (w > MAX_CANVAS_EDGE || h > MAX_CANVAS_EDGE) {
        const s = MAX_CANVAS_EDGE / Math.max(w, h);
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser could not create a drawing canvas.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // JPEG can't carry alpha — flatten onto white. PNG/WebP keep transparency.
      if (output === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      dec.draw(ctx, w, h);
      const blob = await canvasToBlob(canvas, mime, isPng ? undefined : quality);
      releaseCanvas(canvas); // free the backing store; the blob is retained
      const cand = { blob, width: w, height: h, quality: isPng ? undefined : quality };
      kept.push(cand);
      return cand;
    };

    if (isPng) {
      const full = await encode(1);
      if (full.blob.size > targetBytes) {
        // Largest scale whose PNG is ≤ target (binary search on dimensions).
        let lo = minScale;
        let hi = 1;
        for (let i = 0; i < 9; i++) {
          const s = (lo + hi) / 2;
          const c = await encode(s);
          if (c.blob.size <= targetBytes) lo = s;
          else hi = s;
        }
      }
    } else {
      // Highest quality ≤ target at a given scale (binary search on quality).
      const qualitySearch = async (scale: number): Promise<{ ok: boolean; lowBytes: number }> => {
        let lo = 0.1;
        let hi = 0.95;
        let ok = false;
        let lowBytes = Infinity;
        for (let i = 0; i < 8; i++) {
          const q = (lo + hi) / 2;
          const c = await encode(scale, q);
          lowBytes = Math.min(lowBytes, c.blob.size);
          if (c.blob.size <= targetBytes) {
            ok = true;
            lo = q; // room to raise quality and still fit
          } else {
            hi = q;
          }
        }
        return { ok, lowBytes };
      };

      const full = await qualitySearch(1);
      if (!full.ok) {
        // Even lowest quality at full res is over target — reduce dimensions.
        let scale = estimateDownscale(targetBytes, full.lowBytes) * 0.97;
        for (let pass = 0; pass < 5; pass++) {
          scale = Math.min(0.98, Math.max(minScale, scale));
          const r = await qualitySearch(scale);
          if (r.ok || scale <= minScale) break;
          scale *= 0.75;
        }
      }
    }

    const pick = pickBestCandidate(
      kept.map((c) => ({ bytes: c.blob.size, width: c.width, height: c.height, quality: c.quality })),
      targetBytes,
    );
    const chosen = kept[pick ? pick.index : kept.length - 1];
    return {
      blob: chosen.blob,
      filename,
      mime,
      bytes: chosen.blob.size,
      width: chosen.width,
      height: chosen.height,
      quality: chosen.quality,
      targetBytes,
      reachedTarget: pick ? pick.reachedTarget : false,
    };
  } finally {
    dec.close();
  }
}

/** Resize, preserving the input format (jpg stays jpg, png stays png, …). */
export async function resizeImage(
  file: File,
  width: number,
  height: number,
  filename: string,
): Promise<ConvertResult> {
  const { output } = compressOutputFor(file);
  const r = await renderToBlob(file, { output, width, height, quality: 0.95 });
  return {
    blob: r.blob,
    filename,
    mime: r.mime,
    bytes: r.blob.size,
    width: r.width,
    height: r.height,
  };
}
