// Browser-safety limits + input validation for the PDF editor. These bound
// obvious OOM / freeze cases — they are NOT monetization limits. Pure, so the
// validation is unit-tested.

export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_PDF_PAGES = 500;
export const MAX_RENDER_EDGE = 4000; // longest edge of a rendered page bitmap, px
export const MAX_DPR = 2;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Reject bad input files early. null = ok. */
export function checkPdfFile(file: { size: number; type: string; name: string }): string | null {
  if (file.size <= 0) return "This file is empty.";
  if (file.size > MAX_PDF_BYTES) {
    return "This PDF is too large to open safely in your browser.";
  }
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!looksPdf) return "Please choose a PDF file.";
  return null;
}

/** Verify the "%PDF-" signature (some PDFs have a little leading whitespace). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

export function checkPageCount(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return "This PDF has no readable pages.";
  if (n > MAX_PDF_PAGES) {
    return `This PDF has ${n} pages — the editor currently supports up to ${MAX_PDF_PAGES}.`;
  }
  return null;
}
