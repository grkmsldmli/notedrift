"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasController } from "@/lib/canvasController";
import {
  deleteCanvasDoc,
  getCurrentPageId,
  loadCanvasDoc,
  loadPages,
  loadPrefs,
  savePages,
  savePrefs,
  saveCanvasDoc,
  setCurrentPageId,
  uid,
} from "@/lib/storage";
import type { CanvasDoc, EditorState, PageMeta, Tool } from "@/lib/types";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { ZoomControls } from "./ZoomControls";
import { Logo } from "./Logo";

const INITIAL_STATE: EditorState = {
  tool: "select",
  zoom: 1,
  canUndo: false,
  canRedo: false,
  gridOn: true,
  hasSelection: false,
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

function newPageMeta(): PageMeta {
  const now = Date.now();
  return { id: uid(), title: "Untitled", createdAt: now, updatedAt: now };
}

export default function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);

  // Debounced autosave target: always the *current* page.
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
    if (list.length === 0) {
      const first = newPageMeta();
      list = [first];
      curId = first.id;
      savePages(list);
      setCurrentPageId(curId);
    }
    if (!curId || !list.some((p) => p.id === curId)) {
      curId = list[0].id;
      setCurrentPageId(curId);
    }

    setPages(list);
    setCurrentId(curId);
    currentIdRef.current = curId;

    const prefs = loadPrefs();
    const controller = new CanvasController(
      canvasEl,
      paperEl,
      { onState: setState, onPersist: persistDoc },
      prefs.gridOn,
    );
    controllerRef.current = controller;

    void loadCanvasDoc(curId).then((doc) => {
      controller.loadDoc(doc);
      setReady(true);
    });

    const ro = new ResizeObserver(() => controller.resize());
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
      if (!c || c.isEditing()) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

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

  // Paste images from clipboard anywhere.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const c = controllerRef.current;
      if (!c) return;
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

  /* --------------------------------- page ops -------------------------------- */

  const handleNewPage = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.flush();
    const meta = newPageMeta();
    setPages((prev) => {
      const next = [meta, ...prev];
      savePages(next);
      return next;
    });
    setCurrentId(meta.id);
    currentIdRef.current = meta.id;
    setCurrentPageId(meta.id);
    c.clearPage();
  }, []);

  const handleSwitchPage = useCallback(async (id: string) => {
    const c = controllerRef.current;
    if (!c || id === currentIdRef.current) return;
    c.flush();
    setCurrentId(id);
    currentIdRef.current = id;
    setCurrentPageId(id);
    const doc = await loadCanvasDoc(id);
    await c.loadDoc(doc);
  }, []);

  const handleDeletePage = useCallback(
    (id: string) => {
      const c = controllerRef.current;
      if (!c) return;
      void deleteCanvasDoc(id);
      const remaining = pages.filter((p) => p.id !== id);

      if (remaining.length === 0) {
        const meta = newPageMeta();
        setPages([meta]);
        savePages([meta]);
        setCurrentId(meta.id);
        currentIdRef.current = meta.id;
        setCurrentPageId(meta.id);
        c.clearPage();
        return;
      }

      setPages(remaining);
      savePages(remaining);

      if (id === currentIdRef.current) {
        const nextId = remaining[0].id;
        setCurrentId(nextId);
        currentIdRef.current = nextId;
        setCurrentPageId(nextId);
        void loadCanvasDoc(nextId).then((doc) => c.loadDoc(doc));
      }
    },
    [pages],
  );

  const handleRenamePage = useCallback((id: string) => {
    const current = loadPages().find((p) => p.id === id);
    const input = window.prompt("Rename page", current?.title ?? "Untitled");
    if (input === null) return;
    const title = input.trim() || "Untitled";
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
  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void controllerRef.current?.addImageFile(file);
      e.target.value = "";
    },
    [],
  );

  const onExport = useCallback(() => {
    const title =
      pages.find((p) => p.id === currentIdRef.current)?.title ?? "notedrift";
    controllerRef.current?.exportPNG(slugify(title));
  }, [pages]);

  const onToggleGrid = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.toggleGrid();
    savePrefs({ gridOn: !state.gridOn });
  }, [state.gridOn]);

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
    <div className="flex h-dvh flex-col overflow-hidden bg-nd-bg text-nd-text">
      <TopBar
        pages={pages}
        currentPageId={currentId}
        currentTitle={currentTitle}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        gridOn={state.gridOn}
        onNewPage={handleNewPage}
        onUndo={() => controllerRef.current?.undo()}
        onRedo={() => controllerRef.current?.redo()}
        onExport={onExport}
        onToggleGrid={onToggleGrid}
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
          className="relative h-full w-full overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)] ring-1 ring-black/40"
        >
          <canvas ref={canvasRef} />
        </div>

        <Toolbar
          tool={state.tool}
          onSelectTool={onSelectTool}
          onPickImage={onPickImage}
        />

        <ZoomControls
          zoom={state.zoom}
          gridOn={state.gridOn}
          onZoomIn={() => controllerRef.current?.zoomIn()}
          onZoomOut={() => controllerRef.current?.zoomOut()}
          onReset={() => controllerRef.current?.resetZoom()}
          onToggleGrid={onToggleGrid}
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
