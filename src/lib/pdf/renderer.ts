// Browser-only PDF rendering engine. Owns the isolated pdf.js runtime and turns
// pages into canvas bitmaps. Key guarantees:
//   * pdf.js is loaded as untransformed ESM from /public via a *variable*-
//     specifier dynamic import, so neither TypeScript nor Turbopack resolves or
//     bundles it — it never enters the main "/" editor bundle.
//   * Every page render carries a monotonic token and cancels the previous
//     RenderTask, so rapid page/zoom changes can't paint a stale frame.
//   * No global requestAnimationFrame patching. Visibility handling lives in the
//     workspace component (re-render on tab-visible), local to this feature.
//   * isEvalSupported:false and no document JS — untrusted PDFs can't run code.
//
// This module must not import the canvas editor, auth, or storage.

import { MAX_DPR, checkPageCount, hasPdfHeader } from "./limits.ts";
import { safeRenderScale } from "./geometry.ts";
import type { PdfPageSize } from "./session.ts";

/* ---- minimal structural types for the parts of pdf.js we use ---- */

interface PdfViewport {
  readonly width: number;
  readonly height: number;
}
interface PdfRenderTask {
  readonly promise: Promise<void>;
  cancel(): void;
}
interface PdfPageProxy {
  getViewport(params: { scale: number; rotation?: number }): PdfViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): PdfRenderTask;
  cleanup(): void;
}
interface PdfDocumentProxy {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
}
interface PdfLoadingTask {
  readonly promise: Promise<PdfDocumentProxy>;
  destroy(): Promise<void>;
}
interface PdfjsModule {
  getDocument(params: Record<string, unknown>): PdfLoadingTask;
  GlobalWorkerOptions: { workerSrc: string };
}

/* ---- errors ---- */

export type PdfErrorCode =
  | "not-pdf"
  | "password"
  | "corrupt"
  | "too-many-pages"
  | "empty"
  | "unknown";

export class PdfLoadError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.name = "PdfLoadError";
    this.code = code;
  }
}

function isCancel(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "RenderingCancelledException";
}

function mapLoadError(err: unknown): PdfLoadError {
  const name = (err as { name?: string } | null)?.name;
  if (name === "PasswordException") {
    return new PdfLoadError("password", "This PDF is password-protected, so it can't be opened here.");
  }
  return new PdfLoadError("corrupt", "This PDF appears to be damaged and couldn't be opened.");
}

/* ---- isolated runtime loader (module singleton) ---- */

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      // Variable specifier: keeps TS from resolving the path (no TS2307) and
      // Turbopack/webpack from bundling it. Loaded as static ESM from /public.
      const spec = "/pdfjs/pdf.min.mjs";
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec)) as PdfjsModule;
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    })().catch((err) => {
      pdfjsPromise = null; // allow a later retry if the runtime failed to load
      throw err;
    });
  }
  return pdfjsPromise;
}

/* ---- renderer ---- */

export interface RenderResult {
  /** false = this render was superseded by a newer one; the canvas is stale. */
  readonly ok: boolean;
  readonly cssWidth: number;
  readonly cssHeight: number;
}

export class PdfRenderer {
  private pdfjs: PdfjsModule | null = null;
  private loadingTask: PdfLoadingTask | null = null;
  private doc: PdfDocumentProxy | null = null;
  private renderTask: PdfRenderTask | null = null;
  private renderToken = 0;
  private destroyed = false;

  get numPages(): number {
    return this.doc?.numPages ?? 0;
  }

