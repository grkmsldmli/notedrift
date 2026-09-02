"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasController } from "@/lib/canvasController";
import {
  deleteCanvasDoc,
  getCurrentPageId,
  loadCanvasDoc,
  loadPages,
  loadPrefs,
  loadToolDefaults,
  savePages,
  savePrefs,
  saveCanvasDoc,
  saveToolDefaults,
  setCurrentPageId,
  uid,
} from "@/lib/storage";
import type {
  CanvasDoc,
  CanvasStyle,
  DrawTool,
  DrawToolPrefs,
  EditorState,
  PageMeta,
  StylePatch,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import { DRAW_TOOLS } from "@/lib/brush/materials";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { ZoomControls } from "./ZoomControls";
import { ToolOptionsBar } from "./ToolOptionsBar";
import { ObjectToolbar, type LayerOp } from "./ObjectToolbar";
import { NodeQuickAdd } from "./NodeQuickAdd";
import { Logo } from "./Logo";

const INITIAL_STATE: EditorState = {
  tool: "select",
  zoom: 1,
  canUndo: false,
  canRedo: false,
  canvasStyle: "dots",
  hasSelection: false,
  selection: { kind: "none", count: 0, rect: null },
};

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  p: "pen",
  t: "text",
  r: "rect",
  o: "ellipse",
  l: "line",
  a: "arrow",
  n: "note",
  e: "eraser",
};

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "notedrift";
}

function newPageMeta(style: CanvasStyle): PageMeta {
  const now = Date.now();
  return { id: uid(), title: "Untitled", createdAt: now, updatedAt: now, style };
}

