"use client";

// NoteDrift Pro conversion sheet. A customer should grasp — in seconds — what Free
// has, what Pro adds, why it's worth it, and the price. Every Pro claim is rendered
// from SHIPPED_PRO_BENEFITS (the truth source); prices derive from canonical
// PRICING. No fake original price, no countdown, no fabricated scarcity.

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  PRICING,
  SHIPPED_FREE_BENEFITS,
  SHIPPED_PRO_BENEFITS,
  annualMonthlyEquivalent,
  annualSavingsPercent,
} from "@/lib/plans";
import { startCheckout } from "@/lib/billing/client";
import type { BillingInterval } from "@/lib/billing/types";
import type { UpgradeContext } from "@/lib/export/types";
import { billingPlatform } from "@/lib/platform";
import { stripeCheckoutAllowed } from "@/lib/billing/gate";
import { AppleUpgradePanel } from "./AppleUpgradePanel";

const money = (n: number) => `$${n.toFixed(2)}`;

/** The one short opening line, by where the upgrade was triggered. */
const CONTEXT_LINE: Record<UpgradeContext, string> = {
  general: "",
  "cloud-limit": "You've reached the Free cloud limit.",
  "hd-export": "Export crisp high-resolution images with Pro.",
  "transparent-export": "Export a transparent background with Pro.",
  "svg-export": "Export scalable SVG with Pro.",
  "selection-export": "Export just your selection with Pro.",
  "multi-page-pdf": "Export all your pages in one PDF with Pro.",
  "custom-size": "Export at a custom size with Pro.",
};

export function UpgradeDialog({
  onClose,
  onNotice,
  atLimit = false,
  context = "general",
}: {
  onClose: () => void;
  onNotice: (msg: string) => void;
  atLimit?: boolean;
  context?: UpgradeContext;
}) {
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [busy, setBusy] = useState(false);
  const titleId = "nd-upgrade-title";
  const opening = atLimit ? CONTEXT_LINE["cloud-limit"] : CONTEXT_LINE[context];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savePct = Math.round(annualSavingsPercent() * 100);
  const yearlyPerMonth = annualMonthlyEquivalent();
  const price = interval === "monthly" ? `${money(PRICING.monthly)}/month` : `${money(PRICING.annual)}/year`;

  // Apple compliance: the native iOS app must NEVER open Stripe Checkout. Pro is
  // sold via Apple IAP in a later (StoreKit) phase; until then native shows a
  // placeholder and this guard makes a Stripe call impossible even if reached.
  const platform = billingPlatform();

  async function upgrade() {
    if (busy) return;
    if (!stripeCheckoutAllowed(platform)) return; // never Stripe on native iOS
    setBusy(true);
    const res = await startCheckout(interval);
    if (res.ok) {
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    onNotice(
      res.error === "already_subscribed"
        ? "You're already on Pro. Use “Manage billing” to review your subscription."
        : "Couldn't start checkout just now. Please try again in a moment.",
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-nd-border bg-nd-surface p-5 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="nd-hit absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text">
          <X size={16} />
        </button>

        {opening && (
          <p className="mb-3 rounded-lg bg-nd-accent/10 px-3 py-2 text-sm font-medium text-nd-text">{opening}</p>
        )}

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-nd-accent/40 bg-nd-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-nd-accent">
            Founding price
          </span>
          <span className="text-xs font-medium text-nd-muted">NoteDrift Pro</span>
        </div>
        <h2 id={titleId} className="mt-2 text-lg font-semibold leading-tight text-nd-text">
          Save every canvas. Export professionally.
        </h2>
        <p className="mt-1 text-sm text-nd-muted">
          Unlimited cloud, pro exports, and access across devices.
        </p>

        {/* Free vs Pro — understand the difference in seconds. */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-nd-border p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-nd-muted">Free</div>
            <ul className="space-y-1 text-[12px] text-nd-muted">
              {SHIPPED_FREE_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-1.5">
                  <Check size={12} className="mt-0.5 shrink-0 text-nd-muted" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-nd-accent/40 bg-nd-accent/5 p-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-nd-accent">Pro</div>
            <ul className="space-y-1 text-[12px] text-nd-text">
              <li className="flex items-start gap-1.5">
                <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                <span className="font-medium">Everything in Free</span>
              </li>
              {SHIPPED_PRO_BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-1.5">
                  <Check size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {platform === "apple" ? (
          /* Native iOS: StoreKit 2 purchase/restore (no Stripe). A user who bought
             Pro on the web keeps full entitlements here automatically. */
          <AppleUpgradePanel onClose={onClose} onNotice={onNotice} />
        ) : (
          <>
            {/* Interval — annual recommended. */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <IntervalOption selected={interval === "monthly"} onSelect={() => setInterval("monthly")} label="Monthly" price={`${money(PRICING.monthly)}/mo`} />
              <IntervalOption
                selected={interval === "yearly"}
                onSelect={() => setInterval("yearly")}
                label="Yearly"
                price={`${money(PRICING.annual)}/yr`}
                note={`${money(yearlyPerMonth)}/mo`}
                badge={`Best value · Save ${savePct}%`}
              />
            </div>

            <button
              type="button"
              onClick={upgrade}
              disabled={busy}
              className="nd-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Opening checkout…
                </>
              ) : (
                <>Get Pro — {price}</>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-nd-muted">
              Secure checkout · Cancel anytime ·{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-nd-text hover:underline">Terms</a>{" "}
              ·{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-nd-text hover:underline">Privacy</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function IntervalOption({
  selected,
  onSelect,
  label,
  price,
  note,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price: string;
  note?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "relative rounded-xl border p-3 text-left transition-colors",
        selected ? "border-nd-accent bg-nd-accent/10" : "border-nd-border hover:bg-white/5",
      ].join(" ")}
    >
      {badge && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-nd-text">{label}</span>
        <span className={["flex h-4 w-4 items-center justify-center rounded-full border", selected ? "border-nd-accent bg-nd-accent text-white" : "border-nd-border"].join(" ")}>
          {selected && <Check size={11} />}
        </span>
      </div>
      <div className="mt-1 text-sm text-nd-text">{price}</div>
      {note && <div className="mt-0.5 text-[11px] text-nd-muted">{note}</div>}
    </button>
  );
}
