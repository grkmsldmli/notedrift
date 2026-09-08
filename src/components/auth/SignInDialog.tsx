"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { isGoogleAuthConfigured } from "@/lib/auth/config";
import { isNativeIos } from "@/lib/platform";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { OtpInput } from "./OtpInput";
import { OTP_LENGTH } from "@/lib/auth/otp";
import { notifyLifecycle, setMarketingPreference } from "@/lib/email/notify";

/** How long (seconds) to disable "Resend code" after a send, so a signed-in
 *  provider rate limit is never hit by spam-clicking. */
const RESEND_COOLDOWN = 30;

/** A small, dismissible sign-in sheet. Passwordless: Google (Google Identity
 *  Services / ID-token sign-in) or a 6-digit email code. Two in-place steps —
 *  enter email, then enter the code — with no page redirect and no /auth/callback
 *  round-trip. Cloud save stays explicit and opt-in: signing in uploads nothing
 *  and your canvases stay local until you choose Save to cloud (§72). */
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const { signInWithEmail, verifyEmailOtp } = useAuth();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "send" | "verify">(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  // Marketing opt-in — NEVER pre-checked (CAN-SPAM / Gmail sender rules).
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Bumped on each failed verify so the OtpInput remounts, clears, and refocuses.
  const [attempt, setAttempt] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  // Google Identity Services is blocked inside WKWebView and a local Capacitor
  // origin can't be a registered Google JS origin, so hide it on native iOS.
  // Email OTP (below) is the reliable native path. See docs/ios/IOS_ARCHITECTURE.md.
  const showGoogle = isGoogleAuthConfigured() && !isNativeIos();
  const titleId = "nd-signin-title";
  const errId = "nd-signin-error";
  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (step === "email") emailRef.current?.focus();
  }, [step]);

  // Resend cooldown tick.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setError(null);
    setBusy("send");
    const res = await signInWithEmail(email);
    setBusy(null);
    if (res.ok) {
      setStep("otp");
      setCode("");
      setCooldown(RESEND_COOLDOWN);
    } else {
      setError(res.error);
    }
  };

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void sendCode();
  };

  const verify = async (token: string) => {
    if (busy) return;
    setError(null);
    setBusy("verify");
    const res = await verifyEmailOtp(cleanEmail, token);
    if (res.ok) {
      // Session established; onAuthStateChange updates the app. Persist the
      // marketing choice and fire the (idempotent) welcome email — both
      // best-effort, so neither blocks closing the dialog.
      setMarketingPreference(marketingOptIn);
      notifyLifecycle("welcome");
      onClose();
      return;
    }
    setBusy(null);
    setError(res.error);
    setCode("");
    setAttempt((a) => a + 1); // remount OtpInput → clears + refocuses
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setError(null);
    setResent(false);
    setBusy("send");
    const res = await signInWithEmail(email);
    setBusy(null);
    if (res.ok) {
      setCode("");
      setCooldown(RESEND_COOLDOWN);
      setResent(true);
      setAttempt((a) => a + 1);
      setTimeout(() => setResent(false), 2500);
    } else {
      setError(res.error);
    }
  };

  const useDifferentEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
    setCooldown(0);
    setResent(false);
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

        {step === "otp" ? (
          <div className="py-1">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-nd-accent/15 text-nd-accent">
              <Mail size={20} />
            </div>
            <h2 id={titleId} className="text-center text-base font-semibold text-nd-text">
              Check your email
            </h2>
            <p className="mt-1.5 text-center text-sm text-nd-muted">
              Enter the 6-digit code sent to{" "}
              <span className="break-all text-nd-text">{cleanEmail}</span>.
            </p>

            <div className="mt-4">
              <OtpInput
                key={attempt}
                value={code}
                onChange={setCode}
                onComplete={(full) => void verify(full)}
                disabled={busy === "verify"}
                invalid={error !== null}
                autoFocus
                describedById={error ? errId : undefined}
              />
            </div>

            {error && (
              <p id={errId} role="alert" className="mt-3 text-center text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void verify(code)}
              disabled={busy !== null || code.length !== OTP_LENGTH}
              className="nd-gradient mt-4 w-full rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "verify" ? "Verifying…" : "Verify code"}
            </button>

            <div className="mt-3 flex items-center justify-between text-[13px]">
              <button
                type="button"
                onClick={() => void resend()}
                disabled={busy !== null || cooldown > 0}
                className="text-nd-muted transition-colors hover:text-nd-text disabled:cursor-default disabled:opacity-60 disabled:hover:text-nd-muted"
              >
                {resent ? "Code sent" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
              <button
                type="button"
                onClick={useDifferentEmail}
                disabled={busy !== null}
                className="text-nd-muted transition-colors hover:text-nd-text disabled:opacity-60"
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 id={titleId} className="text-base font-semibold text-nd-text">
              Sign in to NoteDrift
            </h2>
            <p className="mt-1 text-sm text-nd-muted">
              Sync your canvases across devices.
            </p>

            {showGoogle && (
              <>
                <GoogleSignInButton
                  onSuccess={onClose}
                  onError={setError}
                  disabled={busy !== null}
                />
                <div className="my-3.5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-nd-muted">
                  <span className="h-px flex-1 bg-nd-border" />
                  or
                  <span className="h-px flex-1 bg-nd-border" />
                </div>
              </>
            )}

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
                {busy === "send" ? "Sending code…" : "Continue with email"}
              </button>
            </form>

            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-nd-muted">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-nd-accent"
              />
              <span>Email me occasional product tips &amp; new free tools. No spam; unsubscribe anytime.</span>
            </label>

            {error && (
              <p id={errId} role="alert" className="mt-3 text-sm text-red-400">
                {error}
              </p>
            )}

            <p className="mt-3 text-center text-[11px] text-nd-muted">
              We&apos;ll email you a 6-digit sign-in code. Nothing uploads until you save to cloud.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
