import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReportForm } from "./report-form";

export const metadata = { title: "Report an issue — PMS" };

// Maintenance-request submission — current tenants of the property only.
export default async function ReportIssuePage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: property } = await supabase
    .from("properties")
    .select("id, address_line1, address_line2, city, state")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) redirect("/dashboard");

  const { data: tenancy } = await supabase
    .from("property_tenants")
    .select("status")
    .eq("property_id", propertyId)
    .eq("tenant_id", user.id)
    .maybeSingle();
  if (tenancy?.status !== "current") redirect("/dashboard");

  const address = [
    property.address_line1,
    property.address_line2,
    `${property.city}, ${property.state}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-8">
      <div className="w-full max-w-xl">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Report an issue</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{address}</p>
      </div>
      <div className="w-full max-w-xl rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <ReportForm propertyId={propertyId} />
      </div>
    </main>
  );
}
