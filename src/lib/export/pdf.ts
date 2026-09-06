// PDF assembly from rendered PNG pages, using pdf-lib (already a dependency, used
// by the PDF editor). Each PNG becomes one PDF page sized to the image's pixel
// dimensions at 72 dpi, so content is never cropped or distorted.

import { PDFDocument } from "pdf-lib";
import { downloadBlob } from "./download.ts";

export interface PdfPageImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Wrap raw bytes in a Blob (copies into a fresh ArrayBuffer so the type is
 *  concrete, sidestepping the Uint8Array<ArrayBufferLike> → BlobPart mismatch). */
function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

/** Build a PDF from one or more PNG page images and return its bytes. */
export async function buildPdf(pages: PdfPageImage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const p of pages) {
    const png = await pdf.embedPng(p.bytes);
    // 1 image px = 1 PDF point (72 dpi). Keeps aspect exact; viewers scale to fit.
    const page = pdf.addPage([p.width, p.height]);
    page.drawImage(png, { x: 0, y: 0, width: p.width, height: p.height });
  }
  return pdf.save();
}

async function blobToPageImage(blob: Blob, width: number, height: number): Promise<PdfPageImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width, height };
}

/** Single-page canvas → PDF (Free). */
export async function exportSinglePagePdf(
  png: { blob: Blob; width: number; height: number },
  filename: string,
): Promise<void> {
  const bytes = await buildPdf([await blobToPageImage(png.blob, png.width, png.height)]);
  downloadBlob(bytesToBlob(bytes, "application/pdf"), `${filename}.pdf`);
}

/** Multi-page PDF from already-rendered page images (Pro). */
export async function exportMultiPagePdf(pages: PdfPageImage[], filename: string): Promise<void> {
  const bytes = await buildPdf(pages);
  downloadBlob(bytesToBlob(bytes, "application/pdf"), `${filename}.pdf`);
}
