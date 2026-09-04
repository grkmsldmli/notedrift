"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfRenderer } from "@/lib/pdf/renderer";

const THUMB_W = 108; // css px

/** Lazy, virtualized thumbnail strip. Only pages within (or near) the scroll
 *  viewport are rendered — computed from scroll position rather than an
 *  IntersectionObserver, so it's deterministic and works even for a 500-page
 *  document. Each thumb renders once through a one-at-a-time queue and is cached
 *  as a data URL. */
export function PdfThumbnailRail({
  renderer,
  numPages,
  currentPage,
  onSelect,
}: {
  renderer: PdfRenderer;
  numPages: number;
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const navRef = useRef<HTMLElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const queueRef = useRef<number[]>([]);
  const inFlightRef = useRef(false);
  const doneRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const drain = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      while (queueRef.current.length > 0 && mountedRef.current) {
        const page = queueRef.current.shift()!;
        if (doneRef.current.has(page)) continue;
        const canvas = document.createElement("canvas");
        try {
          const ok = await renderer.renderThumbnail(page, THUMB_W, canvas);
          if (!ok || !mountedRef.current) continue;
          doneRef.current.add(page);
          const url = canvas.toDataURL("image/png");
          setThumbs((prev) => ({ ...prev, [page]: url }));
        } catch {
          /* a failed thumb just stays a placeholder */
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [renderer]);

  const request = useCallback(
    (page: number) => {
      if (doneRef.current.has(page) || queueRef.current.includes(page)) return;
      queueRef.current.push(page);
      void drain();
    },
    [drain],
  );

  // Request every page thumbnail currently within the scroll viewport (+ margin).
  const recompute = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const itemH = nav.querySelector("li")?.offsetHeight || 170;
    const margin = itemH * 3;
    const start = Math.max(1, Math.floor((nav.scrollTop - margin) / itemH) + 1);
    const end = Math.min(numPages, Math.ceil((nav.scrollTop + nav.clientHeight + margin) / itemH));
    for (let p = start; p <= end; p++) request(p);
  }, [numPages, request]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  // Keep the active thumbnail visible and refresh the visible range when the
  // page changes elsewhere (keyboard, next/prev, etc.).
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
    recompute();
  }, [currentPage, recompute]);

  return (
    <nav
      ref={navRef}
      onScroll={recompute}
      aria-label="Pages"
      className="nd-scroll hidden h-full w-[132px] shrink-0 overflow-y-auto border-r border-nd-border bg-nd-bg-2/60 py-3 md:block"
    >
      <ul className="flex flex-col items-center gap-2">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
          const active = n === currentPage;
          const src = thumbs[n];
          return (
            <li key={n} ref={active ? activeItemRef : undefined}>
              <button
                type="button"
                onClick={() => onSelect(n)}
                aria-current={active ? "page" : undefined}
                className={`group flex flex-col items-center gap-1 rounded-md p-1 transition-colors ${
                  active ? "bg-nd-accent/15" : "hover:bg-white/5"
                }`}
              >
                <span
                  style={{ width: THUMB_W }}
                  className={`flex aspect-[3/4] items-center justify-center overflow-hidden rounded-sm border ${
                    active ? "border-nd-accent" : "border-nd-border"
                  } bg-white`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="h-full w-full animate-pulse bg-nd-surface-2" />
                  )}
                </span>
                <span
                  className={`text-[10px] tabular-nums ${
                    active ? "text-nd-accent" : "text-nd-muted"
                  }`}
                >
                  {n}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
