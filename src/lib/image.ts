// Image import helpers — normalize oversized photos before they enter the canvas
// document, so a single phone photo can't bloat the whole page into IndexedDB.
// No dependency: a plain offscreen canvas downscale.

/** Longest-edge cap for stored raster images. Big enough to stay crisp when
 *  zoomed/annotated, small enough that a 12–48MP photo shrinks dramatically. */
export const MAX_IMAGE_EDGE = 2560;

/** JPEG quality for opaque photos (transparency-bearing types stay PNG). */
export const IMAGE_JPEG_QUALITY = 0.85;

/** Reject inputs above this many bytes outright (before decoding). */
export const MAX_IMAGE_FILE_BYTES = 40 * 1024 * 1024;

/** Reject decoded images above this many megapixels — a well-compressed file
 *  can be small on disk yet gigapixel-huge, blowing up canvas memory. */
export const MAX_IMAGE_MEGAPIXELS = 60;

/** A friendly error surfaced to the user when an import can't proceed. */
export class ImageImportError extends Error {}

export interface NormalizedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** Bytes of the original file and of the normalized dataURL (for diagnostics). */
  originalBytes: number;
  normalizedBytes: number;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

/** Roughly measure a dataURL's decoded byte size (base64 → bytes). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Normalize an imported image file: downscale to MAX_IMAGE_EDGE on the longest
 * side (preserving aspect), re-encoding as PNG when the source may carry alpha
 * (png/webp/gif) or JPEG otherwise. Images already within bounds are returned
 * as-is (no needless re-compression). Throws ImageImportError on unusable input.
 */
export async function normalizeImageFile(file: File): Promise<NormalizedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImageImportError("That file isn't an image.");
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new ImageImportError("This image is too large to add (over 40MB).");
  }

  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataURL(file);
  } catch {
    throw new ImageImportError("Couldn't read this image.");
  }

  let el: HTMLImageElement;
  try {
    el = await loadImageEl(dataUrl);
  } catch {
    throw new ImageImportError("This image couldn't be opened.");
  }

  const w = el.naturalWidth || el.width;
  const h = el.naturalHeight || el.height;
  if (!w || !h) throw new ImageImportError("This image appears to be empty.");
  // Guard against gigapixel images that decode small on disk but would allocate
  // an enormous canvas (a full decode already happened, but this stops the draw).
  if (w * h > MAX_IMAGE_MEGAPIXELS * 1_000_000) {
    throw new ImageImportError("This image is too large (too many pixels).");
  }

  const longest = Math.max(w, h);
  const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;

  // Already small enough — keep the original bytes (no re-compression).
  if (scale === 1) {
    return {
      dataUrl,
      width: w,
      height: h,
      originalBytes: file.size,
      normalizedBytes: dataUrlBytes(dataUrl),
    };
  }

  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageImportError("Couldn't process this image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(el, 0, 0, dw, dh);

  // Preserve transparency for formats that can carry it; JPEG-encode opaque photos.
  const mayHaveAlpha = /image\/(png|webp|gif|avif)/i.test(file.type);
  const out = mayHaveAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);

  return {
    dataUrl: out,
    width: dw,
    height: dh,
    originalBytes: file.size,
    normalizedBytes: dataUrlBytes(out),
  };
}
