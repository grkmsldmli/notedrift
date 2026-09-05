"use client";

// Explains a failed sign-in link instead of silently dropping the user on the
// editor. The callback redirects to `/?auth=link_error` when a magic link can't
// be verified (expired, already used, or a PKCE link opened in a different
// browser than it was requested). We strip the param and show a calm, dismissible
// note. Local canvases are untouched either way.

import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";

export function AuthNotice() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") !== "link_error") return;
    params.delete("auth");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
    let active = true;
    void (async () => {
      await Promise.resolve(); // defer out of the synchronous effect phase
      if (active) {
        setMsg(
          "That sign-in link didn't work — it may have expired or already been used. Request a new one and open it in this browser.",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!msg) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-start gap-2.5 rounded-xl border border-nd-border bg-nd-surface px-3.5 py-2.5 text-sm text-nd-text shadow-2xl"
    >
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <span>{msg}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMsg(null)}
        className="nd-hit -mr-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-nd-muted hover:bg-white/5 hover:text-nd-text"
      >
        <X size={14} />
      </button>
    </div>
  );
}
