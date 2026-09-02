"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  Grid2x2,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import type { PageMeta } from "@/lib/types";
import { IconButton } from "../ui/IconButton";
import { Logo } from "./Logo";

interface TopBarProps {
  pages: PageMeta[];
  currentPageId: string | null;
  currentTitle: string;
  canUndo: boolean;
  canRedo: boolean;
  gridOn: boolean;
  onNewPage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onToggleGrid: () => void;
  onSwitchPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string) => void;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function TopBar(props: TopBarProps) {
  const {
    pages,
    currentPageId,
    currentTitle,
    canUndo,
    canRedo,
    gridOn,
    onNewPage,
    onUndo,
    onRedo,
    onExport,
    onToggleGrid,
    onSwitchPage,
    onDeletePage,
    onRenamePage,
  } = props;

  const [pagesOpen, setPagesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeAll = () => {
    setPagesOpen(false);
    setMenuOpen(false);
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-nd-border bg-nd-bg px-3 sm:px-4">
      {/* Left: brand + page switcher */}
      <div className="flex min-w-0 items-center gap-2">
        <Logo size={26} />
        <span className="text-[15px] font-semibold tracking-tight text-nd-text">
          NoteDrift
        </span>
        <span className="ml-1 hidden text-xs text-nd-muted md:inline">
          Open. <span className="nd-gradient-text font-semibold">Think.</span>{" "}
          Create.
        </span>

        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPagesOpen((o) => !o);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
          >
            <FileText size={14} />
            <span className="max-w-[130px] truncate">{currentTitle}</span>
            <ChevronDown size={14} />
          </button>

          {pagesOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeAll} />
              <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-nd-muted">
                  Recent pages
                </div>
                <div className="nd-scroll max-h-80 overflow-auto">
                  {pages.map((p) => {
                    const active = p.id === currentPageId;
                    return (
                      <div
                        key={p.id}
                        className={[
                          "group flex items-center gap-1 rounded-lg pr-1",
                          active ? "bg-white/10" : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSwitchPage(p.id);
                            closeAll();
                          }}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2 text-left"
                        >
                          <span className="truncate text-sm text-nd-text">
                            {p.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-nd-muted">
                            {timeAgo(p.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Rename"
                          onClick={() => onRenamePage(p.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted opacity-0 transition hover:bg-white/10 hover:text-nd-text group-hover:opacity-100"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => onDeletePage(p.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewPage}
          className="nd-gradient flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Page</span>
        </button>

        <div className="mx-1 hidden h-6 w-px bg-nd-border sm:block" />

        <IconButton
          icon={<Undo2 size={18} />}
          label="Undo  (Ctrl Z)"
          onClick={onUndo}
          disabled={!canUndo}
        />
        <IconButton
          icon={<Redo2 size={18} />}
          label="Redo  (Ctrl Shift Z)"
          onClick={onRedo}
          disabled={!canRedo}
        />
        <IconButton
          icon={<Download size={18} />}
          label="Export PNG"
          onClick={onExport}
        />

        <div className="relative">
          <IconButton
            icon={<MoreHorizontal size={18} />}
            label="More"
            active={menuOpen}
            onClick={() => {
              setPagesOpen(false);
              setMenuOpen((o) => !o);
            }}
          />
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeAll} />
              <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    onToggleGrid();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
                >
                  <Grid2x2 size={16} className="text-nd-muted" />
                  <span className="flex-1 text-left">Dotted grid</span>
                  {gridOn && <Check size={15} className="text-nd-accent" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentPageId) onRenamePage(currentPageId);
                    closeAll();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
                >
                  <Pencil size={16} className="text-nd-muted" />
                  <span className="flex-1 text-left">Rename page</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExport();
                    closeAll();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
                >
                  <Download size={16} className="text-nd-muted" />
                  <span className="flex-1 text-left">Export PNG</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
