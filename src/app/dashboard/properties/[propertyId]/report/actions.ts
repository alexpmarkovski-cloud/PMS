"use server";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTriage } from "@/lib/triage";

export type SubmitResult =
  | { ok: true; caseId: string }
  | { ok: false; error: string };

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Tenant submits a maintenance request: creates the case (status stays
// pending_ai_review — the triage pipeline that advances it is next,
// launch_decisions item 13), uploads photos to the private case-media
// bucket, and records the audit event.
export async function submitMaintenanceRequest(
  propertyId: string,
  formData: FormData,
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Only a *current* tenant of the property may report an issue.
  const { data: tenancy } = await supabase
    .from("property_tenants")
    .select("status")
    .eq("property_id", propertyId)
    .eq("tenant_id", user.id)
    .maybeSingle();
  if (tenancy?.status !== "current") {
    return { ok: false, error: "Only current tenants can report issues here." };
  }

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { ok: false, error: "Describe the issue first." };

  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length === 0) {
    return { ok: false, error: "Add at least one photo of the issue." };
  }
  if (photos.length > MAX_PHOTOS) {
    return { ok: false, error: `At most ${MAX_PHOTOS} photos per request.` };
  }
  for (const photo of photos) {
    if (!photo.type.startsWith("image/")) {
      return { ok: false, error: "Photos only for now — video isn't supported yet." };
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "Each photo must be under 5MB." };
    }
  }

  // The triage call needs the lease; cases.lease_id is NOT NULL, so a
  // tenancy without an uploaded contract can't file yet.
  const { data: lease } = await supabase
    .from("leases")
    .select("id")
    .eq("property_id", propertyId)
    .eq("tenant_id", user.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lease) {
    return {
      ok: false,
      error:
        "No lease is on file for your tenancy yet — ask your property manager to upload your contract first.",
    };
  }

  // Best-effort jurisdiction match by the property's state (Utah-only at
  // launch; null is allowed if no row matches).
  const { data: property } = await supabase
    .from("properties")
    .select("state")
    .eq("id", propertyId)
    .single();
  const { data: jurisdiction } = await supabase
    .from("jurisdictions")
    .select("id")
    .eq("state", property?.state ?? "")
    .is("county", null)
    .is("city", null)
    .maybeSingle();

  // RLS (cases_insert_tenant) re-checks tenant identity + property
  // membership on this insert.
  const { data: kase, error: caseError } = await supabase
    .from("cases")
    .insert({
      tenant_id: user.id,
      property_id: propertyId,
      lease_id: lease.id,
      jurisdiction_id: jurisdiction?.id ?? null,
      description,
    })
    .select("id")
    .single();
  if (caseError || !kase) {
    return { ok: false, error: caseError?.message ?? "Could not create the request." };
  }

  // Photos + audit trail via the service role (the bucket has no client
  // policies, and case_events writes are server-only by design).
  const admin = createAdminClient();
  for (const [i, photo] of photos.entries()) {
    const safeName = photo.name.replace(/[^\w.-]/g, "_");
    const path = `${kase.id}/${i}-${safeName}`;
    const { error: uploadError } = await admin.storage
      .from("case-media")
      .upload(path, photo);
    if (uploadError) {
      return {
        ok: false,
        error: `Request was created, but a photo failed to upload: ${uploadError.message}`,
      };
    }
    const { error: mediaError } = await admin.from("case_media").insert({
      case_id: kase.id,
      storage_path: path,
      media_type: "photo",
      position: i,
    });
    if (mediaError) return { ok: false, error: mediaError.message };
  }

  await admin.from("case_events").insert({
    case_id: kase.id,
    event_type: "case_submitted",
    actor_id: user.id,
    payload: { media_count: photos.length },
  });

  // Kick off the AI review after the response is sent, so the tenant lands
  // on the case page immediately (showing "Pending AI review") instead of
  // waiting on the model call. Failures are logged + recorded as a
  // triage_failed event inside runTriage; the status stays pending and the
  // staff-facing "Run AI review" button retries it.
  after(() => runTriage(kase.id));

  return { ok: true, caseId: kase.id };
}
