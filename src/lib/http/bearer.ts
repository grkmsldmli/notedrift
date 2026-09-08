// Pure Authorization header parsing, shared by API routes and unit-tested.
// Never logs the token.

export function extractBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}
