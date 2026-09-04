"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  Loader2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { BrandHome, NavArrows } from "@/components/nav/HeaderNav";
import { PdfDropzone } from "./PdfDropzone";
import { PdfThumbnailRail } from "./PdfThumbnailRail";
import { PdfToolRail } from "./PdfToolRail";
import { PdfOverlayCanvas } from "./PdfOverlayCanvas";
import { PdfSignatureDialog } from "./PdfSignatureDialog";
import { PdfContextToolbar, type ContextPatch, type ContextValues } from "./PdfContextToolbar";
import { PdfRenderer, type PdfErrorCode } from "@/lib/pdf/renderer";
import { checkPdfFile } from "@/lib/pdf/limits";
import { clampZoom, fitPageScale, fitWidthScale } from "@/lib/pdf/geometry";
import type { PageGeometry } from "@/lib/pdf/coordinates";
import { loadImageFromFile, type LoadedImage } from "@/lib/pdf/imageInput";
import { initialPages, type PageSlot } from "@/lib/pdf/document";
import {
  createSession,
  clampPage,
  goToPage,
  nextPage,
  prevPage,
  setScale as setScaleValue,
  type PdfDocumentSession,
} from "@/lib/pdf/session";
import { DEFAULT_TOOL_STYLE, type DocSummary, type PdfOverlayController } from "@/lib/pdf/overlayController";
import { controlsForTool, type PdfSelection, type PdfTool, type PdfToolStyle } from "@/lib/pdf/toolState";

type Phase = "empty" | "loading" | "ready" | "error";
type PdfError = { code: PdfErrorCode; message: string };
type OverlayView = { pageId: string; display: { width: number; height: number }; scale: number };
type EditState = { canUndo: boolean; canRedo: boolean; count: number };
type SrcGeom = { unrotW: number; unrotH: number; intrinsic: number };

