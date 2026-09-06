// Minimal identity shape used across the app. Deliberately small: auth is
// identity only. It carries no plan, no subscription, and no canvas data.

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

/** Result of a sign-in attempt. `ok:true` means: for the email SEND step, the
 *  6-digit code was sent; for email VERIFY and for Google (ID-token sign-in), the
 *  session was established. */
export type AuthResult = { ok: true } | { ok: false; error: string };
