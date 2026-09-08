"use client";

// Client helper for in-app account deletion. Web uses the cookie session; native
// iOS sends a Bearer Supabase token (the local origin shares no cookies). The
// server derives the user from the verified session/token and deletes ALL of their
// data (storage objects + cascade), then the auth user.

import { apiUrl } from "@/lib/platform";
import { getAccessToken } from "@/lib/auth/client";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "network" | "error" };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const token = await getAccessToken();
  try {
    const res = await fetch(apiUrl("/api/account"), {
      method: "DELETE",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "unauthorized" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
