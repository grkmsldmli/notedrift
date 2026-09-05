"use client";

// Google Identity Services sign-in button. Renders Google's OFFICIAL button (for
// policy/compliance + reliability), signs the user into the NoteDrift Google
// client directly, and exchanges the returned ID token with Supabase via
// signInWithIdToken — so Google's screen never shows the raw Supabase domain, and
// there is no /auth/callback round-trip. If GIS can't load, it shows a friendly
// inline message and email sign-in remains available.

import { useEffect, useRef, useState } from "react";
import { googleClientId } from "@/lib/auth/config";
import { generateNonce, sha256Hex } from "@/lib/auth/nonce";
import { loadGoogleIdentityServices, parseGoogleCredential } from "@/lib/auth/google";
import { signInWithGoogleIdToken } from "@/lib/auth/client";

type State = "loading" | "ready" | "error";

export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled = false,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");

  // Keep the latest callbacks in refs (updated in an effect, not during render) so
  // the GIS init effect can run exactly once — re-initializing on every parent
  // render would flicker Google's button.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  useEffect(() => {
    let cancelled = false;
    const clientId = googleClientId();
    // The RAW nonce goes to Supabase; Google gets its SHA-256 hash.
    let rawNonce: string | null = null;

    void (async () => {
      // Defer past the synchronous effect phase (no setState in the effect body).
      await Promise.resolve();
      if (!clientId) {
        if (!cancelled) setState("error");
        return;
      }
      try {
        const gis = await loadGoogleIdentityServices();
        if (cancelled || !containerRef.current) return;
        rawNonce = generateNonce();
        const hashedNonce = await sha256Hex(rawNonce);
        if (cancelled || !containerRef.current) return;

        gis.initialize({
          client_id: clientId,
          nonce: hashedNonce,
          itp_support: true,
          callback: (response) => {
            const parsed = parseGoogleCredential(response);
            if (!parsed.ok || !rawNonce) {
              onErrorRef.current("Couldn't sign in with Google. Please try again.");
              return;
            }
            void (async () => {
              const res = await signInWithGoogleIdToken(parsed.credential, rawNonce);
              if (res.ok) onSuccessRef.current();
              else onErrorRef.current(res.error);
            })();
          },
        });

        // Match the email field width (dialog inner width), capped to Google's
        // supported max of 400. GIS's minimum supported width is 200.
        const width = Math.min(Math.max(containerRef.current.clientWidth || 320, 200), 400);
        gis.renderButton(containerRef.current, {
          type: "standard",
          // GIS only supports outline | filled_blue | filled_black. "outline" is a
          // WHITE button whose corners jut out against the dark dialog; "filled_black"
          // is too low-contrast on the dark-navy surface. "filled_blue" is the
          // branded, no-white button that reads cleanly here (we can't restyle
          // Google's iframe, so the theme is the only lever).
          theme: "filled_blue",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width,
        });
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        /* best effort */
      }
    };
  }, []);

  if (state === "error") {
    return (
      <p className="mt-4 rounded-lg border border-nd-border bg-nd-surface-2 px-3 py-2.5 text-center text-xs text-nd-muted">
        Google sign-in isn&apos;t available right now — use email below.
      </p>
    );
  }

  return (
    <div
      className={`mt-4 flex min-h-[40px] justify-center transition-opacity ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
      aria-busy={state === "loading"}
    >
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
