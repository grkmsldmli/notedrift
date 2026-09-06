import "server-only";

// Central place that turns "send email KIND to this user" into an actual send:
// ensures the preferences row, enforces marketing opt-in, renders the template
// with the user's unsubscribe token, and attaches List-Unsubscribe headers +
// Reply-To. `sendKindOnce` adds atomic idempotency so a lifecycle email is sent
// at most once (or once per period). Everything is best-effort — a send failure
// or unconfigured Resend never throws to the caller.

import { sendEmail, type SendResult } from "@/lib/email/send";
import {
  ensurePreferences,
  markEventSentIfFirst,
  type EmailPreferences,
} from "@/lib/email/store";
import { SUPPORT_EMAIL, unsubscribeUrl } from "@/lib/email/config";
import {
  EMAIL_CLASSIFICATION,
  fromFor,
  replyToFor,
  otpEmail,
  welcomeEmail,
  discoveryEmail,
  cloudLimitEmail,
  exportIntentEmail,
  dormantEmail,
  newsletterEmail,
  proWelcomeEmail,
  cancellationEmail,
  winbackEmail,
  type EmailKind,
  type RenderedEmail,
} from "@/lib/email/templates";

export interface KindExtra {
  code?: string;
  endDate?: string;
}

function render(kind: EmailKind, unsubToken: string, extra: KindExtra): RenderedEmail {
  const unsub = { unsubscribeUrl: unsubscribeUrl(unsubToken) };
  switch (kind) {
    case "otp":
      return otpEmail(extra.code ?? "");
    case "welcome":
      return welcomeEmail();
    case "pro-welcome":
      return proWelcomeEmail();
    case "cancellation":
      return cancellationEmail({ endDate: extra.endDate ?? "" });
    case "discovery":
      return discoveryEmail(unsub);
    case "cloud-limit":
      return cloudLimitEmail(unsub);
    case "export-intent":
      return exportIntentEmail(unsub);
    case "dormant":
      return dormantEmail(unsub);
    case "newsletter":
      return newsletterEmail(unsub);
    case "winback":
      return winbackEmail(unsub);
  }
}

export type DispatchResult =
  | SendResult
  | { ok: false; skipped: true; reason: "opted-out" | "already-sent" };

/** Render + send using preferences we already loaded (no extra DB read). */
function sendWithPrefs(
  kind: EmailKind,
  prefs: EmailPreferences,
  extra: KindExtra,
): Promise<SendResult> {
  const tpl = render(kind, prefs.unsubscribeToken, extra);
  const headers: Record<string, string> | undefined =
    EMAIL_CLASSIFICATION[kind] === "marketing"
      ? {
          "List-Unsubscribe": `<${unsubscribeUrl(prefs.unsubscribeToken)}>, <mailto:${SUPPORT_EMAIL}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined;
  return sendEmail({
    to: prefs.email,
    from: fromFor(kind),
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    replyTo: replyToFor(kind),
    headers,
  });
}

/** Send an email of `kind` to a user. Marketing kinds require an opt-in. */
export async function sendKind(args: {
  kind: EmailKind;
  userId: string;
  email: string;
  extra?: KindExtra;
}): Promise<DispatchResult> {
  const prefs = await ensurePreferences(args.userId, args.email);
  if (EMAIL_CLASSIFICATION[args.kind] === "marketing" && !prefs.marketingOptIn) {
    return { ok: false, skipped: true, reason: "opted-out" };
  }
  return sendWithPrefs(args.kind, prefs, args.extra ?? {});
}

/**
 * Send at most once. Order matters: check opt-in FIRST, so an opted-out user
 * never has the idempotency slot reserved (a later opt-in can still receive it);
 * THEN reserve the slot atomically; THEN send. `periodKey` (e.g. an ISO week)
 * scopes recurring emails; omit for one-shot lifecycle emails.
 */
export async function sendKindOnce(args: {
  kind: EmailKind;
  userId: string;
  email: string;
  periodKey?: string;
  extra?: KindExtra;
}): Promise<DispatchResult> {
  const prefs = await ensurePreferences(args.userId, args.email);
  if (EMAIL_CLASSIFICATION[args.kind] === "marketing" && !prefs.marketingOptIn) {
    return { ok: false, skipped: true, reason: "opted-out" };
  }
  const eventKey = args.periodKey ? `${args.kind}:${args.periodKey}` : args.kind;
  const first = await markEventSentIfFirst(args.userId, eventKey);
  if (!first) return { ok: false, skipped: true, reason: "already-sent" };
  return sendWithPrefs(args.kind, prefs, args.extra ?? {});
}
