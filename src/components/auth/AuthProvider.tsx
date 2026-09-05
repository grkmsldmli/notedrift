"use client";

// Auth + billing context. CRITICAL: this provider renders its children
// IMMEDIATELY and never blocks on a network request. The editor mounts and is
// fully usable before (and whether or not) auth or billing resolves. When
// Supabase isn't configured we settle straight to an anonymous, ready state.
//
// Billing is layered on top of identity: `plan` is "anonymous" with no user, and
// otherwise "free" until the SERVER-AUTHORITATIVE get_billing_status() RPC reports
// "pro". The client can never promote itself — this value is display-only; the
// cloud-canvas cap is enforced independently server-side.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/auth/config";
import {
  getCurrentUser,
  onAuthChange,
  signInWithEmail,
  signInWithGoogle,
  signOut,
} from "@/lib/auth/client";
import { resolvePlan } from "@/lib/auth/plan";
import type { AuthResult, AuthUser } from "@/lib/auth/types";
import { fetchBillingStatus } from "@/lib/billing/client";
import type { BillingStatus } from "@/lib/billing/types";

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  /** Whether auth is available at all (Supabase env present). */
  configured: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  /** Server-authoritative when Pro: "anonymous" | "free" | "pro". */
  plan: Plan;
  /** Sanitized billing status (null while loading / when signed out). */
  billing: BillingStatus | null;
  /** Post-Checkout state: "activating" while confirming Pro, "processing" if the
   *  webhook hasn't landed yet, else null. */
  billingActivation: "activating" | "processing" | null;
  /** Dismiss the post-Checkout activation banner. */
  dismissBillingActivation: () => void;
  /** Re-read billing status from the server. */
  refreshBilling: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingActivation, setBillingActivation] = useState<"activating" | "processing" | null>(null);
  // Only "loading" when there is actually a session to resolve.
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "ready",
  );

  useEffect(() => {
    if (!configured) return; // fully anonymous — nothing to resolve
    let active = true;
    const unsub = onAuthChange((u) => {
      if (!active) return;
      setUser(u);
      setStatus("ready");
    });
    void getCurrentUser()
      .then((u) => {
        if (!active) return;
        setUser(u);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("ready");
      });
    return () => {
      active = false;
      unsub();
    };
  }, [configured]);

  const uid = user?.id ?? null;

  // Load billing whenever the signed-in user changes; clear it on sign-out.
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void (async () => {
      await Promise.resolve(); // defer out of the synchronous effect phase
      const s = uid ? await fetchBillingStatus() : null;
      if (active) setBilling(s);
    })();
    return () => {
      active = false;
    };
  }, [configured, uid]);

  const refreshBilling = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const s = await fetchBillingStatus();
    setBilling(s);
  }, []);

  // Re-check billing when the tab regains focus (e.g. after managing billing).
  useEffect(() => {
    if (!configured || !uid) return;
    const onFocus = () => void refreshBilling();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [configured, uid, refreshBilling]);

  // Returning from Stripe Checkout (?billing=success): poll briefly for Pro, then
  // clear the flag and strip the query param. The URL never grants Pro (§26) — we
  // only re-read the server's authoritative status.
  useEffect(() => {
    if (!configured) return;
    const params = new URLSearchParams(window.location.search);
    const billingParam = params.get("billing");
    if (billingParam !== "success" && billingParam !== "cancelled") return;

    // Strip the param so a refresh doesn't re-trigger this.
    params.delete("billing");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );

    if (billingParam !== "success") return;
    let active = true;
    void (async () => {
      await Promise.resolve(); // defer out of the synchronous effect phase
      if (!active) return;
      setBillingActivation("activating");
      let becamePro = false;
      for (let i = 0; i < 6 && active; i++) {
        const s = await fetchBillingStatus();
        if (!active) return;
        setBilling(s);
        if (s?.plan === "pro") {
          becamePro = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (active) setBillingActivation(becamePro ? null : "processing");
    })();
    return () => {
      active = false;
    };
  }, [configured]);

  const dismissBillingActivation = useCallback(() => setBillingActivation(null), []);

  // Base plan from identity (anonymous | free) stays in resolvePlan; billing layers
  // "pro" on top for a signed-in user. Display-only — the cap is enforced server-side.
  const plan: Plan =
    resolvePlan(user) === "anonymous" ? "anonymous" : (billing?.plan ?? "free");

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      status,
      user,
      plan,
      billing,
      billingActivation,
      dismissBillingActivation,
      refreshBilling,
      signInWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [configured, status, user, plan, billing, billingActivation, dismissBillingActivation, refreshBilling],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
