"use client";

// Lightweight first-use education. NEVER a wall or a step wizard — the canvas is
// always usable. Two pieces:
//   • EmptyCanvasHint — one subtle line over a genuinely empty canvas, gone for
//     good once the user has created anything.
//   • QuickStart — a small, dismissible first-run coach card (once ever).
// Both persist their dismissal in localStorage, guarded so a private window or
// blocked storage just means the hint may reappear — never an error.

import { useEffect, useState } from "react";
import Link from "next/link";
import { MousePointer2, X } from "lucide-react";

const HINT_KEY = "nd_canvas_hint_seen";
const QUICKSTART_KEY = "nd_quickstart_seen_v1";

function getFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function setFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable — non-fatal */
  }
}

/** One calm line centered on an empty canvas. `pointer-events-none` so it can
 *  never block drawing; it vanishes the moment the page has content, and never
 *  returns once the user has drawn anything. Client-only (the editor is ssr:false),
 *  so the lazy initializer can read storage without a hydration mismatch. */
export function EmptyCanvasHint({ isEmpty, ready }: { isEmpty: boolean; ready: boolean }) {
  const [seen] = useState(() => getFlag(HINT_KEY));

  // Once the canvas has content, remember it so the hint never shows again. Only
  // writes localStorage (no setState) — the prop change already hides the hint.
  useEffect(() => {
    if (ready && !isEmpty && !getFlag(HINT_KEY)) setFlag(HINT_KEY);
  }, [ready, isEmpty]);

  if (seen || !ready || !isEmpty) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
      <p className="rounded-full border border-nd-border bg-nd-surface/80 px-4 py-2 text-center text-sm text-nd-muted shadow-sm backdrop-blur">
        Draw, type, or drop an image — it saves automatically.
      </p>
    </div>
  );
}

const STEPS = [
  "Draw or type anywhere on the page",
  "Open All Tools for shapes, notes & more",
  "Pages save on this device automatically",
  "Sign in to sync canvases across devices",
];

/** A small first-run card (once ever). Not modal — no backdrop, so the canvas
 *  stays usable behind it. */
export function QuickStart() {
  const [show, setShow] = useState(() => !getFlag(QUICKSTART_KEY));

  if (!show) return null;

  const dismiss = () => {
    setFlag(QUICKSTART_KEY);
    setShow(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(22rem,92vw)] rounded-2xl border border-nd-border bg-nd-surface/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-nd-text">Welcome to NoteDrift</h2>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="nd-hit -mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
          >
            <X size={15} />
          </button>
        </div>
        <ul className="space-y-1.5 text-sm text-nd-muted">
          {STEPS.map((s) => (
            <li key={s} className="flex items-start gap-2">
              <MousePointer2 size={14} className="mt-0.5 shrink-0 text-nd-accent" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="nd-gradient flex-1 rounded-lg py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Got it
          </button>
          <Link
            href="/help"
            onClick={dismiss}
            className="rounded-lg border border-nd-border px-3 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
          >
            Help
          </Link>
        </div>
      </div>
    </div>
  );
}
