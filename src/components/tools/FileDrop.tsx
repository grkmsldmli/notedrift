"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

interface FileDropProps {
  /** `accept` attribute for the file input (MIME list). */
  accept: string;
  multiple?: boolean;
  /** Friendly label of accepted input, e.g. "PNG" or "JPG, PNG or WebP". */
  acceptLabel: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}

export function FileDrop({
  accept,
  multiple = false,
  acceptLabel,
  disabled = false,
  onFiles,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = () => inputRef.current?.click();
  const handle = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`Choose ${acceptLabel} file${multiple ? "s" : ""}, or drop ${multiple ? "them" : "it"} here`}
      onClick={disabled ? undefined : pick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={[
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors outline-none",
        disabled
          ? "cursor-not-allowed opacity-50 border-nd-border"
          : over
            ? "cursor-pointer border-nd-accent bg-nd-accent/5"
            : "cursor-pointer border-nd-border hover:border-nd-accent/60 hover:bg-white/[0.02] focus-visible:border-nd-accent",
      ].join(" ")}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-nd-surface-2 text-nd-accent">
        <Upload size={20} />
      </span>
      <span className="text-sm font-medium text-nd-text">
        Drop {multiple ? `${acceptLabel} files` : `a ${acceptLabel} file`} here
      </span>
      <span className="text-xs text-nd-muted">
        or <span className="text-nd-accent">choose {multiple ? "files" : "a file"}</span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = ""; // allow re-picking the same file
        }}
      />
    </div>
  );
}
