// Email configuration — PURE constants only (no secrets, no server-only), so
// templates can import it and be unit-tested. The Resend API key and the actual
// send live in send.ts (server-only).
//
// From-address policy (per product decision):
//   • noreply@notedrift.com — auth / OTP, transactional. No replies expected.
//   • hello@notedrift.com   — marketing / product email. Reply-To → support.
//   • support@notedrift.com — a real, monitored inbox.

import { SITE_URL } from "../site.ts";

export const EMAIL_FROM = {
  /** Transactional / auth (OTP, receipts). No-reply. */
  auth: "NoteDrift <noreply@notedrift.com>",
  /** Marketing / product / lifecycle. */
  marketing: "NoteDrift <hello@notedrift.com>",
} as const;

/** Real monitored inbox — used as Reply-To on marketing mail and in unsubscribe. */
export const SUPPORT_EMAIL = "support@notedrift.com";

/** Absolute URL into the app for email links. */
export function emailUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** The one-click unsubscribe URL for a given per-user token. */
export function unsubscribeUrl(token: string): string {
  return emailUrl(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`);
}
