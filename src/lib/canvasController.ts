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
  CANVAS_FONT,
  CONNECTOR_STROKE,
  CONNECTOR_WIDTH,
  GRID_COLOR,
  GRID_LINE_COLOR,
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  MINDMAP_GAP_X,
  MINDMAP_GAP_Y,
  NOTEDRIFT_PROPS,
} from "./constants";
import { History } from "./history";
import { makeArrow, makeStickyNote, styleArrow } from "./shapes";
import {
  ANCHORS,
  Connector,
  anchorScenePoint,
  isConnectable,
  makeNode,
  nearestAnchor,
  nid,
  sceneBoundsOf,
  type Pt,
} from "./connectors";
import type {
  Anchor,
  CanvasDoc,
  CanvasStyle,
  EditorState,
  ObjKind,
  SelectionInfo,
  StylePatch,
  ToolDefaults,
  Tool,
} from "./types";

export interface ControllerCallbacks {
  onState: (state: EditorState) => void;
  onPersist: (doc: CanvasDoc) => void;
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

const PERSIST_IDLE = 500;
const PERSIST_MAXWAIT = 4000;
const SNAP_SCREEN_PX = 6;

const ndId = (o: fabric.FabricObject): string | undefined => (o as NdObj).ndId;
const ndRole = (o: fabric.FabricObject): string | undefined => (o as NdObj).ndRole;

/** Categorize a Fabric object for the contextual toolbar. */
function kindOf(obj: fabric.FabricObject): ObjKind {
  if (ndRole(obj) === "connector") return "connector";
  const t = ((obj as { type?: string }).type ?? "").toLowerCase();
  if (t === "stickynote") return "note";
  if (t === "nodebox") return "text";
  if (t === "i-text" || t === "itext" || t === "textbox" || t === "text")
    return "text";
  if (t === "path") return "path";
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

  // Interaction state
  private suppress = false;
  private disposed = false;
  private drawing = false;
  private draft: fabric.FabricObject | null = null;
  private start = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private isPanning = false;
  private isErasing = false;
  private interacting = false;
  private spaceDown = false;
  private lastPan = { x: 0, y: 0 };
  private activeGuides: Guide[] = [];

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

    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.color = defaults.penColor;
    this.canvas.freeDrawingBrush.width = defaults.penWidth;

    this.resize();
    this.setCanvasStyle(style);
    this.wireEvents();
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

  dispose(): void {
    this.disposed = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.canvas.dispose();
  }

  /* -------------------------------- state --------------------------------- */

  /** Serialize including NoteDrift relationship props (ids, connector links). */
  private serialize(): CanvasDoc {
    return this.canvas.toObject(NOTEDRIFT_PROPS) as CanvasDoc;
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
      return {
        noteFill: n.backgroundColor as string,
        fontSize: n.fontSize,
        textColor: n.fill as string,
        textAlign: n.textAlign,
      };
    }
    if (kind === "text") {
      const t = obj as fabric.Textbox;
      return {
        textColor: t.fill as string,
        fontSize: t.fontSize,
        bold: t.fontWeight === "bold",
        textAlign: t.textAlign,
      };
    }
    if (kind === "shape") {
      if (obj instanceof fabric.Group) {
        const line = obj.getObjects()[0];
        return {
          stroke: (line?.stroke as string) ?? undefined,
          strokeWidth: line?.strokeWidth,
          fill: "transparent",
        };
      }
      return {
        stroke: obj.stroke as string,
        strokeWidth: obj.strokeWidth,
        fill: (obj.fill as string) ?? "transparent",
      };
    }
    if (kind === "path") {
      return { stroke: obj.stroke as string, strokeWidth: obj.strokeWidth };
    }
    return {};
  }

