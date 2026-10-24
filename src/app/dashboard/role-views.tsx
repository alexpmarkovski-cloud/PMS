import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  COLLABORATOR_LABELS,
  ROLE_LABELS,
  type CollaboratorRole,
  type UserRole,
} from "@/lib/roles";
import type { CaseStatus, ResponsibleParty } from "@/lib/status";
import {
  AddPersonForm,
  AddPropertyForm,
  AlertRecipientsManager,
  CaseStatusSelect,
  RemoveButton,
  RoleSelect,
  type AlertRecipientRow,
} from "./manage-forms";

const cardClass =
  "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const sectionTitleClass =
  "text-sm font-medium text-zinc-500 uppercase tracking-wide";

// Emails live in auth.users, not profiles — look them up server-side with
// the service-role client purely for display. Fine at pilot scale; needs
// pagination past ~200 users.
async function emailsById(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return new Map(
    (data?.users ?? []).map((u) => [u.id, u.email ?? "(no email)"]),
  );
}

function formatAddress(p: {
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
}): string {
  return [p.address_line1, p.address_line2, `${p.city}, ${p.state}`]
    .filter(Boolean)
    .join(" · ");
}

function PersonRow({
  name,
  email,
  detail,
  action,
}: {
  name: string | null;
  email: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">
        <span className="font-medium">{name ?? "(no name)"}</span>{" "}
        <span className="text-zinc-500">{email}</span>
        {detail && <span className="text-zinc-500"> · {detail}</span>}
      </span>
      {action}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shared property card (option 2: one presentational component; each role's
// view is a thin data-fetcher passing capability flags — the matrix in
// launch_decisions #16 lives in those callers, not in here).
// ---------------------------------------------------------------------------

type StaffEntry = {
  userId: string;
  name: string | null;
  email: string;
  role: CollaboratorRole;
};
type JobEntry = {
  id: string;
  description: string;
  status: CaseStatus;
  responsibleParty: ResponsibleParty | null;
};
type ContractEntry = {
  id: string;
  version: number;
  effectiveDate: string | null;
  url: string | null;
};

export type PropertyCardFlags = {
  showTenantsLink: boolean;
  showStaff: boolean;
  canManageStaff: boolean;
  showAlerts: boolean;
  showJobs: boolean;
  canEditJobs: boolean;
  showContracts: boolean;
  showReportIssue: boolean;
};

function PropertyCard({
  property,
  flags,
  roleLine,
  tenantCounts,
  staff,
  alertRecipients,
  jobs,
  contracts,
  jobsHeading = "Repair / maintenance jobs",
  contractsHeading = "Contract",
}: {
  property: {
    id: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
  };
  flags: PropertyCardFlags;
  roleLine?: string;
  tenantCounts?: { current: number; former: number };
  staff?: StaffEntry[];
  alertRecipients?: AlertRecipientRow[];
  jobs?: JobEntry[];
  contracts?: ContractEntry[];
  jobsHeading?: string;
  contractsHeading?: string;
}) {
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{formatAddress(property)}</h2>
        {flags.showTenantsLink && tenantCounts && (
          <Link
            href={`/dashboard/properties/${property.id}/tenants`}
            className="text-sm underline hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Tenants ({tenantCounts.current} current
            {tenantCounts.former > 0 ? `, ${tenantCounts.former} former` : ""}
            ) →
          </Link>
        )}
        {flags.showReportIssue && (
          <Link
            href={`/dashboard/properties/${property.id}/report`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Report an issue
          </Link>
        )}
      </div>
      {roleLine && <p className="mt-1 text-sm text-zinc-500">{roleLine}</p>}

      {flags.showStaff && (
        <div className="mt-4">
          <h3 className={sectionTitleClass}>Staff</h3>
          {(staff ?? []).length === 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              No staff yet
              {flags.canManageStaff &&
                " — add a manager, maintenance, or attorney"}
              .
            </p>
          )}
          <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            {(staff ?? []).map((s) => (
              <PersonRow
                key={s.userId}
                name={s.name}
                email={s.email}
                detail={COLLABORATOR_LABELS[s.role]}
                action={
                  flags.canManageStaff ? (
                    <RemoveButton
                      propertyId={property.id}
                      userId={s.userId}
                      kind="collaborator"
                    />
                  ) : undefined
                }
              />
            ))}
          </ul>
          {flags.canManageStaff && (
            <div className="mt-2">
              <AddPersonForm propertyId={property.id} kind="collaborator" />
            </div>
          )}
        </div>
      )}

      {flags.showContracts && (
        <div className="mt-4">
          <h3 className={sectionTitleClass}>{contractsHeading}</h3>
          {(contracts ?? []).length === 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              No contract on file — contact your property manager.
            </p>
          )}
          <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            {(contracts ?? []).map((contract) => (
              <li
                key={contract.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="text-sm">
                  Version {contract.version}
                  {contract.effectiveDate && (
                    <span className="text-zinc-500">
                      {" "}
                      · effective {contract.effectiveDate}
                    </span>
                  )}
                </span>
                {contract.url ? (
                  <a
                    href={contract.url}
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
        </div>
      )}

      {flags.showJobs && (
        <div className="mt-4">
          <h3 className={sectionTitleClass}>{jobsHeading}</h3>
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
                    href={`/dashboard/properties/${property.id}/cases/${job.id}`}
                    className="whitespace-nowrap underline hover:text-zinc-800 dark:hover:text-zinc-200"
                  >
                    View AI review
                  </Link>
                </span>
                <CaseStatusSelect
                  caseId={job.id}
                  status={job.status}
                  responsibleParty={job.responsibleParty}
                  readOnly={!flags.canEditJobs}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {flags.showAlerts && (
        <div className="mt-5">
          <h3 className={sectionTitleClass}>Maintenance alert emails</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Sent automatically when a job&apos;s AI review completes.
          </p>
          <div className="mt-2">
            <AlertRecipientsManager
              propertyId={property.id}
              recipients={alertRecipients ?? []}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// Capability matrix per collaborator tier. Owners get their own set in
// LandlordView. "Completed"-only restrictions live in the status action.
const TIER_FLAGS: Record<CollaboratorRole, PropertyCardFlags> = {
  manager: {
    showTenantsLink: true,
    showStaff: true,
    canManageStaff: false,
    showAlerts: true,
    showJobs: false,
    canEditJobs: false,
    showContracts: false,
    showReportIssue: false,
  },
  attorney: {
    showTenantsLink: true,
    showStaff: false,
    canManageStaff: false,
    showAlerts: false,
    showJobs: true,
    canEditJobs: true,
    showContracts: false,
    showReportIssue: false,
  },
  maintenance: {
    showTenantsLink: false,
    showStaff: false,
    canManageStaff: false,
    showAlerts: false,
    showJobs: true,
    canEditJobs: true,
    showContracts: false,
    showReportIssue: false,
  },
};

const OWNER_FLAGS: PropertyCardFlags = {
  showTenantsLink: true,
  showStaff: true,
  canManageStaff: true,
  showAlerts: true,
  showJobs: false,
  canEditJobs: false,
  showContracts: false,
  showReportIssue: false,
};

// Tenants: their own contract (view-only — uploads are a manager/owner
// thing) and their own maintenance requests, statuses read-only.
const TENANT_FLAGS: PropertyCardFlags = {
  showTenantsLink: false,
  showStaff: false,
  canManageStaff: false,
  showAlerts: false,
  showJobs: true,
  canEditJobs: false,
  showContracts: true,
  showReportIssue: true,
};

// ---------------------------------------------------------------------------
// Property Owner (role 'landlord'): add-property form + full-capability
// cards. Tenants live on each property's own page.
// ---------------------------------------------------------------------------
export async function LandlordView({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, address_line1, address_line2, city, state, postal_code")
    .eq("landlord_id", userId)
    .order("created_at");

  const propertyIds = (properties ?? []).map((p) => p.id);
  const [{ data: tenantLinks }, { data: collabLinks }, { data: alertLinks }] =
    await Promise.all([
      propertyIds.length
        ? supabase
            .from("property_tenants")
            .select("property_id, tenant_id, status")
            .in("property_id", propertyIds)
        : { data: [] },
      propertyIds.length
        ? supabase
            .from("property_collaborators")
            .select("property_id, user_id, role")
            .in("property_id", propertyIds)
        : { data: [] },
      propertyIds.length
        ? supabase
            .from("property_alert_recipients")
            .select("property_id, user_id")
            .in("property_id", propertyIds)
        : { data: [] },
    ]);

  const personIds = [
    ...new Set([
      ...(collabLinks ?? []).map((c) => c.user_id),
      ...(alertLinks ?? []).map((a) => a.user_id),
    ]),
  ];
  const { data: people } = personIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", personIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const emailById = await emailsById();

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Add a property</h2>
        <div className="mt-3">
          <AddPropertyForm />
        </div>
      </section>

      {(properties ?? []).length === 0 && (
        <p className="text-sm text-zinc-500">
          No properties yet — add one above to start managing tenants and staff.
        </p>
      )}

      {(properties ?? []).map((property) => {
        const tenants = (tenantLinks ?? []).filter(
          (t) => t.property_id === property.id,
        );
        return (
          <PropertyCard
            key={property.id}
            property={property}
            flags={OWNER_FLAGS}
            tenantCounts={{
              current: tenants.filter((t) => t.status === "current").length,
              former: tenants.filter((t) => t.status === "former").length,
            }}
            staff={(collabLinks ?? [])
              .filter((c) => c.property_id === property.id)
              .map((c) => ({
                userId: c.user_id,
                name: nameById.get(c.user_id) ?? null,
                email: emailById.get(c.user_id) ?? "",
                role: c.role as CollaboratorRole,
              }))}
            alertRecipients={(alertLinks ?? [])
              .filter((a) => a.property_id === property.id)
              .map((a) => ({
                userId: a.user_id,
                name: nameById.get(a.user_id) ?? null,
                email: emailById.get(a.user_id) ?? "",
              }))}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff: one card per assignment, with capabilities from TIER_FLAGS —
// managers get the landlord-style card (minus property/staff management),
// attorneys get roster + editable jobs, maintenance gets jobs only.
// ---------------------------------------------------------------------------
export async function StaffView({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("property_collaborators")
    .select("property_id, role")
    .eq("user_id", userId);

  if ((assignments ?? []).length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        You aren&apos;t assigned to any properties yet — ask the property owner.
      </p>
    );
  }

  const roleByProperty = new Map(
    (assignments ?? []).map((a) => [a.property_id, a.role as CollaboratorRole]),
  );
  const propertyIds = [...roleByProperty.keys()];
  const rosterIds = propertyIds.filter((id) =>
    ["manager", "attorney"].includes(roleByProperty.get(id)!),
  );
  const managedIds = propertyIds.filter(
    (id) => roleByProperty.get(id) === "manager",
  );
  const jobsIds = propertyIds.filter((id) =>
    ["attorney", "maintenance"].includes(roleByProperty.get(id)!),
  );

  const [
    { data: properties },
    { data: tenantLinks },
    { data: staffLinks },
    { data: alertLinks },
    { data: cases },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id, address_line1, address_line2, city, state")
      .in("id", propertyIds),
    rosterIds.length
      ? supabase
          .from("property_tenants")
          .select("property_id, tenant_id, status")
          .in("property_id", rosterIds)
      : { data: [] },
    managedIds.length
      ? supabase
          .from("property_collaborators")
          .select("property_id, user_id, role")
          .in("property_id", managedIds)
      : { data: [] },
    managedIds.length
      ? supabase
          .from("property_alert_recipients")
          .select("property_id, user_id")
          .in("property_id", managedIds)
      : { data: [] },
    jobsIds.length
      ? supabase
          .from("cases")
          .select("id, property_id, description, status, responsible_party, created_at")
          .in("property_id", jobsIds)
          .order("created_at", { ascending: false })
      : { data: [] },
  ]);

  const personIds = [
    ...new Set([
      ...(staffLinks ?? []).map((s) => s.user_id),
      ...(alertLinks ?? []).map((a) => a.user_id),
    ]),
  ];
  const { data: people } = personIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", personIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const emailById = personIds.length
    ? await emailsById()
    : new Map<string, string>();

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {(properties ?? []).map((property) => {
        const role = roleByProperty.get(property.id)!;
        const tenants = (tenantLinks ?? []).filter(
          (t) => t.property_id === property.id,
        );
        return (
          <PropertyCard
            key={property.id}
            property={property}
            flags={TIER_FLAGS[role]}
            roleLine={`Your role: ${COLLABORATOR_LABELS[role]}`}
            tenantCounts={{
              current: tenants.filter((t) => t.status === "current").length,
              former: tenants.filter((t) => t.status === "former").length,
            }}
            staff={(staffLinks ?? [])
              .filter((s) => s.property_id === property.id)
              .map((s) => ({
                userId: s.user_id,
                name: nameById.get(s.user_id) ?? null,
                email: emailById.get(s.user_id) ?? "",
                role: s.role as CollaboratorRole,
              }))}
            alertRecipients={(alertLinks ?? [])
              .filter((a) => a.property_id === property.id)
              .map((a) => ({
                userId: a.user_id,
                name: nameById.get(a.user_id) ?? null,
                email: emailById.get(a.user_id) ?? "",
              }))}
            jobs={(cases ?? [])
              .filter((c) => c.property_id === property.id)
              .map((c) => ({
                id: c.id,
                description: c.description,
                status: c.status as CaseStatus,
                responsibleParty: c.responsible_party as ResponsibleParty | null,
              }))}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tenant: one card per property they're linked to, showing only their own
// contract and their own maintenance requests. Every query below is scoped
// to the signed-in tenant (and RLS enforces the same), so other units'
// cases and leases can never appear here.
// ---------------------------------------------------------------------------
export async function TenantView({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("property_tenants")
    .select("property_id, status")
    .eq("tenant_id", userId);

  if ((links ?? []).length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No property linked to your account yet — contact your property manager.
      </p>
    );
  }

  const propertyIds = (links ?? []).map((l) => l.property_id);
  const [{ data: properties }, { data: cases }, { data: leases }] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id, address_line1, address_line2, city, state")
        .in("id", propertyIds),
      supabase
        .from("cases")
        .select("id, property_id, description, status, responsible_party, created_at")
        .eq("tenant_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("leases")
        .select("id, property_id, file_path, version, effective_date")
        .eq("tenant_id", userId)
        .order("version", { ascending: false }),
    ]);

  // Signed URLs for the private bucket (view-only; no upload for tenants).
  const admin = createAdminClient();
  const contracts = await Promise.all(
    (leases ?? []).map(async (lease) => {
      const { data } = await admin.storage
        .from("leases")
        .createSignedUrl(lease.file_path, 60 * 60);
      return { ...lease, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {(properties ?? []).map((property) => {
        const link = (links ?? []).find((l) => l.property_id === property.id);
        return (
          <PropertyCard
            key={property.id}
            property={property}
            flags={{
              ...TENANT_FLAGS,
              // Former tenants keep read access but can't file new issues.
              showReportIssue: link?.status === "current",
            }}
            roleLine={
              link?.status === "former" ? "Former tenancy" : "Current tenancy"
            }
            contractsHeading="My contract"
            jobsHeading="My maintenance requests"
            contracts={contracts
              .filter((c) => c.property_id === property.id)
              .map((c) => ({
                id: c.id,
                version: c.version,
                effectiveDate: c.effective_date,
                url: c.url,
              }))}
            jobs={(cases ?? [])
              .filter((c) => c.property_id === property.id)
              .map((c) => ({
                id: c.id,
                description: c.description,
                status: c.status as CaseStatus,
                responsibleParty: c.responsible_party as ResponsibleParty | null,
              }))}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform admin: every account, with role management.
// ---------------------------------------------------------------------------
export async function AdminView() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at");
  const emailById = await emailsById();

  // AI usage — RLS (ai_usage_select_admin) restricts this table to admins,
  // so nobody else's dashboard can reach it.
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("id, case_id, provider, model, input_tokens, output_tokens, succeeded, created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const totals = (usage ?? []).reduce(
    (acc, row) => ({
      calls: acc.calls + 1,
      tokens: acc.tokens + row.input_tokens + row.output_tokens,
    }),
    { calls: 0, tokens: 0 },
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>AI token usage</h2>
        {totals.calls === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No AI triage calls recorded yet.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              <span className="font-medium">{totals.calls}</span> recent call
              {totals.calls === 1 ? "" : "s"} ·{" "}
              <span className="font-medium">
                {totals.tokens.toLocaleString()}
              </span>{" "}
              tokens
            </p>
            <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {(usage ?? []).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-1.5"
                >
                  <span>
                    <span className="font-medium">{row.model}</span>{" "}
                    <span className="text-zinc-500">
                      {new Date(row.created_at).toLocaleString()}
                      {!row.succeeded && " · failed"}
                    </span>
                  </span>
                  <span className="text-zinc-500">
                    {row.input_tokens.toLocaleString()} in ·{" "}
                    {row.output_tokens.toLocaleString()} out
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Users &amp; roles</h2>
        <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          {(profiles ?? []).map((profile) => (
            <PersonRow
              key={profile.id}
              name={profile.full_name}
              email={emailById.get(profile.id) ?? ""}
              action={
                <RoleSelect
                  userId={profile.id}
                  role={profile.role as UserRole}
                />
              }
            />
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Role changes take effect on the user&apos;s next page load.{" "}
          {ROLE_LABELS.landlord} and {ROLE_LABELS.staff} access additionally
          depends on property assignments.
        </p>
      </section>
    </div>
  );
}
