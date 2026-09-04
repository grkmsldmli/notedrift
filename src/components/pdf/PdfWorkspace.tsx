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
  Redo2,
  Undo2,
} from "lucide-react";
import { BrandHome, NavArrows } from "@/components/nav/HeaderNav";
import { PdfDropzone } from "./PdfDropzone";
import { PdfThumbnailRail } from "./PdfThumbnailRail";
import { PdfToolRail } from "./PdfToolRail";
import { PdfOverlayCanvas } from "./PdfOverlayCanvas";
import {
  PdfContextToolbar,
  type ContextPatch,
  type ContextValues,
} from "./PdfContextToolbar";
import { PdfRenderer, type PdfErrorCode } from "@/lib/pdf/renderer";
import { checkPdfFile } from "@/lib/pdf/limits";
import { clampZoom, fitPageScale, fitWidthScale } from "@/lib/pdf/geometry";
import {
  createSession,
  goToPage,
  nextPage,
  pageIdAt,
  prevPage,
  setScale as setScaleValue,
  type PdfDocumentSession,
  type PdfPageSize,
} from "@/lib/pdf/session";
import {
  DEFAULT_TOOL_STYLE,
  type PdfOverlayController,
} from "@/lib/pdf/overlayController";
import { controlsForTool, type PdfSelection, type PdfTool, type PdfToolStyle } from "@/lib/pdf/toolState";

type Phase = "empty" | "loading" | "ready" | "error";
type PdfError = { code: PdfErrorCode; message: string };
type OverlayView = { pageId: string; display: { width: number; height: number }; scale: number };
type EditState = { canUndo: boolean; canRedo: boolean; count: number };

