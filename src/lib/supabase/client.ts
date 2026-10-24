import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Browser-side Supabase client. Safe to expose: the publishable key only
// grants access permitted by row-level security policies.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
