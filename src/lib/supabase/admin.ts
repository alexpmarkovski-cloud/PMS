import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client for server-only system operations (audit-trail writes,
// health checks, notifications). Bypasses RLS — must never be imported from
// client components; the key has no NEXT_PUBLIC_ prefix so bundling it
// client-side fails loudly rather than leaking.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
