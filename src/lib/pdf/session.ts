// The ephemeral in-memory model for one open PDF. Deliberately NOT the editor's
// CanvasDoc: a PDF session is never persisted to IndexedDB, has no undo history,
// and is discarded when the tab closes or another file is opened. P1 holds only
// view state (which page, zoom, fit mode); editing overlays arrive in a later
// phase. The helpers here are pure so they can be unit-tested.

export type FitMode = "none" | "page" | "width";

export interface PdfPageSize {
  /** Unscaled page dimensions in PDF points (1pt = 1/72"). */
  readonly width: number;
  readonly height: number;
}

export interface PdfDocumentSession {
  readonly filename: string;
  readonly byteLength: number;
  readonly numPages: number;
  /** Current 1-based page. */
  readonly page: number;
  /** Current zoom (CSS px per PDF point). */
  readonly scale: number;
  readonly fitMode: FitMode;
}

export function createSession(init: {
  filename: string;
  byteLength: number;
  numPages: number;
}): PdfDocumentSession {
  return {
    filename: init.filename,
    byteLength: init.byteLength,
    numPages: Math.max(1, init.numPages),
    page: 1,
    scale: 1,
    fitMode: "page",
  };
}

/** Clamp a requested page into [1, numPages]. */
export function clampPage(page: number, numPages: number): number {
  if (!Number.isFinite(page)) return 1;
  const max = Math.max(1, Math.floor(numPages));
  return Math.min(Math.max(1, Math.round(page)), max);
}

export function goToPage(s: PdfDocumentSession, page: number): PdfDocumentSession {
  const next = clampPage(page, s.numPages);
  return next === s.page ? s : { ...s, page: next };
}

export function nextPage(s: PdfDocumentSession): PdfDocumentSession {
  return goToPage(s, s.page + 1);
}

export function prevPage(s: PdfDocumentSession): PdfDocumentSession {
  return goToPage(s, s.page - 1);
}

export function setScale(
  s: PdfDocumentSession,
  scale: number,
  fitMode: FitMode = "none",
): PdfDocumentSession {
  return { ...s, scale, fitMode };
}