  private buildSelection(): SelectionInfo {
    const active = this.canvas.getActiveObject();
    if (!active) return { kind: "none", count: 0, rect: null };

    const objs = this.canvas.getActiveObjects();
    const rect = this.interacting ? null : this.screenRectOf(active);

    if (objs.length > 1) {
      const kinds = new Set(objs.map(kindOf));
      if (kinds.size === 1) {
        const k = [...kinds][0];
        return { kind: k, count: objs.length, rect, ...this.styleOf(objs[0], k) };
      }
      return { kind: "mixed", count: objs.length, rect };
    }

    const k = kindOf(active);
    return { kind: k, count: 1, rect, ...this.styleOf(active, k) };
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

  /* -------------------------- relationship model -------------------------- */

  private objByIdMap(): Map<string, fabric.FabricObject> {
    const m = new Map<string, fabric.FabricObject>();
    for (const o of this.canvas.getObjects()) {
      const id = ndId(o);
      if (id && ndRole(o) !== "connector") m.set(id, o);
    }
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
    const objs =
      target instanceof fabric.ActiveSelection ? target.getObjects() : [target];
    const ids = new Set<string>();
    for (const o of objs) {
      const id = ndId(o);
      if (id) ids.add(id);
    }
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
    if (this.anchorHost && isConnectable(this.anchorHost)) return this.anchorHost;
    const a = this.canvas.getActiveObject();
    if (a && isConnectable(a) && this.canvas.getActiveObjects().length === 1) return a;
    return null;
  }

  private addConnector(
    sourceId: string,
    sourceAnchor: Anchor,
    targetId: string,
    targetAnchor: Anchor,
  ): Connector {
    const c = new Connector([0, 0, 0, 0], {
      sourceId,
      sourceAnchor,
      targetId,
      targetAnchor,
      connKind: "arrow",
      stroke: CONNECTOR_STROKE,
      strokeWidth: CONNECTOR_WIDTH,
    });
    c.selectable = true;
    c.evented = true;
    this.canvas.add(c);
    this.canvas.sendObjectToBack(c);
    c.syncGeometry(this.objByIdMap());
    return c;
  }

  private spawnNode(left = 0, top = 0): fabric.FabricObject {
    const node = makeNode(left, top);
    node.selectable = true;
    node.evented = true;
    this.canvas.add(node);
    return node;
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
      // Quick Connect: drop a new node centered on the release point. Center it
      // from its measured bounds, so padding and text-driven sizing can't push
      // the node away from where the pointer let go.
      const node = this.spawnNode(free.x, free.y);
      this.centerAt(node, free);
      c.targetId = ndId(node)!;
      c.targetAnchor = nearestAnchor(node, srcPt);
      c.targetFree = null;
      selectObj = node;
      spawned = node;
    }
    // reassign to empty leaves the free endpoint as-is.

    this.updateConnectors();
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

  private childrenOf(
    parentId: string,
    map: Map<string, fabric.FabricObject>,
  ): fabric.FabricObject[] {
    const res: fabric.FabricObject[] = [];
    for (const c of this.connectors()) {
      if (c.sourceId === parentId && c.targetId) {
        const t = map.get(c.targetId);
        if (t) res.push(t);
      }
    }
    return res;
  }

  private parentOf(
    nodeId: string,
    map: Map<string, fabric.FabricObject>,
  ): fabric.FabricObject | null {
    for (const c of this.connectors()) {
      if (c.targetId === nodeId && c.sourceId) {
        const s = map.get(c.sourceId);
        if (s) return s;
      }
    }
    return null;
  }

  private focusNewNode(node: fabric.FabricObject): void {
    this.setTool("select");
    this.canvas.setActiveObject(node);
    (node as fabric.IText).enterEditing?.();
    (node as fabric.IText).hiddenTextarea?.focus();
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.emit();
  }

  /** Tab: create a child node to the right of the selected node. */
  createChild(): void {
    const sel = this.canvas.getActiveObject();
    if (
      !sel ||
      !isConnectable(sel) ||
      this.canvas.getActiveObjects().length !== 1 ||
      !ndId(sel)
    ) {
      return;
    }
    const pb = sceneBoundsOf(sel);
    const map = this.objByIdMap();
    const children = this.childrenOf(ndId(sel)!, map);
    const node = this.spawnNode();
    const nb = sceneBoundsOf(node);
    let cy = pb.cy;
    if (children.length) {
      let maxBottom = -Infinity;
      for (const ch of children) maxBottom = Math.max(maxBottom, sceneBoundsOf(ch).bottom);
      cy = maxBottom + MINDMAP_GAP_Y + (nb.bottom - nb.top) / 2;
    }
    this.placeNodeLeftAt(node, pb.right + MINDMAP_GAP_X, cy);
    this.addConnector(ndId(sel)!, "right", ndId(node)!, "left");
    this.updateConnectors();
    this.focusNewNode(node);
  }

  /** Enter: create a sibling (sharing the selected node's parent when known). */
  createSibling(): void {
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
    const node = this.spawnNode();
    const nb = sceneBoundsOf(node);
    const cy = selB.bottom + MINDMAP_GAP_Y + (nb.bottom - nb.top) / 2;
    if (parent) {
      const pb = sceneBoundsOf(parent);
      this.placeNodeLeftAt(node, pb.right + MINDMAP_GAP_X, cy);
      this.addConnector(ndId(parent)!, "right", ndId(node)!, "left");
      this.updateConnectors();
      this.focusNewNode(node);
    } else {
      // No parent — a nearby free sibling below the selection, no connector invented.
      this.centerAt(node, { x: selB.cx, y: cy });
      this.focusNewNode(node);
    }
  }

  /* ------------------------------ tool defaults --------------------------- */

  setDefaults(patch: Partial<ToolDefaults>): void {
    this.defaults = { ...this.defaults, ...patch };
    if (this.tool === "pen" && this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = this.defaults.penColor;
      this.canvas.freeDrawingBrush.width = this.defaults.penWidth;
    }
  }

  /* -------------------------------- tools --------------------------------- */

  setTool(tool: Tool): void {
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
        return "cell";
      default:
        return "crosshair";
    }
  }

