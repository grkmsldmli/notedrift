// Render PDF pages to JPEG images in the browser, using the same self-hosted
// pdf.js runtime as the editor (loaded from /public via a variable specifier so
// the bundler doesn't try to bundle it). Used by the PDF-to-JPG tool. No upload.

interface PdfjsModule {
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
}
interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPageProxy {
  getViewport(o: { scale: number }): PdfViewport;
  render(o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> };
  cleanup(): void;
}

export interface RenderedPage {
  pageNumber: number;
  /** A smaller JPEG data URL for on-page preview. */
  previewUrl: string;
  /** A full-quality JPEG blob for download. */
  blob: Blob;
  width: number;
  height: number;
}

let pdfjsPromise: Promise<PdfjsModule> | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const spec = "/pdfjs/pdf.min.mjs";
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as PdfjsModule;
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    })().catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

/** Render every page of a PDF to a JPEG. `scale` trades quality for size/speed. */
export async function renderPdfToJpegs(
  bytes: Uint8Array,
  opts: { scale?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<RenderedPage[]> {
  const scale = opts.scale ?? 2;
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    isEvalSupported: false,
  }).promise;

  const out: RenderedPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("no-canvas");
      ctx.fillStyle = "#ffffff"; // JPEG has no alpha
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
      if (!blob) throw new Error("encode-failed");
      out.push({
        pageNumber: i,
        previewUrl: canvas.toDataURL("image/jpeg", 0.6),
        blob,
        width: canvas.width,
        height: canvas.height,
      });
      opts.onProgress?.(i, doc.numPages);
    }
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore */
    }
  }
  return out;
}