  /** Parse a PDF from bytes. Returns the page count. Throws PdfLoadError. */
  async open(data: Uint8Array): Promise<number> {
    if (data.byteLength === 0) throw new PdfLoadError("empty", "This file is empty.");
    if (!hasPdfHeader(data)) {
      throw new PdfLoadError("not-pdf", "This file doesn't look like a PDF.");
    }
    const pdfjs = (this.pdfjs ??= await loadPdfjs());
    const task = pdfjs.getDocument({
      data,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      isEvalSupported: false, // never eval() font/color programs
      disableRange: false,
    });
    this.loadingTask = task;

    let doc: PdfDocumentProxy;
    try {
      doc = await task.promise;
    } catch (err) {
      throw mapLoadError(err);
    }

    const countErr = checkPageCount(doc.numPages);
    if (countErr) {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
      throw new PdfLoadError(doc.numPages > 0 ? "too-many-pages" : "empty", countErr);
    }

    if (this.destroyed) {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
      throw new PdfLoadError("unknown", "The document was closed.");
    }

    this.doc = doc;
    return doc.numPages;
  }

  /** Unscaled page size in PDF points. */
  async pageSize(pageNumber: number): Promise<PdfPageSize> {
    const doc = this.requireDoc();
    const page = await doc.getPage(pageNumber);
    const vp = page.getViewport({ scale: 1 });
    page.cleanup();
    return { width: vp.width, height: vp.height };
  }

  /**
   * Render `pageNumber` at `scale` (CSS px per point) into `canvas`. Cancels any
   * in-flight main render first; if a newer render starts before this finishes,
   * resolves with ok:false (stale — the caller should ignore it).
   */
  async renderPage(
    pageNumber: number,
    scale: number,
    canvas: HTMLCanvasElement,
  ): Promise<RenderResult> {
    const doc = this.requireDoc();
    const token = ++this.renderToken;
    this.cancelRender();

    const page = await doc.getPage(pageNumber);
    if (token !== this.renderToken) {
      page.cleanup();
      return { ok: false, cssWidth: 0, cssHeight: 0 };
    }

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const base = page.getViewport({ scale: 1 });
    const eff = safeRenderScale(base.width, base.height, scale, dpr);
    const viewport = page.getViewport({ scale: eff });

    const cssWidth = Math.max(1, Math.floor(viewport.width));
    const cssHeight = Math.max(1, Math.floor(viewport.height));
    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      page.cleanup();
      throw new PdfLoadError("unknown", "Your browser couldn't provide a canvas to draw on.");
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const task = page.render({ canvasContext: ctx, viewport });
    this.renderTask = task;
    try {
      await task.promise;
    } catch (err) {
      if (isCancel(err)) return { ok: false, cssWidth, cssHeight };
      throw err;
    } finally {
      if (this.renderTask === task) this.renderTask = null;
      page.cleanup();
    }
    return { ok: token === this.renderToken, cssWidth, cssHeight };
  }

  /**
   * Render a low-res thumbnail of `pageNumber` roughly `cssWidth` wide into
   * `canvas`. Independent of the main-render token so it can't cancel the page
   * view; the caller (thumbnail strip) serializes these and only requests
   * visible pages.
   */
  async renderThumbnail(
    pageNumber: number,
    cssWidth: number,
    canvas: HTMLCanvasElement,
  ): Promise<boolean> {
    const doc = this.requireDoc();
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = cssWidth / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const eff = safeRenderScale(base.width, base.height, scale, dpr);
    const viewport = page.getViewport({ scale: eff });

    canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
    canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
    canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      page.cleanup();
      return false;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const task = page.render({ canvasContext: ctx, viewport });
    try {
      await task.promise;
    } catch (err) {
      if (isCancel(err)) return false;
      throw err;
    } finally {
      page.cleanup();
    }
    return true;
  }

  cancelRender(): void {
    if (this.renderTask) {
      try {
        this.renderTask.cancel();
      } catch {
        /* ignore */
      }
      this.renderTask = null;
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.renderToken++;
    this.cancelRender();
    const task = this.loadingTask;
    this.loadingTask = null;
    this.doc = null;
    try {
      if (task) await task.destroy();
    } catch {
      /* ignore */
    }
  }

  private requireDoc(): PdfDocumentProxy {
    if (!this.doc) throw new PdfLoadError("unknown", "No PDF is currently open.");
    return this.doc;
  }
}
