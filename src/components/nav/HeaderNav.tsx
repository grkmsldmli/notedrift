"use client";

// One navigation language shared by every NoteDrift header (editor, tools, and
// future pages). `NavArrows` = compact browser back/forward; `BrandHome` = the
// logo/wordmark, which ALWAYS links to `/` (the canvas) — never browser-back.

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/editor/Logo";

const BTN =
  "nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-nd-muted";

function subscribeHistory(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/** Browser back/forward. Uses the real history stack — no custom route stack.
 *  Back is disabled when there's nowhere to go back to (history length ≤ 1);
 *  forward availability isn't reliably knowable, so that button stays enabled
 *  and is simply a no-op when there's nothing ahead (a safe, non-faked state).
 *  `useSyncExternalStore` keeps this SSR-safe (enabled on first paint) and
 *  updates it on browser back/forward, with no setState-in-effect. */
export function NavArrows({ className = "" }: { className?: string }) {
  const canBack = useSyncExternalStore(
    subscribeHistory,
    () => window.history.length > 1,
    () => true,
  );

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <button
        type="button"
        aria-label="Go back"
        disabled={!canBack}
        onClick={() => window.history.back()}
        className={BTN}
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        aria-label="Go forward"
        onClick={() => window.history.forward()}
        className={BTN}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

/** The brand: logo + wordmark, linking to the canvas at `/`. */
export function BrandHome({
  size = 24,
  wordmarkClassName = "",
}: {
  size?: number;
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Go to NoteDrift canvas"
      className="flex items-center gap-2"
    >
      <Logo size={size} />
      <span
        className={`text-[15px] font-semibold tracking-tight text-nd-text ${wordmarkClassName}`}
      >
        NoteDrift
      </span>
    </Link>
  );
}
