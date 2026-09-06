import "server-only";

// The one place NoteDrift sends email. Uses Resend's REST API directly (no SDK
// dependency) so it's easy to gate and swap. FAILS SAFE: when RESEND_API_KEY is
// unset it sends nothing and returns { ok:false, skipped:true } — the app never
// crashes and no caller has to care. A caller should always treat sending as
// best-effort (fire-and-forget), never blocking a user action on it.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Server-only: the Resend API key, or undefined when unconfigured. */
export function resendApiKey(): string | undefined {
  const v = process.env.RESEND_API_KEY?.trim();
  return v && v.length > 0 ? v : undefined;
}

/** Whether email sending is configured at all. */
export function emailConfigured(): boolean {
  return resendApiKey() !== undefined;
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe for marketing mail. */
  headers?: Record<string, string>;
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const key = resendApiKey();
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
        headers: input.headers,
      }),
    });
    if (!res.ok) {
      // Don't leak the recipient or body into logs; the status is enough.
      return { ok: false, error: `resend_${res.status}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch {
    return { ok: false, error: "network" };
  }
}
