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
//
// Post-Checkout activation: on returning with ?billing=success&session_id=… we
// capture the session id, then ask the server to VERIFY it against Stripe and
// reconcile Pro (POST /api/billing/confirm-checkout) so the buyer isn't stuck on
// Free while a webhook is delayed. session_id is only a lookup handle — it never
// grants Pro on its own.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/auth/config";
import {
  getCurrentUser,
  onAuthChange,
  signInWithEmail,
  signOut,
} from "@/lib/auth/client";
import { resolvePlan } from "@/lib/auth/plan";
import type { AuthResult, AuthUser } from "@/lib/auth/types";
import { confirmCheckout, fetchBillingStatus } from "@/lib/billing/client";
import type { BillingStatus } from "@/lib/billing/types";

type AuthStatus = "loading" | "ready";
type Activation = "activating" | "success" | "processing" | null;

interface AuthContextValue {
  /** Whether auth is available at all (Supabase env present). */
  configured: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  /** Server-authoritative when Pro: "anonymous" | "free" | "pro". */
  plan: Plan;
  /** Sanitized billing status (null while loading / when signed out). */
  billing: BillingStatus | null;
  /** Post-Checkout activation: "activating" (confirming), "success" (Pro live),
   *  "processing" (still not Pro after the bounded wait), else null. */
  billingActivation: Activation;
  dismissBillingActivation: () => void;
  /** Re-run the confirmation + poll for the captured Checkout session. */
  retryActivation: () => void;
  /** True after returning from a CANCELLED Checkout (one-shot). */
  checkoutCancelled: boolean;
  dismissCheckoutCancelled: () => void;
  /** Re-read billing status from the server. */
  refreshBilling: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Capture the post-Checkout return params ONCE, at first read, and strip the URL
// immediately. Module-level so it survives React StrictMode's mount→unmount→mount
// double-invoke (which would otherwise strip the URL on the first pass and leave
// the remounted effect with nothing to act on). Cleared implicitly on a full page
// reload (the only way back into the editor).
type BillingReturn = { kind: "success"; session: string | null } | { kind: "cancelled" } | null;
let capturedReturn: BillingReturn = null;
let returnCaptured = false;
function captureBillingReturn(): BillingReturn {
  if (returnCaptured || typeof window === "undefined") return capturedReturn;
  returnCaptured = true;
  const params = new URLSearchParams(window.location.search);
  const billingParam = params.get("billing");
  if (billingParam === "success") capturedReturn = { kind: "success", session: params.get("session_id") };
  else if (billingParam === "cancelled") capturedReturn = { kind: "cancelled" };
  if (billingParam === "success" || billingParam === "cancelled") {
    params.delete("billing");
    params.delete("session_id");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
  }
  return capturedReturn;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingActivation, setBillingActivation] = useState<Activation>(null);
  const [checkoutCancelled, setCheckoutCancelled] = useState(false);
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "ready");
  const activationSessionRef = useRef<string | null>(null);
  const activationSignalRef = useRef<{ active: boolean }>({ active: false });

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
      // Don't clobber an in-flight activation's result with a stale early read.
      if (active && billingActivation === null) setBilling(s);
    })();
    return () => {
      active = false;
    };
    // billingActivation intentionally omitted: this should react to uid, not to
    // activation transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Trusted activation: confirm the session with the server (which verifies Stripe
  // + reconciles), then poll authoritative status with front-loaded backoff up to
  // ~45s before falling back to a "processing" state.
  const runActivation = useCallback(async () => {
    const sessionId = activationSessionRef.current;
    if (!sessionId) return;
    activationSignalRef.current.active = false; // cancel any prior loop
    const signal = { active: true };
    activationSignalRef.current = signal;
    setBillingActivation("activating");

    await confirmCheckout(sessionId);
    if (!signal.active) return;

    const delays = [0, 900, 1200, 1800, 2500, 3500, 5000, 7000, 9000, 12000]; // ~43s
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      if (!signal.active) return;
      const s = await fetchBillingStatus();
      if (!signal.active) return;
      setBilling(s);
      if (s?.plan === "pro") {
        setBillingActivation("success");
        return;
      }
      if (i === 3) await confirmCheckout(sessionId); // one more reconcile attempt mid-way
    }
    if (signal.active) setBillingActivation("processing");
  }, []);

  const retryActivation = useCallback(() => void runActivation(), [runActivation]);
  const dismissBillingActivation = useCallback(() => {
    activationSignalRef.current.active = false;
    setBillingActivation(null);
  }, []);
  const dismissCheckoutCancelled = useCallback(() => setCheckoutCancelled(false), []);

  // Act on the captured Checkout return (robust to StrictMode's double-invoke).
  useEffect(() => {
    if (!configured) return;
    const ret = captureBillingReturn();
    if (!ret) return;
    let mounted = true;
    if (ret.kind === "cancelled") {
      void (async () => {
        await Promise.resolve();
        if (mounted) setCheckoutCancelled(true);
      })();
      return () => {
        mounted = false;
      };
    }
    if (!ret.session) return; // success but no session id — nothing to confirm
    activationSessionRef.current = ret.session;
    void (async () => {
      await Promise.resolve();
      if (mounted) void runActivation();
    })();
    return () => {
      mounted = false;
      activationSignalRef.current.active = false;
    };
  }, [configured, runActivation]);

  // Base plan from identity (anonymous | free); billing layers "pro" on top for a
  // signed-in user. Display-only — the cap is enforced server-side.
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
      retryActivation,
      checkoutCancelled,
      dismissCheckoutCancelled,
      refreshBilling,
      signInWithEmail,
      signOut,
    }),
    [
      configured,
      status,
      user,
      plan,
      billing,
      billingActivation,
      dismissBillingActivation,
      retryActivation,
      checkoutCancelled,
      dismissCheckoutCancelled,
      refreshBilling,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
