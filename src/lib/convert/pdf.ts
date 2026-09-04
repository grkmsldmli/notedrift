// Images → PDF, browser-side, via pdf-lib. One page per image, each page sized
// to its image so the aspect ratio is exact. No file bytes leave the device.
//
// NOTE: PDF → image (rasterizing PDF pages) is intentionally NOT shipped in
// Free Tools Phase 1. Every pdfjs build tried (v4 legacy and v6, real worker and
// main-thread) hangs at page.render() under the current Next 16 / Turbopack
// bundling while parsing works — so those tools would be broken. They are
// deferred until that rendering path is reliable (see docs/PRODUCT_MODEL.md).

import { PDFDocument } from "pdf-lib";
import type { ConvertResult } from "./types";

export async function imagesToPdf(files: File[], filename: string): Promise<ConvertResult> {
  const doc = await PDFDocument.create();
  for (const file of files) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const isPng = file.type === "image/png";
    const img = isPng ? await doc.embedPng(buf) : await doc.embedJpg(buf);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const out = await doc.save();
  const blob = new Blob([out as BlobPart], { type: "application/pdf" });
  return { blob, filename, mime: "application/pdf", bytes: blob.size };
}
