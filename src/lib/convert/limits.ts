// Resource guards so an arbitrary user file can't OOM or freeze the tab. Pure —
// unit-tested. Limits are generous (real files pass) but bound the obvious
// catastrophic cases.

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB input file
export const MAX_IMAGE_MEGAPIXELS = 100; // decoded pixels of a single image
export const MAX_CANVAS_EDGE = 8192; // hard cap per canvas side
export const MAX_IMAGES_IN_PDF = 100; // images combined into one PDF

/** null = ok, else a friendly message. */
export function checkFileSize(bytes: number): string | null {
  if (bytes <= 0) return "This file is empty.";
  if (bytes > MAX_FILE_BYTES) {
    return "This file is too large to process safely in your browser.";
  }
  return null;
}

export function checkMegapixels(width: number, height: number): string | null {
  if ((width * height) / 1_000_000 > MAX_IMAGE_MEGAPIXELS) {
    return "This image is too large to process safely in your browser.";
  }
  return null;
}

export function checkImageCount(count: number): string | null {
  if (count <= 0) return "Choose at least one image.";
  if (count > MAX_IMAGES_IN_PDF) {
    return `That's a lot of images — please use up to ${MAX_IMAGES_IN_PDF} at a time.`;
  }
  return null;
}
