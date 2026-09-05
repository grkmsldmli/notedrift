// Nonce helpers for Google Identity Services sign-in. Pure and isomorphic (uses
// the Web Crypto API, available in the browser and in Node 18+). No DOM, no
// secrets, no `server-only` import — unit-tested directly.
//
// Flow (per Supabase's Google Identity Services guidance): generate a random
// RAW nonce, give Google the SHA-256 HASH of it (embedded in the issued ID
// token), and give Supabase the RAW nonce — Supabase re-hashes it and compares.
// This binds the returned ID token to this specific sign-in attempt.

function webCrypto(): Crypto {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (!c?.getRandomValues || !c.subtle) {
    throw new Error("Web Crypto is unavailable");
  }
  return c;
}

/** A cryptographically-random, URL-safe nonce string (default 32 bytes). */
export function generateNonce(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  webCrypto().getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 =
    typeof btoa !== "undefined"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  // URL-safe, unpadded.
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lowercase hex SHA-256 of a string. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await webCrypto().subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
