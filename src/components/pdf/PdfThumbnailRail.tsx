"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfRenderer } from "@/lib/pdf/renderer";
import type { PageSlot } from "@/lib/pdf/overlayController";

const THUMB_W = 108; // css px

/** Lazy, virtualized thumbnail strip over the page SLOTS (source page + user
 *  rotation). Click selects; drag reorders. Thumbnails are cached by
 *  source+rotation so a reorder doesn't re-render, but a rotation does. */
export function PdfThumbnailRail({
  renderer,
  pages,
  currentPage,
  intrinsicRotation,
  onSelect,
  onReorder,
}: {
  renderer: PdfRenderer;
  pages: readonly PageSlot[];
  currentPage: number; // 1-based
  intrinsicRotation: (sourceIndex: number) => number;
  onSelect: (page: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeItemRef = useRef<HTMLLIElement>(null);
  const queueRef = useRef<{ key: string; sourceIndex: number; rot: number }[]>([]);
  const inFlightRef = useRef(false);
  const doneRef = useRef<Set<string>>(new Set());
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
        const job = queueRef.current.shift()!;
        if (doneRef.current.has(job.key)) continue;
        const canvas = document.createElement("canvas");
        try {
          const ok = await renderer.renderThumbnail(job.sourceIndex + 1, THUMB_W, canvas, job.rot);
          if (!ok || !mountedRef.current) continue;
          doneRef.current.add(job.key);
          const url = canvas.toDataURL("image/png");
          setThumbs((prev) => ({ ...prev, [job.key]: url }));
        } catch {
          /* leave placeholder */
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [renderer]);

  const request = useCallback(
    (key: string, sourceIndex: number, rot: number) => {
      if (doneRef.current.has(key) || queueRef.current.some((j) => j.key === key)) return;
      queueRef.current.push({ key, sourceIndex, rot });
      void drain();
    },
    [drain],
  );

  const keyOf = useCallback(
    (slot: PageSlot) => `${slot.sourceIndex}:${(intrinsicRotation(slot.sourceIndex) + slot.rotation) % 360}`,
    [intrinsicRotation],
  );

  const recompute = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const itemH = nav.querySelector("li")?.offsetHeight || 170;
    const margin = itemH * 3;
    const start = Math.max(0, Math.floor((nav.scrollTop - margin) / itemH));
    const end = Math.min(pages.length - 1, Math.ceil((nav.scrollTop + nav.clientHeight + margin) / itemH));
    for (let i = start; i <= end; i++) {
      const slot = pages[i];
      if (slot) request(keyOf(slot), slot.sourceIndex, (intrinsicRotation(slot.sourceIndex) + slot.rotation) % 360);
    }
  }, [pages, request, keyOf, intrinsicRotation]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentPage]);

  return (
    <nav
      ref={navRef}
      onScroll={recompute}
      aria-label="Pages"
      className="nd-scroll hidden h-full w-[132px] shrink-0 overflow-y-auto border-r border-nd-border bg-nd-bg-2/60 py-3 md:block"
    >
      <ul className="flex flex-col items-center gap-2">
        {pages.map((slot, i) => {
          const active = i + 1 === currentPage;
          const src = thumbs[keyOf(slot)];
          return (
            <li
              key={slot.id}
              ref={active ? activeItemRef : undefined}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== i) setDragOver(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={dragOver === i && dragFrom !== null && dragFrom !== i ? "rounded-md ring-2 ring-nd-accent" : ""}
            >
              <button
                type="button"
                onClick={() => onSelect(i + 1)}
                aria-current={active ? "page" : undefined}
                aria-label={`Page ${i + 1}`}
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
                    <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
                  ) : (
                    <span className="h-full w-full animate-pulse bg-nd-surface-2" />
                  )}
                </span>
                <span className={`text-[10px] tabular-nums ${active ? "text-nd-accent" : "text-nd-muted"}`}>
                  {i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
