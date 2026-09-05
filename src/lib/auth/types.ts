// Minimal identity shape used across the app. Deliberately small: auth is
// identity only. It carries no plan, no subscription, and no canvas data.

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

/** Result of a sign-in attempt. `ok:true` for email means "magic link sent";
 *  for Google (ID-token sign-in) it means the session was established. */
export type AuthResult = { ok: true } | { ok: false; error: string };
