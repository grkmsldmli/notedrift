"use client";

// Post-Checkout activation overlay (§9–11). A compact centered modal over the
// editor — NOT a dashboard or marketing page. It follows the purchase through
// server-authoritative confirmation:
//   activating  -> "Payment successful / Activating NoteDrift Pro…"
//   success     -> "You're Pro" (auto-dismisses)
//   processing  -> "payment completed, still activating" + Retry / Manage billing
// It never asserts Pro on its own — `billingActivation === "success"` is only set
// after get_billing_status() reports Pro.

import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, RefreshCw, X } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { openBillingPortal } from "@/lib/billing/client";

export function CheckoutActivation() {
  const {
    billingActivation,
    billing,
    dismissBillingActivation,
    retryActivation,
    checkoutCancelled,
    dismissCheckoutCancelled,
  } = useAuth();
  const [portalBusy, setPortalBusy] = useState(false);

  // Auto-dismiss the success state after a short beat (§10).
  useEffect(() => {
    if (billingActivation !== "success") return;
    const t = setTimeout(() => dismissBillingActivation(), 2600);
    return () => clearTimeout(t);
  }, [billingActivation, dismissBillingActivation]);

  // Auto-dismiss the cancelled notice.
  useEffect(() => {
    if (!checkoutCancelled) return;
    const t = setTimeout(() => dismissCheckoutCancelled(), 6000);
    return () => clearTimeout(t);
  }, [checkoutCancelled, dismissCheckoutCancelled]);

  // Cancelled Checkout (§14): calm, dismissible note — no Pro, no upgrade popup.
  if (!billingActivation && checkoutCancelled) {
    return (
      <div
        role="status"
        className="fixed bottom-4 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-nd-border bg-nd-surface px-3.5 py-2.5 text-sm text-nd-text shadow-2xl"
      >
        <span>Checkout cancelled. No subscription was started.</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismissCheckoutCancelled}
          className="nd-hit -mr-1 flex h-6 w-6 items-center justify-center rounded-md text-nd-muted hover:bg-white/5 hover:text-nd-text"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (!billingActivation) return null;

  async function manageBilling() {
    if (portalBusy) return;
    setPortalBusy(true);
    const res = await openBillingPortal();
    if (res.ok) window.location.href = res.url;
    else setPortalBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pro activation"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl border border-nd-border bg-nd-surface p-6 text-center shadow-2xl">
        {billingActivation === "activating" && (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-nd-accent/15">
              <Loader2 size={22} className="animate-spin text-nd-accent" />
            </div>
            <h2 className="text-base font-semibold text-nd-text">Payment successful</h2>
            <p className="mt-1 text-sm text-nd-text">Activating NoteDrift Pro…</p>
            <p className="mt-2 text-xs text-nd-muted">Confirming your subscription securely with Stripe.</p>
          </>
        )}

        {billingActivation === "success" && (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <CheckCircle2 size={24} className="text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-nd-text">You&apos;re Pro</h2>
            <p className="mt-1 text-sm text-nd-muted">Unlimited cloud canvases are now active.</p>
            <button
              type="button"
              onClick={dismissBillingActivation}
              className="nd-gradient mt-4 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Continue to NoteDrift
            </button>
          </>
        )}

        {billingActivation === "processing" && (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <Loader2 size={22} className="animate-spin text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-nd-text">Almost there</h2>
            <p className="mt-1 text-sm text-nd-muted">
              Your payment was completed, but Pro is still activating. This can take a moment.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={retryActivation}
                className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <RefreshCw size={15} /> Check again
              </button>
              {billing?.canManageBilling && (
                <button
                  type="button"
                  onClick={manageBilling}
                  disabled={portalBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-nd-border py-2.5 text-sm text-nd-text transition-colors hover:bg-white/5 disabled:opacity-60"
                >
                  <CreditCard size={15} className="text-nd-muted" />
                  {portalBusy ? "Opening…" : "Manage billing"}
                </button>
              )}
              <button
                type="button"
                onClick={dismissBillingActivation}
                className="w-full rounded-lg py-2 text-xs text-nd-muted transition-colors hover:text-nd-text"
              >
                Continue for now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
