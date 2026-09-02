"use client";

import { memo, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Layers,
  Minus,
  MoveDown,
  MoveRight,
  MoveUp,
  Plus,
  Trash2,
} from "lucide-react";
import { FONT_SIZES, NOTE_COLORS, PALETTE, SHAPE_FILLS } from "@/lib/constants";
import type { SelectionInfo, StylePatch } from "@/lib/types";
import { Divider, SwatchRow, WidthPicker } from "../ui/controls";

export type LayerOp = "front" | "forward" | "backward" | "back";

interface ObjectToolbarProps {
  selection: SelectionInfo;
  paperOffset: { left: number; top: number };
  onStyle: (patch: StylePatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (op: LayerOp) => void;
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
}: ObjectToolbarProps) {
  const [layerOpen, setLayerOpen] = useState(false);

  if (selection.kind === "none" || !selection.rect) return null;

  const { rect, kind } = selection;
  const placeBelow = rect.top < 64;
  const left = paperOffset.left + rect.left + rect.width / 2;
  const top = placeBelow
    ? paperOffset.top + rect.top + rect.height + 10
    : paperOffset.top + rect.top - 10;

  const fontIdx = nearestIndex(selection.fontSize ?? 24);
  const decFont = () =>
    onStyle({ fontSize: FONT_SIZES[Math.max(0, fontIdx - 1)] });
  const incFont = () =>
    onStyle({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIdx + 1)] });

  const styleSection = () => {
    if (kind === "shape") {
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
          <SwatchRow
            options={SHAPE_FILLS}
            value={selection.fill}
            onChange={(v) => onStyle({ fill: v })}
          />
          <Divider />
        </>
      );
    }
    if (kind === "path") {
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

  return (
    <div
      className="pointer-events-auto absolute z-30"
      style={{
        left,
        top,
        transform: placeBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      <div className="flex items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 px-1.5 py-1 shadow-2xl backdrop-blur">
        {styleSection()}

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
