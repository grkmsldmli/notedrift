"use client";

// TEMPORARY real-device diagnostics for the iPad-Safari input-state bugs.
// Mounted ONLY when the URL carries `?touchdebug=1` (see Editor). It polls the
// controller's debugSnapshot() and shows live pointer/gesture/tool state plus a
// copyable event log, so the owner can reproduce on a physical iPad in Safari and
// hand back the exact sequence. Nothing here runs — or is even mounted — in a
// normal session. Remove once the bugs are confirmed fixed on device.

import { useEffect, useRef, useState } from "react";
import type { CanvasController } from "@/lib/canvasController";

type Snapshot = ReturnType<CanvasController["debugSnapshot"]>;

export function TouchDebugPanel({
  controllerRef,
}: {
  controllerRef: React.RefObject<CanvasController | null>;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const c = controllerRef.current;
      if (c) setSnap(c.debugSnapshot());
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [controllerRef]);

  // Keep the log pinned to the newest line.
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap]);

  if (!snap?.enabled) return null;

  const asText = () =>
    `NoteDrift touch debug\nstate: ${JSON.stringify(snap.state)}\n\n${snap.log.join("\n")}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — select the textarea so it can be copied manually.
      const ta = document.getElementById("nd-touchdebug-ta") as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
    }
  };

  const boolStyle = (v: unknown) =>
    typeof v === "boolean"
      ? { color: v ? "#34d399" : "#64748b", fontWeight: 600 as const }
      : { color: "#e5e7eb" };

  return (
    <div
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: 9999,
        width: open ? 320 : "auto",
        maxWidth: "calc(100vw - 16px)",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "#e5e7eb",
        background: "rgba(10,11,16,0.94)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        touchAction: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "6px 8px",
          borderBottom: open ? "1px solid rgba(255,255,255,0.1)" : "none",
        }}
      >
        <strong style={{ letterSpacing: 0.4 }}>touchdebug</strong>
        <div style={{ display: "flex", gap: 6 }}>
          {open && (
            <button
              type="button"
              onClick={copy}
              style={btnStyle}
            >
              {copied ? "copied" : "copy"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={btnStyle}
          >
            {open ? "–" : "+"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2px 10px",
              marginBottom: 6,
            }}
          >
            {Object.entries(snap.state).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span style={{ color: "#94a3b8" }}>{k}</span>
                <span style={boolStyle(v)}>{v === null ? "-" : String(v)}</span>
              </div>
            ))}
          </div>
          <div
            ref={logBoxRef}
            style={{
              maxHeight: "34vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: 6,
            }}
          >
            {snap.log.length ? snap.log.join("\n") : "(no events yet)"}
          </div>
          <textarea
            id="nd-touchdebug-ta"
            readOnly
            value={asText()}
            style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          />
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  font: "inherit",
  color: "#e5e7eb",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 6,
  padding: "2px 8px",
  cursor: "pointer",
  minWidth: 44,
  minHeight: 28,
};
