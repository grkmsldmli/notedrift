"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Sparkles, CreditCard, UserRound } from "lucide-react";
import { PLAN_LABELS } from "@/lib/plans";
import { useAuth } from "./AuthProvider";
import { SignInDialog } from "./SignInDialog";
import { UpgradeDialog } from "../billing/UpgradeDialog";
import { openBillingPortal } from "@/lib/billing/client";

/**
 * The single, restrained account entry point (top-right). Renders NOTHING when
 * Supabase isn't configured — no fake buttons that only error on click. Also
 * renders nothing while auth is still resolving, so we never flash "Sign in"
 * at an already-signed-in user. The editor never waits on any of this.
 *
 * Signed in, it also carries the compact billing entry points: Free users get
 * "Upgrade to Pro"; Pro users get "Manage billing" (Stripe-hosted portal).
 */
export function AccountButton() {
  const { configured, status, user, plan, billing, signOut } = useAuth();
  const [dialog, setDialog] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  if (!configured || status === "loading") return null;

  // Signed out → a subtle "Sign in" control.
  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialog(true)}
          title="Sign in"
          aria-label="Sign in"
          className="nd-hit flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <UserRound size={17} />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        {dialog && <SignInDialog onClose={() => setDialog(false)} />}
      </>
    );
  }

  const isPro = plan === "pro";
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  async function manageBilling() {
    if (portalBusy) return;
    setPortalBusy(true);
    const res = await openBillingPortal();
    if (res.ok) {
      window.location.href = res.url;
      return;
    }
    setPortalBusy(false);
    setMenu(false);
    setNotice("Couldn't open the billing portal just now. Please try again in a moment.");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenu((o) => !o)}
        title="Account"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={menu}
        className="nd-hit flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-nd-border transition hover:ring-nd-accent/50"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-nd-surface-2 text-sm font-semibold text-nd-text">
            {initial}
          </span>
        )}
      </button>

      {menu && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl"
        >
          <div className="px-3 py-2">
            {user.name && (
              <div className="truncate text-sm font-medium text-nd-text">
                {user.name}
              </div>
            )}
            <div className="truncate text-xs text-nd-muted">{user.email}</div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {isPro ? (
                <span className="nd-gradient inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <Sparkles size={11} /> Pro
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-nd-muted">
                  {PLAN_LABELS[plan]} plan
                </span>
              )}
              {isPro && billing?.cancelAtPeriodEnd && billing.currentPeriodEnd && (
                <span className="text-[11px] text-nd-muted">
                  Ends {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div className="my-1 h-px bg-nd-border" />

          {isPro ? (
            <button
              type="button"
              role="menuitem"
              onClick={manageBilling}
              disabled={portalBusy}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nd-text transition-colors hover:bg-white/5 disabled:opacity-60"
            >
              <CreditCard size={15} className="text-nd-muted" />
              {portalBusy ? "Opening…" : "Manage billing"}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setUpgrade(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
            >
              <Sparkles size={15} className="text-nd-accent" />
              Upgrade to Pro
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
          >
            <LogOut size={15} className="text-nd-muted" />
            Sign out
          </button>
        </div>
      )}

      {notice && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-nd-border bg-nd-surface px-3 py-2 text-xs text-nd-text shadow-xl">
          {notice}
        </div>
      )}

      {upgrade && (
        <UpgradeDialog onClose={() => setUpgrade(false)} onNotice={(m) => setNotice(m)} />
      )}
    </div>
  );
}
