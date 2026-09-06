"use client";

import { memo } from "react";
import {
  ArrowRight,
  Circle,
  Eraser,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  Minus,
  MousePointer2,
  Paintbrush,
  Pen,
  Pencil,
  PenLine,
  PenTool,
  Pin,
  PinOff,
  Shapes,
  StickyNote,
  Type,
} from "lucide-react";
import type { RailSlot, Tool } from "@/lib/types";
import { getToolDef } from "@/lib/tools/registry";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Pen, Pencil, PenLine, Highlighter, Paintbrush, PenTool, MousePointer2, Lasso,
  Hand, Type, StickyNote, Shapes, Circle, Minus, ArrowRight, Eraser, Image: ImageIcon,
};

/** Curated discovery groups — each entry is a Tool id from the registry. */
const GROUPS: { title: string; tools: Tool[] }[] = [
  { title: "Draw", tools: ["pen", "pencil", "marker", "highlighter", "brush", "technical"] },
  { title: "Write", tools: ["text", "note"] },
  { title: "Shapes", tools: ["rect", "line"] },
  { title: "Insert", tools: ["image" as Tool] },
  { title: "Organize", tools: ["select", "lasso"] },
  { title: "Navigate", tools: ["hand"] },
];

interface ToolLibraryProps {
  /** "v" = desktop left rail (opens to the right); "h" = mobile bottom dock
   *  (opens as a centered panel above the dock). */
  orient?: "h" | "v";
  tool: Tool;
  pinnedSlots: RailSlot[];
  onSelectTool: (tool: Tool) => void;
  onPickImage: () => void;
  onTogglePin: (slot: RailSlot) => void;
  onClose: () => void;
}

/** The unified tool-discovery popover: every tool grouped by purpose, each
 *  activatable and (where it has a rail slot) pinnable — the calm alternative to
 *  a permanently crowded rail. */
export const ToolLibrary = memo(function ToolLibrary({
  orient = "v",
  tool,
  pinnedSlots,
  onSelectTool,
  onPickImage,
  onTogglePin,
  onClose,
}: ToolLibraryProps) {
  // Desktop: anchored to the trigger's BOTTOM, opening rightward. Mobile: a
  // viewport-centered panel floating just above the bottom dock (fixed, so the
  // rightmost dock button can't push it off-screen).
  const panelPos =
    orient === "h"
      ? "fixed bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+4.25rem))] left-1/2 z-50 w-[min(20rem,92vw)] -translate-x-1/2"
      : "absolute bottom-0 left-full z-50 ml-2 w-56";
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={`${panelPos} rounded-xl border border-nd-border bg-nd-surface p-1.5 shadow-2xl`}>
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-nd-muted">
          Tools
        </div>
        <div className="nd-scroll max-h-[70vh] overflow-y-auto pr-0.5">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-nd-faint">
                {g.title}
              </div>
              {g.tools.map((t) => {
                const def = getToolDef(t);
                const Icon = (def?.icon && ICONS[def.icon]) || Circle;
                const label = def?.label ?? t;
                const slot = def?.slot as RailSlot | undefined;
                const pinned = !!slot && pinnedSlots.includes(slot);
                const active = tool === t;
                return (
                  <div
                    key={t}
                    className={[
                      "group flex items-center gap-2 rounded-lg px-2 py-1 transition-colors",
                      active ? "bg-nd-accent/15" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      className="nd-hit flex flex-1 items-center gap-2.5 text-left"
                      onClick={() => {
                        if (def?.action === "pick-image") onPickImage();
                        else onSelectTool(t);
                        onClose();
                      }}
                    >
                      <span className={active ? "text-nd-accent" : "text-nd-muted"}>
                        <Icon size={16} />
                      </span>
                      <span className="text-sm text-nd-text">{label}</span>
                    </button>
                    {slot && (
                      <button
                        type="button"
                        title={pinned ? "Unpin from toolbar" : "Pin to toolbar"}
                        onClick={() => onTogglePin(slot)}
                        className={[
                          "nd-hit flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                          pinned
                            ? "text-nd-accent hover:bg-white/5"
                            : "text-nd-faint opacity-0 hover:bg-white/5 hover:text-nd-text group-hover:opacity-100",
                        ].join(" ")}
                      >
                        {pinned ? <Pin size={13} /> : <PinOff size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
});
