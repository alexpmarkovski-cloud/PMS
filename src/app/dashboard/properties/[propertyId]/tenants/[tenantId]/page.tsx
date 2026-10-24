import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_STATUS_LABELS, type CaseStatus, type ResponsibleParty, type TenantStatus } from "@/lib/status";
import { CaseStatusSelect, TenantStatusSelect, UploadLeaseForm } from "../../../../manage-forms";

export const metadata = { title: "Tenant — PMS" };

const cardClass =
  "w-full max-w-3xl rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const sectionTitleClass =
  "text-sm font-medium uppercase tracking-wide text-zinc-500";

// Tenant detail: contract (view/upload) + repair/maintenance jobs with the
// status lifecycle. Owner and managers get full controls; attorneys get
// read-only tenant info and contracts (their legal-review need) but can
// edit job statuses. Maintenance never reaches this page — their dashboard
// card is a jobs-only view.
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string; tenantId: string }>;
}) {
  const { propertyId, tenantId } = await params;
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
  const canManageTenant = owner || collab?.role === "manager";

  const { data: link } = await supabase
    .from("property_tenants")
    .select("status")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!link) redirect(`/dashboard/properties/${propertyId}/tenants`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", tenantId)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(tenantId);
  const email = authUser?.user?.email ?? "";

  // Contracts, newest version first, each with a short-lived signed URL
  // (bucket is private; seed rows point at files that don't exist, so a
  // missing object just renders without a view link).
  const { data: leases } = await supabase
    .from("leases")
    .select("id, file_path, version, effective_date, created_at")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });

  const leaseLinks = await Promise.all(
    (leases ?? []).map(async (lease) => {
      const { data } = await admin.storage
        .from("leases")
        .createSignedUrl(lease.file_path, 60 * 60);
      return { ...lease, url: data?.signedUrl ?? null };
    }),
  );

  const { data: jobs } = await supabase
    .from("cases")
    .select("id, description, status, responsible_party, created_at")
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

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
          href={`/dashboard/properties/${propertyId}/tenants`}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Tenants
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {profile?.full_name ?? "(no name)"}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              {email} · {address} ·{" "}
              {TENANT_STATUS_LABELS[link.status as TenantStatus]} tenant
            </p>
          </div>
          {canManageTenant && (
            <TenantStatusSelect
              propertyId={propertyId}
              tenantId={tenantId}
              status={link.status as TenantStatus}
            />
          )}
        </div>
      </div>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Contract</h2>
        {leaseLinks.length === 0 && (
          <p className="mt-1 text-sm text-zinc-500">
            No contract on file yet{canManageTenant && " — upload one below"}.
          </p>
        )}
        <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
          {leaseLinks.map((lease) => (
            <li
              key={lease.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="text-sm">
                Version {lease.version}
                {lease.effective_date && (
                  <span className="text-zinc-500">
                    {" "}
                    · effective {lease.effective_date}
                  </span>
                )}
              </span>
              {lease.url ? (
                <a
                  href={lease.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  View contract
                </a>
              ) : (
                <span className="text-sm text-zinc-500">file missing</span>
              )}
            </li>
          ))}
        </ul>
        {canManageTenant && (
          <div className="mt-3">
            <UploadLeaseForm propertyId={propertyId} tenantId={tenantId} />
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Repair / maintenance jobs</h2>
        {(jobs ?? []).length === 0 && (
          <p className="mt-1 text-sm text-zinc-500">No jobs yet.</p>
        )}
        <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
          {(jobs ?? []).map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <span className="max-w-md text-sm">
                {job.description}{" "}
                <Link
                  href={`/dashboard/properties/${propertyId}/cases/${job.id}`}
                  className="whitespace-nowrap underline hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  View AI review
                </Link>
              </span>
              <CaseStatusSelect
                caseId={job.id}
                status={job.status as CaseStatus}
                responsibleParty={job.responsible_party as ResponsibleParty | null}
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          &ldquo;AI review completed&rdquo; is set automatically when the AI
          agent finishes its informational review; the verdict then routes the
          job to landlord- or tenant-responsible. Only the owner, a manager,
          or maintenance can mark a job completed.
        </p>
      </section>
    </main>
  );
}
