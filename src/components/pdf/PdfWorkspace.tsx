"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { BrandHome, NavArrows } from "@/components/nav/HeaderNav";
import { PdfDropzone } from "./PdfDropzone";
import { PdfThumbnailRail } from "./PdfThumbnailRail";
import { PdfRenderer, type PdfErrorCode } from "@/lib/pdf/renderer";
import { checkPdfFile } from "@/lib/pdf/limits";
import { clampZoom, fitPageScale, fitWidthScale } from "@/lib/pdf/geometry";
import {
  createSession,
  goToPage,
  nextPage,
  prevPage,
  setScale as setScaleValue,
  type PdfDocumentSession,
} from "@/lib/pdf/session";

type Phase = "empty" | "loading" | "ready" | "error";
type PdfError = { code: PdfErrorCode; message: string };

export function PdfWorkspace() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [session, setSession] = useState<PdfDocumentSession | null>(null);
  const [error, setError] = useState<PdfError | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  // The renderer lives in state (not just a ref) so the render path can read it
  // without touching a ref during render; rendererRef mirrors it for effects.
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null);

  const rendererRef = useRef<PdfRenderer | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageSizeCacheRef = useRef<Map<number, { width: number; height: number }>>(new Map());
  const sessionRef = useRef<PdfDocumentSession | null>(null);
  const renderPendingRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Discard the renderer (and its worker) when leaving the page.
  useEffect(() => {
    return () => {
      void rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  const openFile = useCallback(async (file: File) => {
    const invalid = checkPdfFile(file);
    if (invalid) {
      setError({ code: "not-pdf", message: invalid });
      setPhase("error");
      return;
    }
    setPhase("loading");
    setError(null);
    setSession(null);

    await rendererRef.current?.destroy();
    pageSizeCacheRef.current = new Map();
    const nextRenderer = new PdfRenderer();
    rendererRef.current = nextRenderer;
    setRenderer(nextRenderer);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const byteLength = bytes.byteLength;
      const numPages = await nextRenderer.open(bytes);
      const first = await nextRenderer.pageSize(1);
      pageSizeCacheRef.current.set(1, first);

      const vp = viewportRef.current;
      const scale = vp
        ? fitPageScale(first.width, first.height, vp.clientWidth, vp.clientHeight)
        : 1;
      setSession(
        setScaleValue(createSession({ filename: file.name, byteLength, numPages }), scale, "page"),
      );
      setPhase("ready");
    } catch (err) {
      const e = err as { code?: PdfErrorCode; message?: string };
      setError({ code: e.code ?? "unknown", message: e.message ?? "This PDF couldn't be opened." });
      setPhase("error");
    }
  }, []);

  const closeDoc = useCallback(async () => {
    await rendererRef.current?.destroy();
    rendererRef.current = null;
    setRenderer(null);
    pageSizeCacheRef.current = new Map();
    setSession(null);
    setError(null);
    setPhase("empty");
  }, []);

  // The specific session fields the render/fit effects depend on. Deriving them
  // keeps the effect dependency lists honest without re-running on unrelated
  // session changes.
  const curPage = session?.page ?? null;
  const curScale = session?.scale ?? null;
  const curFit = session?.fitMode ?? null;

  // Render the current page whenever the page, zoom, or a visibility nudge changes.
  useEffect(() => {
    if (phase !== "ready" || curPage == null || curScale == null) return;
    let cancelled = false;
    renderPendingRef.current = true;
    void (async () => {
      const canvas = pageCanvasRef.current;
      const r = rendererRef.current;
      if (!canvas || !r) return;
      try {
        const res = await r.renderPage(curPage, curScale, canvas);
        if (!cancelled && res.ok) renderPendingRef.current = false;
      } catch {
        /* transient — a newer render or a page change superseded this */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, curPage, curScale, renderNonce]);

  // Cache the current page's size and, if a fit mode is active, re-fit for it
  // (pages within a PDF can differ in size).
  useEffect(() => {
    if (phase !== "ready" || curPage == null) return;
    let cancelled = false;
    void (async () => {
      let size = pageSizeCacheRef.current.get(curPage);
      if (!size) {
        try {
          size = await rendererRef.current!.pageSize(curPage);
        } catch {
          return;
        }
        if (cancelled) return;
        pageSizeCacheRef.current.set(curPage, size);
      }
      if (curFit && curFit !== "none") {
        const vp = viewportRef.current;
        if (!vp) return;
        const scale =
          curFit === "page"
            ? fitPageScale(size.width, size.height, vp.clientWidth, vp.clientHeight)
            : fitWidthScale(size.width, vp.clientWidth);
        const cur = sessionRef.current;
        if (cur && Math.abs(scale - cur.scale) > 0.002) {
          setSession((prev) => (prev ? { ...prev, scale } : prev));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, curPage, curFit]);

  // Re-fit on any viewport resize (window resize, thumbnail rail mounting, etc.).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const s = sessionRef.current;
      if (!s || s.fitMode === "none") return;
      const size = pageSizeCacheRef.current.get(s.page);
      if (!size) return;
      const scale =
        s.fitMode === "page"
          ? fitPageScale(size.width, size.height, vp.clientWidth, vp.clientHeight)
          : fitWidthScale(size.width, vp.clientWidth);
      setSession((prev) => (prev && Math.abs(prev.scale - scale) > 0.002 ? { ...prev, scale } : prev));
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  // Re-render if the tab was hidden mid-render (browsers pause rAF in background
  // tabs, which can leave a render un-finished). Local to this feature — no
  // global rAF patching.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && renderPendingRef.current) {
        setRenderNonce((n) => n + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setSession((s) => (s ? setScaleValue(s, clampZoom(s.scale * factor), "none") : s));
  }, []);

  const applyFit = useCallback((mode: "page" | "width") => {
    const vp = viewportRef.current;
    const s = sessionRef.current;
    if (!vp || !s) return;
    const size = pageSizeCacheRef.current.get(s.page);
    if (!size) return;
    const scale =
      mode === "page"
        ? fitPageScale(size.width, size.height, vp.clientWidth, vp.clientHeight)
        : fitWidthScale(size.width, vp.clientWidth);
    setSession(setScaleValue(s, scale, mode));
  }, []);

  // Keyboard navigation — bare keys only, never hijacking browser shortcuts.
  useEffect(() => {
    if (phase !== "ready") return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault();
          setSession((s) => (s ? nextPage(s) : s));
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          setSession((s) => (s ? prevPage(s) : s));
          break;
        case "Home":
          e.preventDefault();
          setSession((s) => (s ? goToPage(s, 1) : s));
          break;
        case "End":
          e.preventDefault();
          setSession((s) => (s ? goToPage(s, s.numPages) : s));
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomBy(1.25);
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomBy(0.8);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, zoomBy]);

  // Grab-to-pan the page area.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || phase !== "ready") return;
    const vp = viewportRef.current;
    if (!vp) return;
    panRef.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop };
    vp.setPointerCapture?.(e.pointerId);
    setGrabbing(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = panRef.current;
    const vp = viewportRef.current;
    if (!p || !vp) return;
    vp.scrollLeft = p.left - (e.clientX - p.x);
    vp.scrollTop = p.top - (e.clientY - p.y);
  }
  function endPan(e: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return;
    panRef.current = null;
    viewportRef.current?.releasePointerCapture?.(e.pointerId);
    setGrabbing(false);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-nd-bg text-nd-text">
      <Header session={session} onClose={closeDoc} />

      <div className="relative flex min-h-0 flex-1">
        {phase === "ready" && session && renderer && (
          <PdfThumbnailRail
            key={`${session.filename}:${session.byteLength}`}
            renderer={renderer}
            numPages={session.numPages}
            currentPage={session.page}
            onSelect={(n) => setSession((s) => (s ? goToPage(s, n) : s))}
          />
        )}

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          className={`nd-scroll relative flex-1 overflow-auto ${
            phase === "ready" ? (grabbing ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
        >
          {phase === "empty" && <PdfDropzone onFile={openFile} />}
          {phase === "loading" && <LoadingState />}
          {phase === "error" && error && <ErrorState error={error} onRetry={closeDoc} />}
          {phase === "ready" && (
            <div className="flex min-h-full w-max min-w-full items-center justify-center p-6">
              <canvas
                ref={pageCanvasRef}
                className="block rounded-[2px] bg-white shadow-2xl shadow-black/50"
              />
            </div>
          )}
        </div>

        {phase === "ready" && session && (
          <Toolbar
            session={session}
            onPrev={() => setSession((s) => (s ? prevPage(s) : s))}
            onNext={() => setSession((s) => (s ? nextPage(s) : s))}
            onZoomOut={() => zoomBy(0.8)}
            onZoomIn={() => zoomBy(1.25)}
            onFitPage={() => applyFit("page")}
            onFitWidth={() => applyFit("width")}
          />
        )}
      </div>
    </div>
  );
}

/* ---- header ---- */

function Header({
  session,
  onClose,
}: {
  session: PdfDocumentSession | null;
  onClose: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-nd-border bg-nd-bg/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <NavArrows />
        <BrandHome wordmarkClassName="hidden md:inline" />
        {session && (
          <>
            <span className="mx-1 hidden h-5 w-px shrink-0 bg-nd-border sm:block" />
            <span className="min-w-0 truncate text-sm text-nd-text" title={session.filename}>
              {session.filename}
            </span>
            <span className="hidden shrink-0 text-xs text-nd-muted sm:inline">
              · {session.numPages} page{session.numPages === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
      {session && (
        <button
          type="button"
          onClick={onClose}
          className="nd-hit inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-nd-border px-2.5 py-1.5 text-xs text-nd-text transition-colors hover:bg-white/5"
        >
          <FileUp size={14} />
          <span className="hidden sm:inline">Open another</span>
        </button>
      )}
    </header>
  );
}

/* ---- toolbar ---- */

function Toolbar({
  session,
  onPrev,
  onNext,
  onZoomOut,
  onZoomIn,
  onFitPage,
  onFitWidth,
}: {
  session: PdfDocumentSession;
  onPrev: () => void;
  onNext: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitPage: () => void;
  onFitWidth: () => void;
}) {
  const pct = Math.round(session.scale * 100);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
        <IconBtn label="Previous page" onClick={onPrev} disabled={session.page <= 1}>
          <ChevronLeft size={16} />
        </IconBtn>
        <span className="whitespace-nowrap px-1.5 text-xs tabular-nums text-nd-muted">
          {session.page} / {session.numPages}
        </span>
        <IconBtn label="Next page" onClick={onNext} disabled={session.page >= session.numPages}>
          <ChevronRight size={16} />
        </IconBtn>
        <Divider />
        <IconBtn label="Zoom out" onClick={onZoomOut} disabled={pct <= 25}>
          <Minus size={16} />
        </IconBtn>
        <span className="w-11 text-center text-xs tabular-nums text-nd-text">{pct}%</span>
        <IconBtn label="Zoom in" onClick={onZoomIn} disabled={pct >= 400}>
          <Plus size={16} />
        </IconBtn>
        <Divider />
        <TextBtn onClick={onFitPage} active={session.fitMode === "page"}>
          Fit
        </TextBtn>
        <TextBtn onClick={onFitWidth} active={session.fitMode === "width"}>
          Width
        </TextBtn>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-nd-muted"
    >
      {children}
    </button>
  );
}

function TextBtn({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`nd-hit flex h-8 items-center rounded-lg px-2.5 text-xs transition-colors ${
        active
          ? "bg-nd-accent/15 text-nd-accent"
          : "text-nd-muted hover:bg-white/5 hover:text-nd-text"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-nd-border" />;
}

/* ---- loading / error ---- */

function LoadingState() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-nd-muted">
        <Loader2 size={24} className="animate-spin text-nd-accent" />
        <span className="text-sm">Opening your PDF…</span>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: PdfError; onRetry: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-nd-surface-2 text-nd-muted">
          <AlertTriangle size={22} />
        </span>
        <p className="mt-4 text-sm text-nd-text">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="nd-hit mt-5 inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
        >
          <FileUp size={15} /> Choose another file
        </button>
      </div>
    </div>
  );
}
