"use client";

// Restrained post-Checkout banner (§47). Shows "Activating Pro…" while the client
// re-checks server-authoritative status after returning from Stripe, then (if the
// webhook hasn't landed yet) a calm "payment is processing" note. It NEVER asserts
// Pro on its own — the account badge only flips when get_billing_status() says so.

import { Loader2, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export function BillingActivating() {
  const { billingActivation, dismissBillingActivation } = useAuth();
  if (!billingActivation) return null;
  const activating = billingActivation === "activating";
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-nd-border bg-nd-surface px-3.5 py-2.5 text-sm text-nd-text shadow-2xl"
    >
      {activating ? (
        <Loader2 size={16} className="animate-spin text-nd-accent" />
      ) : (
        <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
      )}
      <span>
        {activating
          ? "Activating Pro…"
          : "Payment is processing. Your account will update automatically."}
      </span>
      {!activating && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismissBillingActivation}
          className="nd-hit -mr-1 flex h-6 w-6 items-center justify-center rounded-md text-nd-muted hover:bg-white/5 hover:text-nd-text"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
