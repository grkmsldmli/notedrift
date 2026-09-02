"use client";

import { Grid2x2, Minus, Plus } from "lucide-react";

interface ZoomControlsProps {
  zoom: number;
  gridOn: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleGrid: () => void;
}

export function ZoomControls({
  zoom,
  gridOn,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleGrid,
}: ZoomControlsProps) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="absolute bottom-5 left-4 z-20 flex items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out  (Ctrl -)"
        aria-label="Zoom out"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Minus size={16} />
      </button>

      <button
        type="button"
        onClick={onReset}
        title="Reset to 100%"
        className="min-w-14 rounded-lg px-2 py-1 text-center text-sm font-medium tabular-nums text-nd-text transition-colors hover:bg-white/5"
      >
        {pct}%
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in  (Ctrl +)"
        aria-label="Zoom in"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Plus size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-nd-border" />

      <button
        type="button"
        onClick={onToggleGrid}
        title="Toggle dotted grid"
        aria-pressed={gridOn}
        className={[
          "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
          gridOn
            ? "bg-nd-accent/15 text-white ring-1 ring-nd-accent/40"
            : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
        ].join(" ")}
      >
        <Grid2x2 size={15} />
        <span className="hidden sm:inline">Infinite</span>
      </button>
    </div>
  );
}
