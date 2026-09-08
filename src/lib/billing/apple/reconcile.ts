import "server-only";

// Single place that writes verified Apple entitlement into the server-owned table,
// via the service-role apply_apple_subscription() RPC (atomic, idempotent,
// replay-safe). Used by BOTH the verify route and the notifications route.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleEntitlement } from "./entitlement";

export type ApplyResult = "applied" | "duplicate" | "stale" | "unmapped" | "error";

export interface ApplyArgs {
  /** The authenticated user id (verify route). null for notifications, where the
   *  RPC resolves the user from the verified appAccountToken / existing row. */
  userId: string | null;
  entitlement: AppleEntitlement;
  notification?: { uuid: string | null; type: string | null; subtype: string | null };
}

export async function applyAppleEntitlement(
  admin: SupabaseClient,
  args: ApplyArgs,
): Promise<ApplyResult> {
  const e = args.entitlement;
  const { data, error } = await admin.rpc("apply_apple_subscription", {
    p_user_id: args.userId,
    p_original_transaction_id: e.originalTransactionId,
    p_latest_transaction_id: e.latestTransactionId,
    p_product_id: e.productId,
    p_billing_interval: e.billingInterval,
    p_status: e.status,
    p_environment: e.environment,
    p_purchased_at: e.purchasedAt,
    p_expires_at: e.expiresAt,
    p_revoked_at: e.revokedAt,
    p_auto_renew: e.autoRenew,
    p_app_account_token: e.appAccountToken,
    p_signed_date: e.signedDate,
    p_notification_uuid: args.notification?.uuid ?? null,
    p_notification_type: args.notification?.type ?? null,
    p_notification_subtype: args.notification?.subtype ?? null,
  });
  if (error) return "error";
  return (typeof data === "string" ? data : "error") as ApplyResult;
}
