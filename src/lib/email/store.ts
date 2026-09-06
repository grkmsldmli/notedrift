import "server-only";

// Server-only access to the email_preferences / email_events tables via the
// service-role admin client. The browser never touches these directly (RLS locks
// them to service_role), so a user can't read another user's unsubscribe token or
// forge a "sent" event.

import { getAdminSupabase } from "@/lib/billing/admin";

export interface EmailPreferences {
  userId: string;
  email: string;
  marketingOptIn: boolean;
  unsubscribeToken: string;
}

/** Read the user's preferences, creating the row (with a fresh unsubscribe token,
 *  opt-in FALSE) on first use. Email is refreshed on every call. */
export async function ensurePreferences(userId: string, email: string): Promise<EmailPreferences> {
  const admin = getAdminSupabase();
  const { data: existing } = await admin
    .from("email_preferences")
    .select("email, marketing_opt_in, unsubscribe_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (existing.email !== email) {
      await admin
        .from("email_preferences")
        .update({ email, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
    return {
      userId,
      email,
      marketingOptIn: !!existing.marketing_opt_in,
      unsubscribeToken: existing.unsubscribe_token as string,
    };
  }

  const unsubscribeToken = crypto.randomUUID();
  await admin.from("email_preferences").insert({
    user_id: userId,
    email,
    marketing_opt_in: false,
    unsubscribe_token: unsubscribeToken,
  });
  return { userId, email, marketingOptIn: false, unsubscribeToken };
}

/** Set the marketing opt-in for a user (creating the row if needed). */
export async function setMarketingOptIn(
  userId: string,
  email: string,
  optIn: boolean,
): Promise<EmailPreferences> {
  const prefs = await ensurePreferences(userId, email);
  if (prefs.marketingOptIn !== optIn) {
    await getAdminSupabase()
      .from("email_preferences")
      .update({ marketing_opt_in: optIn, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }
  return { ...prefs, marketingOptIn: optIn };
}

/** One-click unsubscribe by token. Returns whether a matching row was found. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  if (!token) return false;
  const { data } = await getAdminSupabase()
    .from("email_preferences")
    .update({ marketing_opt_in: false, updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("user_id");
  return Array.isArray(data) && data.length > 0;
}

/**
 * Atomically record that `kind` was sent to `userId`. Returns true only the FIRST
 * time (row inserted) and false if it was already recorded — so a caller can do
 * `if (await markEventSentIfFirst(...)) send(...)` and never double-send. For
 * recurring emails pass a period-scoped kind, e.g. "newsletter:2026-W36".
 */
export async function markEventSentIfFirst(userId: string, kind: string): Promise<boolean> {
  const { error } = await getAdminSupabase()
    .from("email_events")
    .insert({ user_id: userId, kind });
  if (!error) return true;
  // 23505 = unique_violation → already sent. Any other error: fail safe (don't send).
  return false;
}
