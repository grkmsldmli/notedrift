"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Bold,
  BoxSelect,
  ChevronsDown,
  ChevronsUp,
  Copy,
  CopyPlus,
  CornerDownRight,
  Group as GroupIcon,
  Layers,
  Lock,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  MoveDown,
  MoveRight,
  MoveUp,
  Network,
  Plus,
  Trash2,
  Ungroup as UngroupIcon,
  Unlock,
} from "lucide-react";
import { FONT_SIZES, NOTE_COLORS, OUTLINE_WIDTHS, PALETTE } from "@/lib/constants";
import type { SelectionInfo, StylePatch } from "@/lib/types";
import { AccentRow, Divider, Label, SwatchRow, WidthPicker } from "../ui/controls";
import { ColorPopover } from "../ui/ColorPopover";
import { OpacityControl, WidthControl } from "../ui/BrushControls";
import { ArrowheadControl, DashPicker, Stepper } from "../ui/ShapeControls";

export type LayerOp = "front" | "forward" | "backward" | "back";
export type AlignEdge =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";

interface ObjectToolbarProps {
  selection: SelectionInfo;
  paperOffset: { left: number; top: number };
  onStyle: (patch: StylePatch, commit?: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (op: LayerOp) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: "h" | "v") => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onCollapseToggle: () => void;
  onArrange: () => void;
  onSelectBranch: () => void;
  onDuplicateBranch: () => void;
}

