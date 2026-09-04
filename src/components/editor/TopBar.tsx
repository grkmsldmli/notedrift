"use client";

import { memo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import type { PageMeta } from "@/lib/types";
import { IconButton } from "../ui/IconButton";
import { AccountButton } from "../auth/AccountButton";
import { Logo } from "./Logo";

interface TopBarProps {
  pages: PageMeta[];
  currentPageId: string | null;
  currentTitle: string;
  canUndo: boolean;
  canRedo: boolean;
  onNewPage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onSwitchPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onRenamePage: (id: string, title: string) => void;
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

export const TopBar = memo(function TopBar(props: TopBarProps) {
  const {
    pages,
    currentPageId,
    currentTitle,
    canUndo,
    canRedo,
    onNewPage,
    onUndo,
    onRedo,
    onExport,
    onSwitchPage,
    onDeletePage,
    onRenamePage,
  } = props;

  const [pagesOpen, setPagesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const closeAll = () => {
    setPagesOpen(false);
    setMenuOpen(false);
    setConfirmId(null);
  };

  const startEditing = () => {
    closeAll();
    setDraft(currentTitle);
    setEditing(true);
  };

  const commitEditing = () => {
    if (!editing) return;
    setEditing(false);
    if (currentPageId) onRenamePage(currentPageId, draft.trim() || "Untitled");
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-nd-border bg-nd-bg px-3 sm:px-4">
      {/* Left: brand + page switcher */}
      <div className="flex min-w-0 items-center gap-2">
        <Logo size={26} />
        <span className="hidden text-[15px] font-semibold tracking-tight text-nd-text sm:inline">
          NoteDrift
        </span>
        <span className="ml-1 hidden text-xs text-nd-muted md:inline">
          Open. <span className="nd-gradient-text font-semibold">Think.</span>{" "}
          Create.
        </span>

        <div className="relative ml-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEditing}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEditing();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="w-44 rounded-md bg-nd-surface-2 px-2 py-1.5 text-sm text-nd-text outline-none ring-1 ring-nd-accent/50"
              aria-label="Page title"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmId(null);
                setPagesOpen((o) => !o);
              }}
              onDoubleClick={startEditing}
              title="Switch pages — double-click to rename"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
            >
              <FileText size={14} className="hidden sm:block" />
              <span className="max-w-[110px] truncate sm:max-w-[130px]">
                {currentTitle}
              </span>
              <ChevronDown size={14} />
            </button>
          )}

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
                    const confirming = confirmId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={[
                          "group flex items-center gap-1 rounded-lg pr-1",
                          active ? "bg-white/10" : "hover:bg-white/5",
                        ].join(" ")}
                      >
                        {confirming ? (
                          <div className="flex flex-1 items-center gap-2 px-2 py-1.5">
                            <span className="flex-1 truncate text-sm text-nd-muted">
                              Delete this page?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeletePage(p.id);
                                setConfirmId(null);
                              }}
                              className="rounded-md bg-red-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmId(null)}
                              className="rounded-md px-2 py-1 text-xs text-nd-muted hover:bg-white/10 hover:text-nd-text"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
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
                              title="Delete"
                              onClick={() => setConfirmId(p.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
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
      <div className="flex shrink-0 items-center gap-1">
        {/* Secondary to New Page; hidden on small screens (available in More). */}
        <Link
          href="/tools"
          className="nd-hit mr-0.5 hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text md:inline-flex"
        >
          <Wrench size={15} />
          Convert Files
        </Link>

        <button
          type="button"
          onClick={onNewPage}
          className="nd-hit nd-gradient flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
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
        {/* Redundant with the "More" menu's Export — hide on phones so the
            account control fits without crowding the title (see Phase 1.6H). */}
        <span className="hidden sm:block">
          <IconButton
            icon={<Download size={18} />}
            label="Export PNG"
            onClick={onExport}
          />
        </span>

        <div className="relative">
          <IconButton
            icon={<MoreHorizontal size={18} />}
            label="More"
            active={menuOpen}
            onClick={() => {
              setPagesOpen(false);
              setConfirmId(null);
              setMenuOpen((o) => !o);
            }}
          />
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeAll} />
              <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
                <button
                  type="button"
                  onClick={startEditing}
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
                <Link
                  href="/tools"
                  onClick={closeAll}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-nd-text transition-colors hover:bg-white/5 md:hidden"
                >
                  <Wrench size={16} className="text-nd-muted" />
                  <span className="flex-1 text-left">Convert Files</span>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Account (top-right). Renders nothing unless auth is configured. */}
        <AccountButton />
      </div>
    </header>
  );
});
