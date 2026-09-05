// Google Identity Services (GIS) integration helpers.
//
// We deliberately do NOT use Supabase's hosted OAuth redirect for Google, because
// that shows the raw Supabase project domain (…​.supabase.co) on Google's consent
// screen. Instead we load Google Identity Services, let the user sign in to the
// NoteDrift Google OAuth client directly, and exchange the returned ID token with
// Supabase via signInWithIdToken (see client.ts). Email magic-link auth is
// unaffected and still uses /auth/callback.
//
// Pure logic here (parseGoogleCredential) is unit-tested; the loader touches the
// DOM only inside its function body, so importing this module in Node is safe.

/** The subset of the GIS `google.accounts.id` API we use. */
export interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string; select_by?: string }) => void;
    nonce?: string;
    auto_select?: boolean;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ): void;
  cancel(): void;
}

interface GoogleGlobal {
  accounts?: { id?: GoogleIdApi };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

export const GIS_SRC = "https://accounts.google.com/gsi/client";

let loadPromise: Promise<GoogleIdApi> | null = null;

/** Load Google Identity Services once (idempotent) and resolve with its `id` API.
 *  Rejects if the script fails to load or the API never appears. Never injects a
 *  duplicate script tag. */
export function loadGoogleIdentityServices(): Promise<GoogleIdApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Google Identity Services requires a browser"));
  }
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    const finish = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error("Google Identity Services API unavailable"));
    };
    const fail = () => {
      loadPromise = null; // allow a later retry
      reject(new Error("Google Identity Services failed to load"));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) return finish();
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Extract a usable ID token from a GIS credential response, or an error. Pure. */
export function parseGoogleCredential(
  response: { credential?: string | null } | null | undefined,
): { ok: true; credential: string } | { ok: false } {
  const credential = response?.credential;
  if (typeof credential === "string" && credential.length > 0) {
    return { ok: true, credential };
  }
  return { ok: false };
}
