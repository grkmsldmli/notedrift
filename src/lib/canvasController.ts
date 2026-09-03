// CanvasController: the imperative core of the NoteDrift editor.
//
// It owns the Fabric canvas and all interaction logic (tools, drawing, styling,
// zoom/pan, history, autosave, alignment guides, and the connector/relationship
// system). React never touches Fabric directly — it creates one controller,
// subscribes to state via `onState`, and calls public methods.

import * as fabric from "fabric";
import {
  ANCHOR_HIT,
  ANCHOR_R,
  AUTO_TEXT_MAX_W,
  AUTO_TEXT_MIN_W,
  BULLET_PREFIX,
  CANVAS_FONT,
  CHECK_PREFIX,
  CROP_HANDLE_HIT,
  CROP_MIN_PX,
  IMAGE_CASCADE,
  CONNECTOR_STROKE,
  CONNECTOR_WIDTH,
  DASH_ARRAYS,
  DEFAULT_NODE_ACCENT,
  GRID_COLOR,
  GRID_LINE_COLOR,
  GRID_SIZE,
  PAPER_ENG_COLOR,
  PAPER_GRAPH_MAJOR,
  PAPER_GRAPH_MINOR,
  PAPER_GRAPH_MINOR_SIZE,
  PAPER_RULE_COLOR,
  PAPER_RULE_ROW,
  MAX_ZOOM,
  MIN_ZOOM,
  MINDMAP_GAP_X,
  MINDMAP_GAP_Y,
  NOTEDRIFT_PROPS,
  NOTE_PAD,
  type NodeAccent,
} from "./constants";
import { History } from "./history";
import { FreehandBrush } from "./brush/freehand";
import { DRAW_TOOLS, materialFor } from "./brush/materials";
import { brushSpecFor } from "./tools/registry";
import { makeStickyNote, styleArrow } from "./shapes";
import { NdLine, makeNdLine } from "./shapes/ndline";
import {
  SHAPE_IDS,
  rebuildPolygon,
  shapeDef,
  type ShapeDef,
  type ShapeParams,
  type ShapeStyle,
} from "./shapes/registry";
import { polygonPoints, starPoints } from "./shapes/geometry";
import { fontKeyOf } from "./fonts";
import { normalizeImageFile, ImageImportError } from "./image";
import {
  ANCHORS,
  Connector,
  NodeBox,
  anchorScenePoint,
  isConnectable,
  isHierEdge,
  makeNode,
  nearestAnchor,
  nid,
  sceneBoundsOf,
  type Pt,
} from "./connectors";
import type {
  Anchor,
  ArrowHead,
  CanvasDoc,
  CanvasStyle,
  DashStyle,
  DrawTool,
  DrawToolPrefs,
  EditorState,
  EraserMode,
  ObjKind,
  SelectionInfo,
  StylePatch,
  ToolDefaults,
  Tool,
} from "./types";

const DRAW_TOOL_SET = new Set<Tool>(DRAW_TOOLS);
function isDrawTool(t: Tool): t is DrawTool {
  return DRAW_TOOL_SET.has(t);
}

const SHAPE_TOOL_SET = new Set<Tool>(SHAPE_IDS as Tool[]);
const LINE_TOOL_SET = new Set<Tool>(["line", "arrow", "doublearrow"]);
function isShapeTool(t: Tool): boolean {
  return SHAPE_TOOL_SET.has(t);
}
function isLineTool(t: Tool): boolean {
  return LINE_TOOL_SET.has(t);
}

/** Map a strokeDashArray back to a dash-style key for the UI. */
function dashKeyOf(arr: number[] | null | undefined): DashStyle {
  if (!arr || arr.length === 0) return "solid";
  return arr[0] <= 3 ? "dotted" : "dashed";
}

export interface ControllerCallbacks {
  onState: (state: EditorState) => void;
  onPersist: (doc: CanvasDoc) => void;
  /** Surface a brief, friendly message (e.g. an image import error). */
  onNotice?: (message: string) => void;
}

type PointerInfo = fabric.TPointerEventInfo<fabric.TPointerEvent>;
type WheelInfo = fabric.TPointerEventInfo<WheelEvent>;
type NdObj = fabric.FabricObject & { ndId?: string; ndRole?: string };

interface Guide {
  axis: "v" | "h";
  pos: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** A text box counts as empty when only whitespace and list markers remain, so
 *  a box holding just a bullet / checkbox prefix is still garbage-collected. */
function isEffectivelyEmpty(text: string): boolean {
  return text.replace(/[•☐☑\s]/g, "") === "";
}

/** The list mode of a text box: bullet / check when every non-blank line carries
 *  that marker, else none. */
function listStyleOf(text: string): "none" | "bullet" | "check" {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return "none";
  if (lines.every((l) => /^\s*•\s+/.test(l))) return "bullet";
  if (lines.every((l) => /^\s*[☐☑]\s+/.test(l))) return "check";
  return "none";
}

/** Whole-object text/note formatting snapshot for the contextual toolbar. */
function textStyleOf(t: fabric.Textbox): Partial<SelectionInfo> {
  const weight = t.fontWeight;
  return {
    textColor: t.fill as string,
    fontSize: t.fontSize,
    fontFamily: fontKeyOf(t.fontFamily),
    bold: weight === "bold" || weight === 700 || weight === "700",
    italic: t.fontStyle === "italic",
    underline: !!t.underline,
    lineHeight: t.lineHeight,
    textAlign: t.textAlign,
    listStyle: listStyleOf(t.text ?? ""),
  };
}

/** A recoverable stand-in for an image whose data failed to decode on load —
 *  keeps the exact geometry and the original src (ndBrokenSrc) so nothing is
 *  silently lost, and the rest of the page still renders. */
function makeBrokenImagePlaceholder(
  s: Record<string, unknown>,
): fabric.Rect {
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const rect = new fabric.Rect({
    left: num(s.left, 0),
    top: num(s.top, 0),
    originX: (s.originX as fabric.TOriginX) ?? "center",
    originY: (s.originY as fabric.TOriginY) ?? "center",
    width: num(s.width, 200),
    height: num(s.height, 150),
    scaleX: num(s.scaleX, 1),
    scaleY: num(s.scaleY, 1),
    angle: num(s.angle, 0),
    flipX: Boolean(s.flipX),
    flipY: Boolean(s.flipY),
    opacity: num(s.opacity, 1),
    fill: "rgba(148,163,184,0.12)",
    stroke: "#94a3b8",
    strokeWidth: 1.5,
    strokeDashArray: [8, 6],
    strokeUniform: true,
  });
  const r = rect as fabric.Rect & {
    ndId?: string;
    ndBrokenSrc?: unknown;
    ndLocked?: boolean;
  };
  r.ndId = (s.ndId as string) ?? nid();
  r.ndBrokenSrc = s.src; // preserve the original data for recovery
  if (s.ndLocked) r.ndLocked = true;
  return rect;
}

/** Reviver for loadFromJSON: replace a failed image with a placeholder so one
 *  bad src never drops data or bricks the page; stays quiet on the console.
 *  Loosely typed to satisfy Fabric's generic reviver signature. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const brokenImageReviver = (serialized: any, instance: any, reason?: any): any => {
  if (instance === undefined && reason !== undefined) {
    const type = String(serialized?.type ?? "").toLowerCase();
    if (type === "image")
      return makeBrokenImagePlaceholder(serialized as Record<string, unknown>);
  }
  return undefined;
};

/** Even-odd ray-cast point-in-polygon test (scene coordinates). */
function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** A soft circular brush-size cursor (dark + dashed-white rings so it reads on
 *  any background), with the hotspot at its center. */
function brushCursor(diameter: number): string {
  const size = Math.max(10, Math.min(Math.round(diameter), 120));
  const c = size / 2;
  const r = c - 1.5;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<circle cx='${c}' cy='${c}' r='${r}' fill='none' stroke='rgba(15,23,42,0.75)' stroke-width='1.25'/>` +
    `<circle cx='${c}' cy='${c}' r='${r}' fill='none' stroke='rgba(255,255,255,0.85)' stroke-width='1.25' stroke-dasharray='3 3'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

const PERSIST_IDLE = 500;
const PERSIST_MAXWAIT = 4000;
/** Longest edge (px) of an exported PNG. Caps the backing store so a scene whose
 *  objects are spread far apart on the infinite canvas can't OOM the tab. */
const EXPORT_MAX_EDGE = 8000;
const SNAP_SCREEN_PX = 6;
/** Forgiving anchor/endpoint hit radius for touch & pen (mouse uses ANCHOR_HIT). */
const ANCHOR_HIT_TOUCH = 26;
/** How far outside an object's edge the connection anchors sit, so they don't
 *  collide with Fabric's mid-edge resize handles. */
const ANCHOR_OFFSET = 14;

const ndId = (o: fabric.FabricObject): string | undefined => (o as NdObj).ndId;
const ndRole = (o: fabric.FabricObject): string | undefined => (o as NdObj).ndRole;

/** True when an object is locked (visible but non-interactive). */
const isLocked = (o: fabric.FabricObject): boolean =>
  (o as { ndLocked?: boolean }).ndLocked === true;

/** True when a Fabric group was created by the user's Group action (as opposed
 *  to a legacy arrow, which is also a fabric group but must never be ungrouped). */
const isUserGroup = (o: fabric.FabricObject): o is fabric.Group =>
  o instanceof fabric.Group && ndRole(o) === "group";

/** True when the object is an editable mind-map node (NodeBox). */
function isNodeBox(o: fabric.FabricObject | null | undefined): o is NodeBox {
  return !!o && ((o as { type?: string }).type ?? "").toLowerCase() === "nodebox";
}

/** A freehand stroke (current ink OR legacy PencilBrush) — any Path that is not
 *  a tagged shape-path (cloud/database/document). Used by the stroke eraser. */
function isFreehandStroke(o: fabric.FabricObject): boolean {
  const t = ((o as { type?: string }).type ?? "").toLowerCase();
  return t === "path" && !(o as { ndShape?: string }).ndShape;
}

/** A freehand ink stroke: a filled Path (fill set, no stroke) from the brush
 *  engine — distinct from a legacy PencilBrush Path (stroke set, no fill). */
function isInkPath(o: fabric.FabricObject): boolean {
  if (((o as { type?: string }).type ?? "").toLowerCase() !== "path") return false;
  const fill = o.fill;
  const stroke = o.stroke;
  return (
    typeof fill === "string" &&
    fill !== "" &&
    fill !== "transparent" &&
    (!stroke || stroke === "")
  );
}

/** Categorize a Fabric object for the contextual toolbar. */
function kindOf(obj: fabric.FabricObject): ObjKind {
  if (ndRole(obj) === "connector") return "connector";
  const t = ((obj as { type?: string }).type ?? "").toLowerCase();
  if (t === "stickynote") return "note";
  if (t === "nodebox") return "text";
  if (t === "i-text" || t === "itext" || t === "textbox" || t === "text")
    return "text";
  if (t === "ndline" || t === "line") return "line";
  if (t === "path") {
    // A tagged shape path (cloud / database / document) vs a freehand ink stroke.
    return (obj as { ndShape?: string }).ndShape ? "shape" : "path";
  }
  if (t === "image") return "image";
  return "shape";
}

export class CanvasController {
  readonly canvas: fabric.Canvas;
  private readonly paperEl: HTMLElement;
  private readonly cb: ControllerCallbacks;
  private readonly history = new History();

  private tool: Tool = "select";
  private canvasStyle: CanvasStyle;
  private defaults: ToolDefaults;
  private freehand!: FreehandBrush;

  // Interaction state
  private suppress = false;
  private disposed = false;
  private drawing = false;
  private draft: fabric.FabricObject | null = null;
  private draftDef: ShapeDef | null = null;
  private drawMods = { shift: false, alt: false };
  private start = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private isPanning = false;
  private isErasing = false;
  private erasedAny = false; // did the current eraser gesture remove anything?
  private eraserMode: EraserMode = "object";
  private interacting = false;
  private spaceDown = false;
  private lastPan = { x: 0, y: 0 };
  private activeGuides: Guide[] = [];

  // Lasso select — a temporary freeform selection region (scene-space points).
  // Never persisted, never part of history or export.
  private lassoing = false;
  private lassoPts: Pt[] = [];

  // Text tool: a pending create — tap makes auto-grow text, drag a fixed-width
  // box (decided on mouse:up so focus() stays inside the gesture).
  private textDraft: { start: Pt; cur: Pt } | null = null;

  // Virtual-keyboard handling (tablet): how much of the viewport the software
  // keyboard covers, and the vertical scene-pan we applied to lift the caret.
  private keyboardInset = 0;
  private keyboardPan = 0;

  // Image crop mode — a controller-owned mode (like marquee/anchors). The crop
  // window is edited in element pixels; the image renders the full picture while
  // cropping, dimmed outside the window. Never leaves artifacts in the document.
  private cropState: {
    img: fabric.FabricImage;
    elW: number;
    elH: number;
    // current crop window (element pixels)
    x: number;
    y: number;
    w: number;
    h: number;
    // to restore on cancel
    orig: { cropX: number; cropY: number; width: number; height: number; opacity: number };
    origCenter: fabric.Point;
    drag: null | { handle: string; startX: number; startY: number; win: { x: number; y: number; w: number; h: number } };
  } | null = null;

  // Touch / pen gestures (multi-touch is handled at the DOM level; Fabric v6 has
  // no built-in pinch/two-finger pan).
  private touchPoints = new Map<number, Pt>();
  private gestureActive = false;
  private gestureLatch = false; // suppress a leftover finger after a gesture
  private lastMid: Pt = { x: 0, y: 0 };
  private lastDist = 1;
  private canvasRect: DOMRect | null = null;
  private penSeen = false; // a stylus has been used → treat fingers as navigation
  private fingerPan: { id: number; last: Pt } | null = null;

  // Connectors
  private anchorHost: fabric.FabricObject | null = null;
  private hoverTarget: { objId: string; anchor: Anchor; point: Pt } | null = null;
  private connectDrag: {
    mode: "create" | "reassign";
    connector: Connector;
    end: "source" | "target";
  } | null = null;
  private pendingConnect: { sourceId: string; anchor: Anchor } | null = null;
  private pendingReassign: {
    end: "source" | "target";
    connector: Connector;
  } | null = null;

  // Clipboard: nodes + internal connectors, deep-cloned so it survives edits.
  private clipboard: {
    nodes: fabric.FabricObject[];
    connectors: Connector[];
  } | null = null;

  // Autosave
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPending = false;
  private lastPersistAt = 0;

  private emitScheduled = false;
  private loadQueue: Promise<void> = Promise.resolve();

  constructor(
    el: HTMLCanvasElement,
    paperEl: HTMLElement,
    cb: ControllerCallbacks,
    style: CanvasStyle,
    defaults: ToolDefaults,
  ) {
    this.paperEl = paperEl;
    this.cb = cb;
    this.canvasStyle = style;
    this.defaults = defaults;

    this.canvas = new fabric.Canvas(el, {
      preserveObjectStacking: true,
      selection: true,
      fireRightClick: false,
      stopContextMenu: true,
      enableRetinaScaling: true,
      targetFindTolerance: 8,
      backgroundColor: undefined,
    });

    // The professional freehand engine replaces PencilBrush (see brush/freehand).
    this.freehand = new FreehandBrush(this.canvas);
    this.canvas.freeDrawingBrush = this.freehand;
    this.configureBrush();

    this.resize();
    this.setCanvasStyle(style);
    this.wireEvents();
    this.attachTouchHandlers();
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onModKeyChange);
      window.addEventListener("keyup", this.onModKeyChange);
    }
    this.applyToolMode();
    this.history.reset(this.snapshot());
    this.emit();
  }

  /* ------------------------------ lifecycle ------------------------------- */

  resize(): void {
    const w = this.paperEl.clientWidth;
    const h = this.paperEl.clientHeight;
    if (w > 0 && h > 0) {
      this.canvas.setDimensions({ width: w, height: h });
      this.updateGrid();
      this.emit();
    }
  }

  /* --------------------------- virtual keyboard --------------------------- */

  /** React reports how much of the viewport the software keyboard covers. We
   *  never resize the canvas — only pan the scene (viewportTransform) to lift
   *  the caret above the keyboard, and restore that pan when it closes. */
  setKeyboardInset(px: number): void {
    const next = Math.max(0, Math.round(px));
    const was = this.keyboardInset;
    this.keyboardInset = next;
    // Re-pin the pointer→scene offset after any iOS viewport shift, so
    // getScenePoint / anchors / lasso stay accurate.
    this.canvas.calcOffset();
    if (next > 0) this.ensureCaretVisible();
    else if (was > 0) this.restoreKeyboardPan();
  }

  /** Pan the scene up (vpt[5]) so the active editing object sits above the
   *  keyboard band. Additive to any manual pan, so scene coords stay valid. */
  private ensureCaretVisible(): void {
    if (this.keyboardInset <= 0 || !this.isEditing()) return;
    const active = this.canvas.getActiveObject();
    if (!active) return;
    const r = this.screenRectOf(active);
    const PAD = 28;
    const visibleBottom = this.canvas.getHeight() - this.keyboardInset;
    const objBottom = r.top + r.height;
    const delta = objBottom - (visibleBottom - PAD);
    if (delta > 1) {
      const vpt = this.canvas.viewportTransform;
      vpt[5] -= delta;
      this.canvas.setViewportTransform(vpt);
      this.keyboardPan += delta;
      this.updateGrid();
      this.emit();
    }
  }

