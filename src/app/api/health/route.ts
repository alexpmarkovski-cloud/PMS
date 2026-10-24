import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Connectivity check: verifies the app can reach Supabase and the schema
// is migrated + seeded. Returns the jurisdiction count (1 = Utah seed row).
export async function GET() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("jurisdictions")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, jurisdictions: count });
}
