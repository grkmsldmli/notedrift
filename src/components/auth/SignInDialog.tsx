"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { useAuth } from "./AuthProvider";

/** A small, dismissible sign-in sheet. Passwordless: Google OAuth or an email
 *  magic link. Copy deliberately does NOT claim sync exists yet. */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = "nd-signin-title";
  const errId = "nd-signin-error";

  useEffect(() => {
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy("email");
    const res = await signInWithEmail(email);
    setBusy(null);
    if (res.ok) setSent(true);
    else setError(res.error);
  };

  const google = async () => {
    if (busy) return;
    setError(null);
    setBusy("google");
    const res = await signInWithGoogle();
    // On success the browser redirects away; only reach here on failure.
    if (!res.ok) {
      setBusy(null);
      setError(res.error);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-nd-border bg-nd-surface p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="nd-hit absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <X size={16} />
        </button>

        {sent ? (
          <div className="py-2 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-nd-accent/15 text-nd-accent">
              <Mail size={20} />
            </div>
            <h2 id={titleId} className="text-base font-semibold text-nd-text">
              Check your email
            </h2>
            <p className="mt-1.5 text-sm text-nd-muted">
              We sent a sign-in link to{" "}
              <span className="text-nd-text">{email.trim().toLowerCase()}</span>.
              Open it to finish signing in.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-lg border border-nd-border py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id={titleId} className="text-base font-semibold text-nd-text">
              Sign in to NoteDrift
            </h2>
            <p className="mt-1 text-sm text-nd-muted">
              Create an account for upcoming cloud features. Your canvases stay on
              this device.
            </p>

            <button
              type="button"
              onClick={google}
              disabled={busy !== null}
              className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-nd-border bg-nd-surface-2 py-2.5 text-sm font-medium text-nd-text transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <GoogleGlyph />
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>

            <div className="my-3.5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-nd-muted">
              <span className="h-px flex-1 bg-nd-border" />
              or
              <span className="h-px flex-1 bg-nd-border" />
            </div>

            <form onSubmit={submitEmail} noValidate>
              <label htmlFor="nd-email" className="sr-only">
                Email address
              </label>
              <input
                id="nd-email"
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
                className="w-full rounded-lg border border-nd-border bg-nd-bg-2 px-3 py-2.5 text-sm text-nd-text outline-none ring-nd-accent/50 transition focus:ring-2"
              />
              <button
                type="submit"
                disabled={busy !== null || email.trim().length === 0}
                className="nd-gradient mt-2.5 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === "email" ? "Sending link…" : "Continue with email"}
              </button>
            </form>

            {error && (
              <p id={errId} role="alert" className="mt-3 text-sm text-red-400">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Small inline Google mark (no external asset). */
function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C41.2 36.4 44 30.8 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
