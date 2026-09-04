"use client";

import { useRef, useState } from "react";
import { FileUp, ShieldCheck } from "lucide-react";
import { MAX_PDF_BYTES } from "@/lib/pdf/limits";

const MAX_MB = Math.round(MAX_PDF_BYTES / (1024 * 1024));

export function PdfDropzone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="flex min-h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-nd-text sm:text-3xl">
          Open a <span className="nd-gradient-text">PDF</span>
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-nd-muted">
          View and page through any PDF instantly. It renders right here in your
          browser — nothing is uploaded.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
          className={`mt-8 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 transition-colors ${
            dragging
              ? "border-nd-accent bg-nd-accent/10"
              : "border-nd-border bg-nd-surface/40 hover:border-nd-accent/50 hover:bg-nd-surface"
          }`}
        >
          <span className="nd-gradient flex h-12 w-12 items-center justify-center rounded-xl text-white">
            <FileUp size={22} />
          </span>
          <span className="text-sm font-medium text-nd-text">
            Drop a PDF here, or click to choose
          </span>
          <span className="text-xs text-nd-muted">Up to {MAX_MB} MB</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />

        <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-nd-muted">
          <ShieldCheck size={14} className="text-nd-accent" />
          Your file never leaves your device.
        </p>
      </div>
    </div>
  );
}
