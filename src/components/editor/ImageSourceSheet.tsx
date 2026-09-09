"use client";

// Touch-friendly "Add Image" chooser, shown on native iOS when the Image tool is
// tapped. Each row is >= 52px tall (comfortable finger target) and routes to a
// native source: Photo Library / Take Photo (camera) / Files. On web this sheet is
// never shown — the hidden <input type=file> is used directly.

import { useEffect } from "react";
import { Camera, FolderOpen, ImageIcon, X } from "lucide-react";
import type { NativeImageSource } from "@/lib/image/native";

const OPTIONS: {
  source: NativeImageSource;
  label: string;
  hint: string;
  icon: React.ReactNode;
}[] = [
  {
    source: "library",
    label: "Photo Library",
    hint: "Choose one or more photos",
    icon: <ImageIcon size={20} />,
  },
  {
    source: "camera",
    label: "Take Photo",
    hint: "Use the camera",
    icon: <Camera size={20} />,
  },
  {
    source: "files",
    label: "Files",
    hint: "Browse iCloud & on-device files",
    icon: <FolderOpen size={20} />,
  },
];

export function ImageSourceSheet({
  onPick,
  onClose,
}: {
  onPick: (source: NativeImageSource) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add image"
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
      />
      <div className="nd-safe relative w-full max-w-md rounded-t-2xl border border-nd-border bg-nd-surface p-3 shadow-2xl sm:mb-0 sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between px-2 py-1">
          <span className="text-sm font-semibold text-nd-text">Add Image</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {OPTIONS.map((o) => (
            <button
              key={o.source}
              type="button"
              onClick={() => onPick(o.source)}
              className="nd-hit flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nd-surface-2 text-nd-accent">
                {o.icon}
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-medium text-nd-text">{o.label}</span>
                <span className="text-xs text-nd-muted">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="nd-hit mt-2 min-h-[48px] w-full rounded-xl border border-nd-border text-sm font-medium text-nd-text transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