  /** Undo exactly our keyboard pan (leaving any manual pan intact). */
  private restoreKeyboardPan(): void {
    if (this.keyboardPan === 0) return;
    const vpt = this.canvas.viewportTransform;
    vpt[5] += this.keyboardPan;
    this.keyboardPan = 0;
    this.canvas.setViewportTransform(vpt);
    this.updateGrid();
    this.emit();
  }

  /** Re-measure text that uses a web font once it has loaded, so a page saved
   *  with the handwriting font doesn't reflow on first paint. */
  refreshFonts(): void {
    let changed = false;
    const visit = (objs: fabric.FabricObject[]): void => {
      for (const o of objs) {
        const t = o as fabric.Textbox & { fontFamily?: string; ndAutoGrow?: boolean };
        if (typeof t.fontFamily === "string" && /patrick|cursive/i.test(t.fontFamily)) {
          t.initDimensions?.();
          // Auto-grow width is font-dependent, so re-fit it too (initDimensions
          // only re-wraps within the current width).
          this.fitAutoGrow(t);
          t.setCoords();
          changed = true;
        }
        if (o instanceof fabric.Group) visit(o.getObjects());
      }
    };
    visit(this.canvas.getObjects());
    if (changed) {
      this.updateConnectors();
      this.canvas.requestRenderAll();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.detachTouchHandlers();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onModKeyChange);
      window.removeEventListener("keyup", this.onModKeyChange);
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.canvas.dispose();
  }

  /* -------------------------------- state --------------------------------- */

  /** Serialize including NoteDrift relationship props (ids, connector links).
   *  While cropping, the target image is transiently expanded to its full
   *  picture — serialize it in its committed (pre-crop) state so a mid-crop
   *  autosave or history snapshot can never overwrite the real crop. */
  private serialize(): CanvasDoc {
    const s = this.cropState;
    if (!s) return this.canvas.toObject(NOTEDRIFT_PROPS) as CanvasDoc;
    s.img.set({
      cropX: s.orig.cropX,
      cropY: s.orig.cropY,
      width: s.orig.width,
      height: s.orig.height,
      dirty: true,
    });
    s.img.setPositionByOrigin(s.origCenter, "center", "center");
    s.img.setCoords();
    const doc = this.canvas.toObject(NOTEDRIFT_PROPS) as CanvasDoc;
    // Restore the full-image expansion so cropping continues normally.
    this.repositionImageForCrop(s.img, 0, 0, s.elW, s.elH);
    return doc;
  }

  private snapshot(): string {
    return JSON.stringify(this.serialize());
  }

