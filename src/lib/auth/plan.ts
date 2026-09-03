// The ONE place identity is mapped to a plan. Keep this centralized so no
// component decides `user ? "free" : "anonymous"` on its own.
//
// Rule (Phase 2.0B): no user → anonymous; ANY signed-in user → free. Pro is
// NEVER derived from client identity — a "pro" plan will come only from
// server-authoritative billing state in a later phase (see docs/PRODUCT_MODEL.md).
// There is intentionally no code path here that can return "pro".

import type { Plan } from "../plans";
import type { AuthUser } from "./types";

export function resolvePlan(user: AuthUser | null): Plan {
  return user ? "free" : "anonymous";
}
