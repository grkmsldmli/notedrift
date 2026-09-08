// Shim for `next/navigation` (defensive — the editor graph uses no router hooks).
// Backs onto the History API so any stray call behaves sensibly.
export function useRouter() {
  return {
    push: (url: string) => {
      window.location.href = url;
    },
    replace: (url: string) => {
      window.location.replace(url);
    },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => {},
    prefetch: async () => {},
  };
}

export function usePathname(): string {
  return typeof window !== "undefined" ? window.location.pathname : "/";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}

export function redirect(url: string): void {
  if (typeof window !== "undefined") window.location.href = url;
}

export function notFound(): void {}
