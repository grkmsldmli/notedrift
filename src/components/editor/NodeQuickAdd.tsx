"use client";

import { memo } from "react";
import { Plus } from "lucide-react";
import type { SelectionInfo } from "@/lib/types";

interface NodeQuickAddProps {
  selection: SelectionInfo;
  paperOffset: { left: number; top: number };
  paperSize: { width: number; height: number };
  onAddChild: () => void;
  onAddSibling: () => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Subtle floating "+ child" (right) and "+ sibling" (below) controls near a
 * selected mind-map node. They exist mainly so touch/tablet users can branch
 * without a keyboard, but work with mouse and stylus too. Each has a generous
 * invisible hit area (44px on coarse pointers via `nd-hit`) while staying small
 * and unobtrusive visually. They use the exact same creation path as Tab/Enter.
 */
export const NodeQuickAdd = memo(function NodeQuickAdd({
  selection,
  paperOffset,
  paperSize,
  onAddChild,
  onAddSibling,
}: NodeQuickAddProps) {
  if (!selection.isNode || !selection.rect) return null;

  const r = selection.rect;
  const left = paperOffset.left + r.left;
  const top = paperOffset.top + r.top;
  const cx = left + r.width / 2;
  const cy = top + r.height / 2;
  const rightX = left + r.width;
  const bottomY = top + r.height;

  // Keep both buttons inside the visible paper so the container's overflow-hidden
  // never clips them; flip to the opposite side of the node when they'd run off.
  const OFF = 30;
  const M = 14;
  const minX = paperOffset.left + M;
  const maxX = paperOffset.left + paperSize.width - M;
  const minY = paperOffset.top + M;
  const maxY = paperOffset.top + paperSize.height - M;

  // Child: right of the node, flipping to the left when it would overflow.
  let childX = rightX + OFF;
  if (childX > maxX) childX = left - OFF;
  const childPos = { left: clamp(childX, minX, maxX), top: clamp(cy, minY, maxY) };

  // Sibling: below the node, flipping above when it would overflow.
  let siblingY = bottomY + OFF;
  if (siblingY > maxY) siblingY = top - OFF;
  const siblingPos = { left: clamp(cx, minX, maxX), top: clamp(siblingY, minY, maxY) };

  return (
    <>
      <QuickButton
        pos={childPos}
        title="Add child"
        onClick={onAddChild}
      />
      <QuickButton
        pos={siblingPos}
        title="Add sibling"
        onClick={onAddSibling}
      />
    </>
  );
});

function QuickButton({
  pos,
  title,
  onClick,
}: {
  pos: { left: number; top: number };
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      // Pointer-down (not just click) so a stylus/touch tap responds instantly;
      // stop propagation so it never reaches the canvas underneath.
      onPointerDown={(e) => e.stopPropagation()}
      className="nd-hit pointer-events-auto absolute z-30 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-nd-accent/50 bg-nd-surface/95 text-nd-accent shadow-lg backdrop-blur transition hover:scale-110 hover:bg-nd-accent hover:text-white"
      style={{ left: pos.left, top: pos.top }}
    >
      <Plus size={15} strokeWidth={2.5} />
    </button>
  );
}