  private screenRectOf(obj: fabric.FabricObject) {
    obj.setCoords();
    const c = obj.aCoords;
    const vpt = this.canvas.viewportTransform;
    const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x].map((x) => x * vpt[0] + vpt[4]);
    const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y].map((y) => y * vpt[3] + vpt[5]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  private styleOf(obj: fabric.FabricObject, kind: ObjKind): Partial<SelectionInfo> {
    if (kind === "connector") {
      const c = obj as Connector;
      return {
        stroke: c.stroke as string,
        strokeWidth: c.strokeWidth,
        hasArrow: c.connKind === "arrow",
      };
    }
    if (kind === "note") {
      const n = obj as fabric.Textbox;
      return { noteFill: n.backgroundColor as string, ...textStyleOf(n) };
    }
    if (kind === "text") {
      const t = obj as fabric.Textbox;
      // Mind-map nodes share kind "text" but must not surface free-text
      // formatting (their look is accent-driven).
      if (isNodeBox(obj)) {
        return {
          textColor: t.fill as string,
          fontSize: t.fontSize,
          textAlign: t.textAlign,
          fontFamily: fontKeyOf(t.fontFamily),
        };
      }
      return textStyleOf(t);
    }
    if (kind === "line") {
      const l = obj as NdLine;
      const isNd = ((obj as { type?: string }).type ?? "").toLowerCase() === "ndline";
      return {
        stroke: obj.stroke as string,
        strokeWidth: obj.strokeWidth,
        opacity: obj.opacity ?? 1,
        dash: dashKeyOf(obj.strokeDashArray),
        isLine: isNd,
        startHead: isNd ? l.startHead ?? "none" : undefined,
        endHead: isNd ? l.endHead ?? "none" : undefined,
      };
    }
    if (kind === "shape") {
      if (obj instanceof fabric.Group) {
        // Legacy arrow group.
        const line = obj.getObjects()[0];
        return {
          stroke: (line?.stroke as string) ?? undefined,
          strokeWidth: line?.strokeWidth,
          fill: "transparent",
        };
      }
      const t = obj as fabric.FabricObject & {
        ndShape?: string;
        ndSides?: number;
        ndPoints?: number;
        ndInner?: number;
      };
      return {
        stroke: obj.stroke as string,
        strokeWidth: obj.strokeWidth,
        fill: (obj.fill as string) ?? "transparent",
        opacity: obj.opacity ?? 1,
        dash: dashKeyOf(obj.strokeDashArray),
        // Any non-group vector shape is fillable — including legacy rect/ellipse
        // drawn before shapes were tagged with ndShape.
        fillable: true,
        shapeId: t.ndShape,
        radius: t.ndShape === "roundrect" ? (obj as fabric.Rect).rx : undefined,
        sides: t.ndSides,
        starPoints: t.ndPoints,
        starInner: t.ndInner,
      };
    }
    if (kind === "path") {
      // Freehand ink stores its color in `fill`; surface that as the swatch value.
      if (isInkPath(obj)) return { stroke: obj.fill as string, opacity: obj.opacity ?? 1 };
      return { stroke: obj.stroke as string, strokeWidth: obj.strokeWidth };
    }
    if (kind === "image") {
      const img = obj as fabric.FabricImage;
      return {
        opacity: obj.opacity ?? 1,
        flipX: !!img.flipX,
        flipY: !!img.flipY,
        cropped: typeof img.hasCrop === "function" ? img.hasCrop() : false,
      };
    }
    return {};
  }

  private buildSelection(): SelectionInfo {
    const active = this.canvas.getActiveObject();
    if (!active) return { kind: "none", count: 0, rect: null };

    const objs = this.canvas.getActiveObjects();
    const rect = this.interacting ? null : this.screenRectOf(active);

    if (objs.length > 1) {
      const groupableCount = objs.filter(
        (o) => ndRole(o) !== "connector" && !isLocked(o),
      ).length;
      const multi = {
        count: objs.length,
        rect,
        canGroup: groupableCount >= 2,
        canAlign: groupableCount >= 2,
        // Align/distribute operate on movable objects only — connectors and
        // locked objects are excluded, so gate on that count, not raw length.
        canDistribute: groupableCount >= 3,
        locked: objs.every(isLocked),
      };
      const kinds = new Set(objs.map(kindOf));
      if (kinds.size === 1) {
        const k = [...kinds][0];
        const info: SelectionInfo = { kind: k, ...multi, ...this.styleOf(objs[0], k) };
        // A uniform multi-node selection uses the node branch (accent + font,
        // which apply to all) instead of the free-text controls that no-op on
        // nodes; add/collapse actions are hidden for multi (they act on one node).
        if (k === "text" && objs.every(isNodeBox)) info.isNode = true;
        return info;
      }
      return { kind: "mixed", ...multi };
    }

    const k = kindOf(active);
    const info: SelectionInfo = {
      kind: k,
      count: 1,
      rect,
      ...this.styleOf(active, k),
    };
    if (isUserGroup(active)) {
      info.isGroup = true;
      info.canUngroup = true;
    }
    if (isLocked(active)) info.locked = true;
    if (k === "path" && isInkPath(active)) {
      info.isInk = true;
      info.opacity = active.opacity ?? 1;
    }
    // Mind-map extras for a single node (skip during drags — the toolbar is
    // hidden then anyway, and the traversal is wasted work; and skip when the
    // node is locked, so no quick-add / anchors appear on it).
    if (!this.interacting && isNodeBox(active) && !isLocked(active)) {
      const id = ndId(active);
      if (id) {
        const map = this.objByIdMap();
        info.isNode = true;
        info.hasChildren = this.childrenOf(id, map).length > 0;
        info.isRoot = this.isRootNode(id, map);
        info.collapsed = !!active.ndCollapsed;
        info.nodeAccent = active.ndAccent ?? DEFAULT_NODE_ACCENT;
      }
    }
    return info;
  }

  private getState(): EditorState {
    return {
      tool: this.tool,
      zoom: this.canvas.getZoom(),
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      canvasStyle: this.canvasStyle,
      hasSelection: this.canvas.getActiveObjects().length > 0,
      selection: this.buildSelection(),
      cropping: this.cropState !== null,
      eraserMode: this.eraserMode,
    };
  }

  private emit(): void {
    if (this.emitScheduled || this.disposed) return;
    this.emitScheduled = true;
    const run = () => {
      this.emitScheduled = false;
      if (!this.disposed) this.cb.onState(this.getState());
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else run();
  }

  private recordHistory(): void {
    if (this.suppress) return;
    this.history.record(this.snapshot());
    this.emit();
  }

  private schedulePersist(): void {
    if (this.suppress) return;
    this.persistPending = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const sinceLast = Date.now() - this.lastPersistAt;
    const delay = Math.max(0, Math.min(PERSIST_IDLE, PERSIST_MAXWAIT - sinceLast));
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.persistPending) this.flush();
    }, delay);
  }

  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.disposed) return;
    this.persistPending = false;
    this.lastPersistAt = Date.now();
    this.cb.onPersist(this.serialize());
  }

  /** Drop any pending autosave WITHOUT writing it. Used when the current page is
   *  being discarded (deleted), so its unsaved edits aren't resurrected into the
   *  deleted id by a timer that fires after the delete. */
  cancelPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistPending = false;
  }

  /* -------------------------- relationship model -------------------------- */

  /** Map every connectable object by ndId — recursing INTO groups, so a shape
   *  nested in a Fabric.Group is still resolvable by its connectors (which stay
   *  top-level relationship objects). */
  private objByIdMap(): Map<string, fabric.FabricObject> {
    const m = new Map<string, fabric.FabricObject>();
    const visit = (objs: fabric.FabricObject[]): void => {
      for (const o of objs) {
        if (ndRole(o) === "connector") continue;
        const id = ndId(o);
        if (id) m.set(id, o);
        if (o instanceof fabric.Group) visit(o.getObjects());
      }
    };
    visit(this.canvas.getObjects());
    return m;
  }

  private connectors(): Connector[] {
    return this.canvas
      .getObjects()
      .filter((o) => ndRole(o) === "connector") as Connector[];
  }

  /** Recompute connector geometry from linked objects. */
  private updateConnectors(onlyForIds?: Set<string>): void {
    const map = this.objByIdMap();
    for (const c of this.connectors()) {
      if (
        onlyForIds &&
        !(
          (c.sourceId && onlyForIds.has(c.sourceId)) ||
          (c.targetId && onlyForIds.has(c.targetId))
        )
      ) {
        continue;
      }
      c.syncGeometry(map);
    }
    this.canvas.requestRenderAll();
  }

  private movedIds(target: fabric.FabricObject): Set<string> {
    const ids = new Set<string>();
    // Recurse into groups: a connector bound to a node nested in a moving group
    // must still be recomputed as the group drags.
    const visit = (o: fabric.FabricObject): void => {
      if (ndRole(o) === "connector") return;
      const id = ndId(o);
      if (id) ids.add(id);
      if (o instanceof fabric.Group) o.getObjects().forEach(visit);
    };
    if (target instanceof fabric.ActiveSelection) target.getObjects().forEach(visit);
    else visit(target);
    return ids;
  }

  /** All connectable ndIds contained in an object, recursing into groups. */
  private allIdsIn(o: fabric.FabricObject): string[] {
    const ids: string[] = [];
    const id = ndId(o);
    if (id && ndRole(o) !== "connector") ids.push(id);
    if (o instanceof fabric.Group)
      for (const c of o.getObjects()) ids.push(...this.allIdsIn(c));
    return ids;
  }

  /** Assign ids to legacy connectable objects. Returns true if any assigned. */
  private ensureIds(): boolean {
    let changed = false;
    for (const o of this.canvas.getObjects()) {
      if (isConnectable(o) && !ndId(o)) {
        (o as NdObj).ndId = nid();
        changed = true;
      }
    }
    return changed;
  }

  /** Remove connectors whose linked object is gone. Returns true if any removed. */
  private cleanupOrphans(): boolean {
    const map = this.objByIdMap();
    const dead = this.connectors().filter((c) => {
      const s = c.sourceId ? map.get(c.sourceId) : c.sourceFree;
      const t = c.targetId ? map.get(c.targetId) : c.targetFree;
      return !s || !t;
    });
    dead.forEach((c) => this.canvas.remove(c));
    return dead.length > 0;
  }

  private currentAnchorHost(): fabric.FabricObject | null {
    if (this.anchorHost && isConnectable(this.anchorHost) && !isLocked(this.anchorHost))
      return this.anchorHost;
    const a = this.canvas.getActiveObject();
    if (a && isConnectable(a) && !isLocked(a) && this.canvas.getActiveObjects().length === 1)
      return a;
    return null;
  }

  private addConnector(
    sourceId: string,
    sourceAnchor: Anchor,
    targetId: string,
    targetAnchor: Anchor,
    hier = true,
  ): Connector {
    const c = new Connector([0, 0, 0, 0], {
      sourceId,
      sourceAnchor,
      targetId,
      targetAnchor,
      connKind: "arrow",
      stroke: CONNECTOR_STROKE,
      strokeWidth: CONNECTOR_WIDTH,
      hier,
    });
    c.selectable = true;
    c.evented = true;
    this.canvas.add(c);
    this.canvas.sendObjectToBack(c);
    c.syncGeometry(this.objByIdMap());
    return c;
  }

  private spawnNode(
    left = 0,
    top = 0,
    accent: NodeAccent = DEFAULT_NODE_ACCENT,
  ): NodeBox {
    const node = makeNode(left, top, "", accent);
    node.selectable = true;
    node.evented = true;
    this.canvas.add(node);
    return node;
  }

  /** Accent to give a new node spawned from `source` (inherit, else neutral). */
  private inheritedAccent(source: fabric.FabricObject | null): NodeAccent {
    return isNodeBox(source) ? source.ndAccent : DEFAULT_NODE_ACCENT;
  }

  /** Move `o` so its rendered bounds are centered on `p`. */
  private centerAt(o: fabric.FabricObject, p: Pt): void {
    const b = sceneBoundsOf(o);
    o.set({ left: (o.left ?? 0) + (p.x - b.cx), top: (o.top ?? 0) + (p.y - b.cy) });
    o.setCoords();
  }

  /**
   * Place a node by its RENDERED bounds: left edge at x0, vertical center at cy.
   * Padding-expanded nodes (NodeBox) can't be positioned by raw left/top, so we
   * measure and center — the same technique Quick Connect uses.
   */
  private placeNodeLeftAt(o: fabric.FabricObject, x0: number, cy: number): void {
    const b = sceneBoundsOf(o);
    this.centerAt(o, { x: x0 + (b.right - b.left) / 2, y: cy });
  }

  /** Rebuild a polygon/star's points (e.g. side/point count changed) while
   *  preserving its visual bounding box and centre — different polygons inscribe
   *  their reference box differently, so we re-fit scale afterwards. */
  private reshapePoly(o: fabric.Polygon, points: { x: number; y: number }[]): void {
    // Preserve the geometry size (unstroked) so the stroke width can't accumulate
    // across successive reshapes, and keep the centre fixed.
    const geomW = (o.width || 1) * (o.scaleX || 1);
    const geomH = (o.height || 1) * (o.scaleY || 1);
    const b = sceneBoundsOf(o);
    rebuildPolygon(o, points);
    o.set({ scaleX: geomW / (o.width || 1), scaleY: geomH / (o.height || 1) });
    this.centerAt(o, { x: b.cx, y: b.cy });
    o.setCoords();
  }

  private cancelFabricTransform(): void {
    (this.canvas as unknown as { _currentTransform: unknown | null })._currentTransform =
      null;
  }

  /* ---------------------- connector create / reassign --------------------- */

  private startCreateConnector(): void {
    const pending = this.pendingConnect;
    if (!pending) return;
    this.cancelFabricTransform();
    this.canvas.discardActiveObject();
    const src = this.objByIdMap().get(pending.sourceId);
    const sp = src ? anchorScenePoint(src, pending.anchor) : { x: 0, y: 0 };
    const conn = new Connector([sp.x, sp.y, sp.x, sp.y], {
      sourceId: pending.sourceId,
      sourceAnchor: pending.anchor,
      connKind: "arrow",
      stroke: CONNECTOR_STROKE,
      strokeWidth: CONNECTOR_WIDTH,
      targetFree: { x: sp.x, y: sp.y },
    });
    conn.selectable = true;
    conn.evented = true;
    this.canvas.add(conn);
    this.canvas.sendObjectToBack(conn);
    this.connectDrag = { mode: "create", connector: conn, end: "target" };
    this.interacting = true;
    this.canvas.requestRenderAll();
  }

  private startReassign(): void {
    const pending = this.pendingReassign;
    if (!pending) return;
    const c = pending.connector;
    const end = pending.end;
    // Fabric may have just selected the object under the endpoint — take the
    // connector back so the reassignment (not an object move) proceeds.
    this.cancelFabricTransform();
    this.canvas.discardActiveObject();
    this.canvas.setActiveObject(c);
    const cur =
      end === "target"
        ? { x: c.x2 ?? 0, y: c.y2 ?? 0 }
        : { x: c.x1 ?? 0, y: c.y1 ?? 0 };
    if (end === "target") {
      c.targetId = null;
      c.targetFree = cur;
    } else {
      c.sourceId = null;
      c.sourceFree = cur;
    }
    this.connectDrag = { mode: "reassign", connector: c, end };
    this.interacting = true;
  }

  private updateConnectDrag(opt: PointerInfo): void {
    const drag = this.connectDrag;
    if (!drag) return;
    const p = this.canvas.getScenePoint(opt.e);
    const c = drag.connector;
    this.hoverTarget = null;
    let free: Pt = { x: p.x, y: p.y };

    const hovered = opt.target ?? this.canvas.findTarget(opt.e)?.target ?? null;
    const fixedId = drag.end === "target" ? c.sourceId : c.targetId;
    if (
      hovered &&
      isConnectable(hovered) &&
      ndId(hovered) &&
      ndId(hovered) !== fixedId
    ) {
      const a = nearestAnchor(hovered, p);
      const ap = anchorScenePoint(hovered, a);
      this.hoverTarget = { objId: ndId(hovered)!, anchor: a, point: ap };
      free = ap;
    }

    if (drag.end === "target") {
      c.targetId = null;
      c.targetFree = free;
    } else {
      c.sourceId = null;
      c.sourceFree = free;
    }
    c.syncGeometry(this.objByIdMap());
    this.canvas.requestRenderAll();
  }

  private finishConnectDrag(): void {
    const drag = this.connectDrag;
    if (!drag) return;
    this.connectDrag = null;
    this.interacting = false;
    this.canvas.selection = true;
    const c = drag.connector;
    let selectObj: fabric.FabricObject = c;
    let spawned: fabric.FabricObject | null = null;

    if (this.hoverTarget) {
      if (drag.end === "target") {
        c.targetId = this.hoverTarget.objId;
        c.targetAnchor = this.hoverTarget.anchor;
        c.targetFree = null;
      } else {
        c.sourceId = this.hoverTarget.objId;
        c.sourceAnchor = this.hoverTarget.anchor;
        c.sourceFree = null;
      }
      // Linking two pre-existing objects is a freeform link, not a hierarchy edge.
      if (drag.mode === "create") c.hier = false;
      this.hoverTarget = null;
    } else if (drag.mode === "create") {
      const free = drag.end === "target" ? c.targetFree : c.sourceFree;
      const srcPt = { x: c.x1 ?? 0, y: c.y1 ?? 0 };
      if (!free || dist(free, srcPt) < 12) {
        this.canvas.remove(c);
        this.canvas.requestRenderAll();
        this.emit();
        return;
      }
      // Quick Connect: drop a new child node centered on the release point.
      // Center it from its measured bounds, so padding and text-driven sizing
      // can't push the node away from where the pointer let go. The new node is
      // a hierarchy child of the source and inherits its accent.
      const source = c.sourceId ? this.objByIdMap().get(c.sourceId) ?? null : null;
      // Quick-connecting a child off a collapsed node expands it too.
      if (isNodeBox(source) && source.ndCollapsed) source.ndCollapsed = false;
      const node = this.spawnNode(free.x, free.y, this.inheritedAccent(source));
      this.centerAt(node, free);
      c.targetId = ndId(node)!;
      c.targetAnchor = nearestAnchor(node, srcPt);
      c.targetFree = null;
      c.hier = true;
      selectObj = node;
      spawned = node;
    }
    // reassign to empty leaves the free endpoint as-is.

    this.updateConnectors();
    this.applyCollapseVisibility();
    this.canvas.setActiveObject(selectObj);
    // A Quick Connect node opens for typing straight away, like a Tab/Enter one.
    if (spawned) {
      (spawned as fabric.IText).enterEditing?.();
      (spawned as fabric.IText).hiddenTextarea?.focus();
    }
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /* --------------------------- mind-map flow ------------------------------ */

  /** Hierarchical children of a node (via hierarchy edges only). */
  private childrenOf(
    parentId: string,
    map: Map<string, fabric.FabricObject>,
  ): fabric.FabricObject[] {
    const res: fabric.FabricObject[] = [];
    for (const c of this.connectors()) {
      if (isHierEdge(c) && c.sourceId === parentId && c.targetId) {
        const t = map.get(c.targetId);
        if (t) res.push(t);
      }
    }
    return res;
  }

  /** First hierarchical parent of a node, if any. */
  private parentOf(
    nodeId: string,
    map: Map<string, fabric.FabricObject>,
  ): fabric.FabricObject | null {
    for (const c of this.connectors()) {
      if (isHierEdge(c) && c.targetId === nodeId && c.sourceId) {
        const s = map.get(c.sourceId);
        if (s) return s;
      }
    }
    return null;
  }

  /** A node is a mind-map root when it has no hierarchical parent. */
  private isRootNode(nodeId: string, map: Map<string, fabric.FabricObject>): boolean {
    return this.parentOf(nodeId, map) === null;
  }

  /**
   * All descendants of a node (cycle-safe, excludes the node itself). Ordered
   * breadth-first. When `respectCollapse` is true, a collapsed node's subtree is
   * treated as hidden and skipped.
   */
  private descendantsOf(
    rootId: string,
    map: Map<string, fabric.FabricObject>,
    respectCollapse = false,
  ): fabric.FabricObject[] {
    const out: fabric.FabricObject[] = [];
    const seen = new Set<string>([rootId]);
    const queue: string[] = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      const node = map.get(id);
      if (respectCollapse && id !== rootId && isNodeBox(node) && node.ndCollapsed) {
        continue; // its own subtree stays hidden
      }
      for (const child of this.childrenOf(id, map)) {
        const cid = ndId(child);
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        out.push(child);
        queue.push(cid);
      }
    }
    return out;
  }

  /**
   * The full branch rooted at a node: the node, all descendants, and every
   * connector whose endpoints both lie inside that set (hierarchy edges and any
   * internal freeform links alike).
   */
  private branchOf(rootId: string): {
    nodes: fabric.FabricObject[];
    connectors: Connector[];
  } {
    const map = this.objByIdMap();
    const root = map.get(rootId);
    if (!root) return { nodes: [], connectors: [] };
    const nodes = [root, ...this.descendantsOf(rootId, map)];
    const ids = new Set(nodes.map(ndId).filter(Boolean) as string[]);
    const connectors = this.connectors().filter(
      (c) =>
        !!c.sourceId &&
        !!c.targetId &&
        ids.has(c.sourceId) &&
        ids.has(c.targetId),
    );
    return { nodes, connectors };
  }

  /** The active object if it is a single mind-map node, else null. */
  private activeNode(): NodeBox | null {
    const a = this.canvas.getActiveObject();
    return isNodeBox(a) && this.canvas.getActiveObjects().length === 1 ? a : null;
  }

  private focusNewNode(node: fabric.FabricObject): void {
    this.setTool("select");
    // Keep collapse invariants consistent (e.g. a child added under a just-expanded
    // parent) before the new node's state is recorded/persisted.
    this.applyCollapseVisibility();
    this.canvas.setActiveObject(node);
    (node as fabric.IText).enterEditing?.();
    (node as fabric.IText).hiddenTextarea?.focus();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /** True when at least one object is selected. */
  hasActiveSelection(): boolean {
    return this.canvas.getActiveObjects().length > 0;
  }

  /**
   * Start a mind map: create a fresh root node at the viewport centre and open
   * it for typing. Bound to Tab on an empty canvas — no modal, no mode switch.
   */
  createRoot(): void {
    const node = this.spawnNode();
    this.centerAt(node, this.viewportCenterScene());
    this.focusNewNode(node);
  }

  /** Tab: create a child node to the right of the selected node. */
  createChild(): void {
    // Commit any in-progress text edit first (a separate, granular undo step).
    this.exitEditing();
    const sel = this.canvas.getActiveObject();
    if (
      !sel ||
      !isConnectable(sel) ||
      this.canvas.getActiveObjects().length !== 1 ||
      !ndId(sel)
    ) {
      return;
    }
    // Adding a child to a collapsed node expands it, so the new child is visible
    // and editable (rather than born hidden inside the collapsed subtree).
    if (isNodeBox(sel) && sel.ndCollapsed) sel.ndCollapsed = false;
    const pb = sceneBoundsOf(sel);
    const map = this.objByIdMap();
    const children = this.childrenOf(ndId(sel)!, map);
    const node = this.spawnNode(0, 0, this.inheritedAccent(sel));
    const nb = sceneBoundsOf(node);
    let cy = pb.cy;
    if (children.length) {
      let maxBottom = -Infinity;
      for (const ch of children) maxBottom = Math.max(maxBottom, sceneBoundsOf(ch).bottom);
      cy = maxBottom + MINDMAP_GAP_Y + (nb.bottom - nb.top) / 2;
    }
    this.placeNodeLeftAt(node, pb.right + MINDMAP_GAP_X, cy);
    this.addConnector(ndId(sel)!, "right", ndId(node)!, "left", true);
    this.updateConnectors();
    this.focusNewNode(node);
  }

  /** Enter: create a sibling (sharing the selected node's parent when known). */
  createSibling(): void {
    this.exitEditing();
    const sel = this.canvas.getActiveObject();
    if (
      !sel ||
      !isConnectable(sel) ||
      this.canvas.getActiveObjects().length !== 1 ||
      !ndId(sel)
    ) {
      return;
    }
    const map = this.objByIdMap();
    const selB = sceneBoundsOf(sel);
    const parent = this.parentOf(ndId(sel)!, map);
    const node = this.spawnNode(0, 0, this.inheritedAccent(sel));
    const nb = sceneBoundsOf(node);
    const cy = selB.bottom + MINDMAP_GAP_Y + (nb.bottom - nb.top) / 2;
    if (parent) {
      const pb = sceneBoundsOf(parent);
      this.placeNodeLeftAt(node, pb.right + MINDMAP_GAP_X, cy);
      this.addConnector(ndId(parent)!, "right", ndId(node)!, "left", true);
      this.updateConnectors();
      this.focusNewNode(node);
    } else {
      // No parent — a nearby free sibling below the selection, no connector invented.
      this.centerAt(node, { x: selB.cx, y: cy });
      this.focusNewNode(node);
    }
  }

  /** True while a mind-map node is being text-edited (drives the keyboard flow). */
  isEditingNode(): boolean {
    const a = this.canvas.getActiveObject() as
      | (fabric.FabricObject & { isEditing?: boolean })
      | undefined;
    return isNodeBox(a) && Boolean(a?.isEditing);
  }

  /* --------------------------- mind-map operations ------------------------- */

  private toolSelectable(): boolean {
    return this.tool === "select";
  }
  private toolEvented(): boolean {
    return this.tool === "select" || this.tool === "eraser";
  }

  /**
   * Deterministic right-flowing tree layout of the branch rooted at `rootId`.
   * Children flow to the right of their parent; sibling subtrees stack vertically
   * with a consistent gap, using each node's real measured size so nothing
   * overlaps. The root keeps its current position; only descendants move. Applied
   * as a single history action. Collapsed nodes are treated as leaves.
   */
  private arrangeFrom(rootId: string): void {
    const map = this.objByIdMap();
    const root = map.get(rootId);
    if (!root) return;

    // Lay out into a local space (root's left edge at x=0), then translate the
    // whole plan so the root's centre returns to where it is now.
    const plan = new Map<string, { cx: number; cy: number }>();
    const cursor = { y: 0 };
    const visited = new Set<string>();

    const layout = (id: string, leftX: number): number | null => {
      if (visited.has(id)) return null;
      visited.add(id);
      const node = map.get(id);
      if (!node) return null;
      const b = sceneBoundsOf(node);
      const w = b.right - b.left;
      const h = b.bottom - b.top;
      const collapsed = isNodeBox(node) && node.ndCollapsed;
      const children = collapsed
        ? []
        : this.childrenOf(id, map).filter((c) => {
            const cid = ndId(c);
            return !!cid && !visited.has(cid);
          });

      if (children.length === 0) {
        const cy = cursor.y + h / 2;
        cursor.y += h + MINDMAP_GAP_Y;
        plan.set(id, { cx: leftX + w / 2, cy });
        return cy;
      }

      const childLeft = leftX + w + MINDMAP_GAP_X;
      const startY = cursor.y;
      const beforeKeys = new Set(plan.keys());
      const childCys: number[] = [];
      for (const ch of children) {
        const r = layout(ndId(ch)!, childLeft);
        if (r !== null) childCys.push(r);
      }
      let cy = childCys.length
        ? (childCys[0] + childCys[childCys.length - 1]) / 2
        : startY + h / 2;

      // Reserve the parent's OWN height: if it is taller than the vertical band its
      // children occupy, grow the slot to the parent's height and shift the whole
      // child subtree down to stay centred — so a multi-line parent never overlaps
      // the adjacent sibling subtree (above or below).
      const bandH = Math.max(0, cursor.y - MINDMAP_GAP_Y - startY);
      if (h > bandH) {
        const shift = (h - bandH) / 2;
        for (const k of plan.keys()) {
          if (!beforeKeys.has(k)) plan.get(k)!.cy += shift;
        }
        cy = startY + h / 2;
        cursor.y = startY + h + MINDMAP_GAP_Y;
      }

      plan.set(id, { cx: leftX + w / 2, cy });
      return cy;
    };

    layout(rootId, 0);
    const rootPlan = plan.get(rootId);
    if (!rootPlan) return;
    const now = sceneBoundsOf(root);
    const dx = now.cx - rootPlan.cx;
    const dy = now.cy - rootPlan.cy;

    for (const [id, pos] of plan) {
      const node = map.get(id);
      if (node) this.centerAt(node, { x: pos.cx + dx, y: pos.cy + dy });
    }
    this.updateConnectors();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Arrange the branch (or full map, if the node is a root) of the selection. */
  arrangeSelected(): void {
    const node = this.activeNode();
    if (!node || !ndId(node)) return;
    this.arrangeFrom(ndId(node)!);
    this.canvas.setActiveObject(node);
    this.emit();
  }

  /**
   * Recompute node/connector visibility from collapse state. A node is hidden
   * when any hierarchical ancestor is collapsed (nesting-correct); a connector is
   * hidden when either linked end is hidden. Positions are never touched.
   */
  private applyCollapseVisibility(): void {
    const map = this.objByIdMap();
    const hidden = new Set<string>();
    for (const [id] of map) {
      const seen = new Set<string>([id]);
      let cur = this.parentOf(id, map);
      while (cur) {
        const pid = ndId(cur);
        if (!pid || seen.has(pid)) break;
        seen.add(pid);
        if (isNodeBox(cur) && cur.ndCollapsed) {
          hidden.add(id);
          break;
        }
        cur = this.parentOf(pid, map);
      }
    }

    const sel = this.toolSelectable();
    const evt = this.toolEvented();
    for (const [id, node] of map) {
      // Nested group children are managed by their group, not by collapse.
      if (node.group) continue;
      const vis = !hidden.has(id);
      // Locked objects keep their own interactivity (always non-interactive);
      // collapse may still hide/show them but never re-enables selection.
      if (isLocked(node)) {
        if (node.visible !== vis) node.set({ visible: vis });
        continue;
      }
      if (node.visible !== vis || (node.selectable !== (vis && sel))) {
        node.set({ visible: vis, selectable: vis && sel, evented: vis && evt });
      }
    }
    for (const c of this.connectors()) {
      const sOk = c.sourceId ? !hidden.has(c.sourceId) : true;
      const tOk = c.targetId ? !hidden.has(c.targetId) : true;
      const vis = sOk && tOk;
      if (c.visible !== vis) {
        c.set({ visible: vis, selectable: vis && sel, evented: vis && evt });
      }
    }
    this.canvas.requestRenderAll();
  }

  /** Toggle collapse/expand of the selected node's branch (one history action). */
  toggleCollapseSelected(): void {
    const node = this.activeNode();
    if (!node || !ndId(node)) return;
    if (this.childrenOf(ndId(node)!, this.objByIdMap()).length === 0) return;
    node.ndCollapsed = !node.ndCollapsed;
    this.applyCollapseVisibility();
    this.canvas.setActiveObject(node); // the collapsed node itself stays visible
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /** Select the whole branch (node + descendants + their internal connectors). */
  selectBranchSelected(): void {
    const node = this.activeNode();
    if (!node || !ndId(node)) return;
    const { nodes, connectors } = this.branchOf(ndId(node)!);
    const objs: fabric.FabricObject[] = [...nodes, ...connectors];
    if (objs.length === 0) return;
    this.setTool("select");
    this.canvas.discardActiveObject();
    if (objs.length === 1) {
      this.canvas.setActiveObject(objs[0]);
    } else {
      const selection = new fabric.ActiveSelection(objs, { canvas: this.canvas });
      this.canvas.setActiveObject(selection);
    }
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Duplicate the whole branch with fresh ids, offset slightly (atomic). */
  async duplicateBranchSelected(): Promise<void> {
    const node = this.activeNode();
    if (!node || !ndId(node)) return;
    const { nodes, connectors } = this.branchOf(ndId(node)!);
    await this.cloneAndPlace(nodes, connectors, 28, 28);
  }

  /* ------------------------------ tool defaults --------------------------- */

  setDefaults(patch: Partial<ToolDefaults>): void {
    this.defaults = { ...this.defaults, ...patch };
    this.configureBrush();
  }

  /** Update the persisted preferences for a single drawing instrument. */
  setDrawPref(tool: DrawTool, patch: Partial<DrawToolPrefs>): void {
    this.defaults.draw[tool] = { ...this.defaults.draw[tool], ...patch };
    if (this.tool === tool) this.configureBrush();
  }

  /** Configure the freehand engine from the active drawing tool's material +
   *  its persisted preferences. The registry's brush spec gates this, proving the
   *  tool-registry pattern drives the whole drawing family. */
  private configureBrush(): void {
    const tool = this.tool;
    if (!isDrawTool(tool) || brushSpecFor(tool)?.kind !== "freehand") return;
    const mat = materialFor(tool);
    const p = this.defaults.draw[tool];
    this.freehand.configure({
      color: p.color,
      size: p.width,
      opacity: p.opacity,
      stabilization: p.stabilization,
      pressure: p.pressure,
      smoothing: mat.smoothing,
      thinning: mat.thinning,
      dynamics: mat.dynamics,
      brushId: tool,
    });
    this.updateBrushCursor();
  }

  /** A circle cursor approximating the current brush footprint, visible on both
   *  white canvas and dark chrome. */
  private updateBrushCursor(): void {
    if (!isDrawTool(this.tool)) return;
    const d = this.defaults.draw[this.tool].width * this.canvas.getZoom();
    this.canvas.freeDrawingCursor = brushCursor(d);
  }

  /** Freehand engine diagnostics from the last completed stroke (perf report). */
  lastStrokeStats(): { raw: number; kept: number; outline: number } {
    return {
      raw: this.freehand.lastRawCount,
      kept: this.freehand.lastKeptCount,
      outline: this.freehand.lastOutlineCount,
    };
  }

  /* -------------------------------- tools --------------------------------- */

  setTool(tool: Tool): void {
    // Leaving select for another tool ends any active crop (restoring the image)
    // and commits any in-progress text edit — no stale mode carries over.
    if (this.cropState && tool !== "select") this.cancelCrop();
    if (this.isEditing()) this.exitEditing();
    // Abandon any half-finished draft/stroke/lasso/guide so a gesture interrupted
    // by a tool-shortcut keypress can't bleed a phantom object into the new tool.
    this.resetTransientInteraction();
    this.tool = tool;
    this.applyToolMode();
    this.emit();
  }

  getTool(): Tool {
    return this.tool;
  }

  isEditing(): boolean {
    const active = this.canvas.getActiveObject() as
      | (fabric.FabricObject & { isEditing?: boolean })
      | undefined;
    return Boolean(active?.isEditing);
  }

  /** True when the current single selection is a connectable node. */
  canBranch(): boolean {
    const a = this.canvas.getActiveObject();
    return Boolean(
      a && isConnectable(a) && this.canvas.getActiveObjects().length === 1,
    );
  }

  exitEditing(): void {
    const active = this.canvas.getActiveObject() as
      | (fabric.FabricObject & { isEditing?: boolean; exitEditing?: () => void })
      | undefined;
    if (active?.isEditing && active.exitEditing) {
      active.exitEditing();
      this.canvas.requestRenderAll();
    }
  }

  isSpaceDown(): boolean {
    return this.spaceDown;
  }

  setSpace(down: boolean): void {
    this.spaceDown = down;
    this.canvas.defaultCursor = down ? "grab" : this.baseCursor();
    this.canvas.setCursor(this.canvas.defaultCursor);
  }

  private baseCursor(): string {
    switch (this.tool) {
      case "select":
        return "default";
      case "text":
        return "text";
      case "eraser":
        return brushCursor(26);
      case "hand":
        return "grab";
      default:
        return "crosshair";
    }
  }

  private applyToolMode(): void {
    const c = this.canvas;
    c.isDrawingMode = isDrawTool(this.tool);
    if (isDrawTool(this.tool)) this.configureBrush();

    c.selection = this.tool === "select";
    c.skipTargetFind = !(this.tool === "select" || this.tool === "eraser");
    c.defaultCursor = this.baseCursor();
    c.hoverCursor = this.tool === "select" ? "move" : this.baseCursor();

    const selectable = this.tool === "select";
    const evented = this.tool === "select" || this.tool === "eraser";
    c.forEachObject((o) => {
      // Locked objects are always visible but never interactive (unlock is via
      // the lock badge / alt-click, which re-enable them explicitly). Re-apply
      // the full transform locks too — they aren't serialized, so this restores
      // them after a reload as defense-in-depth.
      if (isLocked(o)) {
        o.set({
          selectable: false,
          evented: false,
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
          hasControls: false,
        });
        return;
      }
      // Collapsed (hidden) objects stay non-interactive across tool changes.
      const vis = o.visible !== false;
      o.selectable = selectable && vis;
      o.evented = evented && vis;
    });

    if (this.tool !== "select") {
      c.discardActiveObject();
      this.anchorHost = null;
      this.connectDrag = null;
      this.hoverTarget = null;
    }
    c.requestRenderAll();
  }

  /* ------------------------------- styling -------------------------------- */

  /** Apply a style patch to the selection. `commit` false = a live drag preview
   *  (no history entry, no persist); the caller records once on release. */
  applyStyle(patch: StylePatch, commit = true): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;

    for (const obj of objs) {
      const k = kindOf(obj);

      if (patch.opacity !== undefined) obj.set("opacity", patch.opacity);

      if (k === "connector") {
        const c = obj as Connector;
        if (patch.stroke !== undefined) c.set("stroke", patch.stroke);
        if (patch.strokeWidth !== undefined) c.set("strokeWidth", patch.strokeWidth);
        if (patch.hasArrow !== undefined) c.connKind = patch.hasArrow ? "arrow" : "straight";
        c.set("dirty", true);
        continue;
      }

      if (patch.stroke !== undefined) {
        if (obj instanceof fabric.Group) styleArrow(obj, { stroke: patch.stroke });
        else if (k === "path" && isInkPath(obj)) obj.set("fill", patch.stroke);
        else if (k === "shape" || k === "path" || k === "line")
          obj.set("stroke", patch.stroke);
      }
      if (patch.strokeWidth !== undefined) {
        if (obj instanceof fabric.Group)
          styleArrow(obj, { strokeWidth: patch.strokeWidth });
        // Ink width is baked into the filled outline geometry — not retro-editable.
        else if ((k === "shape" || k === "path" || k === "line") && !isInkPath(obj))
          obj.set("strokeWidth", patch.strokeWidth);
      }
      if (patch.fill !== undefined) {
        if (k === "shape" && !(obj instanceof fabric.Group)) obj.set("fill", patch.fill);
      }
      if (patch.dash !== undefined && (k === "shape" || k === "line")) {
        obj.set("strokeDashArray", DASH_ARRAYS[patch.dash]);
        obj.set("dirty", true);
      }
      if (patch.radius !== undefined && (obj as { ndShape?: string }).ndShape === "roundrect") {
        (obj as fabric.Rect).set({ rx: patch.radius, ry: patch.radius });
      }
      if (patch.sides !== undefined && (obj as { ndShape?: string }).ndShape === "polygon") {
        this.reshapePoly(obj as fabric.Polygon, polygonPoints(patch.sides));
        (obj as { ndSides?: number }).ndSides = patch.sides;
      }
      if (
        (patch.starPoints !== undefined || patch.starInner !== undefined) &&
        (obj as { ndShape?: string }).ndShape === "star"
      ) {
        const so = obj as fabric.Polygon & { ndPoints?: number; ndInner?: number };
        const pts = patch.starPoints ?? so.ndPoints ?? 5;
        const inner = patch.starInner ?? so.ndInner ?? 0.45;
        this.reshapePoly(so, starPoints(pts, inner));
        so.ndPoints = pts;
        so.ndInner = inner;
      }
      if (patch.startHead !== undefined && obj instanceof NdLine) {
        obj.startHead = patch.startHead;
        obj.set("dirty", true);
      }
      if (patch.endHead !== undefined && obj instanceof NdLine) {
        obj.endHead = patch.endHead;
        obj.set("dirty", true);
      }
      if (patch.nodeAccent !== undefined && isNodeBox(obj)) {
        obj.setAccent(patch.nodeAccent as NodeAccent);
        continue;
      }
      // Whole-object text formatting: applies to free text and sticky notes.
      // Mind-map nodes are accent-driven and stay immune to it.
      const isFreeText = k === "text" && !isNodeBox(obj);
      const textish = isFreeText || k === "note";
      let reflow = false;
      if (patch.textColor !== undefined && textish) obj.set("fill", patch.textColor);
      if (patch.noteFill !== undefined && k === "note") {
        obj.set("backgroundColor", patch.noteFill);
      }
      // Font family is also allowed on mind-map nodes (a handwritten mind map is
      // a deliberate look) — it doesn't touch the accent-driven color/geometry.
      if (patch.fontFamily !== undefined && (textish || isNodeBox(obj))) {
        obj.set("fontFamily", patch.fontFamily);
        reflow = true;
      }
      if (patch.fontSize !== undefined && textish) {
        obj.set("fontSize", patch.fontSize);
        reflow = true;
      }
      if (patch.bold !== undefined && textish) {
        obj.set("fontWeight", patch.bold ? "bold" : "normal");
        reflow = true;
      }
      if (patch.italic !== undefined && textish) {
        obj.set("fontStyle", patch.italic ? "italic" : "normal");
        reflow = true;
      }
      if (patch.underline !== undefined && textish) {
        obj.set("underline", patch.underline);
      }
      if (patch.lineHeight !== undefined && textish) {
        obj.set("lineHeight", patch.lineHeight);
        reflow = true;
      }
      if (patch.textAlign !== undefined && textish) obj.set("textAlign", patch.textAlign);
      if (patch.listStyle !== undefined && textish) {
        this.applyListStyle(obj as fabric.Textbox, patch.listStyle);
        reflow = true;
      }
      if (reflow) {
        const tb = obj as fabric.Textbox;
        tb.initDimensions?.();
        tb.setCoords();
        this.fitAutoGrow(tb);
      }
      obj.set("dirty", true);
    }

    this.updateConnectors();
    this.canvas.requestRenderAll();
    // Never record mid-edit: a format tap while the box is being typed into would
    // fragment the single edit — text:editing:exited captures the final state.
    if (commit && !this.isEditing()) {
      this.recordHistory();
      this.schedulePersist();
    }
  }

  /** Toggle a bullet / checklist line-prefix over every line of a text box.
   *  Whole-object (no per-character cursor surgery), so it stays reliable. */
  private applyListStyle(t: fabric.Textbox, style: "none" | "bullet" | "check"): void {
    const prefix =
      style === "bullet" ? BULLET_PREFIX : style === "check" ? CHECK_PREFIX : "";
    const lines = (t.text ?? "").split("\n").map((ln) => {
      // Strip only the marker and its (≤2) prefix spaces — never the content's
      // own leading indentation.
      const bare = ln.replace(/^[•☐☑] {0,2}/, "");
      return style === "none" ? bare : prefix + bare;
    });
    t.set("text", lines.join("\n"));
  }

  /** Apply a sticky-note size preset (card width + font size). Bakes out any
   *  prior corner-scale so the padded card, shadow, and border stay crisp, and
   *  keeps the card centered where it was. One history entry. */
  setNoteSize(cardWidth: number, fontSize: number): void {
    const notes = this.canvas
      .getActiveObjects()
      .filter((o) => kindOf(o) === "note" && !isLocked(o));
    if (notes.length === 0) return;
    // Drop out of the ActiveSelection so each note reports canvas-space bounds
    // and centerAt's scene delta is applied in its own frame (matches
    // align/distribute) — otherwise a scaled/rotated selection mis-sizes them.
    this.canvas.discardActiveObject();
    for (const n of notes) {
      const b = sceneBoundsOf(n);
      (n as fabric.Textbox).set({
        scaleX: 1,
        scaleY: 1,
        width: Math.max(40, cardWidth - NOTE_PAD * 2),
        fontSize,
      });
      (n as fabric.Textbox).initDimensions?.();
      this.centerAt(n, { x: b.cx, y: b.cy });
      n.setCoords();
    }
    this.reselect(notes);
    this.updateConnectors();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /* ------------------------- duplicate / clipboard ------------------------ */

  private gatherForClone(active: fabric.FabricObject[]): {
    nodes: fabric.FabricObject[];
    connectors: Connector[];
  } {
    const nodes = active.filter((o) => ndRole(o) !== "connector");
    if (nodes.length === 0) {
      return {
        nodes: [],
        connectors: active.filter((o) => ndRole(o) === "connector") as Connector[],
      };
    }
    // Include ids nested inside selected groups, so connectors internal to a
    // group are carried along when the group is duplicated/copied.
    const nodeIds = new Set(nodes.flatMap((n) => this.allIdsIn(n)));
    const connectors = this.connectors().filter(
      (c) =>
        !!c.sourceId &&
        !!c.targetId &&
        nodeIds.has(c.sourceId) &&
        nodeIds.has(c.targetId),
    );
    return { nodes, connectors };
  }

  private async cloneAndPlace(
    nodes: fabric.FabricObject[],
    connectors: Connector[],
    dx: number,
    dy: number,
  ): Promise<void> {
    const idMap = new Map<string, string>();
    const clones: fabric.FabricObject[] = [];

    for (const n of nodes) {
      const cl = await n.clone(NOTEDRIFT_PROPS);
      const newId = nid();
      const old = ndId(n);
      if (old) idMap.set(old, newId);
      (cl as NdObj).ndId = newId;
      (cl as NdObj).ndRole = ndRole(n);
      // Duplicating a group: give every nested connectable child a fresh id and
      // record the mapping, so internal connectors rewire to the copies (never
      // to the originals) and ids stay globally unique. Recurse into sub-groups
      // so a group-of-groups remaps at every depth.
      if (cl instanceof fabric.Group) {
        const remap = (g: fabric.Group): void => {
          for (const child of g.getObjects()) {
            if (ndRole(child) === "connector") continue;
            const oldChild = ndId(child);
            if (oldChild) {
              const newChild = nid();
              idMap.set(oldChild, newChild);
              (child as NdObj).ndId = newChild;
            }
            if (child instanceof fabric.Group) remap(child);
          }
        };
        remap(cl);
      }
      cl.set({
        left: (cl.left ?? 0) + dx,
        top: (cl.top ?? 0) + dy,
        evented: true,
        selectable: true,
      });
      this.canvas.add(cl);
      clones.push(cl);
    }

    for (const c of connectors) {
      const cc = (await c.clone(NOTEDRIFT_PROPS)) as Connector;
      cc.ndId = nid();
      cc.ndRole = "connector";
      cc.sourceId = c.sourceId ? idMap.get(c.sourceId) ?? c.sourceId : null;
      cc.targetId = c.targetId ? idMap.get(c.targetId) ?? c.targetId : null;
      if (cc.sourceFree) cc.sourceFree = { x: cc.sourceFree.x + dx, y: cc.sourceFree.y + dy };
      if (cc.targetFree) cc.targetFree = { x: cc.targetFree.x + dx, y: cc.targetFree.y + dy };
      cc.set({ evented: true, selectable: true, lockMovementX: true, lockMovementY: true });
      this.canvas.add(cc);
      this.canvas.sendObjectToBack(cc);
      clones.push(cc);
    }

    this.updateConnectors();
    this.applyCollapseVisibility();
    this.setTool("select");
    this.canvas.discardActiveObject();
    if (clones.length === 1) {
      this.canvas.setActiveObject(clones[0]);
    } else if (clones.length > 1) {
      const sel = new fabric.ActiveSelection(clones, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
    }
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  async copySelection(): Promise<void> {
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) {
      this.clipboard = null;
      return;
    }
    const g = this.gatherForClone(active);
    const nodes = await Promise.all(g.nodes.map((o) => o.clone(NOTEDRIFT_PROPS)));
    const connectors = (await Promise.all(
      g.connectors.map((o) => o.clone(NOTEDRIFT_PROPS)),
    )) as Connector[];
    this.clipboard = { nodes, connectors };
  }

  async pasteClipboard(): Promise<void> {
    if (!this.clipboard) return;
    await this.cloneAndPlace(this.clipboard.nodes, this.clipboard.connectors, 24, 24);
  }

  async duplicateSelection(): Promise<void> {
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) return;
    const g = this.gatherForClone(active);
    await this.cloneAndPlace(g.nodes, g.connectors, 24, 24);
  }

  selectAllObjects(): void {
    this.setTool("select");
    // Exclude locked objects — they must never enter a selection (a locked
    // object folded into an ActiveSelection could be dragged with the group,
    // since Fabric ignores per-child lock flags during a group transform).
    const objs = this.canvas.getObjects().filter((o) => !isLocked(o));
    if (objs.length === 0) return;
    this.canvas.discardActiveObject();
    if (objs.length === 1) {
      this.canvas.setActiveObject(objs[0]);
    } else {
      const sel = new fabric.ActiveSelection(objs, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
    }
    this.canvas.requestRenderAll();
    this.emit();
  }

  /* ------------------------------ layer order ----------------------------- */

  private layerOp(fn: (o: fabric.FabricObject) => void): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;
    objs.forEach(fn);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  bringForward(): void {
    this.layerOp((o) => this.canvas.bringObjectForward(o));
  }
  sendBackward(): void {
    this.layerOp((o) => this.canvas.sendObjectBackwards(o));
  }
  bringToFront(): void {
    this.layerOp((o) => this.canvas.bringObjectToFront(o));
  }
  sendToBack(): void {
    this.layerOp((o) => this.canvas.sendObjectToBack(o));
  }

  /* --------------------------- group / organize --------------------------- */

  /** Combine the current multi-selection into one movable group. Smart
   *  connectors stay TOP-LEVEL relationship objects (never folded into the
   *  group); only their endpoint nodes move inside it, and `objByIdMap` resolves
   *  those nested nodes so the connectors keep tracking. */
  groupSelection(): void {
    const active = this.canvas.getActiveObjects();
    const groupable = active.filter(
      (o) => ndRole(o) !== "connector" && !isLocked(o),
    );
    if (groupable.length < 2) return;

    // Preserve stacking order (getActiveObjects() is selection order, not
    // z-order) so the group looks identical to the loose objects.
    const ordered = this.canvas
      .getObjects()
      .filter((o) => groupable.includes(o));

    this.canvas.discardActiveObject();
    // Detach from the canvas first — the objects keep their canvas-space
    // transforms, and the Group constructor then makes each child relative to
    // the new group's center without any visible jump.
    for (const o of ordered) this.canvas.remove(o);
    const group = new fabric.Group(ordered);
    (group as NdObj).ndRole = "group";
    (group as NdObj).ndId = nid();
    group.set({ selectable: true, evented: true });
    this.canvas.add(group);
    this.canvas.setActiveObject(group);

    this.updateConnectors();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Break the selected user group back into its members, preserving each
   *  member's exact visible transform (position, scale, rotation, flip). */
  ungroupSelection(): void {
    const active = this.canvas.getActiveObject();
    if (!active || !isUserGroup(active)) return;
    const group = active;

    this.canvas.discardActiveObject();
    // removeAll() applies the group transform back onto every child, so they
    // land in canvas space exactly where they appeared inside the group.
    const items = group.removeAll();
    this.canvas.remove(group);
    for (const o of items) {
      o.set({ selectable: true, evented: true });
      this.canvas.add(o);
    }
    if (items.length === 1) {
      this.canvas.setActiveObject(items[0]);
    } else if (items.length > 1) {
      const sel = new fabric.ActiveSelection(items, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
    }

    this.updateConnectors();
    this.applyCollapseVisibility();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Lock the selection: it stays visible but can't be selected, moved, scaled,
   *  rotated or deleted. Drawing over a locked object still works. */
  lockSelection(): void {
    const active = this.canvas.getActiveObjects();
    const targets = active.filter((o) => !isLocked(o));
    if (targets.length === 0) return;
    for (const o of targets) {
      (o as { ndLocked?: boolean }).ndLocked = true;
      o.set({
        selectable: false,
        evented: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
      });
    }
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Unlock the currently (alt-)selected locked objects. */
  unlockSelection(): void {
    const active = this.canvas.getActiveObjects();
    const targets = active.filter((o) => isLocked(o));
    if (targets.length === 0) return;
    for (const o of targets) {
      (o as { ndLocked?: boolean }).ndLocked = false;
      o.set({
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        lockRotation: false,
        hasControls: true,
      });
    }
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /**
   * Align every selected object to a shared edge or centerline, computed from
   * the collective scene bounds of the selection. One history entry.
   */
  alignSelection(edge: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"): void {
    // Only movable objects participate: connectors follow their nodes, and
    // locked objects must not be repositioned.
    const movable = this.canvas
      .getActiveObjects()
      .filter((o) => ndRole(o) !== "connector" && !isLocked(o));
    if (movable.length < 2) return;

    // Drop out of the ActiveSelection so each object reports canvas-space bounds.
    this.canvas.discardActiveObject();
    const items = movable.map((o) => ({ o, b: sceneBoundsOf(o) }));
    const left = Math.min(...items.map((i) => i.b.left));
    const right = Math.max(...items.map((i) => i.b.right));
    const top = Math.min(...items.map((i) => i.b.top));
    const bottom = Math.max(...items.map((i) => i.b.bottom));
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;

    for (const { o, b } of items) {
      const w = b.right - b.left;
      const h = b.bottom - b.top;
      let nx = b.cx;
      let ny = b.cy;
      if (edge === "left") nx = left + w / 2;
      else if (edge === "right") nx = right - w / 2;
      else if (edge === "hcenter") nx = cx;
      else if (edge === "top") ny = top + h / 2;
      else if (edge === "bottom") ny = bottom - h / 2;
      else if (edge === "vcenter") ny = cy;
      this.centerAt(o, { x: nx, y: ny });
      o.setCoords();
    }

    this.reselect(movable);
    this.updateConnectors();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /**
   * Distribute ≥3 selected objects so the gaps BETWEEN their scene bounds are
   * equal along one axis. The two extreme objects stay put. One history entry.
   */
  distributeSelection(axis: "h" | "v"): void {
    // Connectors and locked objects are excluded — only real, movable nodes are
    // spaced (a connector's bounds would otherwise consume a slot in the gaps).
    const movable = this.canvas
      .getActiveObjects()
      .filter((o) => ndRole(o) !== "connector" && !isLocked(o));
    if (movable.length < 3) return;

    this.canvas.discardActiveObject();
    const items = movable.map((o) => ({ o, b: sceneBoundsOf(o) }));
    const horizontal = axis === "h";
    items.sort((a, z) => (horizontal ? a.b.cx - z.b.cx : a.b.cy - z.b.cy));

    const first = items[0].b;
    const last = items[items.length - 1].b;
    const span = horizontal ? last.right - first.left : last.bottom - first.top;
    const sizes = items.map((i) =>
      horizontal ? i.b.right - i.b.left : i.b.bottom - i.b.top,
    );
    const sumSizes = sizes.reduce((s, v) => s + v, 0);
    const gap = (span - sumSizes) / (items.length - 1);

    let cursor = horizontal ? first.left : first.top;
    for (let i = 0; i < items.length; i++) {
      const { o, b } = items[i];
      const size = sizes[i];
      const centerAlong = cursor + size / 2;
      if (horizontal) this.centerAt(o, { x: centerAlong, y: b.cy });
      else this.centerAt(o, { x: b.cx, y: centerAlong });
      o.setCoords();
      cursor += size + gap;
    }

    this.reselect(movable);
    this.updateConnectors();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Restore a multi-selection after a batch move (align/distribute). */
  private reselect(objs: fabric.FabricObject[]): void {
    if (objs.length === 1) {
      this.canvas.setActiveObject(objs[0]);
    } else if (objs.length > 1) {
      const sel = new fabric.ActiveSelection(objs, { canvas: this.canvas });
      this.canvas.setActiveObject(sel);
    }
  }

  /* -------------------------------- lasso --------------------------------- */

  /** Close the lasso: select every top-level object it captured, then return to
   *  the select tool. Selection only — no history, no persist, no export. */
  private finishLasso(): void {
    const poly = this.lassoPts;
    this.lassoing = false;
    this.lassoPts = [];

    const matches: fabric.FabricObject[] = [];
    if (poly.length >= 3) {
      for (const o of this.canvas.getObjects()) {
        if (ndRole(o) === "connector") continue; // connectors follow their nodes
        if (isLocked(o)) continue;
        if (o.visible === false) continue;
        if (this.lassoHits(o, poly)) matches.push(o);
      }
    }

    this.setTool("select");
    this.canvas.discardActiveObject();
    this.reselect(matches);
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Lasso hit rule: an object is captured when its scene-space CENTER lies
   *  inside the lasso polygon, OR at least two of its four scene bounding-box
   *  corners lie inside it (a meaningful overlap). */
  private lassoHits(o: fabric.FabricObject, poly: Pt[]): boolean {
    const b = sceneBoundsOf(o);
    if (pointInPolygon({ x: b.cx, y: b.cy }, poly)) return true;
    const corners: Pt[] = [
      { x: b.left, y: b.top },
      { x: b.right, y: b.top },
      { x: b.right, y: b.bottom },
      { x: b.left, y: b.bottom },
    ];
    let inside = 0;
    for (const c of corners) if (pointInPolygon(c, poly)) inside++;
    return inside >= 2;
  }

  /** Topmost locked object whose scene bounds contain a scene point. */
  private lockedObjectAt(p: Pt): fabric.FabricObject | null {
    const objs = this.canvas.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (!isLocked(o) || o.visible === false) continue;
      const b = sceneBoundsOf(o);
      if (p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom) return o;
    }
    return null;
  }

  /** Topmost locked object whose padlock badge is under a screen point. This is
   *  the touch-friendly unlock affordance (the badge is a visible tap target, so
   *  a locked object can be reselected without a keyboard / alt-click). */
  private lockBadgeHostAt(vp: Pt): fabric.FabricObject | null {
    const objs = this.canvas.getObjects();
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (!isLocked(o) || o.visible === false) continue;
      const b = sceneBoundsOf(o);
      const badge = this.toScreen({ x: b.left, y: b.top });
      if (dist(vp, { x: badge.x + 9, y: badge.y + 9 }) <= 16) return o;
    }
    return null;
  }

  /* ------------------------------ undo/redo ------------------------------- */

  undo(): void {
    const state = this.history.undo();
    if (state !== null) void this.loadSnapshot(state);
  }

  redo(): void {
    const state = this.history.redo();
    if (state !== null) void this.loadSnapshot(state);
  }

  private runExclusive(task: () => Promise<void>): Promise<void> {
    const run = this.loadQueue.then(task, task);
    this.loadQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private loadSnapshot(json: string): Promise<void> {
    return this.runExclusive(async () => {
      this.cropState = null; // any crop-in-progress targets a stale object now
      this.suppress = true;
      this.resetTransientInteraction(); // undo/redo mustn't leave a draft/overlay
      try {
        await this.canvas.loadFromJSON(JSON.parse(json), brokenImageReviver);
      } finally {
        this.suppress = false;
      }
      this.applyToolMode();
      this.updateConnectors();
      this.applyCollapseVisibility();
      this.canvas.requestRenderAll();
      this.emit();
      this.schedulePersist();
    });
  }

  /* -------------------------------- zoom ---------------------------------- */

  private applyZoom(zoom: number, at?: { x: number; y: number }): void {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const point = at
      ? new fabric.Point(at.x, at.y)
      : new fabric.Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2);
    this.canvas.zoomToPoint(point, z);
    // A zoom rescales viewportTransform, invalidating the absolute keyboard-pan
    // delta — forget it so closing the keyboard doesn't lurch the view.
    this.keyboardPan = 0;
    this.updateGrid();
    this.updateBrushCursor();
    this.emit();
  }

  zoomIn(): void {
    this.applyZoom(this.canvas.getZoom() * 1.2);
  }
  zoomOut(): void {
    this.applyZoom(this.canvas.getZoom() / 1.2);
  }
  resetZoom(): void {
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.keyboardPan = 0;
    this.updateGrid();
    this.updateBrushCursor();
    this.emit();
  }

  /** Frame the current selection with comfortable padding. */
  fitSelection(): void {
    this.fitToObjects(this.canvas.getActiveObjects());
  }

  /** Frame all visible canvas objects with comfortable padding. */
  fitContent(): void {
    const objs = this.canvas.getObjects().filter((o) => o.visible !== false);
    this.fitToObjects(objs);
  }

  /** Zoom+pan so the given objects fill the viewport (minus padding). No-op for
   *  an empty set; clamps to the zoom limits and never jumps to extremes. */
  private fitToObjects(objs: fabric.FabricObject[]): void {
    if (objs.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const o of objs) {
      const b = sceneBoundsOf(o);
      minX = Math.min(minX, b.left);
      minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.right);
      maxY = Math.max(maxY, b.bottom);
    }
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const cw = this.canvas.getWidth();
    const ch = this.canvas.getHeight();
    const PAD = 64; // screen px
    const z = clamp(
      Math.min((cw - PAD * 2) / w, (ch - PAD * 2) / h),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.canvas.setZoom(z);
    const vpt = this.canvas.viewportTransform;
    vpt[4] = cw / 2 - cx * z;
    vpt[5] = ch / 2 - cy * z;
    this.canvas.setViewportTransform(vpt);
    this.keyboardPan = 0;
    this.updateGrid();
    this.updateBrushCursor();
    this.emit();
  }

  /* --------------------------------- eraser ------------------------------- */

  setEraserMode(mode: EraserMode): void {
    this.eraserMode = mode;
    this.emit();
  }

  getEraserMode(): EraserMode {
    return this.eraserMode;
  }

  /** Erase one object under the eraser: skips locked objects; in "stroke" mode
   *  only removes freehand strokes (never images/shapes/smart connectors); in
   *  "object" mode removes the whole object and cascades its connectors. */
  private eraseObject(o: fabric.FabricObject): void {
    if (isLocked(o)) return;
    if (this.eraserMode === "stroke" && !isFreehandStroke(o)) return;
    const ids = this.eraserMode === "object" ? this.allIdsIn(o) : [];
    this.canvas.remove(o);
    this.erasedAny = true;
    if (ids.length) {
      const idset = new Set(ids);
      for (const c of this.connectors()) {
        if (
          (c.sourceId && idset.has(c.sourceId)) ||
          (c.targetId && idset.has(c.targetId))
        ) {
          this.canvas.remove(c);
        }
      }
    }
  }

  /* --------------------------- canvas appearance -------------------------- */

  setCanvasStyle(style: CanvasStyle): void {
    this.canvasStyle = style;
    const el = this.paperEl;
    // Each style is a lightweight CSS gradient (never Fabric objects). `spacings`
    // holds one base cell size per gradient layer, scaled by zoom in updateGrid.
    let image = "none";
    let spacings: number[] = [];
    if (style === "dots") {
      image = `radial-gradient(circle, ${GRID_COLOR} 1.3px, transparent 1.3px)`;
      spacings = [GRID_SIZE];
    } else if (style === "grid") {
      image =
        `linear-gradient(to right, ${GRID_LINE_COLOR} 1px, transparent 1px), ` +
        `linear-gradient(to bottom, ${GRID_LINE_COLOR} 1px, transparent 1px)`;
      spacings = [GRID_SIZE, GRID_SIZE];
    } else if (style === "lines") {
      image = `linear-gradient(to bottom, ${PAPER_RULE_COLOR} 1px, transparent 1px)`;
      spacings = [PAPER_RULE_ROW];
    } else if (style === "graph") {
      const m = PAPER_GRAPH_MINOR_SIZE;
      image =
        `linear-gradient(to right, ${PAPER_GRAPH_MAJOR} 1px, transparent 1px), ` +
        `linear-gradient(to bottom, ${PAPER_GRAPH_MAJOR} 1px, transparent 1px), ` +
        `linear-gradient(to right, ${PAPER_GRAPH_MINOR} 1px, transparent 1px), ` +
        `linear-gradient(to bottom, ${PAPER_GRAPH_MINOR} 1px, transparent 1px)`;
      spacings = [m * 5, m * 5, m, m];
    } else if (style === "engineering") {
      const m = PAPER_GRAPH_MINOR_SIZE;
      image =
        `linear-gradient(to right, ${PAPER_ENG_COLOR} 1.1px, transparent 1.1px), ` +
        `linear-gradient(to bottom, ${PAPER_ENG_COLOR} 1.1px, transparent 1.1px), ` +
        `linear-gradient(to right, ${PAPER_ENG_COLOR} 0.5px, transparent 0.5px), ` +
        `linear-gradient(to bottom, ${PAPER_ENG_COLOR} 0.5px, transparent 0.5px)`;
      spacings = [m * 5, m * 5, m, m];
    }
    el.style.backgroundImage = image;
    this.paperSpacings = spacings;
    this.updateGrid();
    this.emit();
  }

  private paperSpacings: number[] = [GRID_SIZE];

  private updateGrid(): void {
    if (this.canvasStyle === "blank" || this.paperSpacings.length === 0) return;
    const vpt = this.canvas.viewportTransform;
    const zoom = this.canvas.getZoom();
    this.paperEl.style.backgroundSize = this.paperSpacings
      .map((s) => {
        const px = s * zoom;
        return `${px}px ${px}px`;
      })
      .join(", ");
    this.paperEl.style.backgroundPosition = this.paperSpacings
      .map(() => `${vpt[4]}px ${vpt[5]}px`)
      .join(", ");
  }

  /* ------------------------------ selection ------------------------------- */

  deleteSelection(): void {
    // Locked objects are protected from deletion.
    const active = this.canvas.getActiveObjects().filter((o) => !isLocked(o));
    if (active.length === 0) return;
    const toRemove = new Set<fabric.FabricObject>(active);
    // Include ids nested inside groups so a deleted group takes its connectors.
    const selectedIds = new Set<string>();
    for (const o of active) for (const id of this.allIdsIn(o)) selectedIds.add(id);
    // Cascade: remove connectors attached to any deleted node.
    for (const c of this.connectors()) {
      if (
        (c.sourceId && selectedIds.has(c.sourceId)) ||
        (c.targetId && selectedIds.has(c.targetId))
      ) {
        toRemove.add(c);
      }
    }
    toRemove.forEach((o) => this.canvas.remove(o));
    this.canvas.discardActiveObject();
    this.anchorHost = null;
    // Deleting a collapsed parent orphans its hidden children — re-reveal any node
    // that no longer sits under a collapsed ancestor.
    this.applyCollapseVisibility();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /* -------------------------------- images -------------------------------- */

  /** Sensible initial on-canvas size (scene px), scaled with zoom so an image
   *  never fills the screen and small images aren't enlarged. */
  private defaultImageFit(): number {
    const z = this.canvas.getZoom() || 1;
    const vpMin = (Math.min(this.canvas.getWidth(), this.canvas.getHeight()) || 900) / z;
    return Math.max(120, Math.min(600, vpMin * 0.55));
  }

  /** Add one already-decoded image at a scene point (no history/persist — the
   *  caller records once, so batches stay a single undo). */
  private async placeImage(
    dataUrl: string,
    at: { x: number; y: number },
    dims: { width: number; height: number } | undefined,
    normalized: boolean,
  ): Promise<fabric.FabricImage> {
    const img = await fabric.FabricImage.fromURL(dataUrl);
    const natW = dims?.width ?? img.width ?? 1;
    const natH = dims?.height ?? img.height ?? 1;
    const scale = Math.min(1, this.defaultImageFit() / Math.max(natW, natH, 1));
    img.scale(scale);
    img.set({ left: at.x, top: at.y, originX: "center", originY: "center" });
    (img as NdObj).ndId = nid();
    if (normalized) (img as { ndNormalized?: boolean }).ndNormalized = true;
    img.selectable = this.tool === "select";
    img.evented = this.tool === "select" || this.tool === "eraser";
    this.canvas.add(img);
    return img;
  }

  /** Insert a single image file (normalized). `at` = drop point; omitted =
   *  viewport center. */
  async addImageFile(file: File, at?: { x: number; y: number }): Promise<void> {
    try {
      const n = await normalizeImageFile(file);
      const img = await this.placeImage(
        n.dataUrl,
        at ?? this.viewportCenterScene(),
        { width: n.width, height: n.height },
        true,
      );
      this.setTool("select");
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
      this.recordHistory();
      this.schedulePersist();
    } catch (e) {
      this.cb.onNotice?.(
        e instanceof ImageImportError ? e.message : "Couldn't add this image.",
      );
    }
  }

  /** Insert several image files at once — cascaded so they don't stack, and
   *  recorded as a single undo entry. */
  async addImageFiles(files: File[], at?: { x: number; y: number }): Promise<void> {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const base = at ?? this.viewportCenterScene();
    const placed: fabric.FabricImage[] = [];
    for (let i = 0; i < imgs.length; i++) {
      try {
        const n = await normalizeImageFile(imgs[i]);
        placed.push(
          await this.placeImage(
            n.dataUrl,
            { x: base.x + i * IMAGE_CASCADE, y: base.y + i * IMAGE_CASCADE },
            { width: n.width, height: n.height },
            true,
          ),
        );
      } catch (e) {
        this.cb.onNotice?.(
          e instanceof ImageImportError ? e.message : "Couldn't add an image.",
        );
      }
    }
    if (placed.length === 0) return;
    this.setTool("select");
    this.canvas.discardActiveObject();
    if (placed.length === 1) this.canvas.setActiveObject(placed[0]);
    else this.canvas.setActiveObject(new fabric.ActiveSelection(placed, { canvas: this.canvas }));
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Insert a single image from a data URL (already decoded — programmatic). */
  async addImageFromDataURL(dataUrl: string, at?: { x: number; y: number }): Promise<void> {
    const img = await this.placeImage(dataUrl, at ?? this.viewportCenterScene(), undefined, false);
    this.setTool("select");
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /** Convert a DOM client point (e.g. a drop event) to a scene point. */
  clientToScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.upperCanvasEl.getBoundingClientRect();
    const vp = new fabric.Point(clientX - rect.left, clientY - rect.top);
    const p = fabric.util.transformPoint(
      vp,
      fabric.util.invertTransform(this.canvas.viewportTransform),
    );
    return { x: p.x, y: p.y };
  }

  /* --------------------------------- flip --------------------------------- */

  /** Flip the selected image(s) horizontally / vertically (non-destructive —
   *  a display transform, safe with crop + rotation). One history entry. */
  flipSelection(axis: "h" | "v"): void {
    const imgs = this.canvas
      .getActiveObjects()
      .filter((o) => (o as { type?: string }).type === "image" && !isLocked(o));
    if (imgs.length === 0) return;
    for (const o of imgs) {
      if (axis === "h") o.set("flipX", !o.flipX);
      else o.set("flipY", !o.flipY);
      o.setCoords();
    }
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /* --------------------------------- crop --------------------------------- */

  isCropping(): boolean {
    return this.cropState !== null;
  }

  private imageElementSize(img: fabric.FabricImage): { w: number; h: number } {
    const el = img.getElement() as {
      naturalWidth?: number;
      naturalHeight?: number;
      width?: number;
      height?: number;
    };
    return {
      w: el.naturalWidth || el.width || img.width || 1,
      h: el.naturalHeight || el.height || img.height || 1,
    };
  }

  /** Change an image's crop window (element px) while keeping the new window's
   *  center pinned in scene space (so the visible pixels don't jump). */
  private repositionImageForCrop(
    img: fabric.FabricImage,
    nx: number,
    ny: number,
    nw: number,
    nh: number,
  ): void {
    const cx0 = img.cropX ?? 0;
    const cy0 = img.cropY ?? 0;
    const w0 = img.width ?? nw;
    const h0 = img.height ?? nh;
    // The new window's center, expressed in the CURRENT local frame (element px).
    const local = new fabric.Point(nx + nw / 2 - cx0 - w0 / 2, ny + nh / 2 - cy0 - h0 / 2);
    const scene = fabric.util.transformPoint(local, img.calcTransformMatrix());
    img.set({ cropX: nx, cropY: ny, width: nw, height: nh, dirty: true });
    img.setPositionByOrigin(scene, "center", "center");
    img.setCoords();
  }

  /** Enter crop mode on the selected single, unlocked image. Shows the full
   *  image (dimmed outside the window) and a draggable crop rectangle. */
  startCrop(): void {
    const a = this.canvas.getActiveObject();
    if (
      !a ||
      (a as { type?: string }).type !== "image" ||
      isLocked(a) ||
      this.canvas.getActiveObjects().length !== 1
    )
      return;
    const img = a as fabric.FabricImage;
    const { w: elW, h: elH } = this.imageElementSize(img);
    // Too small to crop meaningfully — a crop would clamp to an invalid rect.
    if (elW < CROP_MIN_PX * 2 || elH < CROP_MIN_PX * 2) {
      this.cb.onNotice?.("This image is too small to crop.");
      return;
    }
    const cropX0 = img.cropX ?? 0;
    const cropY0 = img.cropY ?? 0;
    const w0 = img.width ?? elW;
    const h0 = img.height ?? elH;
    this.cropState = {
      img,
      elW,
      elH,
      x: cropX0,
      y: cropY0,
      w: w0,
      h: h0,
      orig: { cropX: cropX0, cropY: cropY0, width: w0, height: h0, opacity: img.opacity ?? 1 },
      origCenter: img.getCenterPoint(),
      drag: null,
    };
    // Show the whole image, pinning the current window's center in place.
    this.repositionImageForCrop(img, 0, 0, elW, elH);
    img.set({ hasControls: false, hasBorders: false, evented: false, selectable: false });
    // Take full ownership of pointer input: stop Fabric's rubber-band and
    // target-finding so a crop-handle drag can't grab an object underneath.
    this.canvas.discardActiveObject();
    this.canvas.selection = false;
    this.canvas.skipTargetFind = true;
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Commit the crop window as the image's new crop. One history entry. */
  commitCrop(): void {
    const s = this.cropState;
    if (!s) return;
    const { img } = s;
    const nx = Math.round(clamp(s.x, 0, s.elW - CROP_MIN_PX));
    const ny = Math.round(clamp(s.y, 0, s.elH - CROP_MIN_PX));
    const nw = Math.round(clamp(s.w, CROP_MIN_PX, s.elW - nx));
    const nh = Math.round(clamp(s.h, CROP_MIN_PX, s.elH - ny));
    this.repositionImageForCrop(img, nx, ny, nw, nh);
    img.set({ hasControls: true, hasBorders: true, evented: true, selectable: true });
    this.cropState = null;
    this.restoreAfterCrop(img);
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /** Restore normal selection/target-finding and re-select the image after crop. */
  private restoreAfterCrop(img: fabric.FabricImage): void {
    this.canvas.selection = this.tool === "select";
    this.canvas.skipTargetFind = !(this.tool === "select" || this.tool === "eraser");
    this.canvas.setActiveObject(img);
  }

  /** Leave crop mode, restoring the original crop. No history. */
  cancelCrop(): void {
    const s = this.cropState;
    if (!s) return;
    const { img, orig } = s;
    img.set({
      cropX: orig.cropX,
      cropY: orig.cropY,
      width: orig.width,
      height: orig.height,
      hasControls: true,
      hasBorders: true,
      evented: true,
      selectable: true,
      dirty: true,
    });
    img.setPositionByOrigin(s.origCenter, "center", "center");
    img.setCoords();
    this.cropState = null;
    this.restoreAfterCrop(img);
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Reset the crop window to the full image (still in crop mode — commit to apply). */
  resetCropRect(): void {
    const s = this.cropState;
    if (!s) return;
    s.x = 0;
    s.y = 0;
    s.w = s.elW;
    s.h = s.elH;
    this.canvas.requestRenderAll();
    this.emit();
  }

  /** Element-pixel point → scene, using the (full-image) crop-mode transform. */
  private cropElemToScene(ex: number, ey: number): Pt {
    const s = this.cropState!;
    return fabric.util.transformPoint(
      new fabric.Point(ex - s.elW / 2, ey - s.elH / 2),
      s.img.calcTransformMatrix(),
    );
  }

  /** Scene point → element pixels (inverse of cropElemToScene). */
  private sceneToCropElem(p: Pt): Pt {
    const s = this.cropState!;
    const local = fabric.util.transformPoint(
      new fabric.Point(p.x, p.y),
      fabric.util.invertTransform(s.img.calcTransformMatrix()),
    );
    return { x: local.x + s.elW / 2, y: local.y + s.elH / 2 };
  }

  /** The 8 crop handles as {name, screen point}. */
  private cropHandles(): { name: string; p: Pt }[] {
    const s = this.cropState!;
    const L = s.x, T = s.y, R = s.x + s.w, B = s.y + s.h;
    const mx = (L + R) / 2, my = (T + B) / 2;
    const pts: [string, number, number][] = [
      ["nw", L, T], ["n", mx, T], ["ne", R, T], ["e", R, my],
      ["se", R, B], ["s", mx, B], ["sw", L, B], ["w", L, my],
    ];
    return pts.map(([name, ex, ey]) => ({ name, p: this.toScreen(this.cropElemToScene(ex, ey)) }));
  }

  /** The crop handle name under a screen (viewport) point, if any. */
  private cropHandleAt(vp: Pt): string | null {
    for (const h of this.cropHandles()) {
      if (dist(vp, h.p) <= CROP_HANDLE_HIT) return h.name;
    }
    return null;
  }

  /** Begin a crop drag from a screen point (handle or inside = move). */
  private cropPointerDown(opt: PointerInfo): void {
    const s = this.cropState!;
    const vp = this.canvas.getViewportPoint(opt.e);
    const handle = this.cropHandleAt(vp);
    const elem = this.sceneToCropElem(this.canvas.getScenePoint(opt.e));
    const inside =
      elem.x >= s.x && elem.x <= s.x + s.w && elem.y >= s.y && elem.y <= s.y + s.h;
    if (handle || inside) {
      s.drag = {
        handle: handle ?? "move",
        startX: elem.x,
        startY: elem.y,
        win: { x: s.x, y: s.y, w: s.w, h: s.h },
      };
    }
  }

  /** Update the crop window from the current pointer during a drag. */
  private cropPointerMove(opt: PointerInfo): void {
    const s = this.cropState!;
    const d = s.drag;
    if (!d) return;
    const p = this.sceneToCropElem(this.canvas.getScenePoint(opt.e));
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const MIN = CROP_MIN_PX;
    if (d.handle === "move") {
      s.x = clamp(d.win.x + dx, 0, s.elW - d.win.w);
      s.y = clamp(d.win.y + dy, 0, s.elH - d.win.h);
      s.w = d.win.w;
      s.h = d.win.h;
    } else {
      let L = d.win.x;
      let T = d.win.y;
      let R = d.win.x + d.win.w;
      let B = d.win.y + d.win.h;
      if (d.handle.includes("w")) L = clamp(d.win.x + dx, 0, R - MIN);
      if (d.handle.includes("e")) R = clamp(d.win.x + d.win.w + dx, L + MIN, s.elW);
      if (d.handle.includes("n")) T = clamp(d.win.y + dy, 0, B - MIN);
      if (d.handle.includes("s")) B = clamp(d.win.y + d.win.h + dy, T + MIN, s.elH);
      s.x = L;
      s.y = T;
      s.w = R - L;
      s.h = B - T;
    }
    this.canvas.requestRenderAll();
  }

  private drawCropOverlay(ctx: CanvasRenderingContext2D): void {
    const s = this.cropState!;
    const W = this.canvas.getWidth();
    const H = this.canvas.getHeight();
    const c = ([
      [s.x, s.y],
      [s.x + s.w, s.y],
      [s.x + s.w, s.y + s.h],
      [s.x, s.y + s.h],
    ] as [number, number][]).map(([ex, ey]) => this.toScreen(this.cropElemToScene(ex, ey)));

    // Dim everything outside the crop window (even-odd hole).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.fillStyle = "rgba(10, 11, 16, 0.55)";
    ctx.fill("evenodd");
    ctx.restore();

    // Window outline + rule-of-thirds guides.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    for (let t = 1; t <= 2; t++) {
      const top = this.toScreen(this.cropElemToScene(s.x + (s.w * t) / 3, s.y));
      const bot = this.toScreen(this.cropElemToScene(s.x + (s.w * t) / 3, s.y + s.h));
      const lft = this.toScreen(this.cropElemToScene(s.x, s.y + (s.h * t) / 3));
      const rgt = this.toScreen(this.cropElemToScene(s.x + s.w, s.y + (s.h * t) / 3));
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bot.x, bot.y);
      ctx.moveTo(lft.x, lft.y);
      ctx.lineTo(rgt.x, rgt.y);
      ctx.stroke();
    }
    ctx.restore();

    // Handles (touch-sized).
    ctx.save();
    for (const h of this.cropHandles()) {
      ctx.beginPath();
      ctx.arc(h.p.x, h.p.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(91, 140, 255, 0.95)";
      ctx.stroke();
    }
    ctx.restore();
  }

  private viewportCenterScene(): { x: number; y: number } {
    const inv = fabric.util.invertTransform(this.canvas.viewportTransform);
    const p = fabric.util.transformPoint(
      new fabric.Point(this.canvas.getWidth() / 2, this.canvas.getHeight() / 2),
      inv,
    );
    return { x: p.x, y: p.y };
  }

  /* ------------------------------ text / note ----------------------------- */

  /**
   * Create an editable text box and immediately enter editing (keyboard-ready).
   * `fixedWidth` (from a Text-tool drag) makes a defined-width box that wraps;
   * omitting it makes an auto-grow box that hugs its content until it hits the
   * wrap width. enterEditing()+focus() stay synchronous inside the gesture so
   * the tablet keyboard opens.
   */
  private createTextAt(x: number, y: number, fixedWidth?: number): void {
    const autoGrow = fixedWidth === undefined;
    const text = new fabric.Textbox("", {
      left: x,
      top: y,
      width: autoGrow ? AUTO_TEXT_MIN_W : Math.max(60, fixedWidth),
      fontSize: this.defaults.textFontSize,
      fill: this.defaults.textColor,
      fontFamily: this.defaults.textFontFamily,
      lineHeight: this.defaults.textLineHeight,
    });
    (text as NdObj).ndId = nid();
    (text as { ndAutoGrow?: boolean }).ndAutoGrow = autoGrow;
    this.setTool("select");
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    text.enterEditing();
    text.hiddenTextarea?.focus();
    this.canvas.requestRenderAll();
  }

  /** Offscreen 2D context for measuring auto-grow text width. */
  private measureCtx: CanvasRenderingContext2D | null = null;
  private getMeasureCtx(): CanvasRenderingContext2D | null {
    if (!this.measureCtx && typeof document !== "undefined") {
      this.measureCtx = document.createElement("canvas").getContext("2d");
    }
    return this.measureCtx;
  }

  /** Grow (or shrink) an auto-grow text box to fit its content width, up to the
   *  wrap cap. No-op for fixed-width boxes. */
  private fitAutoGrow(t: fabric.Textbox): void {
    if (!(t as { ndAutoGrow?: boolean }).ndAutoGrow) return;
    const ctx = this.getMeasureCtx();
    if (!ctx) return;
    const style = t.fontStyle && t.fontStyle !== "normal" ? t.fontStyle : "normal";
    const weight = String(t.fontWeight ?? "normal");
    ctx.font = `${style} ${weight} ${t.fontSize}px ${t.fontFamily}`;
    let maxW = 0;
    for (const ln of (t.text ?? "").split("\n")) {
      maxW = Math.max(maxW, ctx.measureText(ln).width);
    }
    const pad = (t.fontSize ?? 16) * 0.7; // breathing room + caret
    const w = clamp(maxW + pad, AUTO_TEXT_MIN_W, AUTO_TEXT_MAX_W);
    if (Math.abs((t.width ?? 0) - w) > 0.5) {
      t.set("width", w);
      t.initDimensions();
      t.setCoords();
    }
  }

  /* ------------------------- shape / line drawing ------------------------- */

  private currentShapeStyle(): ShapeStyle {
    return {
      stroke: this.defaults.shapeStroke,
      strokeWidth: this.defaults.shapeStrokeWidth,
      fill: this.defaults.shapeFill,
      dash: DASH_ARRAYS[this.defaults.shapeDash],
      opacity: this.defaults.shapeOpacity,
    };
  }

  private currentShapeParams(): ShapeParams {
    return {
      radius: this.defaults.shapeRadius,
      sides: this.defaults.shapeSides,
      points: this.defaults.shapeStarPoints,
      inner: this.defaults.shapeStarInner,
    };
  }

  private lineHeads(tool: Tool): { start: ArrowHead; end: ArrowHead } {
    if (tool === "arrow") return { start: "none", end: "filled" };
    if (tool === "doublearrow") return { start: "filled", end: "filled" };
    return { start: "none", end: "none" };
  }

  private startShapeDraft(): void {
    const def = shapeDef(this.tool);
    if (!def) return;
    const o = def.make(this.currentShapeStyle(), this.currentShapeParams());
    o.selectable = false;
    o.evented = false;
    this.draft = o;
    this.draftDef = def;
    this.canvas.add(o);
    this.reapplyDraft();
  }

  private startLineDraft(): void {
    const heads = this.lineHeads(this.tool);
    const o = makeNdLine(this.start.x, this.start.y, this.start.x, this.start.y, {
      stroke: this.defaults.lineStroke,
      strokeWidth: this.defaults.lineStrokeWidth,
      startHead: heads.start,
      endHead: heads.end,
      dash: DASH_ARRAYS[this.defaults.lineDash],
      opacity: this.defaults.lineOpacity,
    });
    o.selectable = false;
    o.evented = false;
    this.draft = o;
    this.draftDef = null;
    this.canvas.add(o);
  }

  private reapplyDraft(): void {
    if (!this.draft) return;
    if (this.draftDef) this.updateShapeDraft();
    else this.updateLineDraft();
  }

  private updateShapeDraft(): void {
    if (!this.draft || !this.draftDef) return;
    const { x: sx, y: sy } = this.start;
    const { x, y } = this.cur;
    const dx = x - sx;
    const dy = y - sy;
    const sgx = dx < 0 ? -1 : 1;
    const sgy = dy < 0 ? -1 : 1;
    let hw = Math.abs(dx);
    let hh = Math.abs(dy);
    if (!this.drawMods.alt) {
      hw /= 2;
      hh /= 2;
    }
    if (this.drawMods.shift) {
      const m = Math.max(hw, hh);
      hw = m;
      hh = m;
    }
    const w = Math.max(hw * 2, 1);
    const h = Math.max(hh * 2, 1);
    const cx = this.drawMods.alt ? sx : sx + sgx * hw;
    const cy = this.drawMods.alt ? sy : sy + sgy * hh;
    this.draftDef.resize(this.draft, w, h);
    this.centerAt(this.draft, { x: cx, y: cy });
    this.draft.setCoords();
    this.canvas.requestRenderAll();
  }

  private updateLineDraft(): void {
    if (!this.draft) return;
    const { x: sx, y: sy } = this.start;
    let x = this.cur.x;
    let y = this.cur.y;
    if (this.drawMods.shift) {
      // Snap to 45° increments.
      const ang = Math.atan2(y - sy, x - sx);
      const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x - sx, y - sy);
      x = sx + Math.cos(snap) * len;
      y = sy + Math.sin(snap) * len;
    }
    (this.draft as NdLine).set({ x1: sx, y1: sy, x2: x, y2: y });
    this.draft.setCoords();
    this.canvas.requestRenderAll();
  }

  private commitDraft(): void {
    const draft = this.draft;
    this.draft = null;
    const def = this.draftDef;
    this.draftDef = null;
    if (!draft) return;

    const { x: sx, y: sy } = this.start;
    const { x: ex, y: ey } = this.cur;
    const tiny = Math.abs(ex - sx) < 6 && Math.abs(ey - sy) < 6;
    if (tiny) {
      // Click-to-create at a sensible default size, centred on the click.
      if (draft instanceof NdLine) {
        draft.set({ x1: sx - 70, y1: sy, x2: sx + 70, y2: sy });
      } else if (def) {
        def.resize(draft, def.defaultSize.w, def.defaultSize.h);
        this.centerAt(draft, { x: sx, y: sy });
      }
      draft.setCoords();
    }

    draft.selectable = true;
    draft.evented = true;
    this.canvas.setActiveObject(draft);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.setTool("select");
  }

  /** Live modifier update while drawing (Shift/Alt pressed without moving). */
  private onModKeyChange = (e: KeyboardEvent): void => {
    if (!this.drawing || !this.draft) return;
    if (e.key !== "Shift" && e.key !== "Alt") return;
    this.drawMods = { shift: e.shiftKey, alt: e.altKey };
    this.reapplyDraft();
  };

  /* ------------------------------- documents ------------------------------ */

  private afterLoad(): void {
    const migrated = this.ensureIds();
    this.cleanupOrphans();
    this.updateConnectors();
    this.applyCollapseVisibility();
    this.anchorHost = null;
    if (migrated) this.schedulePersist();
  }

  /** Clear every transient, in-gesture interaction and overlay field. Called
   *  whenever the object graph is swapped wholesale (loadDoc, undo/redo snapshot,
   *  clearPage) or a single-finger interaction is aborted by a two-finger gesture,
   *  so a mid-flight gesture can neither commit a phantom object nor leave an
   *  overlay (alignment guides, connection anchors, lasso path, shape/line draft)
   *  painted over objects that no longer exist. Safe to call under suppress. */
  private resetTransientInteraction(): void {
    this.freehand.cancel();
    this.drawing = false;
    if (this.draft) {
      this.canvas.remove(this.draft);
      this.draft = null;
    }
    this.draftDef = null;
    this.isErasing = false;
    this.erasedAny = false;
    this.interacting = false;
    this.activeGuides = [];
    this.lassoing = false;
    this.lassoPts = [];
    this.textDraft = null;
    this.anchorHost = null;
    this.hoverTarget = null;
    this.connectDrag = null;
    this.pendingConnect = null;
    this.pendingReassign = null;
    this.fingerPan = null;
  }

  loadDoc(doc: CanvasDoc | undefined): Promise<void> {
    return this.runExclusive(async () => {
      this.cropState = null;
      this.suppress = true;
      this.resetTransientInteraction();
      try {
        if (doc && Object.keys(doc).length > 0) {
          await this.canvas.loadFromJSON(doc, brokenImageReviver);
        } else {
          this.canvas.clear();
        }
      } finally {
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.suppress = false;
      }
      this.applyToolMode();
      this.updateGrid();
      this.afterLoad();
      this.canvas.requestRenderAll();
      this.history.reset(this.snapshot());
      this.emit();
    });
  }

  clearPage(): void {
    void this.runExclusive(async () => {
      this.cropState = null;
      this.suppress = true;
      this.resetTransientInteraction();
      this.canvas.clear();
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.suppress = false;
      this.updateGrid();
      this.applyToolMode();
      this.anchorHost = null;
      this.canvas.requestRenderAll();
      this.history.reset(this.snapshot());
      this.emit();
      this.flush();
    });
  }

  /* -------------------------------- export -------------------------------- */

  exportPNG(fileName = "notedrift"): void {
    const c = this.canvas;
    const objects = c.getObjects();
    const prevVpt = [...c.viewportTransform] as fabric.TMat2D;
    const prevBg = c.backgroundColor;
    const prevW = c.getWidth();
    const prevH = c.getHeight();

    c.discardActiveObject();
    this.activeGuides = [];
    this.anchorHost = null;

    let dataUrl: string | null = null;
    try {
      if (objects.length === 0) {
        c.backgroundColor = "#ffffff";
        c.renderAll();
        dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
      } else {
        const b = this.contentBounds(objects);
        const pad = 48;
        const rawW = b.width + pad * 2;
        const rawH = b.height + pad * 2;
        // Downscale enormous scenes (objects spread far apart on the infinite
        // canvas) so we never allocate a multi-gigapixel backing store; keep the
        // crisp 2x render for normal-sized pages.
        const scale = Math.min(2, EXPORT_MAX_EDGE / Math.max(rawW, rawH, 1));
        const w = Math.max(1, Math.ceil(rawW * scale));
        const h = Math.max(1, Math.ceil(rawH * scale));
        c.setDimensions({ width: w, height: h });
        c.setViewportTransform([
          scale,
          0,
          0,
          scale,
          (-b.left + pad) * scale,
          (-b.top + pad) * scale,
        ]);
        c.backgroundColor = "#ffffff";
        c.renderAll();
        dataUrl = c.toDataURL({ format: "png", multiplier: 1 });
      }
    } catch {
      dataUrl = null; // OOM / canvas-too-large — restored below, reported after
    } finally {
      // Always restore the live canvas, even if export threw, so the editor is
      // never left resized, transformed, or without its grid.
      c.setDimensions({ width: prevW, height: prevH });
      c.setViewportTransform(prevVpt);
      c.backgroundColor = prevBg;
      this.updateGrid();
      c.renderAll();
    }

    if (!dataUrl) {
      this.cb.onNotice?.("Couldn't export this page — it may be too large.");
      return;
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  private contentBounds(objects: fabric.FabricObject[]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const o of objects) {
      o.setCoords();
      const c = o.aCoords;
      if (!c) continue;
      for (const p of [c.tl, c.tr, c.bl, c.br]) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }

  /* -------------------------- alignment guides ---------------------------- */

  private sceneBounds(obj: fabric.FabricObject) {
    const c = obj.aCoords;
    const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x];
    const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y];
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  private applySnap(obj: fabric.FabricObject): void {
    const zoom = this.canvas.getZoom();
    const threshold = SNAP_SCREEN_PX / zoom;
    obj.setCoords();
    const b = this.sceneBounds(obj);
    const selected = new Set(this.canvas.getActiveObjects());

    const movingX = [b.left, b.cx, b.right];
    const movingY = [b.top, b.cy, b.bottom];

    let bestV: { delta: number; pos: number } | null = null;
    let bestH: { delta: number; pos: number } | null = null;

    this.canvas.forEachObject((o) => {
      if (o === obj || selected.has(o) || ndRole(o) === "connector") return;
      o.setCoords();
      const ob = this.sceneBounds(o);
      const targetX = [ob.left, ob.cx, ob.right];
      const targetY = [ob.top, ob.cy, ob.bottom];
      for (const mv of movingX)
        for (const tv of targetX) {
          const d = tv - mv;
          if (Math.abs(d) <= threshold && (!bestV || Math.abs(d) < Math.abs(bestV.delta)))
            bestV = { delta: d, pos: tv };
        }
      for (const mv of movingY)
        for (const tv of targetY) {
          const d = tv - mv;
          if (Math.abs(d) <= threshold && (!bestH || Math.abs(d) < Math.abs(bestH.delta)))
            bestH = { delta: d, pos: tv };
        }
    });

    const guides: Guide[] = [];
    if (bestV) {
      obj.set("left", (obj.left ?? 0) + (bestV as { delta: number }).delta);
      guides.push({ axis: "v", pos: (bestV as { pos: number }).pos });
    }
    if (bestH) {
      obj.set("top", (obj.top ?? 0) + (bestH as { delta: number }).delta);
      guides.push({ axis: "h", pos: (bestH as { pos: number }).pos });
    }
    if (bestV || bestH) obj.setCoords();
    this.activeGuides = guides;
  }

  /* ------------------------------- overlays ------------------------------- */

  private overlayCtx(): CanvasRenderingContext2D | null {
    const ctx = this.canvas.contextTop;
    if (!ctx) return null;
    const retina = this.canvas.getRetinaScaling();
    ctx.setTransform(retina, 0, 0, retina, 0, 0);
    return ctx;
  }

  private toScreen(p: Pt): Pt {
    const vpt = this.canvas.viewportTransform;
    return { x: p.x * vpt[0] + vpt[4], y: p.y * vpt[3] + vpt[5] };
  }

  /** Screen position of a connection anchor, nudged just outside the edge so it
   *  doesn't overlap Fabric's mid-edge resize handle. */
  private anchorScreenPos(host: fabric.FabricObject, a: Anchor): Pt {
    const sp = this.toScreen(anchorScenePoint(host, a));
    const off =
      a === "top"
        ? { x: 0, y: -1 }
        : a === "right"
          ? { x: 1, y: 0 }
          : a === "bottom"
            ? { x: 0, y: 1 }
            : { x: -1, y: 0 };
    return { x: sp.x + off.x * ANCHOR_OFFSET, y: sp.y + off.y * ANCHOR_OFFSET };
  }

  /** Is the pointer over one of the object's resize/rotate handles? */
  private pointerOnControl(obj: fabric.FabricObject, vp: Pt): boolean {
    const oc = obj.oCoords as
      | Record<string, { x: number; y: number }>
      | undefined;
    if (!oc) return false;
    for (const k in oc) {
      const c = oc[k];
      if (c && Math.hypot(vp.x - c.x, vp.y - c.y) <= 12) return true;
    }
    return false;
  }

  /** A small padlock glyph centered at a screen point. */
  private drawLockBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const bodyW = 9;
    const bodyH = 7;
    const bx = cx - bodyW / 2;
    const by = cy - bodyH / 2 + 1.5;
    // White halo so the badge reads on any background.
    ctx.beginPath();
    ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    // Shackle.
    ctx.beginPath();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#475569";
    ctx.arc(cx, by, 2.6, Math.PI, 0);
    ctx.stroke();
    // Body.
    ctx.fillStyle = "#475569";
    ctx.fillRect(bx, by, bodyW, bodyH);
  }

  private drawOverlays(): void {
    const ctx = this.overlayCtx();
    if (!ctx) return;

    // Crop mode owns the overlay entirely — dim outside the window, draw a bright
    // crop rectangle + handles. Nothing else (guides/anchors) draws while cropping.
    if (this.cropState) {
      this.drawCropOverlay(ctx);
      return;
    }

    // Lasso region (temporary — never persisted or exported).
    if (this.lassoing && this.lassoPts.length >= 2) {
      ctx.save();
      ctx.beginPath();
      const p0 = this.toScreen(this.lassoPts[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < this.lassoPts.length; i++) {
        const sp = this.toScreen(this.lassoPts[i]);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(139, 92, 246, 0.10)";
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(139, 92, 246, 0.9)";
      ctx.stroke();
      ctx.restore();
    }

    // Text-tool drag preview (defining a fixed-width text box).
    if (this.textDraft) {
      const { start, cur } = this.textDraft;
      if (Math.abs(cur.x - start.x) >= 12) {
        const a = this.toScreen({ x: Math.min(start.x, cur.x), y: Math.min(start.y, cur.y) });
        const b = this.toScreen({ x: Math.max(start.x, cur.x), y: Math.max(start.y, cur.y) });
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(91, 140, 255, 0.9)";
        ctx.strokeRect(a.x, a.y, b.x - a.x, Math.max(b.y - a.y, 10));
        ctx.restore();
      }
    }

    // Alignment guides
    if (this.activeGuides.length) {
      const W = this.canvas.getWidth();
      const H = this.canvas.getHeight();
      ctx.save();
      ctx.strokeStyle = "rgba(91, 140, 255, 0.95)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      for (const g of this.activeGuides) {
        ctx.beginPath();
        if (g.axis === "v") {
          const x = this.toScreen({ x: g.pos, y: 0 }).x;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
        } else {
          const y = this.toScreen({ x: 0, y: g.pos }).y;
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Connection anchors on the current host (hover or selected node).
    if (this.tool === "select") {
      const host = this.currentAnchorHost();
      if (host) {
        ctx.save();
        for (const a of ANCHORS) {
          const sp = this.anchorScreenPos(host, a);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, ANCHOR_R, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(91, 140, 255, 0.9)";
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Collapsed-branch indicators: a subtle pill showing the hidden child count.
    if (this.tool === "select" && !this.interacting) {
      const map = this.objByIdMap();
      ctx.save();
      ctx.font = `600 11px ${CANVAS_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [id, node] of map) {
        if (!isNodeBox(node) || !node.ndCollapsed || node.visible === false) continue;
        const count = this.childrenOf(id, map).length;
        if (count === 0) continue;
        const b = sceneBoundsOf(node);
        const sp = this.toScreen({ x: b.right, y: b.cy });
        const label = String(count);
        const w = Math.max(18, 11 + label.length * 7);
        const h = 16;
        const cx = sp.x + 5 + w / 2;
        const x = cx - w / 2;
        const y = sp.y - h / 2;
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fillStyle = "rgba(91, 140, 255, 0.95)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, cx, sp.y + 0.5);
      }
      ctx.restore();
    }

    // Lock badges: a small padlock on each locked object so it reads as locked
    // and hints that alt-click unlocks it. Select mode, when idle.
    if (this.tool === "select" && !this.interacting) {
      ctx.save();
      for (const o of this.canvas.getObjects()) {
        if (!isLocked(o) || o.visible === false) continue;
        const b = sceneBoundsOf(o);
        const sp = this.toScreen({ x: b.left, y: b.top });
        this.drawLockBadge(ctx, sp.x + 9, sp.y + 9);
      }
      ctx.restore();
    }

    // Highlight the target anchor while dragging a connector.
    if (this.hoverTarget) {
      const sp = this.toScreen(this.hoverTarget.point);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, ANCHOR_R + 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(91, 140, 255, 0.95)";
      ctx.fill();
      ctx.restore();
    }

    // Endpoint handles on a selected connector.
    const active = this.canvas.getActiveObject();
    if (
      active &&
      ndRole(active) === "connector" &&
      this.canvas.getActiveObjects().length === 1
    ) {
      const c = active as Connector;
      const ends: Pt[] = [
        this.toScreen({ x: c.x1 ?? 0, y: c.y1 ?? 0 }),
        this.toScreen({ x: c.x2 ?? 0, y: c.y2 ?? 0 }),
      ];
      ctx.save();
      for (const sp of ends) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, ANCHOR_R + 1, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(91, 140, 255, 0.95)";
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private endInteraction(): void {
    if (!this.interacting && this.activeGuides.length === 0) return;
    this.interacting = false;
    this.activeGuides = [];
    this.canvas.requestRenderAll();
  }

  /* ------------------------------ event wiring ---------------------------- */

  /* --------------------------- touch / pen gestures ----------------------- */

  private attachTouchHandlers(): void {
    const el = this.paperEl;
    el.addEventListener("pointerdown", this.onDomPointerDown, { capture: true });
    el.addEventListener("pointermove", this.onDomPointerMove, {
      capture: true,
      passive: false,
    });
    el.addEventListener("pointerup", this.onDomPointerUp, { capture: true });
    el.addEventListener("pointercancel", this.onDomPointerUp, { capture: true });
  }

  private detachTouchHandlers(): void {
    const el = this.paperEl;
    const opts = { capture: true } as EventListenerOptions;
    el.removeEventListener("pointerdown", this.onDomPointerDown, opts);
    el.removeEventListener("pointermove", this.onDomPointerMove, opts);
    el.removeEventListener("pointerup", this.onDomPointerUp, opts);
    el.removeEventListener("pointercancel", this.onDomPointerUp, opts);
  }

  /** Discard an in-progress single-finger stroke/transform (a finger became a gesture). */
  private abortActiveInteraction(): void {
    this.canvas.isDrawingMode = false;
    this.cancelFabricTransform();
    // Drop freehand/draft/lasso/guides/anchors so a two-finger gesture over an
    // active drag never leaves a stuck overlay behind.
    this.resetTransientInteraction();
    this.canvas.requestRenderAll();
  }

  private beginGesture(): void {
    const pts = [...this.touchPoints.values()];
    this.lastMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    this.lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    this.canvasRect = this.canvas.upperCanvasEl.getBoundingClientRect();
    this.gestureActive = true;
    this.gestureLatch = true;
    this.abortActiveInteraction();
  }

  private onDomPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "pen") {
      this.penSeen = true;
      return; // let Fabric draw/select with the stylus
    }
    if (e.pointerType !== "touch") return; // mouse → unchanged desktop path

    this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.touchPoints.size >= 2) {
      // Second finger → intercept before Fabric engages it, start pan/pinch.
      e.stopPropagation();
      e.preventDefault();
      this.beginGesture();
      return;
    }

    // Single finger. In any drawing mode, once a stylus has been seen, a finger
    // navigates (pans) instead of drawing — the best web-safe palm rejection.
    if (isDrawTool(this.tool) && this.penSeen) {
      e.stopPropagation();
      e.preventDefault();
      this.fingerPan = { id: e.pointerId, last: { x: e.clientX, y: e.clientY } };
    }
    // Otherwise Fabric handles the single touch per the active tool.
  };

  private onDomPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    if (this.touchPoints.has(e.pointerId)) {
      this.touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.gestureActive && this.touchPoints.size >= 2 && this.canvasRect) {
      e.stopPropagation();
      e.preventDefault();
      const pts = [...this.touchPoints.values()];
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      // Pan by the midpoint delta…
      const vpt = this.canvas.viewportTransform;
      vpt[4] += mid.x - this.lastMid.x;
      vpt[5] += mid.y - this.lastMid.y;
      this.canvas.setViewportTransform(vpt);
      // …and pinch-zoom toward the midpoint (in canvas-element coords).
      const at = { x: mid.x - this.canvasRect.left, y: mid.y - this.canvasRect.top };
      const zoom = clamp(
        this.canvas.getZoom() * (d / this.lastDist),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      this.canvas.zoomToPoint(new fabric.Point(at.x, at.y), zoom);
      // The pinch rescaled the viewport — drop the stale keyboard-pan delta.
      this.keyboardPan = 0;
      this.updateGrid();
      this.updateBrushCursor();
      this.emit();
      this.lastMid = mid;
      this.lastDist = d;
      return;
    }

    if (this.fingerPan && e.pointerId === this.fingerPan.id) {
      e.stopPropagation();
      e.preventDefault();
      const vpt = this.canvas.viewportTransform;
      vpt[4] += e.clientX - this.fingerPan.last.x;
      vpt[5] += e.clientY - this.fingerPan.last.y;
      this.canvas.setViewportTransform(vpt);
      this.fingerPan.last = { x: e.clientX, y: e.clientY };
      this.updateGrid();
      this.emit();
      return;
    }

    if (this.gestureLatch) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  private onDomPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== "touch") return;
    this.touchPoints.delete(e.pointerId);

    if (this.fingerPan && e.pointerId === this.fingerPan.id) {
      this.fingerPan = null;
      e.stopPropagation();
      e.preventDefault();
    }

    if (this.gestureActive && this.touchPoints.size < 2) {
      this.gestureActive = false;
      e.stopPropagation();
      e.preventDefault();
    }

    if (this.touchPoints.size === 0) {
      if (this.gestureLatch) {
        this.gestureLatch = false;
        // Restore the drawing mode the active tool expects.
        this.canvas.isDrawingMode = isDrawTool(this.tool);
      }
    } else if (this.gestureLatch) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /** Forgiving hit radius for touch/pen input, tight for mouse. */
  private anchorHitRadius(e: Event): number {
    const pt = (e as PointerEvent).pointerType;
    return pt === "touch" || pt === "pen" ? ANCHOR_HIT_TOUCH : ANCHOR_HIT;
  }

  private wireEvents(): void {
    this.canvas.on("mouse:down:before", this.onMouseDownBefore);
    this.canvas.on("mouse:down", this.onMouseDown);
    this.canvas.on("mouse:move", this.onMouseMove);
    this.canvas.on("mouse:up", this.onMouseUp);
    this.canvas.on("mouse:wheel", this.onWheel);
    this.canvas.on("mouse:dblclick", this.onDblClick);
    this.canvas.on("after:render", () => this.drawOverlays());

    this.canvas.on("object:moving", (opt) => {
      const obj = opt.target;
      if (!obj) return;
      this.interacting = true;
      this.applySnap(obj);
      this.updateConnectors(this.movedIds(obj));
      this.canvas.requestRenderAll();
      this.emit();
    });
    this.canvas.on("object:scaling", (opt) => {
      this.interacting = true;
      if (opt.target) this.updateConnectors(this.movedIds(opt.target));
      this.emit();
    });
    // A Textbox side handle reflows width via the RESIZING action (not scaling),
    // so mirror the scaling handler or a bound connector detaches mid-drag.
    this.canvas.on("object:resizing", (opt) => {
      this.interacting = true;
      // A deliberate width drag turns an auto-grow box into a fixed-width one,
      // so the next keystroke's fitAutoGrow doesn't snap the width back.
      const t = opt.target as (fabric.FabricObject & { ndAutoGrow?: boolean }) | undefined;
      if (t?.ndAutoGrow) t.ndAutoGrow = false;
      if (opt.target) this.updateConnectors(this.movedIds(opt.target));
      this.emit();
    });
    this.canvas.on("object:rotating", (opt) => {
      this.interacting = true;
      const ev = opt.e as (PointerEvent & MouseEvent) | undefined;
      const t = opt.target;
      if (t) {
        const a = t.angle ?? 0;
        const nearest = Math.round(a / 15) * 15;
        // Hold Shift to snap hard to 15° increments (desktop). Touch/pen has no
        // Shift key, so snapping is magnetic there — it engages only within a
        // few degrees of a 15° mark, leaving free rotation everywhere else.
        const touch = !!ev?.pointerType && ev.pointerType !== "mouse";
        if (ev?.shiftKey || (touch && Math.abs(a - nearest) <= 4)) {
          t.set("angle", nearest);
        }
      }
      if (t) this.updateConnectors(this.movedIds(t));
      this.emit();
    });

    this.canvas.on("path:created", () => {
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("object:modified", () => {
      this.endInteraction();
      this.updateConnectors();
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("text:editing:entered", (opt) => {
      // Keep the caret above the software keyboard when editing begins.
      void opt;
      if (this.keyboardInset > 0) this.ensureCaretVisible();
    });
    this.canvas.on("text:changed", (opt) => {
      const t = (opt as { target?: fabric.FabricObject }).target as
        | fabric.Textbox
        | undefined;
      if (t) this.fitAutoGrow(t);
      this.updateConnectors();
      if (this.keyboardInset > 0) this.ensureCaretVisible();
      this.schedulePersist();
    });
    this.canvas.on("text:editing:exited", (opt) => {
      // Drop an empty free-text box so it never lingers as a cramped, useless
      // object. Sticky notes and mind-map nodes are kept even when empty. A box
      // holding only a bullet/checklist prefix counts as empty.
      const t = (opt as { target?: fabric.FabricObject }).target ??
        this.canvas.getActiveObject() ?? undefined;
      const type = ((t as { type?: string } | undefined)?.type ?? "").toLowerCase();
      const isFreeText = type === "textbox" || type === "i-text" || type === "itext";
      const txt = (t as fabric.Textbox | undefined)?.text ?? "";
      if (t && isFreeText && isEffectivelyEmpty(txt)) {
        this.canvas.remove(t);
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
      }
      this.recordHistory();
      this.schedulePersist();
    });
    this.canvas.on("selection:created", () => this.emit());
    this.canvas.on("selection:updated", () => this.emit());
    this.canvas.on("selection:cleared", () => {
      this.endInteraction();
      this.emit();
    });
  }

  private onMouseDownBefore = (opt: PointerInfo): void => {
    this.pendingConnect = null;
    this.pendingReassign = null;
    if (this.tool !== "select" || this.spaceDown) return;
    const e = opt.e as MouseEvent;
    if (e.button === 1) return;
    const vp = this.canvas.getViewportPoint(opt.e);
    const hit = this.anchorHitRadius(opt.e);

    // Reassign a selected connector's endpoint?
    const active = this.canvas.getActiveObject();
    if (active && ndRole(active) === "connector") {
      const c = active as Connector;
      const e1 = this.toScreen({ x: c.x1 ?? 0, y: c.y1 ?? 0 });
      const e2 = this.toScreen({ x: c.x2 ?? 0, y: c.y2 ?? 0 });
      if (dist(vp, e1) <= hit) {
        this.pendingReassign = { end: "source", connector: c };
        this.canvas.selection = false;
        return;
      }
      if (dist(vp, e2) <= hit) {
        this.pendingReassign = { end: "target", connector: c };
        this.canvas.selection = false;
        return;
      }
    }

    // A resize/rotate handle of the selected object wins over connecting, so any
    // object (including text boxes) can be resized from its mid-edge handles.
    if (active && this.pointerOnControl(active, vp)) return;

    // Start a new connector from a host anchor (offset just outside the edge)?
    const host = this.currentAnchorHost();
    if (host && ndId(host)) {
      for (const a of ANCHORS) {
        const sp = this.anchorScreenPos(host, a);
        if (dist(vp, sp) <= hit) {
          this.pendingConnect = { sourceId: ndId(host)!, anchor: a };
          this.canvas.selection = false;
          return;
        }
      }
    }
  };

  private onDblClick = (opt: PointerInfo): void => {
    if (this.tool !== "select" || opt.target) return;
    const p = this.canvas.getScenePoint(opt.e);
    // A locked object is non-evented, so opt.target is null over it — don't drop
    // a stray text box on top of one.
    if (this.lockedObjectAt(p)) return;
    this.createTextAt(p.x, p.y);
  };

  private onMouseDown = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    if (this.spaceDown || this.tool === "hand" || e.button === 1) {
      this.isPanning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      this.canvas.setCursor("grabbing");
      return;
    }

    // Crop mode owns pointer interaction on the cropped image.
    if (this.cropState) {
      this.cropPointerDown(opt);
      return;
    }

    // In any drawing mode Fabric's freeDrawingBrush owns the stroke — never
    // create a shape draft here (mouse:down still fires to us in drawing mode).
    if (isDrawTool(this.tool)) return;

    if (this.tool === "eraser") {
      this.isErasing = true;
      this.erasedAny = false;
      if (opt.target) this.eraseObject(opt.target);
      return;
    }

    if (this.tool === "lasso") {
      const p = this.canvas.getScenePoint(opt.e);
      this.lassoing = true;
      this.lassoPts = [{ x: p.x, y: p.y }];
      return;
    }

    if (this.tool === "select") {
      // Select a locked object to unlock it. Locked objects are non-evented, so
      // Fabric never targets them — hit-test here. Two affordances: tapping the
      // visible padlock badge (works with mouse OR touch/stylus — the primary
      // route on a keyboard-less tablet), or alt-clicking anywhere on it.
      const locked =
        this.lockBadgeHostAt(this.canvas.getViewportPoint(opt.e)) ||
        (e.altKey ? this.lockedObjectAt(this.canvas.getScenePoint(opt.e)) : null);
      if (locked) {
        this.canvas.discardActiveObject();
        this.canvas.setActiveObject(locked);
        this.canvas.requestRenderAll();
        this.emit();
        return;
      }
      if (this.pendingConnect) {
        this.startCreateConnector();
        this.pendingConnect = null;
      } else if (this.pendingReassign) {
        this.startReassign();
        this.pendingReassign = null;
      }
      return;
    }

    const p = this.canvas.getScenePoint(opt.e);
    this.start = { x: p.x, y: p.y };
    this.cur = { x: p.x, y: p.y };

    if (this.tool === "text") {
      // Defer creation to mouse:up so a drag can define a fixed width, and so
      // enterEditing()+focus() run inside the pointerup gesture (tablet keyboard).
      this.textDraft = { start: { x: p.x, y: p.y }, cur: { x: p.x, y: p.y } };
      return;
    }

    if (this.tool === "note") {
      const note = makeStickyNote(p.x, p.y, this.defaults.noteFill);
      (note as NdObj).ndId = nid();
      this.setTool("select");
      this.canvas.add(note);
      // Center the card on the click — padding-expanded bounds mean raw left/top
      // don't map to the visible card position.
      this.centerAt(note, p);
      this.canvas.setActiveObject(note);
      note.enterEditing();
      note.hiddenTextarea?.focus();
      this.canvas.requestRenderAll();
      this.recordHistory();
      this.schedulePersist();
      return;
    }

    this.drawMods = { shift: e.shiftKey, alt: e.altKey };
    if (isShapeTool(this.tool)) {
      this.drawing = true;
      this.startShapeDraft();
      return;
    }
    if (isLineTool(this.tool)) {
      this.drawing = true;
      this.startLineDraft();
      return;
    }
  };

  private onMouseMove = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    if (this.isPanning) {
      const dx = e.clientX - this.lastPan.x;
      const dy = e.clientY - this.lastPan.y;
      this.lastPan = { x: e.clientX, y: e.clientY };
      const vpt = this.canvas.viewportTransform;
      vpt[4] += dx;
      vpt[5] += dy;
      this.canvas.setViewportTransform(vpt);
      this.updateGrid();
      return;
    }

    if (this.isErasing) {
      const target = this.canvas.findTarget(opt.e)?.target;
      if (target) this.eraseObject(target);
      return;
    }

    if (this.cropState) {
      if (this.cropState.drag) this.cropPointerMove(opt);
      return;
    }

    if (this.lassoing) {
      const p = this.canvas.getScenePoint(opt.e);
      const last = this.lassoPts[this.lassoPts.length - 1];
      // Throttle to ~3 screen px between vertices so the path stays light.
      if (!last || dist(p, last) * this.canvas.getZoom() >= 3)
        this.lassoPts.push({ x: p.x, y: p.y });
      this.canvas.requestRenderAll();
      return;
    }

    if (this.textDraft) {
      const p = this.canvas.getScenePoint(opt.e);
      this.textDraft.cur = { x: p.x, y: p.y };
      this.canvas.requestRenderAll();
      return;
    }

    if (this.connectDrag) {
      this.updateConnectDrag(opt);
      return;
    }

    if (this.drawing && this.draft) {
      const p = this.canvas.getScenePoint(opt.e);
      this.cur = { x: p.x, y: p.y };
      this.drawMods = { shift: e.shiftKey, alt: e.altKey };
      this.reapplyDraft();
      return;
    }

    // Idle in select mode: track hovered connectable for its anchors.
    if (this.tool === "select") {
      const hovered = opt.target ?? null;
      const host = hovered && isConnectable(hovered) ? hovered : null;
      if (host !== this.anchorHost) {
        this.anchorHost = host;
        this.canvas.requestRenderAll();
      }
    }
  };

  private onMouseUp = (): void => {
    if (this.cropState) {
      if (this.cropState.drag) this.cropState.drag = null;
      return;
    }

    if (this.lassoing) {
      this.finishLasso();
      return;
    }

    if (this.textDraft) {
      const { start, cur } = this.textDraft;
      this.textDraft = null;
      const w = Math.abs(cur.x - start.x);
      const TAP = 12; // scene px — below this it's a tap, not a drag
      if (w < TAP) {
        this.createTextAt(start.x, start.y); // tap → auto-grow
      } else {
        this.createTextAt(Math.min(start.x, cur.x), Math.min(start.y, cur.y), w);
      }
      this.canvas.requestRenderAll();
      return;
    }

    if (this.connectDrag) {
      this.finishConnectDrag();
      return;
    }

    if (this.interacting) this.endInteraction();

    if (this.isPanning) {
      this.isPanning = false;
      this.setSpace(this.spaceDown);
      return;
    }

    if (this.isErasing) {
      this.isErasing = false;
      // One continuous gesture = one undo; record only if something was removed.
      if (this.erasedAny) {
        this.applyCollapseVisibility();
        this.canvas.requestRenderAll();
        this.recordHistory();
        this.schedulePersist();
      }
      this.erasedAny = false;
      return;
    }

    if (!this.drawing) return;
    this.drawing = false;
    this.commitDraft();
  };

  private onWheel = (opt: WheelInfo): void => {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      let zoom = this.canvas.getZoom();
      zoom *= Math.pow(0.999, e.deltaY * 2);
      const vp = this.canvas.getViewportPoint(opt.e);
      this.applyZoom(zoom, { x: vp.x, y: vp.y });
    } else {
      const vpt = this.canvas.viewportTransform;
      vpt[4] -= e.deltaX;
      vpt[5] -= e.deltaY;
      this.canvas.setViewportTransform(vpt);
      this.updateGrid();
      this.emit();
    }
  };
}