  private applyToolMode(): void {
    const c = this.canvas;
    c.isDrawingMode = this.tool === "pen";

    if (this.tool === "pen" && c.freeDrawingBrush) {
      c.freeDrawingBrush.color = this.defaults.penColor;
      c.freeDrawingBrush.width = this.defaults.penWidth;
    }

    c.selection = this.tool === "select";
    c.skipTargetFind = !(this.tool === "select" || this.tool === "eraser");
    c.defaultCursor = this.baseCursor();
    c.hoverCursor = this.tool === "select" ? "move" : this.baseCursor();

    const selectable = this.tool === "select";
    const evented = this.tool === "select" || this.tool === "eraser";
    c.forEachObject((o) => {
      o.selectable = selectable;
      o.evented = evented;
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

  applyStyle(patch: StylePatch): void {
    const objs = this.canvas.getActiveObjects();
    if (objs.length === 0) return;

    for (const obj of objs) {
      const k = kindOf(obj);

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
        else if (k === "shape" || k === "path") obj.set("stroke", patch.stroke);
      }
      if (patch.strokeWidth !== undefined) {
        if (obj instanceof fabric.Group)
          styleArrow(obj, { strokeWidth: patch.strokeWidth });
        else if (k === "shape" || k === "path")
          obj.set("strokeWidth", patch.strokeWidth);
      }
      if (patch.fill !== undefined) {
        if (k === "shape" && !(obj instanceof fabric.Group)) obj.set("fill", patch.fill);
      }
      if (patch.textColor !== undefined && (k === "text" || k === "note")) {
        obj.set("fill", patch.textColor);
      }
      if (patch.noteFill !== undefined && k === "note") {
        obj.set("backgroundColor", patch.noteFill);
      }
      if (patch.fontSize !== undefined && (k === "text" || k === "note")) {
        obj.set("fontSize", patch.fontSize);
        (obj as fabric.Textbox).initDimensions?.();
      }
      if (patch.bold !== undefined && k === "text") {
        obj.set("fontWeight", patch.bold ? "bold" : "normal");
      }
      if (patch.textAlign !== undefined && (k === "text" || k === "note")) {
        obj.set("textAlign", patch.textAlign);
      }
      obj.set("dirty", true);
    }

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
    const nodeIds = new Set(nodes.map(ndId).filter(Boolean) as string[]);
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
    const objs = this.canvas.getObjects();
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
      this.suppress = true;
      await this.canvas.loadFromJSON(JSON.parse(json));
      this.suppress = false;
      this.applyToolMode();
      this.updateConnectors();
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
    this.updateGrid();
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
    this.updateGrid();
    this.emit();
  }

  /* --------------------------- canvas appearance -------------------------- */

  setCanvasStyle(style: CanvasStyle): void {
    this.canvasStyle = style;
    const el = this.paperEl;
    if (style === "blank") {
      el.style.backgroundImage = "none";
    } else if (style === "dots") {
      el.style.backgroundImage = `radial-gradient(circle, ${GRID_COLOR} 1.3px, transparent 1.3px)`;
    } else {
      el.style.backgroundImage =
        `linear-gradient(to right, ${GRID_LINE_COLOR} 1px, transparent 1px), ` +
        `linear-gradient(to bottom, ${GRID_LINE_COLOR} 1px, transparent 1px)`;
    }
    this.updateGrid();
    this.emit();
  }

  private updateGrid(): void {
    if (this.canvasStyle === "blank") return;
    const vpt = this.canvas.viewportTransform;
    const zoom = this.canvas.getZoom();
    const size = GRID_SIZE * zoom;
    this.paperEl.style.backgroundSize = `${size}px ${size}px`;
    this.paperEl.style.backgroundPosition = `${vpt[4]}px ${vpt[5]}px`;
  }

  /* ------------------------------ selection ------------------------------- */

  deleteSelection(): void {
    const active = this.canvas.getActiveObjects();
    if (active.length === 0) return;
    const toRemove = new Set<fabric.FabricObject>(active);
    const selectedIds = new Set(
      active.map(ndId).filter(Boolean) as string[],
    );
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
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
  }

  /* -------------------------------- images -------------------------------- */

  async addImageFile(file: File): Promise<void> {
    const dataUrl = await readFileAsDataURL(file);
    await this.addImageFromDataURL(dataUrl);
  }

  async addImageFromDataURL(dataUrl: string, at?: { x: number; y: number }): Promise<void> {
    const img = await fabric.FabricImage.fromURL(dataUrl);
    const maxDim = 520;
    const scale = Math.min(1, maxDim / Math.max(img.width ?? 1, img.height ?? 1));
    img.scale(scale);

    const center = at ?? this.viewportCenterScene();
    img.set({ left: center.x, top: center.y, originX: "center", originY: "center" });
    img.selectable = this.tool === "select";
    img.evented = this.tool === "select" || this.tool === "eraser";

    this.canvas.add(img);
    this.canvas.setActiveObject(img);
    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
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

  private createTextAt(x: number, y: number): void {
    const text = new fabric.IText("", {
      left: x,
      top: y,
      fontSize: this.defaults.textFontSize,
      fill: this.defaults.textColor,
      fontFamily: CANVAS_FONT,
    });
    (text as NdObj).ndId = nid();
    this.setTool("select");
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    text.enterEditing();
    text.hiddenTextarea?.focus();
    this.canvas.requestRenderAll();
  }

  /* ------------------------------- documents ------------------------------ */

  private afterLoad(): void {
    const migrated = this.ensureIds();
    this.cleanupOrphans();
    this.updateConnectors();
    this.anchorHost = null;
    if (migrated) this.schedulePersist();
  }

  loadDoc(doc: CanvasDoc | undefined): Promise<void> {
    return this.runExclusive(async () => {
      this.suppress = true;
      if (doc && Object.keys(doc).length > 0) {
        await this.canvas.loadFromJSON(doc);
      } else {
        this.canvas.clear();
      }
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
      this.suppress = false;
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
      this.suppress = true;
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

    let dataUrl: string;

    if (objects.length === 0) {
      c.backgroundColor = "#ffffff";
      c.renderAll();
      dataUrl = c.toDataURL({ format: "png", multiplier: 2 });
    } else {
      const b = this.contentBounds(objects);
      const pad = 48;
      const w = Math.ceil(b.width + pad * 2);
      const h = Math.ceil(b.height + pad * 2);
      const multiplier = w * 2 > 12000 || h * 2 > 12000 ? 1 : 2;

      c.setDimensions({ width: w, height: h });
      c.setViewportTransform([1, 0, 0, 1, -b.left + pad, -b.top + pad]);
      c.backgroundColor = "#ffffff";
      c.renderAll();
      dataUrl = c.toDataURL({ format: "png", multiplier });

      c.setDimensions({ width: prevW, height: prevH });
      c.setViewportTransform(prevVpt);
    }

    c.backgroundColor = prevBg;
    this.updateGrid();
    c.renderAll();

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

  private drawOverlays(): void {
    const ctx = this.overlayCtx();
    if (!ctx) return;

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
          const sp = this.toScreen(anchorScenePoint(host, a));
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
    this.canvas.on("object:rotating", (opt) => {
      this.interacting = true;
      if (opt.target) this.updateConnectors(this.movedIds(opt.target));
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
    this.canvas.on("text:changed", () => {
      this.updateConnectors();
      this.schedulePersist();
    });
    this.canvas.on("text:editing:exited", () => {
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

    // Reassign a selected connector's endpoint?
    const active = this.canvas.getActiveObject();
    if (active && ndRole(active) === "connector") {
      const c = active as Connector;
      const e1 = this.toScreen({ x: c.x1 ?? 0, y: c.y1 ?? 0 });
      const e2 = this.toScreen({ x: c.x2 ?? 0, y: c.y2 ?? 0 });
      if (dist(vp, e1) <= ANCHOR_HIT) {
        this.pendingReassign = { end: "source", connector: c };
        this.canvas.selection = false;
        return;
      }
      if (dist(vp, e2) <= ANCHOR_HIT) {
        this.pendingReassign = { end: "target", connector: c };
        this.canvas.selection = false;
        return;
      }
    }

    // Start a new connector from a host anchor?
    const host = this.currentAnchorHost();
    if (host && ndId(host)) {
      for (const a of ANCHORS) {
        const sp = this.toScreen(anchorScenePoint(host, a));
        if (dist(vp, sp) <= ANCHOR_HIT) {
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
    this.createTextAt(p.x, p.y);
  };

  private onMouseDown = (opt: PointerInfo): void => {
    const e = opt.e as MouseEvent;

    if (this.spaceDown || e.button === 1) {
      this.isPanning = true;
      this.lastPan = { x: e.clientX, y: e.clientY };
      this.canvas.setCursor("grabbing");
      return;
    }

    if (this.tool === "eraser") {
      this.isErasing = true;
      if (opt.target) this.canvas.remove(opt.target);
      return;
    }

    if (this.tool === "select") {
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
      this.createTextAt(p.x, p.y);
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

    this.drawing = true;
    let draft: fabric.FabricObject;
    if (this.tool === "rect") {
      draft = new fabric.Rect({
        left: p.x,
        top: p.y,
        width: 0,
        height: 0,
        rx: 3,
        ry: 3,
        fill: this.defaults.shapeFill,
        stroke: this.defaults.shapeStroke,
        strokeWidth: this.defaults.shapeStrokeWidth,
        strokeUniform: true,
      });
    } else if (this.tool === "ellipse") {
      draft = new fabric.Ellipse({
        left: p.x,
        top: p.y,
        rx: 0,
        ry: 0,
        fill: this.defaults.shapeFill,
        stroke: this.defaults.shapeStroke,
        strokeWidth: this.defaults.shapeStrokeWidth,
        strokeUniform: true,
      });
    } else {
      draft = new fabric.Line([p.x, p.y, p.x, p.y], {
        stroke: this.defaults.lineStroke,
        strokeWidth: this.defaults.lineStrokeWidth,
        strokeLineCap: "round",
        strokeUniform: true,
      });
    }
    draft.selectable = false;
    draft.evented = false;
    this.draft = draft;
    this.canvas.add(draft);
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
      if (target) this.canvas.remove(target);
      return;
    }

    if (this.connectDrag) {
      this.updateConnectDrag(opt);
      return;
    }

    if (this.drawing && this.draft) {
      const p = this.canvas.getScenePoint(opt.e);
      this.cur = { x: p.x, y: p.y };
      const { x: sx, y: sy } = this.start;
      if (this.tool === "rect") {
        this.draft.set({
          left: Math.min(sx, p.x),
          top: Math.min(sy, p.y),
          width: Math.abs(p.x - sx),
          height: Math.abs(p.y - sy),
        });
      } else if (this.tool === "ellipse") {
        (this.draft as fabric.Ellipse).set({
          left: Math.min(sx, p.x),
          top: Math.min(sy, p.y),
          rx: Math.abs(p.x - sx) / 2,
          ry: Math.abs(p.y - sy) / 2,
        });
      } else {
        (this.draft as fabric.Line).set({ x2: p.x, y2: p.y });
      }
      this.draft.setCoords();
      this.canvas.requestRenderAll();
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
      this.recordHistory();
      this.schedulePersist();
      return;
    }

    if (!this.drawing) return;
    this.drawing = false;

    const draft = this.draft;
    this.draft = null;
    if (!draft) return;

    const { x: sx, y: sy } = this.start;
    const { x: ex, y: ey } = this.cur;
    const dst = Math.hypot(ex - sx, ey - sy);
    const tool = this.tool;

    const tooSmall =
      tool === "rect" || tool === "ellipse"
        ? Math.abs(ex - sx) < 4 && Math.abs(ey - sy) < 4
        : dst < 4;

    if (tooSmall) {
      this.canvas.remove(draft);
      this.canvas.requestRenderAll();
      this.setTool("select");
      return;
    }

    if (tool === "arrow") {
      this.canvas.remove(draft);
      const arrow = makeArrow(
        sx,
        sy,
        ex,
        ey,
        this.defaults.lineStroke,
        this.defaults.lineStrokeWidth,
      );
      this.canvas.add(arrow);
      this.canvas.setActiveObject(arrow);
    } else {
      if (tool === "rect" || tool === "ellipse") (draft as NdObj).ndId = nid();
      draft.setCoords();
      this.canvas.setActiveObject(draft);
    }

    this.canvas.requestRenderAll();
    this.recordHistory();
    this.schedulePersist();
    this.setTool("select");
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

/* --------------------------------- utils ---------------------------------- */

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