export function PdfWorkspace() {
  const [phase, setPhase] = useState<Phase>("empty");
  const [session, setSession] = useState<PdfDocumentSession | null>(null);
  const [pages, setPages] = useState<readonly PageSlot[]>([]);
  const [error, setError] = useState<PdfError | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [renderer, setRenderer] = useState<PdfRenderer | null>(null);

  const [tool, setTool] = useState<PdfTool>("select");
  const [toolStyle, setToolStyle] = useState<PdfToolStyle>(DEFAULT_TOOL_STYLE);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [edit, setEdit] = useState<EditState>({ canUndo: false, canRedo: false, count: 0 });
  const [overlayView, setOverlayView] = useState<OverlayView | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "info" | "error"; message: string } | null>(null);
  const [srcRot, setSrcRot] = useState<Record<number, number>>({});

  const rendererRef = useRef<PdfRenderer | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<PdfOverlayController | null>(null);
  const originalBytesRef = useRef<Uint8Array | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const srcGeomRef = useRef<Map<number, SrcGeom>>(new Map());
  const sessionRef = useRef<PdfDocumentSession | null>(null);
  const pagesRef = useRef<readonly PageSlot[]>([]);
  const toolRef = useRef<PdfTool>("select");
  const renderPendingRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { toolRef.current = tool; }, [tool]);

  useEffect(() => {
    return () => {
      void rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  const ensureSrcGeom = useCallback(async (sourceIndex: number): Promise<SrcGeom | null> => {
    const cached = srcGeomRef.current.get(sourceIndex);
    if (cached) return cached;
    const r = rendererRef.current;
    if (!r) return null;
    try {
      const unrot = await r.pageSize(sourceIndex + 1, 0);
      const nat = await r.pageSize(sourceIndex + 1);
      const g: SrcGeom = { unrotW: unrot.width, unrotH: unrot.height, intrinsic: nat.rotation };
      srcGeomRef.current.set(sourceIndex, g);
      setSrcRot((prev) => (prev[sourceIndex] === g.intrinsic ? prev : { ...prev, [sourceIndex]: g.intrinsic }));
      return g;
    } catch {
      return null;
    }
  }, []);

  function slotDisplay(g: SrcGeom, total: number): { width: number; height: number } {
    return total % 180 === 0 ? { width: g.unrotW, height: g.unrotH } : { width: g.unrotH, height: g.unrotW };
  }

  const openFile = useCallback(async (file: File) => {
    const invalid = checkPdfFile(file);
    if (invalid) { setError({ code: "not-pdf", message: invalid }); setPhase("error"); return; }
    setPhase("loading");
    setError(null);
    setSession(null);
    setSelection(null);
    setOverlayView(null);
    setTool("select");
    setSrcRot({});

    await rendererRef.current?.destroy();
    srcGeomRef.current = new Map();
    const nextRenderer = new PdfRenderer();
    rendererRef.current = nextRenderer;
    setRenderer(nextRenderer);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const byteLength = bytes.byteLength;
      originalBytesRef.current = bytes.slice();
      const numPages = await nextRenderer.open(bytes);
      const slots = initialPages(numPages);
      pagesRef.current = slots;
      setPages(slots);

      const g = await ensureSrcGeom(0);
      const disp = g ? slotDisplay(g, (g.intrinsic + slots[0].rotation) % 360) : { width: 612, height: 792 };
      const vp = viewportRef.current;
      const scale = vp ? fitPageScale(disp.width, disp.height, vp.clientWidth, vp.clientHeight) : 1;
      setSession(setScaleValue(createSession({ filename: file.name, byteLength, numPages }), scale, "page"));
      setPhase("ready");
    } catch (err) {
      const e = err as { code?: PdfErrorCode; message?: string };
      setError({ code: e.code ?? "unknown", message: e.message ?? "This PDF couldn't be opened." });
      setPhase("error");
    }
  }, [ensureSrcGeom]);

  const closeDoc = useCallback(async () => {
    if (controllerRef.current?.hasEdits()) {
      if (!window.confirm("Opening another PDF will discard your current edits. Continue?")) return;
    }
    await rendererRef.current?.destroy();
    rendererRef.current = null;
    originalBytesRef.current = null;
    setRenderer(null);
    srcGeomRef.current = new Map();
    setPages([]);
    setSession(null);
    setError(null);
    setSelection(null);
    setOverlayView(null);
    setTool("select");
    setPhase("empty");
  }, []);

  const onDoc = useCallback((s: DocSummary) => {
    setPages(s.pages.slice());
    setEdit({ canUndo: s.canUndo, canRedo: s.canRedo, count: s.overlayCount });
    setSession((prev) =>
      prev ? { ...prev, numPages: s.pages.length, page: clampPage(prev.page, s.pages.length) } : prev,
    );
  }, []);

  const curPage = session?.page ?? null;
  const curScale = session?.scale ?? null;
  const curFit = session?.fitMode ?? null;
  const curSlot = curPage != null ? pages[curPage - 1] : undefined;
  const curSlotKey = curSlot ? `${curSlot.sourceIndex}:${curSlot.rotation}` : null;
  const curSlotRef = useRef<PageSlot | undefined>(undefined);
  useEffect(() => { curSlotRef.current = curSlot; }, [curSlot]);

  // Render the current slot's page, then publish the overlay view at the ACTUAL
  // rendered size (matches even when the render-scale cap engages).
  useEffect(() => {
    if (phase !== "ready" || curPage == null || curScale == null || !curSlot) return;
    let cancelled = false;
    renderPendingRef.current = true;
    void (async () => {
      const canvas = pageCanvasRef.current;
      const r = rendererRef.current;
      if (!canvas || !r) return;
      const g = await ensureSrcGeom(curSlot.sourceIndex);
      if (cancelled || !g) return;
      const total = (g.intrinsic + curSlot.rotation + 360) % 360;
      const disp = slotDisplay(g, total);
      try {
        const res = await r.renderPage(curSlot.sourceIndex + 1, curScale, canvas, total);
        if (cancelled || !res.ok) return;
        renderPendingRef.current = false;
        const eff = disp.width ? res.cssWidth / disp.width : curScale;
        setOverlayView({ pageId: curSlot.id, display: disp, scale: eff });
      } catch {
        /* superseded */
      }
    })();
    return () => { cancelled = true; };
  }, [phase, curPage, curScale, curSlotKey, renderNonce, ensureSrcGeom, curSlot]);

  // Keep fit modes correct across pages of differing size.
  useEffect(() => {
    if (phase !== "ready" || !curSlot) return;
    let cancelled = false;
    void (async () => {
      const g = await ensureSrcGeom(curSlot.sourceIndex);
      if (cancelled || !g || !curFit || curFit === "none") return;
      const total = (g.intrinsic + curSlot.rotation + 360) % 360;
      const disp = slotDisplay(g, total);
      const vp = viewportRef.current;
      if (!vp) return;
      const scale = curFit === "page"
        ? fitPageScale(disp.width, disp.height, vp.clientWidth, vp.clientHeight)
        : fitWidthScale(disp.width, vp.clientWidth);
      const cur = sessionRef.current;
      if (cur && Math.abs(scale - cur.scale) > 0.002) setSession((prev) => (prev ? { ...prev, scale } : prev));
    })();
    return () => { cancelled = true; };
  }, [phase, curSlotKey, curFit, ensureSrcGeom, curSlot]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const s = sessionRef.current;
      const slot = curSlotRef.current;
      if (!s || s.fitMode === "none" || !slot) return;
      const g = srcGeomRef.current.get(slot.sourceIndex);
      if (!g) return;
      const total = (g.intrinsic + slot.rotation + 360) % 360;
      const disp = slotDisplay(g, total);
      const scale = s.fitMode === "page"
        ? fitPageScale(disp.width, disp.height, vp.clientWidth, vp.clientHeight)
        : fitWidthScale(disp.width, vp.clientWidth);
      setSession((prev) => (prev && Math.abs(prev.scale - scale) > 0.002 ? { ...prev, scale } : prev));
    });
    ro.observe(vp);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && renderPendingRef.current) setRenderNonce((n) => n + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const zoomBy = useCallback((factor: number) => {
    setSession((s) => (s ? setScaleValue(s, clampZoom(s.scale * factor), "none") : s));
  }, []);

  const applyFit = useCallback((mode: "page" | "width") => {
    const vp = viewportRef.current;
    const s = sessionRef.current;
    const slot = curSlotRef.current;
    if (!vp || !s || !slot) return;
    const g = srcGeomRef.current.get(slot.sourceIndex);
    if (!g) return;
    const total = (g.intrinsic + slot.rotation + 360) % 360;
    const disp = slotDisplay(g, total);
    const scale = mode === "page"
      ? fitPageScale(disp.width, disp.height, vp.clientWidth, vp.clientHeight)
      : fitWidthScale(disp.width, vp.clientWidth);
    setSession(setScaleValue(s, scale, mode));
  }, []);

  const handleToolStyle = useCallback((patch: ContextPatch, forTool: PdfTool) => {
    setToolStyle((s) => {
      const next: PdfToolStyle = { ...s };
      if (patch.color !== undefined) {
        if (forTool === "highlight") next.highlightColor = patch.color;
        else if (forTool === "whiteout") next.whiteoutColor = patch.color;
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

  const onContextChange = useCallback((patch: ContextPatch) => {
    if (selection) controllerRef.current?.updateSelected(patch as Partial<PdfSelection>);
    else handleToolStyle(patch, toolRef.current);
  }, [selection, handleToolStyle]);

  const placeLoadedImage = useCallback((img: LoadedImage) => {
    controllerRef.current?.placeImage(img.el, img.src, img.format);
    setTool("select");
  }, []);

  const chooseTool = useCallback((t: PdfTool) => {
    if (t === "image") { imageInputRef.current?.click(); return; }
    if (t === "signature") { setSigOpen(true); return; }
    setTool(t);
    if (t !== "select") setSelection(null);
  }, []);

  // Page operations on the current page.
  const rotateCurrent = useCallback(async (delta: number) => {
    const slot = curSlotRef.current;
    if (!slot) return;
    const g = await ensureSrcGeom(slot.sourceIndex);
    if (!g) return;
    const oldTotal = (g.intrinsic + slot.rotation + 360) % 360;
    const newTotal = (oldTotal + delta + 360) % 360;
    const geom = (rot: number): PageGeometry => ({ width: g.unrotW, height: g.unrotH, rotation: rot });
    controllerRef.current?.rotateSlot(slot.id, delta, geom(oldTotal), geom(newTotal));
  }, [ensureSrcGeom]);

  const deleteCurrent = useCallback(() => {
    const slot = curSlotRef.current;
    if (slot && pagesRef.current.length > 1) controllerRef.current?.removeSlot(slot.id);
  }, []);

  const duplicateCurrent = useCallback(() => {
    const slot = curSlotRef.current;
    if (slot) controllerRef.current?.duplicateSlot(slot.id);
  }, []);

  // Keyboard: page nav + editing shortcuts, never while typing.
  useEffect(() => {
    if (phase !== "ready") return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") { controllerRef.current?.flush(); chooseTool("select"); return; }
      if (typing) return;
      if (mod) {
        const key = e.key.toLowerCase();
        if (key === "z") { e.preventDefault(); if (e.shiftKey) controllerRef.current?.redo(); else controllerRef.current?.undo(); }
        else if (key === "y") { e.preventDefault(); controllerRef.current?.redo(); }
        return;
      }
      if (e.altKey) return;
      switch (e.key) {
        case "v": case "V": chooseTool("select"); break;
        case "t": case "T": chooseTool("text"); break;
        case "p": case "P": chooseTool("pen"); break;
        case "h": case "H": chooseTool("highlight"); break;
        case "Delete": case "Backspace": e.preventDefault(); controllerRef.current?.deleteSelected(); break;
        case "ArrowRight": case "PageDown": e.preventDefault(); setSession((s) => (s ? nextPage(s) : s)); break;
        case "ArrowLeft": case "PageUp": e.preventDefault(); setSession((s) => (s ? prevPage(s) : s)); break;
        case "Home": e.preventDefault(); setSession((s) => (s ? goToPage(s, 1) : s)); break;
        case "End": e.preventDefault(); setSession((s) => (s ? goToPage(s, s.numPages) : s)); break;
        case "+": case "=": e.preventDefault(); zoomBy(1.25); break;
        case "-": case "_": e.preventDefault(); zoomBy(0.8); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, zoomBy, chooseTool]);

  const handleDownload = useCallback(async () => {
    if (exporting) return;
    const controller = controllerRef.current;
    const original = originalBytesRef.current;
    const s = sessionRef.current;
    if (!controller || !original || !s) return;
    setExporting(true);
    setToast(null);
    controller.flush();
    try {
      const { exportEditedPdf } = await import("@/lib/pdf/export");
      const result = await exportEditedPdf({
        originalBytes: original,
        overlays: controller.getOverlays(),
        pages: controller.getPages(),
        filename: s.filename,
      });
      const blob = new Blob([result.bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (result.unsupportedText) setToast({ kind: "info", message: "Some characters weren't in the export fonts and were omitted." });
    } catch {
      setToast({ kind: "error", message: "Couldn't prepare the PDF. Please try again." });
    } finally {
      setExporting(false);
    }
  }, [exporting]);

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
        color: tool === "highlight" ? toolStyle.highlightColor : tool === "whiteout" ? toolStyle.whiteoutColor : toolStyle.strokeColor,
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
  const showContextBar = phase === "ready" && (selection !== null || contextHasControls(contextControls));

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-nd-bg text-nd-text">
      <Header
        session={session}
        edit={edit}
        exporting={exporting}
        onDownload={handleDownload}
        onClose={closeDoc}
        onUndo={() => controllerRef.current?.undo()}
        onRedo={() => controllerRef.current?.redo()}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { placeLoadedImage(await loadImageFromFile(f)); }
          catch (err) { setToast({ kind: "error", message: (err as Error).message }); }
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {phase === "ready" && session && renderer && pages.length > 0 && (
          <PdfThumbnailRail
            key={`thumbs:${docKey}`}
            renderer={renderer}
            pages={pages}
            currentPage={session.page}
            intrinsicRotation={(i) => srcRot[i] ?? 0}
            onSelect={(n) => setSession((s) => (s ? goToPage(s, n) : s))}
            onReorder={(from, to) => controllerRef.current?.reorderSlots(from, to)}
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
                <canvas ref={pageCanvasRef} className="block rounded-[2px] bg-white shadow-2xl shadow-black/50" />
                {overlayView && (
                  <div className="absolute inset-0">
                    <PdfOverlayCanvas
                      key={`overlay:${docKey}`}
                      pageId={overlayView.pageId}
                      display={overlayView.display}
                      scale={overlayView.scale}
                      tool={tool}
                      toolStyle={toolStyle}
                      onController={(c) => {
                        controllerRef.current = c;
                        if (c) c.init(pagesRef.current);
                      }}
                      onDoc={onDoc}
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

        {showContextBar && (
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
            canDelete={pages.length > 1}
            onPrev={() => setSession((s) => (s ? prevPage(s) : s))}
            onNext={() => setSession((s) => (s ? nextPage(s) : s))}
            onRotateLeft={() => rotateCurrent(-90)}
            onRotateRight={() => rotateCurrent(90)}
            onDuplicate={duplicateCurrent}
            onDeletePage={deleteCurrent}
            onZoomOut={() => zoomBy(0.8)}
            onZoomIn={() => zoomBy(1.25)}
            onFitPage={() => applyFit("page")}
            onFitWidth={() => applyFit("width")}
          />
        )}

        {toast && (
          <div role="status" className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
            <div className={`pointer-events-auto max-w-sm rounded-lg border px-3.5 py-2 text-xs shadow-xl backdrop-blur ${toast.kind === "error" ? "border-red-500/30 bg-red-500/15 text-red-200" : "border-nd-border bg-nd-surface/95 text-nd-text"}`}>
              {toast.message}
            </div>
          </div>
        )}
      </div>

      {sigOpen && (
        <PdfSignatureDialog
          onClose={() => setSigOpen(false)}
          onInsert={(img) => { setSigOpen(false); placeLoadedImage(img); }}
        />
      )}
    </div>
  );
}

function contextHasControls(c: ReturnType<typeof controlsForTool>): boolean {
  return c.color || c.strokeWidth || c.opacity || c.fill || c.text || c.highlight;
}

/* ---- header ---- */

function Header({
  session, edit, exporting, onDownload, onClose, onUndo, onRedo,
}: {
  session: PdfDocumentSession | null;
  edit: EditState;
  exporting: boolean;
  onDownload: () => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-nd-border bg-nd-bg/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <NavArrows />
        <BrandHome wordmarkClassName="hidden lg:inline" />
        {session && (
          <>
            <span className="mx-1 hidden h-5 w-px shrink-0 bg-nd-border sm:block" />
            <span className="min-w-0 truncate text-sm text-nd-text" title={session.filename}>{session.filename}</span>
            <span className="hidden shrink-0 text-xs text-nd-muted md:inline">· {session.numPages} page{session.numPages === 1 ? "" : "s"}</span>
          </>
        )}
      </div>
      {session && (
        <div className="flex shrink-0 items-center gap-1">
          <HeaderIcon label="Undo  (Ctrl Z)" onClick={onUndo} disabled={!edit.canUndo}><Undo2 size={16} /></HeaderIcon>
          <HeaderIcon label="Redo  (Ctrl Shift Z)" onClick={onRedo} disabled={!edit.canRedo}><Redo2 size={16} /></HeaderIcon>
          <span className="mx-0.5 h-6 w-px bg-nd-border" />
          <button type="button" onClick={onClose} aria-label="Open another PDF" className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-2.5 py-1.5 text-xs text-nd-text transition-colors hover:bg-white/5">
            <FileUp size={14} />
            <span className="hidden lg:inline">Open another</span>
          </button>
          <button type="button" onClick={onDownload} disabled={exporting} aria-label="Download edited PDF" className="nd-hit nd-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">{exporting ? "Preparing…" : "Download PDF"}</span>
          </button>
        </div>
      )}
    </header>
  );
}

function HeaderIcon({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-nd-muted">
      {children}
    </button>
  );
}

/* ---- bottom toolbar ---- */

function Toolbar({
  session, canDelete, onPrev, onNext, onRotateLeft, onRotateRight, onDuplicate, onDeletePage, onZoomOut, onZoomIn, onFitPage, onFitWidth,
}: {
  session: PdfDocumentSession;
  canDelete: boolean;
  onPrev: () => void; onNext: () => void;
  onRotateLeft: () => void; onRotateRight: () => void; onDuplicate: () => void; onDeletePage: () => void;
  onZoomOut: () => void; onZoomIn: () => void; onFitPage: () => void; onFitWidth: () => void;
}) {
  const pct = Math.round(session.scale * 100);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
      <div className="nd-scroll pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
        <IconBtn label="Previous page" onClick={onPrev} disabled={session.page <= 1}><ChevronLeft size={16} /></IconBtn>
        <span className="whitespace-nowrap px-1.5 text-xs tabular-nums text-nd-muted">{session.page} / {session.numPages}</span>
        <IconBtn label="Next page" onClick={onNext} disabled={session.page >= session.numPages}><ChevronRight size={16} /></IconBtn>
        <Divider />
        <IconBtn label="Rotate page left" onClick={onRotateLeft}><RotateCcw size={15} /></IconBtn>
        <IconBtn label="Rotate page right" onClick={onRotateRight}><RotateCw size={15} /></IconBtn>
        <IconBtn label="Duplicate page" onClick={onDuplicate}><Copy size={15} /></IconBtn>
        <IconBtn label="Delete page" onClick={onDeletePage} disabled={!canDelete}><Trash2 size={15} /></IconBtn>
        <Divider />
        <IconBtn label="Zoom out" onClick={onZoomOut} disabled={pct <= 25}><Minus size={16} /></IconBtn>
        <span className="w-11 text-center text-xs tabular-nums text-nd-text">{pct}%</span>
        <IconBtn label="Zoom in" onClick={onZoomIn} disabled={pct >= 400}><Plus size={16} /></IconBtn>
        <Divider />
        <TextBtn onClick={onFitPage} active={session.fitMode === "page"}>Fit</TextBtn>
        <TextBtn onClick={onFitWidth} active={session.fitMode === "width"}>Width</TextBtn>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="nd-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-nd-muted">
      {children}
    </button>
  );
}

function TextBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`nd-hit flex h-8 shrink-0 items-center rounded-lg px-2.5 text-xs transition-colors ${active ? "bg-nd-accent/15 text-nd-accent" : "text-nd-muted hover:bg-white/5 hover:text-nd-text"}`}>
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-nd-border" />;
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
        <button type="button" onClick={onRetry} className="nd-hit mt-5 inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5">
          <FileUp size={15} /> Choose another file
        </button>
      </div>
    </div>
  );
}
