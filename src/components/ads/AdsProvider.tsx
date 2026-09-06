"use client";

// Ad eligibility context. Two providers feed the SAME context so every ad
// component (AdSlot, BottomAdBand, InlineAd) is provider-agnostic:
//
//   • AdsProviderFromAuth  — used on the editor, INSIDE <AuthProvider>. Reads the
//     app's authoritative plan/billing, so a live Free→Pro upgrade (or sign-out)
//     flips eligibility with no reload.
//   • AdsProviderStandalone — used on /tools and the PDF editor, which do NOT
//     mount AuthProvider. It resolves the user + billing itself using the same
//     primitives, and re-checks on focus so a plan change elsewhere is picked up.
//
// Both render <AdSenseLoader> so the AdSense script loads only where eligible.
// Neither ever blocks children from rendering — only the ad regions wait.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "@/lib/plans";
import { adsConfigured, isProductionAdHost } from "@/lib/ads/config";
import { adsEligible } from "@/lib/ads/eligibility";
import { isSupabaseConfigured } from "@/lib/auth/config";
import { getCurrentUser, onAuthChange } from "@/lib/auth/client";
import { fetchBillingStatus } from "@/lib/billing/client";
import type { AuthUser } from "@/lib/auth/types";
import type { BillingStatus } from "@/lib/billing/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdSenseLoader } from "./AdSenseLoader";

const AdsContext = createContext<boolean>(false);

/** Whether NoteDrift may show its own ads in the current subtree. false when no
 *  AdsProvider is mounted, so ad components are inert outside a provider. */
export function useAdsEligible(): boolean {
  return useContext(AdsContext);
}

function AdsShell({ eligible, children }: { eligible: boolean; children: ReactNode }) {
  return (
    <AdsContext.Provider value={eligible}>
      <AdSenseLoader eligible={eligible} />
      {children}
    </AdsContext.Provider>
  );
}

/** Editor provider: eligibility derived from the app's own AuthProvider. */
export function AdsProviderFromAuth({ children }: { children: ReactNode }) {
  const { status, user, plan, billing, billingActivation } = useAuth();
  // During checkout activation the user is transitioning to Pro — treat billing
  // as unresolved so we never show an ad to someone who just paid.
  const billingResolved =
    billing !== null && billingActivation !== "activating" && billingActivation !== "processing";
  const eligible = adsEligible({
    configured: adsConfigured(),
    productionHost: isProductionAdHost(),
    authStatus: status,
    signedIn: !!user,
    billingResolved,
    plan,
  });
  return <AdsShell eligible={eligible}>{children}</AdsShell>;
}

/** Standalone provider: self-resolves identity + billing for routes without
 *  AuthProvider (/tools, /tools/*, the PDF editor). Does NO network work unless
 *  ads are configured for a production host — so dev/localhost is a pure no-op. */
export function AdsProviderStandalone({ children }: { children: ReactNode }) {
  // Resolve identity + billing only when ads are actually configured for a
  // production host AND Supabase backs auth — otherwise this is a pure no-op and
  // the initial state is already "ready" (so the effect never sets it).
  const canResolve = adsConfigured() && isProductionAdHost() && isSupabaseConfigured();

  const [status, setStatus] = useState<"loading" | "ready">(canResolve ? "loading" : "ready");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const userRef = useRef<AuthUser | null>(null);

  useEffect(() => {
    if (!canResolve) return; // initial status is already "ready"; nothing to do
    let alive = true;
    const applyUser = (u: AuthUser | null) => {
      if (!alive) return;
      userRef.current = u;
      setUser(u);
      setStatus("ready");
      if (u) void fetchBillingStatus().then((b) => alive && setBilling(b));
      else setBilling(null);
    };
    const unsub = onAuthChange(applyUser);
    void getCurrentUser().then(applyUser).catch(() => {
      if (alive) setStatus("ready");
    });
    // A plan change made elsewhere (e.g. upgrading on the editor tab) is picked
    // up when this tab regains focus — no timers, no ad refresh.
    const onFocus = () => {
      if (userRef.current) void fetchBillingStatus().then((b) => alive && setBilling(b));
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [canResolve]);

  const plan: Plan = !user ? "anonymous" : billing?.plan === "pro" ? "pro" : "free";
  const eligible = adsEligible({
    configured: adsConfigured(),
    productionHost: isProductionAdHost(),
    authStatus: status,
    signedIn: !!user,
    billingResolved: billing !== null,
    plan,
  });

  return <AdsShell eligible={eligible}>{children}</AdsShell>;
}
