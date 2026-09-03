// Server-side Supabase client for the OAuth / magic-link callback route.
// Uses @supabase/ssr's cookie-based server client (the recommended Next.js App
// Router pattern) so sessions live in secure httpOnly cookies, not client state.
// Returns null when Supabase isn't configured.

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";

export async function createServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a context where cookies can't be set (e.g. a plain
          // Server Component render). Safe to ignore — the middleware/route
          // that owns the response persists them.
        }
      },
    },
  });
}
