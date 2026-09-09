"use client";

// Dedicated, touch-first "Paper" control for phone/tablet. The canvas-style picker
// (Blank / Dots / Grid / Lines / Graph / Engineering) is otherwise buried in the
// zoom menu; on touch this surfaces it as an always-visible labelled button that
// opens a large, finger-friendly sheet. It reuses the SAME callback the zoom menu
// uses (onSetPageStyle) so the change applies immediately, persists per page, and
// becomes the default for new pages — no duplicated logic.

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { CanvasStyle } from "@/lib/types";
import { PAPER_STYLES } from "./paperStyles";

export function PaperControl({
  canvasStyle,
  onSetStyle,
  keyboardInset = 0,
}: {
  canvasStyle: CanvasStyle;
  onSetStyle: (style: CanvasStyle) => void;
  keyboardInset?: number;
}) {
  const [open, setOpen] = useState(false);
  const current = PAPER_STYLES.find((s) => s.id === canvasStyle) ?? PAPER_STYLES[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div
        className="absolute right-4 z-20 transition-[bottom]"
        // Lift above the bottom tool dock, matching the zoom control on the left.
        style={{ bottom: 84 + keyboardInset }}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Paper style"
          className="nd-hit flex items-center gap-2 rounded-xl border border-nd-border bg-nd-surface/90 px-3 py-2 text-sm font-medium text-nd-text shadow-lg backdrop-blur transition-colors hover:bg-nd-surface"
        >
          <span className="text-nd-muted">{current.icon}</span>
          <span>Paper</span>
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Paper style"
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="nd-safe relative w-full max-w-md rounded-t-2xl border border-nd-border bg-nd-surface p-3 shadow-2xl sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between px-2 py-1">
              <span className="text-sm font-semibold text-nd-text">Paper</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
              >
                <X size={16} />
              </button>
            </div>

            <div role="menu" className="grid grid-cols-2 gap-2">
              {PAPER_STYLES.map((s) => {
                const active = canvasStyle === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSetStyle(s.id);
                      setOpen(false);
                    }}
                    className={`nd-hit flex min-h-[52px] items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                      active
                        ? "border-nd-accent/50 bg-nd-accent/[0.08] text-nd-accent"
                        : "border-nd-border text-nd-text hover:bg-white/5"
                    }`}
                  >
                    <span className={active ? "text-nd-accent" : "text-nd-muted"}>{s.icon}</span>
                    <span className="flex-1 text-left text-[15px] font-medium">{s.label}</span>
                    {active && <Check size={16} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
