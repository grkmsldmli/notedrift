// Native session-persistence seam. On the local Capacitor origin, cookie storage
// (the @supabase/ssr default) is unreliable across app cold starts, so the native
// shell registers a localStorage-backed cookie store here (localStorage IS
// persistent and synchronous under WKWebView). Web registers nothing and keeps the
// default document.cookie behavior — this module is inert unless a store is set.
//
// The store is an opaque name->value jar; @supabase/ssr handles token chunking on
// top of it, so we never parse token internals here.

export interface NativeCookie {
  name: string;
  value: string;
  options?: { maxAge?: number; expires?: Date | number };
}

export interface NativeAuthCookieStore {
  getAll(): NativeCookie[];
  setAll(cookies: NativeCookie[]): void;
}

let store: NativeAuthCookieStore | null = null;

export function setNativeAuthCookieStore(next: NativeAuthCookieStore | null): void {
  store = next;
}

export function getNativeAuthCookieStore(): NativeAuthCookieStore | null {
  return store;
}
