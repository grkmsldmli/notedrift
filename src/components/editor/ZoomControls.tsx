"use client";

import { memo, useState } from "react";
import {
  Check,
  Grid2x2,
  Grid3x3,
  Grip,
  Maximize,
  Minus,
  Plus,
  Ruler,
  ScanSearch,
  Square,
} from "lucide-react";
import type { CanvasStyle } from "@/lib/types";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface ZoomControlsProps {
  zoom: number;
  canvasStyle: CanvasStyle;
  hasSelection: boolean;
  /** Height (px) the software keyboard covers, so the controls lift above it. */
  keyboardInset?: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitContent: () => void;
  onFitSelection: () => void;
  onSetStyle: (style: CanvasStyle) => void;
}

const STYLES: { id: CanvasStyle; label: string; icon: React.ReactNode }[] = [
  { id: "blank", label: "Blank", icon: <Square size={15} /> },
  { id: "dots", label: "Dots", icon: <Grip size={15} /> },
  { id: "grid", label: "Grid", icon: <Grid3x3 size={15} /> },
  { id: "lines", label: "Lines", icon: <Minus size={15} /> },
  { id: "graph", label: "Graph", icon: <Grid2x2 size={15} /> },
  { id: "engineering", label: "Engineering", icon: <Ruler size={15} /> },
];

export const ZoomControls = memo(function ZoomControls({
  zoom,
  canvasStyle,
  hasSelection,
  keyboardInset = 0,
  onZoomIn,
  onZoomOut,
  onReset,
  onFitContent,
  onFitSelection,
  onSetStyle,
}: ZoomControlsProps) {
  const [open, setOpen] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const isMobile = useIsMobile();
  const pct = Math.round(zoom * 100);
  const current = STYLES.find((s) => s.id === canvasStyle) ?? STYLES[1];

  return (
    <div
      className="absolute left-4 z-20 flex items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl backdrop-blur transition-[bottom]"
      // Lift above the mobile bottom tool dock so they never overlap.
      style={{ bottom: (isMobile ? 84 : 20) + keyboardInset }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out  (Ctrl -)"
        aria-label="Zoom out"
        className="nd-hit flex h-7 w-7 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Minus size={16} />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setZoomMenu((o) => !o)}
          title="Zoom & fit"
          className="nd-hit min-w-12 rounded-lg px-1.5 py-0.5 text-center text-[13px] font-medium tabular-nums text-nd-text transition-colors hover:bg-white/5"
        >
          {pct}%
        </button>
        {zoomMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setZoomMenu(false)} />
            <div className="absolute bottom-full left-0 z-40 mb-2 w-44 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
              {(
                [
                  { label: "Fit content", icon: <Maximize size={15} />, run: onFitContent, disabled: false },
                  { label: "Fit selection", icon: <ScanSearch size={15} />, run: onFitSelection, disabled: !hasSelection },
                  { label: "Zoom to 100%", icon: <span className="text-xs font-semibold">1:1</span>, run: onReset, disabled: false },
                ] as { label: string; icon: React.ReactNode; run: () => void; disabled: boolean }[]
              ).map((it) => (
                <button
                  key={it.label}
                  type="button"
                  disabled={it.disabled}
                  onClick={() => {
                    it.run();
                    setZoomMenu(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="flex w-4 justify-center text-nd-muted">{it.icon}</span>
                  <span className="flex-1 text-left">{it.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in  (Ctrl +)"
        aria-label="Zoom in"
        className="nd-hit flex h-7 w-7 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Plus size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-nd-border" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Canvas appearance"
          aria-label="Canvas appearance"
          aria-expanded={open}
          className={[
            "nd-hit flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors",
            open
              ? "bg-white/10 text-nd-text"
              : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
          ].join(" ")}
        >
          {current.icon}
          <span className="hidden sm:inline">{current.label}</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute bottom-full left-0 z-40 mb-2 w-36 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSetStyle(s.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
                >
                  <span className="text-nd-muted">{s.icon}</span>
                  <span className="flex-1 text-left">{s.label}</span>
                  {canvasStyle === s.id && (
                    <Check size={15} className="text-nd-accent" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
