import "server-only";

// Server-only Supabase client using the SECRET (service-role) key. Bypasses RLS
// and is used ONLY by server routes (the Stripe webhook and checkout customer
// mapping) to write server-owned billing state. NEVER import this into a client
// component — the "server-only" import makes that a build error.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "./config";

let cached: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(supabaseUrl(), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
