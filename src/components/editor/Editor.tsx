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
  type Prefs,
} from "@/lib/storage";
import type {
  CanvasDoc,
  CanvasStyle,
  DrawTool,
  DrawToolPrefs,
  EditorState,
  EraserMode,
  PageMeta,
  RailSlot,
  StylePatch,
  Tool,
  ToolDefaults,
} from "@/lib/types";
import { DEFAULT_RAIL_SLOTS, MAX_RAIL_SLOTS } from "@/lib/types";
import { DRAW_TOOLS } from "@/lib/brush/materials";
import { ensureCanvasFonts } from "@/lib/fonts";
import { getCloudEngine } from "@/lib/cloud/engine";
import { onAuthChange } from "@/lib/auth/client";
import { CloudButton } from "./CloudButton";
import { CloudCanvasesDialog } from "./CloudCanvasesDialog";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { ZoomControls } from "./ZoomControls";
import { ToolOptionsBar } from "./ToolOptionsBar";
import { ObjectToolbar, type LayerOp } from "./ObjectToolbar";
import { CropBar } from "./CropBar";
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
  cropping: false,
  eraserMode: "object",
};

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  q: "lasso",
  h: "hand",
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
  // Monotonic token guarding async page loads. Every page operation (switch /
  // new / delete) bumps it; an in-flight load whose token is stale aborts before
  // it can render or re-target persistence — this prevents a slow/superseded
  // load from painting the wrong page and autosaving it into another page's id.
  const switchTokenRef = useRef(0);

  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [pages, setPages] = useState<PageMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [toolDefaults, setToolDefaults] = useState<ToolDefaults | null>(null);
  const [paperOffset, setPaperOffset] = useState({ left: 0, top: 0 });
  const [paperSize, setPaperSize] = useState({ width: 0, height: 0 });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [pinnedSlots, setPinnedSlots] = useState<RailSlot[]>(DEFAULT_RAIL_SLOTS);
  const [ready, setReady] = useState(false);
  const prefsRef = useRef<Prefs>({
    defaultStyle: "dots",
    eraserMode: "object",
    pinnedSlots: DEFAULT_RAIL_SLOTS,
  });
  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    savePrefs(next);
  }, []);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(() => {
    currentIdRef.current = currentId;
  }, [currentId]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // Warn at most once per run of save failures, so a full disk doesn't spam.
  const saveFailedRef = useRef(false);
  const persistDoc = useCallback(
    (doc: CanvasDoc) => {
      const id = currentIdRef.current;
      if (!id) return;
      void saveCanvasDoc(id, doc).then((ok) => {
        if (!ok) {
          if (!saveFailedRef.current) {
            saveFailedRef.current = true;
            showNotice(
              "Couldn't save to this device — storage may be full. Export a copy to keep your work.",
            );
          }
          return; // don't advance the saved-time on a write that didn't land
        }
        saveFailedRef.current = false;
        setPages((prev) => {
          const next = prev.map((p) =>
            p.id === id ? { ...p, updatedAt: Date.now() } : p,
          );
          savePages(next);
          return next;
        });
        // Local save succeeded — ONLY now tell the cloud engine (local-first).
        // A no-op unless this canvas is explicitly cloud-linked to this account.
        getCloudEngine().notifyLocalSave(id);
      });
    },
    [showNotice],
  );

  // One-time editor bootstrap.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const paperEl = paperRef.current;
    if (!canvasEl || !paperEl) return;

    let list = loadPages();
    let curId = getCurrentPageId();
    const prefs = loadPrefs();
    prefsRef.current = prefs;
    setPinnedSlots(prefs.pinnedSlots);
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
      { onState: setState, onPersist: persistDoc, onNotice: showNotice },
      styleOf(curPage),
      defaults,
    );
    controllerRef.current = controller;
    controller.setEraserMode(prefs.eraserMode);

    // Load the handwriting font BEFORE the doc so a saved Patrick-Hand box is
    // measured with the right metrics (no first-paint reflow); re-measure once
    // more when fonts settle, as a safety net.
    void loadCanvasDoc(curId).then(async (doc) => {
      await ensureCanvasFonts();
      controller.loadDoc(doc);
      controller.setCanvasStyle(styleOf(curPage));
      setReady(true);
      controllerRef.current?.refreshFonts();
    });
    // Also re-measure whenever the handwriting font actually finishes loading
    // (fires even if ensureCanvasFonts timed out), so a box typed during the
    // load re-fits once the real metrics arrive.
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts
        .load('16px "Patrick Hand"')
        .then(() => controllerRef.current?.refreshFonts())
        .catch(() => {});
    }

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

    // Virtual keyboard (tablet): track how much of the viewport it covers, so we
    // can lift the caret above it (in the controller) and keep bottom chrome
    // reachable — WITHOUT resizing the canvas.
    const vv =
      typeof window !== "undefined" ? window.visualViewport : null;
    const onViewport = () => {
      if (!vv) return;
      const raw = window.innerHeight - vv.height - vv.offsetTop;
      const kb = raw > 120 ? Math.round(raw) : 0; // ignore small UI, keyboard is tall
      document.documentElement.style.setProperty("--nd-kb-inset", `${kb}px`);
      setKeyboardInset(kb);
      controllerRef.current?.setKeyboardInset(kb);
    };
    vv?.addEventListener("resize", onViewport);
    vv?.addEventListener("scroll", onViewport);

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", onViewport);
      vv?.removeEventListener("scroll", onViewport);
      document.documentElement.style.removeProperty("--nd-kb-inset");
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

      // Crop mode: Enter applies, Escape cancels; swallow other shortcuts.
      if (c.isCropping()) {
        if (e.key === "Enter") {
          e.preventDefault();
          c.commitCrop();
        } else if (e.key === "Escape") {
          e.preventDefault();
          c.cancelCrop();
        }
        return;
      }

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
        } else if (k === "g") {
          e.preventDefault();
          if (e.shiftKey) c.ungroupSelection();
          else c.groupSelection();
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
      if (!c || c.isEditing() || c.isCropping()) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void c.addImageFiles(files); // viewport-centered
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
    ++switchTokenRef.current; // supersede any in-flight page load
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
    const token = ++switchTokenRef.current;
    // Persist the OUTGOING page to its own id — the canvas still shows it and
    // currentIdRef still points at it.
    c.flush();
    setCurrentId(id); // responsive highlight; the latest switch's setState wins
    setCurrentPageId(id);
    const target = pagesRef.current.find((p) => p.id === id);
    const doc = await loadCanvasDoc(id);
    if (switchTokenRef.current !== token) return; // superseded by a newer page op
    await c.loadDoc(doc);
    if (switchTokenRef.current !== token) return; // superseded during the load
    // Only now that the canvas actually shows the new page do we re-target
    // autosave at it — so a save can never land the old canvas in the new id.
    currentIdRef.current = id;
    c.setCanvasStyle(styleOf(target));
  }, []);

  // --- Cloud sync engine wiring (local-first; inert unless a canvas is linked) ---
  const [, setCloudTick] = useState(0);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const reloadCurrentCanvas = useCallback(async (id: string) => {
    const c = controllerRef.current;
    if (!c || id !== currentIdRef.current) return;
    await c.loadDoc(await loadCanvasDoc(id));
  }, []);
  useEffect(() => {
    const engine = getCloudEngine();
    engine.configure({
      onPagesChanged: () => {
        const list = loadPages();
        pagesRef.current = list;
        setPages(list);
      },
      onCanvasReplaced: (id) => void reloadCurrentCanvas(id),
    });
    const unsubEngine = engine.subscribe(() => setCloudTick((t) => t + 1));
    const unsubAuth = onAuthChange((user) => engine.setUser(user?.id ?? null));
    return () => {
      unsubEngine();
      unsubAuth();
    };
  }, [reloadCurrentCanvas]);

  const openCloudCanvas = useCallback(
    async (cloudId: string) => {
      const res = await getCloudEngine().openFromCloud(cloudId);
      if (res.ok) await handleSwitchPage(res.localId);
      else showNotice(res.message);
    },
    [handleSwitchPage, showNotice],
  );

  const handleDeletePage = useCallback((id: string) => {
    const c = controllerRef.current;
    if (!c) return;
    const token = ++switchTokenRef.current; // supersede any in-flight page load
    const deletingCurrent = id === currentIdRef.current;
    // Don't let a pending autosave resurrect the page we're discarding.
    if (deletingCurrent) c.cancelPersist();
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

    if (deletingCurrent) {
      const target = remaining[0];
      setCurrentId(target.id);
      setCurrentPageId(target.id);
      void loadCanvasDoc(target.id).then(async (doc) => {
        if (switchTokenRef.current !== token) return; // superseded
        await c.loadDoc(doc);
        if (switchTokenRef.current !== token) return;
        currentIdRef.current = target.id;
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
    getCloudEngine().notifyTitleChange(id); // sync the new title if cloud-linked
  }, []);

  /* ------------------------------- tool / view ------------------------------- */

  const onSelectTool = useCallback(
    (tool: Tool) => controllerRef.current?.setTool(tool),
    [],
  );
  const onSetEraserMode = useCallback(
    (mode: EraserMode) => {
      controllerRef.current?.setEraserMode(mode);
      updatePrefs({ eraserMode: mode });
    },
    [updatePrefs],
  );
  const onTogglePin = useCallback(
    (slot: RailSlot) => {
      setPinnedSlots((prev) => {
        const next = prev.includes(slot)
          ? prev.filter((s) => s !== slot)
          : [...prev, slot].slice(0, MAX_RAIL_SLOTS);
        // Never leave the rail empty.
        const safe = next.length > 0 ? next : prev;
        updatePrefs({ pinnedSlots: safe });
        return safe;
      });
    },
    [updatePrefs],
  );
  const onFitContent = useCallback(() => controllerRef.current?.fitContent(), []);
  const onFitSelection = useCallback(() => controllerRef.current?.fitSelection(), []);
  const onPickImage = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) void controllerRef.current?.addImageFiles(files);
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
    updatePrefs({ defaultStyle: style });
    setPages((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, style } : p));
      savePages(next);
      return next;
    });
  }, [updatePrefs]);

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
  const onGroup = useCallback(() => controllerRef.current?.groupSelection(), []);
  const onUngroup = useCallback(
    () => controllerRef.current?.ungroupSelection(),
    [],
  );
  const onLock = useCallback(() => controllerRef.current?.lockSelection(), []);
  const onUnlock = useCallback(
    () => controllerRef.current?.unlockSelection(),
    [],
  );
  const onAlign = useCallback(
    (edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") =>
      controllerRef.current?.alignSelection(edge),
    [],
  );
  const onDistribute = useCallback(
    (axis: "h" | "v") => controllerRef.current?.distributeSelection(axis),
    [],
  );
  const onNoteSize = useCallback(
    (cardWidth: number, fontSize: number) =>
      controllerRef.current?.setNoteSize(cardWidth, fontSize),
    [],
  );
  const onCrop = useCallback(() => controllerRef.current?.startCrop(), []);
  const onFlip = useCallback(
    (axis: "h" | "v") => controllerRef.current?.flipSelection(axis),
    [],
  );
  const onCropDone = useCallback(() => controllerRef.current?.commitCrop(), []);
  const onCropCancel = useCallback(() => controllerRef.current?.cancelCrop(), []);
  const onCropReset = useCallback(() => controllerRef.current?.resetCropRect(), []);

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
    if (!c || c.isCropping()) return;
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    // Place at the actual drop location (in scene coords), cascading multiples.
    const at = c.clientToScene(e.clientX, e.clientY);
    void c.addImageFiles(files, at);
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
        cloudSlot={
          currentId ? (
            <CloudButton
              currentId={currentId}
              currentTitle={currentTitle}
              onOpenCloudList={() => setCloudDialogOpen(true)}
              onNotice={showNotice}
            />
          ) : null
        }
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
          pinnedSlots={pinnedSlots}
          eraserMode={state.eraserMode}
          onSelectTool={onSelectTool}
          onPickImage={onPickImage}
          onSetEraserMode={onSetEraserMode}
          onTogglePin={onTogglePin}
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
          onGroup={onGroup}
          onUngroup={onUngroup}
          onLock={onLock}
          onUnlock={onUnlock}
          onAlign={onAlign}
          onDistribute={onDistribute}
          onNoteSize={onNoteSize}
          onCrop={onCrop}
          onFlip={onFlip}
          cropping={state.cropping}
          onAddChild={onAddChild}
          onAddSibling={onAddSibling}
          onCollapseToggle={onCollapseToggle}
          onArrange={onArrange}
          onSelectBranch={onSelectBranch}
          onDuplicateBranch={onDuplicateBranch}
          keyboardInset={keyboardInset}
        />

        {state.cropping && (
          <CropBar onDone={onCropDone} onCancel={onCropCancel} onReset={onCropReset} />
        )}

        {notice && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-nd-border bg-nd-surface/95 px-3.5 py-2 text-sm text-nd-text shadow-2xl backdrop-blur">
            {notice}
          </div>
        )}

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
          hasSelection={state.hasSelection}
          keyboardInset={keyboardInset}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onReset={onReset}
          onFitContent={onFitContent}
          onFitSelection={onFitSelection}
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
        multiple
        hidden
        onChange={onFileChange}
      />

      {cloudDialogOpen && (
        <CloudCanvasesDialog
          onClose={() => setCloudDialogOpen(false)}
          onOpen={(cloudId) => {
            setCloudDialogOpen(false);
            void openCloudCanvas(cloudId);
          }}
          onNotice={showNotice}
        />
      )}
    </div>
  );
}
