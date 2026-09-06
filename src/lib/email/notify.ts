// Client-side, fire-and-forget triggers for lifecycle email + the marketing
// preference. These NEVER block a user action and swallow every error: the server
// decides whether to actually send (opt-in + idempotency), and an anonymous user
// simply gets a 401 that we ignore. `keepalive` lets the request finish even if
// the page navigates away immediately after (e.g. the sign-in dialog closing).

type LifecycleEvent = "welcome" | "pro-welcome" | "export-intent" | "cloud-limit";

export function notifyLifecycle(event: LifecycleEvent): void {
  try {
    void fetch("/api/email/lifecycle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw from a best-effort notify */
  }
}

export function setMarketingPreference(optIn: boolean): void {
  try {
    void fetch("/api/email/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketingOptIn: optIn }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}
