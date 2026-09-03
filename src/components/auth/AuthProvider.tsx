"use client";

// Auth context. CRITICAL: this provider renders its children IMMEDIATELY and
// never blocks on a network request. The editor mounts and is fully usable
// before (and whether or not) auth resolves. Only the account control in the
// TopBar reacts to `status`/`user`. When Supabase isn't configured we settle
// straight to an anonymous, ready state.

import {
  createContext,
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

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  /** Whether auth is available at all (Supabase env present). */
  configured: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  /** Derived plan — never "pro" from client identity in this phase. */
  plan: Plan;
  signInWithEmail: (email: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  // Only "loading" when there is actually a session to resolve.
  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "ready",
  );

  useEffect(() => {
    if (!configured) return; // fully anonymous — nothing to resolve
    let active = true;
    // Subscribe first: fires immediately with the current (cookie) session and
    // stays in sync on sign-in/out.
    const unsub = onAuthChange((u) => {
      if (!active) return;
      setUser(u);
      setStatus("ready");
    });
    // Safety net: an explicit network-validated fetch in case the subscription
    // is slow to emit.
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

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      status,
      user,
      plan: resolvePlan(user),
      signInWithEmail,
      signInWithGoogle,
      signOut,
    }),
    [configured, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
