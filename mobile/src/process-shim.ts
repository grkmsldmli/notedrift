// Some reused modules read `process.env.*` at runtime. Vite's `define` replaces
// the known NEXT_PUBLIC_* keys with literals at build time; this shim guards any
// other stray read so it returns undefined instead of throwing "process is not
// defined". MUST be imported before any reused module (see main.tsx import order).
const g = globalThis as unknown as { process?: { env: Record<string, string | undefined> } };
if (!g.process) g.process = { env: {} };
export {};
