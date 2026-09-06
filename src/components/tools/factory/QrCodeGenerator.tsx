"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { downloadBlob, dataUrlToBlob } from "@/lib/export/download";

// Generates a QR code entirely in the browser via the `qrcode` library. No
// network call, no tracking redirect — the code encodes exactly what you type.

const SIZES = [
  { label: "Small", px: 256 },
  { label: "Medium", px: 512 },
  { label: "Large", px: 1024 },
] as const;

export function QrCodeGenerator() {
  const [text, setText] = useState("");
  const [size, setSize] = useState(512);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = text.trim();
    if (!value) return; // render shows the placeholder; no synchronous setState here
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!active) return;
        setDataUrl(url);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setDataUrl(null);
        setError("That's too much data for a single QR code. Try a shorter link or text.");
      });
    return () => {
      active = false;
    };
  }, [text, size]);

  // Only surface a code / error while there's actually input.
  const trimmed = text.trim();
  const shownUrl = trimmed ? dataUrl : null;
  const shownError = trimmed ? error : null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qr-input" className="sr-only">
          Link or text to encode
        </label>
        <input
          id="qr-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://example.com or any text"
          className="w-full rounded-lg border border-nd-border bg-nd-bg-2 px-3 py-2.5 text-sm text-nd-text outline-none ring-nd-accent/50 transition focus:ring-2"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-nd-muted">Size</span>
        {SIZES.map((s) => (
          <button
            key={s.px}
            type="button"
            onClick={() => setSize(s.px)}
            aria-pressed={size === s.px}
            className={[
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              size === s.px
                ? "border-nd-accent bg-nd-accent/10 text-nd-text"
                : "border-nd-border text-nd-muted hover:bg-white/5 hover:text-nd-text",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-nd-border bg-nd-surface/40 p-6">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownUrl}
            alt="Generated QR code"
            width={200}
            height={200}
            className="h-[200px] w-[200px] rounded-lg bg-white p-2"
          />
        ) : shownError ? (
          <p className="text-center text-sm text-red-400">{shownError}</p>
        ) : (
          <p className="text-center text-sm text-nd-muted">
            Your QR code will appear here as you type.
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!shownUrl}
        onClick={() => shownUrl && downloadBlob(dataUrlToBlob(shownUrl), "qr-code.png")}
        className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Download size={16} /> Download PNG
      </button>
    </div>
  );
}
