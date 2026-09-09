"use client";

import { memo, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
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
import { useIsTouch } from "@/lib/hooks/useIsMobile";

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
  // Lift above the bottom tool dock on any touch device (phone OR tablet), which
  // now both use the horizontal dock.
  const isTouch = useIsTouch();
  const pct = Math.round(zoom * 100);

  // Escape closes the popover (outside-click handled by the transient overlay).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className="absolute left-4 z-20 transition-[bottom]"
      // Lift above the bottom tool dock so they never overlap.
      style={{ bottom: (isTouch ? 84 : 20) + keyboardInset }}
    >
      <div className="relative">
        {/* The ONLY persistent control: a compact percentage button. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Zoom & canvas"
          className={[
            "nd-hit flex h-8 items-center gap-1 rounded-xl border border-nd-border bg-nd-surface/95 px-2.5 text-[13px] font-medium tabular-nums shadow-xl backdrop-blur transition-colors",
            open ? "text-nd-text" : "text-nd-text hover:bg-nd-surface",
          ].join(" ")}
        >
          {pct}%
          <ChevronDown size={14} className={`text-nd-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <>
            {/* Transient overlay — present ONLY while open, so nothing intercepts
                canvas interaction after it closes. */}
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="absolute bottom-full left-0 z-40 mb-2 w-52 rounded-xl border border-nd-border bg-nd-surface p-1.5 shadow-2xl"
            >
              {/* Zoom row */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onZoomOut}
                  aria-label="Zoom out"
                  title="Zoom out  (Ctrl -)"
                  className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
                >
                  <Minus size={16} />
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  title="Zoom to 100%  (Ctrl 0)"
                  className="nd-hit flex h-8 flex-1 items-center justify-center rounded-lg text-[13px] font-medium tabular-nums text-nd-text transition-colors hover:bg-white/5"
                >
                  {pct}%
                </button>
                <button
                  type="button"
                  onClick={onZoomIn}
                  aria-label="Zoom in"
                  title="Zoom in  (Ctrl +)"
                  className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="my-1 h-px bg-nd-border" />

              {/* Fit / reset actions (menu closes after each). */}
              {(
                [
                  { label: "Fit content", icon: <Maximize size={15} />, run: onFitContent, disabled: false },
                  { label: "Fit selection", icon: <ScanSearch size={15} />, run: onFitSelection, disabled: !hasSelection },
                  { label: "Zoom to 100%", icon: <span className="text-[11px] font-semibold">1:1</span>, run: onReset, disabled: false },
                ] as { label: string; icon: React.ReactNode; run: () => void; disabled: boolean }[]
              ).map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    it.run();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="flex w-4 justify-center text-nd-muted">{it.icon}</span>
                  <span className="flex-1 text-left">{it.label}</span>
                </button>
              ))}

              <div className="my-1 h-px bg-nd-border" />

              <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-nd-muted">
                Canvas
              </div>
              <div className="grid grid-cols-3 gap-1">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={canvasStyle === s.id}
                    onClick={() => {
                      onSetStyle(s.id);
                      setOpen(false);
                    }}
                    title={s.label}
                    className={[
                      "relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition-colors",
                      canvasStyle === s.id
                        ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                        : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
                    ].join(" ")}
                  >
                    <span className={canvasStyle === s.id ? "text-nd-accent" : ""}>{s.icon}</span>
                    <span className="truncate">{s.label}</span>
                    {canvasStyle === s.id && (
                      <Check size={11} className="absolute right-1 top-1 text-nd-accent" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