export function PdfWorkspace() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [session, setSession] = useState<PdfDocumentSession | null>(null);
  const [error, setError] = useState<PdfError | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null);

  // editing layer
  const [tool, setTool] = useState<PdfTool>("select");
  const [toolStyle, setToolStyle] = useState<PdfToolStyle>(DEFAULT_TOOL_STYLE);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [edit, setEdit] = useState<EditState>({ canUndo: false, canRedo: false, count: 0 });
  const [overlayView, setOverlayView] = useState<OverlayView | null>(null);

  const rendererRef = useRef<PdfRenderer | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PdfOverlayController | null>(null);
  const pageSizeCacheRef = useRef<Map<number, PdfPageSize>>(new Map());
  const sessionRef = useRef<PdfDocumentSession | null>(null);
  const toolRef = useRef<PdfTool>("select");
  const renderPendingRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

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
    setSelection(null);
    setOverlayView(null);
    setTool("select");

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
    if (controllerRef.current?.hasOverlays()) {
      const ok = window.confirm("Opening another PDF will discard your current edits. Continue?");
      if (!ok) return;
    }
    await rendererRef.current?.destroy();
    rendererRef.current = null;
    setRenderer(null);
    pageSizeCacheRef.current = new Map();
    setSession(null);
    setError(null);
    setSelection(null);
    setOverlayView(null);
    setTool("select");
    setPhase("empty");
  }, []);

  const curPage = session?.page ?? null;
  const curScale = session?.scale ?? null;
  const curFit = session?.fitMode ?? null;

  // Render the background page, then publish the overlay view using the ACTUAL
  // rendered size (so the overlay matches even when the render-scale is capped).
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
        if (cancelled || !res.ok) return;
        renderPendingRef.current = false;
        let size = pageSizeCacheRef.current.get(curPage);
        if (!size) {
          size = await r.pageSize(curPage);
          if (cancelled) return;
          pageSizeCacheRef.current.set(curPage, size);
        }
        const eff = size.width ? res.cssWidth / size.width : curScale;
        const s = sessionRef.current;
        if (s) {
          setOverlayView({
            pageId: pageIdAt(s, curPage),
            display: { width: size.width, height: size.height },
            scale: eff,
          });
        }
      } catch {
        /* transient — superseded by a newer render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, curPage, curScale, renderNonce]);

  // Cache size + keep fit modes correct across pages of differing sizes.
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

  // Keep tool default style in sync (highlight uses its own color slot).
  const handleToolStyle = useCallback((patch: ContextPatch, forTool: PdfTool) => {
    setToolStyle((s) => {
      const next: PdfToolStyle = { ...s };
      if (patch.color !== undefined) {
        if (forTool === "highlight") next.highlightColor = patch.color;
        else next.strokeColor = patch.color;
      }
      if (patch.strokeWidth !== undefined) next.strokeWidth = patch.strokeWidth;
      if (patch.opacity !== undefined) next.opacity = patch.opacity;
      if (patch.fill !== undefined) next.fill = patch.fill;
      if (patch.fontFamily) next.fontFamily = patch.fontFamily;
      if (patch.fontSize) next.fontSize = patch.fontSize;
      if (patch.bold !== undefined) next.bold = patch.bold;
      if (patch.italic !== undefined) next.italic = patch.italic;
      if (patch.align) next.align = patch.align;
      return next;
    });
  }, []);

  const onContextChange = useCallback(
    (patch: ContextPatch) => {
      if (selection) {
        controllerRef.current?.updateSelected(patch as Partial<PdfSelection>);
      } else {
        handleToolStyle(patch, toolRef.current);
      }
    },
    [selection, handleToolStyle],
  );

  const chooseTool = useCallback((t: PdfTool) => {
    setTool(t);
    if (t !== "select") setSelection(null);
  }, []);

  // Keyboard: page nav (P1) + editing shortcuts (P2), never while typing.
  useEffect(() => {
    if (phase !== "ready") return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      // Escape always finishes an in-progress text edit / drawing (even while
      // typing) and returns to Select.
      if (e.key === "Escape") {
        controllerRef.current?.flush();
        chooseTool("select");
        return;
      }

      // While typing into the text editor (or any field), keep ALL shortcuts —
      // including Ctrl+Z/Y — out of the way so the native editor handles them.
      if (typing) return;

      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) controllerRef.current?.redo();
          else controllerRef.current?.undo();
        } else if (key === "y") {
          e.preventDefault();
          controllerRef.current?.redo();
        }
        return;
      }
      if (e.altKey) return;

      switch (e.key) {
        case "v":
        case "V":
          chooseTool("select");
          break;
        case "t":
        case "T":
          chooseTool("text");
          break;
        case "p":
        case "P":
          chooseTool("pen");
          break;
        case "h":
        case "H":
          chooseTool("highlight");
          break;
        case "Delete":
        case "Backspace":
          e.preventDefault();
          controllerRef.current?.deleteSelected();
          break;
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
  }, [phase, zoomBy, chooseTool]);

  // Grab-to-pan only on the dark margin — never on the page (Fabric owns that).
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || phase !== "ready") return;
    if (pageWrapRef.current?.contains(e.target as Node)) return;
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

  const docKey = session ? `${session.filename}:${session.byteLength}` : "doc";
  const showContext = phase === "ready" && (selection !== null || tool !== "select");
  const contextValues: ContextValues = selection
    ? {
        color: selection.color ?? "#000000",
        strokeWidth: selection.strokeWidth ?? 3,
        opacity: selection.opacity ?? 1,
        fill: selection.fill ?? null,
        fontFamily: selection.fontFamily ?? "sans",
        fontSize: selection.fontSize ?? 18,
        bold: selection.bold ?? false,
        italic: selection.italic ?? false,
        align: selection.align ?? "left",
      }
    : {
        color: tool === "highlight" ? toolStyle.highlightColor : toolStyle.strokeColor,
        strokeWidth: toolStyle.strokeWidth,
        opacity: toolStyle.opacity,
        fill: toolStyle.fill,
        fontFamily: toolStyle.fontFamily,
        fontSize: toolStyle.fontSize,
        bold: toolStyle.bold,
        italic: toolStyle.italic,
        align: toolStyle.align,
      };
  const contextControls = controlsForTool(
    selection ? (selection.type === "freehand" ? "pen" : (selection.type as PdfTool)) : tool,
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-nd-bg text-nd-text">
      <Header
        session={session}
        edit={edit}
        onClose={closeDoc}
        onUndo={() => controllerRef.current?.undo()}
        onRedo={() => controllerRef.current?.redo()}
      />

      <div className="relative flex min-h-0 flex-1">
        {phase === "ready" && session && renderer && (
          <PdfThumbnailRail
            key={`thumbs:${docKey}`}
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
            phase === "ready" && tool === "select" ? (grabbing ? "cursor-grabbing" : "cursor-grab") : ""
          }`}
        >
          {phase === "empty" && <PdfDropzone onFile={openFile} />}
          {phase === "loading" && <LoadingState />}
          {phase === "error" && error && <ErrorState error={error} onRetry={closeDoc} />}
          {phase === "ready" && (
            <div className="flex min-h-full w-max min-w-full items-center justify-center p-6">
              <div ref={pageWrapRef} className="relative">
                <canvas
                  ref={pageCanvasRef}
                  className="block rounded-[2px] bg-white shadow-2xl shadow-black/50"
                />
                {overlayView && (
                  <div className="absolute inset-0">
                    <PdfOverlayCanvas
                      key={`overlay:${docKey}`}
                      pageId={overlayView.pageId}
                      display={overlayView.display}
                      scale={overlayView.scale}
                      tool={tool}
                      toolStyle={toolStyle}
                      onController={(c) => { controllerRef.current = c; }}
                      onHistory={setEdit}
                      onSelection={setSelection}
                      onToolReset={() => setTool("select")}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {phase === "ready" && session && <PdfToolRail tool={tool} onTool={chooseTool} />}

        {showContext && (
          <PdfContextToolbar
            controls={contextControls}
            values={contextValues}
            onChange={onContextChange}
            onDelete={selection ? () => controllerRef.current?.deleteSelected() : undefined}
          />
        )}

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
  edit,
  onClose,
  onUndo,
  onRedo,
}: {
  session: PdfDocumentSession | null;
  edit: EditState;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
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
        <div className="flex shrink-0 items-center gap-1">
          <HeaderIcon label="Undo  (Ctrl Z)" onClick={onUndo} disabled={!edit.canUndo}>
            <Undo2 size={16} />
          </HeaderIcon>
          <HeaderIcon label="Redo  (Ctrl Shift Z)" onClick={onRedo} disabled={!edit.canRedo}>
            <Redo2 size={16} />
          </HeaderIcon>
          <span className="mx-0.5 h-6 w-px bg-nd-border" />
          <button
            type="button"
            onClick={onClose}
            className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-2.5 py-1.5 text-xs text-nd-text transition-colors hover:bg-white/5"
          >
            <FileUp size={14} />
            <span className="hidden sm:inline">Open another</span>
          </button>
        </div>
      )}
    </header>
  );
}

function HeaderIcon({
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
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-nd-muted"
    >
      {children}
    </button>
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
