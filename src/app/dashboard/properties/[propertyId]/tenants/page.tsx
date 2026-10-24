import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TenantStatus } from "@/lib/status";
import { AddPersonForm, TenantsTable } from "../../../manage-forms";

export const metadata = { title: "Tenants — PMS" };

// Roster page for one property. Owner and managers get the full controls;
// attorneys get a read-only roster (they need it to reach contracts).
// Maintenance is excluded entirely — their dashboard card is a jobs-only
// view with no tenant personal info.
export default async function PropertyTenantsPage({
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
    .select("id, landlord_id, address_line1, address_line2, city, state")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) redirect("/dashboard");

  const owner = property.landlord_id === user.id;
  const { data: collab } = owner
    ? { data: null }
    : await supabase
        .from("property_collaborators")
        .select("role")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .maybeSingle();
  if (!owner && collab?.role !== "manager" && collab?.role !== "attorney") {
    redirect("/dashboard");
  }
  const readOnly = !owner && collab?.role === "attorney";

  const { data: links } = await supabase
    .from("property_tenants")
    .select("tenant_id, status")
    .eq("property_id", propertyId)
    .order("created_at");

  const tenantIds = (links ?? []).map((l) => l.tenant_id);
  const { data: people } = tenantIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", tenantIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const admin = createAdminClient();
  const { data: userList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const emailById = new Map(
    (userList?.users ?? []).map((u) => [u.id, u.email ?? "(no email)"]),
  );

  const rows = (links ?? []).map((l) => ({
    tenantId: l.tenant_id,
    name: nameById.get(l.tenant_id) ?? null,
    email: emailById.get(l.tenant_id) ?? "",
    status: l.status as TenantStatus,
  }));

  const address = [
    property.address_line1,
    property.address_line2,
    `${property.city}, ${property.state}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-8">
      <div className="w-full max-w-3xl">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Tenants</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{address}</p>
      </div>

      <div className="w-full max-w-3xl rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <TenantsTable propertyId={propertyId} rows={rows} readOnly={readOnly} />
      </div>

      {!readOnly && (
        <div className="w-full max-w-3xl rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Add a tenant
          </h2>
          <div className="mt-3">
            <AddPersonForm propertyId={propertyId} kind="tenant" />
          </div>
        </div>
      )}
    </main>
  );
}
