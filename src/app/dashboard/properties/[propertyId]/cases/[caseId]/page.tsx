import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CASE_STATUS_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  type CaseStatus,
  type ResponsibleParty,
} from "@/lib/status";
import { CaseStatusSelect, RunAiReviewButton } from "../../../../manage-forms";

export const metadata = { title: "Case — PMS" };

const cardClass =
  "w-full max-w-3xl rounded-lg border border-zinc-200 p-4 dark:border-zinc-800";
const sectionTitleClass =
  "text-sm font-medium uppercase tracking-wide text-zinc-500";

type CitedSource = { type?: string; reference?: string; quote?: string };

// Full AI review for one repair/maintenance case: verdict, reasoning,
// citations, confidence, disclaimer, and the audit trail. Reachable by
// anyone RLS lets see the case — the owner, every collaborator tier, and
// the tenant who filed it (read-only status for tenants and admins).
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string; caseId: string }>;
}) {
  const { propertyId, caseId } = await params;
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

  // RLS is the gate: the case row is only visible to the owner, the
  // property's collaborators, the tenant who filed it, and admins. Anyone
  // else gets no row and bounces.
  const { data: kase } = await supabase
    .from("cases")
    .select(
      "id, tenant_id, description, status, responsible_party, confidence, cited_sources, reasoning_summary, disclaimer, model_used, created_at",
    )
    .eq("id", caseId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (!kase) redirect("/dashboard");

  // Every collaborator tier may adjust status (attorneys can correct the
  // AI verdict's routing); tenants and admins are read-only. The
  // completed-only-by-owner/manager/maintenance rule lives in the action.
  const canEditStatus = owner || collab !== null;

  // Tenant identity is shown only when RLS lets this viewer read the
  // profile (owner/manager) — maintenance deliberately doesn't see it.
  const { data: tenantProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", kase.tenant_id)
    .maybeSingle();

  const { data: events } = await supabase
    .from("case_events")
    .select("id, event_type, created_at")
    .eq("case_id", caseId)
    .order("created_at");

  // Photos: RLS-scoped rows, signed URLs from the private bucket. Seed
  // rows point at files that don't exist — those simply render no image.
  const { data: media } = await supabase
    .from("case_media")
    .select("id, storage_path, media_type, position")
    .eq("case_id", caseId)
    .order("position");
  const admin = createAdminClient();
  const photos = (
    await Promise.all(
      (media ?? []).map(async (m) => {
        const { data } = await admin.storage
          .from("case-media")
          .createSignedUrl(m.storage_path, 60 * 60);
        return { id: m.id, url: data?.signedUrl ?? null };
      }),
    )
  ).filter((p): p is { id: string; url: string } => p.url !== null);

  const reviewed = kase.status !== "pending_ai_review";
  const sources = (kase.cited_sources ?? []) as CitedSource[];
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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Maintenance case</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              {address}
              {tenantProfile?.full_name && ` · reported by ${tenantProfile.full_name}`}
              {" · "}
              {new Date(kase.created_at).toLocaleDateString()}
            </p>
          </div>
          <CaseStatusSelect
            caseId={kase.id}
            status={kase.status as CaseStatus}
            responsibleParty={kase.responsible_party as ResponsibleParty | null}
            readOnly={!canEditStatus}
          />
        </div>
      </div>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Reported issue</h2>
        <p className="mt-2 text-sm">{kase.description}</p>
        {photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* Signed URLs from the private bucket; plain <img> since
                    the optimizer isn't configured for this host. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt="Photo of the reported issue"
                  className="h-32 w-32 rounded-md border border-zinc-200 object-cover dark:border-zinc-800"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>AI review</h2>

        {!reviewed ? (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-sm text-zinc-500">
              The AI review hasn&apos;t completed yet. The verdict, reasoning,
              and citations will appear here once it has — it normally runs
              automatically right after a request is submitted.
            </p>
            {canEditStatus && <RunAiReviewButton caseId={kase.id} />}
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {kase.responsible_party && (
                <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {RESPONSIBLE_PARTY_LABELS[kase.responsible_party as ResponsibleParty]}
                </span>
              )}
              {kase.confidence !== null && (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Confidence: {Math.round(Number(kase.confidence) * 100)}%
                </span>
              )}
              <span className="text-sm text-zinc-500">
                Status: {CASE_STATUS_LABELS[kase.status as CaseStatus]}
              </span>
            </div>

            {kase.reasoning_summary ? (
              <div>
                <h3 className="text-sm font-medium">Reasoning</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {kase.reasoning_summary}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No reasoning was recorded for this case.
              </p>
            )}

            {sources.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Cited sources</h3>
                <ul className="mt-1 flex flex-col gap-2">
                  {sources.map((source, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                    >
                      <p className="font-medium">
                        {source.reference ?? "Unnamed source"}
                        {source.type && (
                          <span className="ml-2 text-xs font-normal uppercase tracking-wide text-zinc-500">
                            {source.type.replace(/_/g, " ")}
                          </span>
                        )}
                      </p>
                      {source.quote && (
                        <p className="mt-1 border-l-2 border-zinc-300 pl-2 text-zinc-600 italic dark:border-zinc-700 dark:text-zinc-400">
                          &ldquo;{source.quote}&rdquo;
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {kase.model_used && (
              <p className="text-xs text-zinc-500">
                Reviewed by {kase.model_used}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          {kase.disclaimer}
        </p>
      </section>

      {(events ?? []).length > 0 && (
        <section className={cardClass}>
          <h2 className={sectionTitleClass}>History</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {(events ?? []).map((event) => (
              <li key={event.id} className="flex justify-between gap-3 text-sm">
                <span>{event.event_type.replace(/_/g, " ")}</span>
                <span className="text-zinc-500">
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