const styleOf = (p: PageMeta | undefined): CanvasStyle => p?.style ?? "dots";

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const pagesRef = useRef<PageMeta[]>([]);

  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [toolDefaults, setToolDefaults] = useState<ToolDefaults | null>(null);
  const [paperOffset, setPaperOffset] = useState({ left: 0, top: 0 });
  const [paperSize, setPaperSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const persistDoc = useCallback((doc: CanvasDoc) => {
    const id = currentIdRef.current;
    if (!id) return;
    void saveCanvasDoc(id, doc);
    setPages((prev) => {
      const next = prev.map((p) =>
        p.id === id ? { ...p, updatedAt: Date.now() } : p,
      );
      savePages(next);
      return next;
    });
  }, []);

  // One-time editor bootstrap.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const paperEl = paperRef.current;
    if (!canvasEl || !paperEl) return;

    let list = loadPages();
    let curId = getCurrentPageId();
    const prefs = loadPrefs();
    const defaults = loadToolDefaults();
    setToolDefaults(defaults);

    if (list.length === 0) {
      const first = newPageMeta(prefs.defaultStyle);
      list = [first];
      curId = first.id;
      savePages(list);
      setCurrentPageId(curId);
    }
    if (!curId || !list.some((p) => p.id === curId)) {
      curId = list[0].id;
      setCurrentPageId(curId);
    }

    const curPage = list.find((p) => p.id === curId);
    setPages(list);
    setCurrentId(curId);
    currentIdRef.current = curId;
    pagesRef.current = list;

    const controller = new CanvasController(
      canvasEl,
      paperEl,
      { onState: setState, onPersist: persistDoc },
      styleOf(curPage),
      defaults,
    );
    controllerRef.current = controller;

    void loadCanvasDoc(curId).then((doc) => {
      controller.loadDoc(doc);
      controller.setCanvasStyle(styleOf(curPage));
      setReady(true);
    });

    const measurePaper = () => {
      setPaperOffset({ left: paperEl.offsetLeft, top: paperEl.offsetTop });
      setPaperSize({ width: paperEl.clientWidth, height: paperEl.clientHeight });
    };
    measurePaper();
    const ro = new ResizeObserver(() => {
      controller.resize();
      measurePaper();
    });
    ro.observe(paperEl);

    return () => {
      ro.disconnect();
      controller.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const c = controllerRef.current;
      if (!c) return;
      const el = document.activeElement;
      const typingInField =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

      if (e.key === "Escape") {
        if (c.isEditing()) c.exitEditing();
        else if (!typingInField) c.setTool("select");
        return;
      }

      if (c.isEditing() || typingInField) return;

      const meta = e.metaKey || e.ctrlKey;
      if (meta) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) c.redo();
          else c.undo();
        } else if (k === "y") {
          e.preventDefault();
          c.redo();
        } else if (k === "d") {
          e.preventDefault();
          void c.duplicateSelection();
        } else if (k === "c") {
          void c.copySelection();
        } else if (k === "v") {
          void c.pasteClipboard();
        } else if (k === "a") {
          e.preventDefault();
          c.selectAllObjects();
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          c.zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          c.zoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          c.resetZoom();
        }
        return;
      }

      // Mind-map flow (only when a node is selected and not editing text).
      if (e.key === "Tab") {
        e.preventDefault();
        if (c.canBranch()) c.createChild();
        else if (!c.hasActiveSelection()) c.createRoot(); // Tab on empty → root
        return;
      }
      if (e.key === "Enter") {
        if (c.canBranch()) {
          e.preventDefault();
          c.createSibling();
        }
        return;
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        c.deleteSelection();
        return;
      }
      if (e.key === " ") {
        if (!c.isSpaceDown()) c.setSpace(true);
        e.preventDefault();
        return;
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) c.setTool(tool);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") controllerRef.current?.setSpace(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Rapid mind-map flow while EDITING a node: Tab makes a child, Enter makes a
  // sibling (Shift+Enter still inserts a newline). Capture phase so we intercept
  // before Fabric's hidden textarea consumes the key. Only mind-map nodes are
  // hijacked — normal multiline editing of free text and sticky notes is intact.
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      const c = controllerRef.current;
      if (!c || !c.isEditingNode()) return;
      // Never hijack Enter/Tab while an IME composition is active — that Enter
      // confirms the candidate, it must not spawn a sibling.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        c.createChild();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        c.createSibling();
      }
    };
    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);

  // Paste images from clipboard (not while editing text).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const c = controllerRef.current;
      if (!c || c.isEditing()) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void c.addImageFile(file);
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Flush autosave before tab hide/close.
  useEffect(() => {
    const flush = () => controllerRef.current?.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* --------------------------------- page ops -------------------------------- */

  const handleNewPage = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.flush();
    const style = loadPrefs().defaultStyle;
    const meta = newPageMeta(style);
    setPages((prev) => {
      const next = [meta, ...prev];
      savePages(next);
      return next;
    });
    setCurrentId(meta.id);
    currentIdRef.current = meta.id;
    setCurrentPageId(meta.id);
    c.clearPage();
    c.setCanvasStyle(style);
  }, []);

  const handleSwitchPage = useCallback(async (id: string) => {
    const c = controllerRef.current;
    if (!c || id === currentIdRef.current) return;
    c.flush();
    setCurrentId(id);
    currentIdRef.current = id;
    setCurrentPageId(id);
    const target = pagesRef.current.find((p) => p.id === id);
    const doc = await loadCanvasDoc(id);
    await c.loadDoc(doc);
    c.setCanvasStyle(styleOf(target));
  }, []);

  const handleDeletePage = useCallback((id: string) => {
    const c = controllerRef.current;
    if (!c) return;
    void deleteCanvasDoc(id);
    const remaining = pagesRef.current.filter((p) => p.id !== id);

    if (remaining.length === 0) {
      const style = loadPrefs().defaultStyle;
      const meta = newPageMeta(style);
      setPages([meta]);
      savePages([meta]);
      setCurrentId(meta.id);
      currentIdRef.current = meta.id;
      setCurrentPageId(meta.id);
      c.clearPage();
      c.setCanvasStyle(style);
      return;
    }

    setPages(remaining);
    savePages(remaining);

    if (id === currentIdRef.current) {
      const target = remaining[0];
      setCurrentId(target.id);
      currentIdRef.current = target.id;
      setCurrentPageId(target.id);
      void loadCanvasDoc(target.id).then((doc) => {
        c.loadDoc(doc);
        c.setCanvasStyle(styleOf(target));
      });
    }
  }, []);

  const handleRenamePage = useCallback((id: string, title: string) => {
    setPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, title } : p));
      savePages(next);
      return next;
    });
  }, []);

  /* ------------------------------- tool / view ------------------------------- */

  const onSelectTool = useCallback(
    (tool: Tool) => controllerRef.current?.setTool(tool),
    [],
  );
  const onPickImage = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void controllerRef.current?.addImageFile(file);
    e.target.value = "";
  }, []);

  const onUndo = useCallback(() => controllerRef.current?.undo(), []);
  const onRedo = useCallback(() => controllerRef.current?.redo(), []);
  const onZoomIn = useCallback(() => controllerRef.current?.zoomIn(), []);
  const onZoomOut = useCallback(() => controllerRef.current?.zoomOut(), []);
  const onReset = useCallback(() => controllerRef.current?.resetZoom(), []);

  const onExport = useCallback(() => {
    const title =
      pagesRef.current.find((p) => p.id === currentIdRef.current)?.title ??
      "notedrift";
    controllerRef.current?.exportPNG(slugify(title));
  }, []);

  const onSetPageStyle = useCallback((style: CanvasStyle) => {
    const id = currentIdRef.current;
    if (!id) return;
    controllerRef.current?.setCanvasStyle(style);
    savePrefs({ defaultStyle: style });
    setPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, style } : p));
      savePages(next);
      return next;
    });
  }, []);

  const applyDefaults = useCallback((patch: Partial<ToolDefaults>, commit = true) => {
    setToolDefaults((prev) => {
      const base = prev ?? loadToolDefaults();
      const next = { ...base, ...patch };
      if (commit) saveToolDefaults(next);
      return next;
    });
    controllerRef.current?.setDefaults(patch);
  }, []);

  // Per-drawing-tool preferences (the active brush's color/width/opacity/etc.).
  const drawToolsSet = DRAW_TOOLS as readonly Tool[];
  const onSetDrawPref = useCallback(
    (patch: Partial<DrawToolPrefs>, commit = true) => {
      const c = controllerRef.current;
      if (!c) return;
      const t = c.getTool();
      if (!drawToolsSet.includes(t)) return;
      const dt = t as DrawTool;
      c.setDrawPref(dt, patch); // live: brush reflects it immediately
      setToolDefaults((prev) => {
        const base = prev ?? loadToolDefaults();
        const next: ToolDefaults = {
          ...base,
          draw: { ...base.draw, [dt]: { ...base.draw[dt], ...patch } },
        };
        // Only touch localStorage on commit (not per slider frame).
        if (commit) saveToolDefaults(next);
        return next;
      });
    },
    // drawToolsSet is a stable module constant reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onStyle = useCallback(
    (patch: StylePatch, commit = true) => {
      controllerRef.current?.applyStyle(patch, commit);
      // Live drag previews don't record history or update remembered defaults.
      if (!commit) return;
      // Remember the styling so newly created objects match.
      const d: Partial<ToolDefaults> = {};
      if (patch.stroke !== undefined) {
        d.shapeStroke = patch.stroke;
        d.lineStroke = patch.stroke;
      }
      if (patch.strokeWidth !== undefined) {
        d.shapeStrokeWidth = patch.strokeWidth;
        d.lineStrokeWidth = patch.strokeWidth;
      }
      if (patch.fill !== undefined) d.shapeFill = patch.fill;
      if (patch.textColor !== undefined) d.textColor = patch.textColor;
      if (patch.fontSize !== undefined) d.textFontSize = patch.fontSize;
      if (patch.noteFill !== undefined) d.noteFill = patch.noteFill;
      if (Object.keys(d).length > 0) applyDefaults(d);
    },
    [applyDefaults],
  );

  const onDuplicate = useCallback(
    () => void controllerRef.current?.duplicateSelection(),
    [],
  );
  const onDeleteSel = useCallback(
    () => controllerRef.current?.deleteSelection(),
    [],
  );
  const onLayer = useCallback((op: LayerOp) => {
    const c = controllerRef.current;
    if (!c) return;
    if (op === "front") c.bringToFront();
    else if (op === "forward") c.bringForward();
    else if (op === "backward") c.sendBackward();
    else c.sendToBack();
  }, []);

  // Mind-map node actions (shared by the contextual toolbar and touch quick-add).
  const onAddChild = useCallback(() => controllerRef.current?.createChild(), []);
  const onAddSibling = useCallback(
    () => controllerRef.current?.createSibling(),
    [],
  );
  const onCollapseToggle = useCallback(
    () => controllerRef.current?.toggleCollapseSelected(),
    [],
  );
  const onArrange = useCallback(
    () => controllerRef.current?.arrangeSelected(),
    [],
  );
  const onSelectBranch = useCallback(
    () => controllerRef.current?.selectBranchSelected(),
    [],
  );
  const onDuplicateBranch = useCallback(
    () => void controllerRef.current?.duplicateBranchSelected(),
    [],
  );

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const c = controllerRef.current;
    if (!c) return;
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith("image/")) void c.addImageFile(file);
    }
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);

  const currentTitle =
    pages.find((p) => p.id === currentId)?.title ?? "Untitled";

  return (
    <div className="nd-safe flex h-dvh flex-col overflow-hidden bg-nd-bg text-nd-text">
      <TopBar
        pages={pages}
        currentPageId={currentId}
        currentTitle={currentTitle}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onNewPage={handleNewPage}
        onUndo={onUndo}
        onRedo={onRedo}
        onExport={onExport}
        onSwitchPage={handleSwitchPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
      />

      <div
        className="relative flex-1 overflow-hidden p-3 sm:p-4"
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <div
          ref={paperRef}
          className="nd-paper relative h-full w-full overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)] ring-1 ring-black/40"
        >
          <canvas ref={canvasRef} />
        </div>

        <Toolbar
          tool={state.tool}
          onSelectTool={onSelectTool}
          onPickImage={onPickImage}
        />

        {toolDefaults && (
          <ToolOptionsBar
            tool={state.tool}
            defaults={toolDefaults}
            onSetDefault={applyDefaults}
            onSetDrawPref={onSetDrawPref}
          />
        )}

        <ObjectToolbar
          selection={state.selection}
          paperOffset={paperOffset}
          onStyle={onStyle}
          onDuplicate={onDuplicate}
          onDelete={onDeleteSel}
          onLayer={onLayer}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onCollapseToggle={onCollapseToggle}
          onArrange={onArrange}
          onSelectBranch={onSelectBranch}
          onDuplicateBranch={onDuplicateBranch}
        />

        <NodeQuickAdd
          selection={state.selection}
          paperOffset={paperOffset}
          paperSize={paperSize}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
        />

        <ZoomControls
          zoom={state.zoom}
          canvasStyle={state.canvasStyle}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onReset={onReset}
          onSetStyle={onSetPageStyle}
        />

        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 opacity-70">
              <Logo size={40} />
              <span className="text-sm text-nd-muted">Loading canvas…</span>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChange}
      />
    </div>
  );
}
