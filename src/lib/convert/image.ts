// Browser-side image engine. Every function runs entirely on the device — decode
// with createImageBitmap (raster) or a sandboxed <img> (SVG, so embedded scripts
// never run), draw onto a <canvas>, and re-encode to a Blob. No file bytes are
// ever sent anywhere.

import { extensionOf } from "./filenames";
import {
  MAX_CANVAS_EDGE,
  checkMegapixels,
} from "./limits";
import type { ConvertResult, RasterOutput } from "./types";

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

/** Which encoder the compressor should use for a given input (format-preserving,
 *  except unsupported inputs fall back to PNG). */
export function compressOutputFor(file: File): {
  output: RasterOutput | "webp";
  ext: string;
} {
  const t = file.type;
  if (t === "image/jpeg") return { output: "jpeg", ext: "jpg" };
  if (t === "image/webp") return { output: "webp", ext: "webp" };
  return { output: "png", ext: "png" };
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
