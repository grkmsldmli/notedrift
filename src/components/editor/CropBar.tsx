"use client";

import { memo } from "react";
import { Check, Crop, RotateCcw, X } from "lucide-react";

interface CropBarProps {
  onDone: () => void;
  onCancel: () => void;
  onReset: () => void;
}

/** The minimal crop-mode bar — Reset / Cancel / Done. Shown only while cropping,
 *  replacing the normal object toolbar so the canvas stays calm. */
export const CropBar = memo(function CropBar({ onDone, onCancel, onReset }: CropBarProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 px-2 py-1.5 shadow-2xl backdrop-blur">
      <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-nd-muted">
        <Crop size={13} /> Crop
      </span>
      <div className="mx-1 h-5 w-px bg-nd-border" />
      <button
        type="button"
        onClick={onReset}
        title="Reset crop"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <RotateCcw size={14} /> Reset
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Cancel  (Esc)"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <X size={14} /> Cancel
      </button>
      <button
        type="button"
        onClick={onDone}
        title="Apply crop  (Enter)"
        className="flex h-8 items-center gap-1.5 rounded-lg bg-nd-accent/20 px-3 text-sm font-medium text-nd-text ring-1 ring-nd-accent/40 transition-colors hover:bg-nd-accent/30"
      >
        <Check size={15} /> Done
      </button>
    </div>
  );
});