function nearestIndex(size: number): number {
  let best = 0;
  let bestDist = Infinity;
  FONT_SIZES.forEach((s, i) => {
    const d = Math.abs(s - size);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

const iconBtn =
  "flex h-7 w-7 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text";

export const ObjectToolbar = memo(function ObjectToolbar({
  selection,
  paperOffset,
  onStyle,
  onDuplicate,
  onDelete,
  onLayer,
  onGroup,
  onUngroup,
  onLock,
  onUnlock,
  onAlign,
  onDistribute,
  onAddChild,
  onAddSibling,
  onCollapseToggle,
  onArrange,
  onSelectBranch,
  onDuplicateBranch,
}: ObjectToolbarProps) {
  const [layerOpen, setLayerOpen] = useState(false);
  const [mindOpen, setMindOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  // Collision-aware placement: measure the toolbar and keep it fully on-screen —
  // prefer above the object, else below, clamped inside the canvas area and clear
  // of the floating left toolbar. (Improves desktop and tablet alike.)
  useLayoutEffect(() => {
    const el = ref.current;
    const rect = selection.rect;
    if (!el || selection.kind === "none" || !rect) return;
    const container = el.offsetParent as HTMLElement | null;
    const cw = container?.clientWidth ?? window.innerWidth;
    const ch = container?.clientHeight ?? window.innerHeight;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;

    const GAP = 10;
    const MARGIN = 8;
    const LEFT_RAIL = 68; // keep clear of the floating left toolbar

    const ox = paperOffset.left + rect.left;
    const oy = paperOffset.top + rect.top;
    const ocx = ox + rect.width / 2;

    let left = ocx - tw / 2;
    left = Math.max(LEFT_RAIL + MARGIN, Math.min(cw - MARGIN - tw, left));
    if (left < MARGIN) left = MARGIN; // extremely narrow viewport fallback

    let top = oy - GAP - th; // prefer above
    if (top < MARGIN) top = oy + rect.height + GAP; // else below
    top = Math.max(MARGIN, Math.min(ch - MARGIN - th, top)); // clamp within canvas

    setBox({ left: Math.round(left), top: Math.round(top) });
  }, [selection, paperOffset]);

  if (selection.kind === "none" || !selection.rect) return null;

  const { kind } = selection;
  const locked = !!selection.locked;

  const alignItems: { edge: AlignEdge; icon: React.ReactNode; label: string }[] = [
    { edge: "left", icon: <AlignStartVertical size={16} />, label: "Align left" },
    { edge: "hcenter", icon: <AlignCenterVertical size={16} />, label: "Align center" },
    { edge: "right", icon: <AlignEndVertical size={16} />, label: "Align right" },
    { edge: "top", icon: <AlignStartHorizontal size={16} />, label: "Align top" },
    { edge: "vcenter", icon: <AlignCenterHorizontal size={16} />, label: "Align middle" },
    { edge: "bottom", icon: <AlignEndHorizontal size={16} />, label: "Align bottom" },
  ];

  const fontIdx = nearestIndex(selection.fontSize ?? 24);
  const decFont = () =>
    onStyle({ fontSize: FONT_SIZES[Math.max(0, fontIdx - 1)] });
  const incFont = () =>
    onStyle({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIdx + 1)] });

  const styleSection = () => {
    // A user group has no single meaningful stroke/fill — show only org controls.
    if (selection.isGroup) return null;
    if (kind === "shape") {
      // Fillable = any vector shape (incl. legacy rect/ellipse); false only for a
      // legacy arrow group. Shape-specific controls still key off shapeId.
      const realShape = !!selection.fillable;
      return (
        <>
          <ColorPopover
            value={selection.stroke ?? "#20242e"}
            onChange={(v, commit) => onStyle({ stroke: v }, commit)}
          />
          {realShape && (
            <>
              <Divider />
              <Label>Fill</Label>
              <ColorPopover
                value={selection.fill ?? "transparent"}
                allowNone
                onChange={(v, commit) => onStyle({ fill: v }, commit)}
              />
            </>
          )}
          <Divider />
          <WidthControl
            value={selection.strokeWidth ?? 3}
            presets={OUTLINE_WIDTHS}
            min={1}
            max={20}
            onChange={(w, commit) => onStyle({ strokeWidth: w }, commit)}
          />
          {realShape && (
            <>
              <Divider />
              <DashPicker
                value={selection.dash ?? "solid"}
                onChange={(d) => onStyle({ dash: d })}
              />
              <Divider />
              <OpacityControl
                value={selection.opacity ?? 1}
                onChange={(o, commit) => onStyle({ opacity: o }, commit)}
              />
            </>
          )}
          {selection.shapeId === "roundrect" && (
            <>
              <Divider />
              <Stepper
                value={selection.radius ?? 16}
                min={0}
                max={64}
                step={4}
                onChange={(v) => onStyle({ radius: v })}
              />
            </>
          )}
          {selection.shapeId === "polygon" && (
            <>
              <Divider />
              <Stepper
                value={selection.sides ?? 6}
                min={3}
                max={12}
                onChange={(v) => onStyle({ sides: v })}
              />
            </>
          )}
          {selection.shapeId === "star" && (
            <>
              <Divider />
              <Stepper
                value={selection.starPoints ?? 5}
                min={3}
                max={12}
                onChange={(v) => onStyle({ starPoints: v })}
              />
            </>
          )}
          <Divider />
        </>
      );
    }
    if (kind === "line") {
      return (
        <>
          <ColorPopover
            value={selection.stroke ?? "#20242e"}
            onChange={(v, commit) => onStyle({ stroke: v }, commit)}
          />
          <Divider />
          <WidthControl
            value={selection.strokeWidth ?? 4}
            presets={OUTLINE_WIDTHS}
            min={1}
            max={20}
            onChange={(w, commit) => onStyle({ strokeWidth: w }, commit)}
          />
          <Divider />
          <DashPicker
            value={selection.dash ?? "solid"}
            onChange={(d) => onStyle({ dash: d })}
          />
          {selection.isLine && (
            <>
              <Divider />
              <ArrowheadControl
                start={selection.startHead ?? "none"}
                end={selection.endHead ?? "none"}
                onChange={(patch) => onStyle(patch)}
              />
            </>
          )}
          <Divider />
          <OpacityControl
            value={selection.opacity ?? 1}
            onChange={(o, commit) => onStyle({ opacity: o }, commit)}
          />
          <Divider />
        </>
      );
    }
    if (kind === "path") {
      // Freehand ink: recolor (full picker) + opacity. Width is baked into the
      // outline, so it is intentionally not editable.
      if (selection.isInk) {
        return (
          <>
            <ColorPopover
              value={selection.stroke ?? "#20242e"}
              onChange={(v, commit) => onStyle({ stroke: v }, commit)}
            />
            <Divider />
            <OpacityControl
              value={selection.opacity ?? 1}
              onChange={(o, commit) => onStyle({ opacity: o }, commit)}
            />
            <Divider />
          </>
        );
      }
      // Legacy stroked path: keep stroke color + width controls.
      return (
        <>
          <SwatchRow
            options={PALETTE}
            value={selection.stroke}
            onChange={(v) => onStyle({ stroke: v })}
          />
          <Divider />
          <WidthPicker
            value={selection.strokeWidth}
            onChange={(w) => onStyle({ strokeWidth: w })}
          />
          <Divider />
        </>
      );
    }
    if (kind === "text" && selection.isNode) {
      // Mind-map node: soft accents + rapid add / collapse controls.
      return (
        <>
          <AccentRow
            value={selection.nodeAccent}
            onChange={(v) => onStyle({ nodeAccent: v })}
          />
          <Divider />
          <button
            type="button"
            className={iconBtn}
            title="Add child  (Tab)"
            onClick={onAddChild}
          >
            <CornerDownRight size={16} />
          </button>
          <button
            type="button"
            className={iconBtn}
            title="Add sibling  (Enter)"
            onClick={onAddSibling}
          >
            <Plus size={16} />
          </button>
          {selection.hasChildren && (
            <button
              type="button"
              className={iconBtn}
              title={selection.collapsed ? "Expand branch" : "Collapse branch"}
              aria-pressed={selection.collapsed}
              onClick={onCollapseToggle}
            >
              {selection.collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
          )}
          <Divider />
        </>
      );
    }
    if (kind === "text") {
      return (
        <>
          <SwatchRow
            options={PALETTE}
            value={selection.textColor}
            onChange={(v) => onStyle({ textColor: v })}
          />
          <Divider />
          <button type="button" className={iconBtn} title="Smaller" onClick={decFont}>
            <Minus size={15} />
          </button>
          <span className="w-6 text-center text-xs tabular-nums text-nd-text">
            {selection.fontSize ?? 24}
          </span>
          <button type="button" className={iconBtn} title="Larger" onClick={incFont}>
            <Plus size={15} />
          </button>
          <Divider />
          <button
            type="button"
            title="Bold"
            aria-pressed={selection.bold}
            onClick={() => onStyle({ bold: !selection.bold })}
            className={[
              iconBtn,
              selection.bold ? "bg-nd-accent/15 !text-white ring-1 ring-nd-accent/40" : "",
            ].join(" ")}
          >
            <Bold size={15} />
          </button>
          {(["left", "center", "right"] as const).map((a) => {
            const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
            return (
              <button
                key={a}
                type="button"
                title={`Align ${a}`}
                aria-pressed={selection.textAlign === a}
                onClick={() => onStyle({ textAlign: a })}
                className={[
                  iconBtn,
                  selection.textAlign === a
                    ? "bg-nd-accent/15 !text-white ring-1 ring-nd-accent/40"
                    : "",
                ].join(" ")}
              >
                <Icon size={15} />
              </button>
            );
          })}
          <Divider />
        </>
      );
    }
    if (kind === "connector") {
      return (
        <>
          <SwatchRow
            options={PALETTE}
            value={selection.stroke}
            onChange={(v) => onStyle({ stroke: v })}
          />
          <Divider />
          <WidthPicker
            value={selection.strokeWidth}
            onChange={(w) => onStyle({ strokeWidth: w })}
          />
          <Divider />
          <button
            type="button"
            title="Toggle arrowhead"
            aria-pressed={selection.hasArrow}
            onClick={() => onStyle({ hasArrow: !selection.hasArrow })}
            className={[
              iconBtn,
              selection.hasArrow
                ? "bg-nd-accent/15 !text-white ring-1 ring-nd-accent/40"
                : "",
            ].join(" ")}
          >
            <MoveRight size={16} />
          </button>
          <Divider />
        </>
      );
    }
    if (kind === "note") {
      return (
        <>
          <SwatchRow
            options={NOTE_COLORS}
            value={selection.noteFill}
            onChange={(v) => onStyle({ noteFill: v })}
          />
          <Divider />
          <button type="button" className={iconBtn} title="Smaller" onClick={decFont}>
            <Minus size={15} />
          </button>
          <span className="w-6 text-center text-xs tabular-nums text-nd-text">
            {selection.fontSize ?? 18}
          </span>
          <button type="button" className={iconBtn} title="Larger" onClick={incFont}>
            <Plus size={15} />
          </button>
          <Divider />
        </>
      );
    }
    // image / mixed → no style controls
    return null;
  };

  // A locked object: the only action is to unlock it.
  if (locked) {
    return (
      <div
        ref={ref}
        className="pointer-events-auto absolute z-30"
        style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
      >
        <div className="flex items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 px-1.5 py-1 shadow-2xl backdrop-blur">
          <span className="flex items-center gap-1.5 px-1.5 text-xs text-nd-muted">
            <Lock size={13} /> Locked
          </span>
          <Divider />
          <button type="button" className={iconBtn} title="Unlock" onClick={onUnlock}>
            <Unlock size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute z-30"
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
    >
      <div className="flex items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 px-1.5 py-1 shadow-2xl backdrop-blur">
        {styleSection()}

        {selection.canAlign && (
          <div className="relative">
            <button
              type="button"
              className={[iconBtn, alignOpen ? "bg-white/10 text-nd-text" : ""].join(" ")}
              title="Align & distribute"
              onClick={() => setAlignOpen((o) => !o)}
            >
              <LayoutGrid size={15} />
            </button>
            {alignOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAlignOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-nd-border bg-nd-surface p-1.5 shadow-2xl">
                  <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-nd-muted">
                    Align
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {alignItems.map((it) => (
                      <button
                        key={it.edge}
                        type="button"
                        title={it.label}
                        onClick={() => {
                          onAlign(it.edge);
                          setAlignOpen(false);
                        }}
                        className="flex h-8 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
                      >
                        {it.icon}
                      </button>
                    ))}
                  </div>
                  <div className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-nd-muted">
                    Distribute
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { axis: "h", icon: <AlignHorizontalDistributeCenter size={16} />, label: "Distribute horizontally" },
                        { axis: "v", icon: <AlignVerticalDistributeCenter size={16} />, label: "Distribute vertically" },
                      ] as { axis: "h" | "v"; icon: React.ReactNode; label: string }[]
                    ).map((it) => (
                      <button
                        key={it.axis}
                        type="button"
                        title={
                          selection.canDistribute
                            ? it.label
                            : "Select 3 or more objects to distribute"
                        }
                        disabled={!selection.canDistribute}
                        onClick={() => {
                          onDistribute(it.axis);
                          setAlignOpen(false);
                        }}
                        className="flex h-8 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        {it.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {selection.canGroup && (
          <button type="button" className={iconBtn} title="Group  (Ctrl G)" onClick={onGroup}>
            <GroupIcon size={15} />
          </button>
        )}
        {selection.canUngroup && (
          <button
            type="button"
            className={iconBtn}
            title="Ungroup  (Ctrl Shift G)"
            onClick={onUngroup}
          >
            <UngroupIcon size={15} />
          </button>
        )}
        <button type="button" className={iconBtn} title="Lock" onClick={onLock}>
          <Lock size={15} />
        </button>

        <button type="button" className={iconBtn} title="Duplicate  (Ctrl D)" onClick={onDuplicate}>
          <Copy size={15} />
        </button>

        <div className="relative">
          <button
            type="button"
            className={[iconBtn, layerOpen ? "bg-white/10 text-nd-text" : ""].join(" ")}
            title="Layer order"
            onClick={() => setLayerOpen((o) => !o)}
          >
            <Layers size={15} />
          </button>
          {layerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLayerOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-nd-border bg-nd-surface p-1 shadow-2xl">
                {(
                  [
                    { op: "front", label: "Bring to Front", icon: <ChevronsUp size={15} /> },
                    { op: "forward", label: "Bring Forward", icon: <MoveUp size={15} /> },
                    { op: "backward", label: "Send Backward", icon: <MoveDown size={15} /> },
                    { op: "back", label: "Send to Back", icon: <ChevronsDown size={15} /> },
                  ] as { op: LayerOp; label: string; icon: React.ReactNode }[]
                ).map((it) => (
                  <button
                    key={it.op}
                    type="button"
                    onClick={() => {
                      onLayer(it.op);
                      setLayerOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
                  >
                    <span className="text-nd-muted">{it.icon}</span>
                    {it.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {selection.isNode && selection.hasChildren && (
          <div className="relative">
            <button
              type="button"
              className={[iconBtn, mindOpen ? "bg-white/10 text-nd-text" : ""].join(" ")}
              title="Branch actions"
              onClick={() => setMindOpen((o) => !o)}
            >
              <MoreHorizontal size={15} />
            </button>
            {mindOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMindOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-nd-border bg-nd-surface p-1 shadow-2xl">
                  {(
                    [
                      {
                        key: "arrange",
                        label: selection.isRoot ? "Arrange mind map" : "Arrange branch",
                        icon: <Network size={15} />,
                        run: onArrange,
                      },
                      {
                        key: "select",
                        label: "Select branch",
                        icon: <BoxSelect size={15} />,
                        run: onSelectBranch,
                      },
                      {
                        key: "duplicate",
                        label: "Duplicate branch",
                        icon: <CopyPlus size={15} />,
                        run: onDuplicateBranch,
                      },
                    ] as { key: string; label: string; icon: React.ReactNode; run: () => void }[]
                  ).map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => {
                        it.run();
                        setMindOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
                    >
                      <span className="text-nd-muted">{it.icon}</span>
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-red-500/15 hover:text-red-400"
          title="Delete  (Del)"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
});
