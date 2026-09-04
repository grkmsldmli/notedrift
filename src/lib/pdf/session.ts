// The ephemeral in-memory model for one open PDF. Deliberately NOT the editor's
// CanvasDoc: a PDF session is never persisted to IndexedDB, has no undo history,
// and is discarded when the tab closes or another file is opened. P1 holds only
// view state (which page, zoom, fit mode); editing overlays arrive in a later
// phase. The helpers here are pure so they can be unit-tested.

export type FitMode = "none" | "page" | "width";

export interface PdfPageSize {
  /** On-screen (display, rotation-applied) page dimensions in PDF points. */
  readonly width: number;
  readonly height: number;
  /** Page rotation, normalized to 0 | 90 | 180 | 270. */
  readonly rotation: number;
}

export interface PdfDocumentSession {
  readonly filename: string;
  readonly byteLength: number;
  readonly numPages: number;
  /** Stable per-page identifiers (index i → page i+1). Overlays key off these
   *  rather than the visual page index, so a future page-reorder can't scramble
   *  which edits belong to which page. */
  readonly pageIds: readonly string[];
  /** Current 1-based page. */
  readonly page: number;
  /** Current zoom (CSS px per PDF point). */
  readonly scale: number;
  readonly fitMode: FitMode;
}

/** Deterministic, session-stable page ids. */
export function makePageIds(numPages: number): string[] {
  return Array.from({ length: Math.max(1, numPages) }, (_, i) => `pg-${i + 1}`);
}

export function createSession(init: {
  filename: string;
  byteLength: number;
  numPages: number;
}): PdfDocumentSession {
  const numPages = Math.max(1, init.numPages);
  return {
    filename: init.filename,
    byteLength: init.byteLength,
    numPages,
    pageIds: makePageIds(numPages),
    page: 1,
    scale: 1,
    fitMode: "page",
  };
}

/** The stable id for a 1-based page number. */
export function pageIdAt(session: PdfDocumentSession, pageNumber: number): string {
  const idx = clampPage(pageNumber, session.numPages) - 1;
  return session.pageIds[idx] ?? `pg-${idx + 1}`;
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
