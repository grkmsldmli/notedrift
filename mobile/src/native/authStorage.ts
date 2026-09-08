// Native session persistence: back the Supabase auth "cookies" with localStorage,
// which persists across app cold starts under WKWebView (unlike custom-scheme
// cookies). Registered into the auth seam (src/lib/auth/nativeCookies.ts). No-op on
// web. Synchronous, so it satisfies @supabase/ssr's cookie contract.
import { setNativeAuthCookieStore, type NativeCookie } from "@/lib/auth/nativeCookies";
import { isNative } from "@/lib/platform";

const PREFIX = "nd.authcookie.";

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function registerNativeAuthStorage(): void {
  if (!isNative()) return;
  const ls = safeLocalStorage();
  if (!ls) return;

  setNativeAuthCookieStore({
    getAll(): NativeCookie[] {
      const out: NativeCookie[] = [];
      try {
        for (let i = 0; i < ls.length; i++) {
          const key = ls.key(i);
          if (key && key.startsWith(PREFIX)) {
            out.push({ name: key.slice(PREFIX.length), value: ls.getItem(key) ?? "" });
          }
        }
      } catch {
        /* storage read failed — return what we have */
      }
      return out;
    },
    setAll(cookies: NativeCookie[]): void {
      try {
        for (const { name, value, options } of cookies) {
          const key = PREFIX + name;
          const expired =
            value === "" || (options?.maxAge != null && options.maxAge <= 0);
          if (expired) ls.removeItem(key);
          else ls.setItem(key, value);
        }
      } catch {
        /* storage write failed — session simply won't persist this write */
      }
    },
  });
}
