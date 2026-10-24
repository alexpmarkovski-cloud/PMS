"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMaintenanceAlert } from "@/lib/alerts";
import { runTriage } from "@/lib/triage";
import type { CollaboratorRole, UserRole } from "@/lib/roles";
import type { CaseStatus, TenantStatus } from "@/lib/status";

export type ManageResult = { ok: true } | { ok: false; error: string };

const COLLABORATOR_ROLES: CollaboratorRole[] = [
  "manager",
  "maintenance",
  "attorney",
];
const ASSIGNABLE_USER_ROLES: UserRole[] = [
  "tenant",
  "landlord",
  "staff",
  "admin",
];

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Owner of the property, or a manager collaborator — mirrors the DB's
// manages_property() helper. Service-role writes bypass RLS, so every
// action re-checks authorization here before touching the admin client.
async function canManageProperty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  propertyId: string,
): Promise<{ owner: boolean; manager: boolean }> {
  const { data: property } = await supabase
    .from("properties")
    .select("landlord_id")
    .eq("id", propertyId)
    .maybeSingle();
  const owner = property?.landlord_id === userId;
  if (owner) return { owner: true, manager: false };

  const { data: collab } = await supabase
    .from("property_collaborators")
    .select("role")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle();
  return { owner: false, manager: collab?.role === "manager" };
}

// Creates an auth user (no password — they sign in with the normal email
// OTP) whose profile role comes from metadata via handle_new_user.
async function provisionUser(
  email: string,
  fullName: string,
  role: "tenant" | "staff",
): Promise<{ userId: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), role },
  });
  if (error) {
    return {
      error: error.message.toLowerCase().includes("already been registered")
        ? "An account with this email already exists."
        : error.message,
    };
  }
  return { userId: data.user.id };
}

export async function addProperty(
  addressLine1: string,
  addressLine2: string,
  city: string,
  state: string,
  postalCode: string,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS also enforces landlord_id = auth.uid() on insert.
  const { error } = await supabase.from("properties").insert({
    landlord_id: user.id,
    address_line1: addressLine1.trim(),
    address_line2: addressLine2.trim() || null,
    city: city.trim(),
    state: state.trim().toUpperCase(),
    postal_code: postalCode.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addTenant(
  propertyId: string,
  email: string,
  fullName: string,
  status: TenantStatus,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { owner, manager } = await canManageProperty(supabase, user.id, propertyId);
  if (!owner && !manager) {
    return { ok: false, error: "Only the owner or a manager can add tenants." };
  }
  if (status !== "current" && status !== "former") {
    return { ok: false, error: "Unknown tenant status." };
  }

  // Current tenants get an invite email telling them an account was set up
  // for them; former tenants (added for history) are created silently —
  // they can still log in with the normal email code, they just aren't
  // notified.
  let tenantId: string;
  if (status === "current") {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      { data: { full_name: fullName.trim(), role: "tenant" } },
    );
    if (error) {
      return {
        ok: false,
        error: error.message.toLowerCase().includes("already been registered")
          ? "An account with this email already exists."
          : error.message,
      };
    }
    tenantId = data.user.id;
  } else {
    const provisioned = await provisionUser(email, fullName, "tenant");
    if ("error" in provisioned) return { ok: false, error: provisioned.error };
    tenantId = provisioned.userId;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("property_tenants").insert({
    property_id: propertyId,
    tenant_id: tenantId,
    status,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setTenantStatus(
  propertyId: string,
  tenantId: string,
  status: TenantStatus,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (status !== "current" && status !== "former") {
    return { ok: false, error: "Unknown tenant status." };
  }

  // Server client: RLS's owner-or-manager update policy authorizes this.
  const { error, count } = await supabase
    .from("property_tenants")
    .update({ status }, { count: "exact" })
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "Not allowed to change this tenant." };
  revalidatePath("/dashboard");
  return { ok: true };
}

const CASE_STATUSES: CaseStatus[] = [
  "pending_ai_review",
  "ai_review_completed",
  "landlord_responsible",
  "tenant_responsible",
  "completed",
];

export async function setCaseStatus(
  caseId: string,
  status: CaseStatus,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!CASE_STATUSES.includes(status)) {
    return { ok: false, error: "Unknown status." };
  }

  // RLS (can_update_case) allows the owner, every collaborator tier, and
  // admins. Marking a job completed is narrower — owner, manager, or
  // maintenance only (attorneys correct verdict routing but don't close
  // work) — and that's value-dependent, so it's enforced here.
  const { data: before } = await supabase
    .from("cases")
    .select("status, property_id")
    .eq("id", caseId)
    .maybeSingle();

  if (status === "completed" && before) {
    const { owner, manager } = await canManageProperty(
      supabase,
      user.id,
      before.property_id,
    );
    const { data: collab } = await supabase
      .from("property_collaborators")
      .select("role")
      .eq("property_id", before.property_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const mayComplete =
      owner ||
      manager ||
      collab?.role === "maintenance" ||
      profile?.role === "admin";
    if (!mayComplete) {
      return {
        ok: false,
        error:
          "Only the owner, a manager, or maintenance can mark a job completed.",
      };
    }
  }

  const { error, count } = await supabase
    .from("cases")
    .update({ status }, { count: "exact" })
    .eq("id", caseId);
  if (error) return { ok: false, error: error.message };
  if (count === 0) {
    return { ok: false, error: "Not allowed to change this job's status." };
  }

  // Entering ai_review_completed notifies the property's designated
  // recipients. (The triage pipeline will do the same when it lands.)
  if (status === "ai_review_completed" && before?.status !== status) {
    await sendMaintenanceAlert(caseId);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

// Manually (re)runs the AI review on a pending case — the retry path when
// the automatic post-submit run failed (bad config, provider error), and
// the way to trigger seeded/legacy pending cases. Same authorization set
// as status edits: owner, any collaborator tier, or admin.
export async function runAiReview(caseId: string): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: kase } = await supabase
    .from("cases")
    .select("id, property_id, tenant_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, error: "Case not found." };

  const { owner, manager } = await canManageProperty(supabase, user.id, kase.property_id);
  const { data: collab } = await supabase
    .from("property_collaborators")
    .select("role")
    .eq("property_id", kase.property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const allowed =
    owner || manager || collab !== null || profile?.role === "admin";
  if (!allowed) {
    return { ok: false, error: "Not allowed to run the AI review." };
  }

  const result = await runTriage(caseId);
  revalidatePath("/dashboard");
  return result.ok ? { ok: true } : result;
}

export async function addAlertRecipient(
  propertyId: string,
  email: string,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { owner, manager } = await canManageProperty(supabase, user.id, propertyId);
  if (!owner && !manager) {
    return { ok: false, error: "Only the owner or a manager can manage alerts." };
  }

  // Resolve the email to a registered user, then require that user to be
  // associated with this property (owner, staff, or current tenant).
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const target = (list?.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
  );

  const notAssociated = {
    ok: false as const,
    error:
      "This user doesn't exist for this property — alerts can only go to a currently registered person associated with it (the owner, staff, or a current tenant).",
  };
  if (!target) return notAssociated;

  const [{ data: property }, { data: collab }, { data: tenancy }] =
    await Promise.all([
      admin
        .from("properties")
        .select("landlord_id")
        .eq("id", propertyId)
        .maybeSingle(),
      admin
        .from("property_collaborators")
        .select("user_id")
        .eq("property_id", propertyId)
        .eq("user_id", target.id)
        .maybeSingle(),
      admin
        .from("property_tenants")
        .select("status")
        .eq("property_id", propertyId)
        .eq("tenant_id", target.id)
        .maybeSingle(),
    ]);
  const isMember =
    property?.landlord_id === target.id ||
    collab !== null ||
    tenancy?.status === "current";
  if (!isMember) return notAssociated;

  // Server client: RLS + the DB's membership check constraint back this up.
  const { error } = await supabase.from("property_alert_recipients").insert({
    property_id: propertyId,
    user_id: target.id,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "This person already receives alerts for this property."
        : error.message,
    };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeAlertRecipient(
  propertyId: string,
  userId: string,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS: owner or manager of the property.
  const { error, count } = await supabase
    .from("property_alert_recipients")
    .delete({ count: "exact" })
    .eq("property_id", propertyId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  if (count === 0) {
    return { ok: false, error: "Not allowed to change alerts for this property." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

// Uploads a lease PDF to the private 'leases' bucket and records it. The
// bucket has no client policies — everything goes through here (service
// role) after an owner/manager check.
export async function uploadLease(
  propertyId: string,
  tenantId: string,
  formData: FormData,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { owner, manager } = await canManageProperty(supabase, user.id, propertyId);
  if (!owner && !manager) {
    return { ok: false, error: "Only the owner or a manager can upload leases." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${propertyId}/${tenantId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from("leases")
    .upload(path, file);
  if (uploadError) return { ok: false, error: uploadError.message };

  const { count } = await admin
    .from("leases")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId);

  const { error } = await admin.from("leases").insert({
    property_id: propertyId,
    tenant_id: tenantId,
    file_path: path,
    // Text extraction is part of the triage pipeline, which isn't built
    // yet — placeholder keeps the not-null contract.
    extracted_text: "(text extraction pending)",
    version: (count ?? 0) + 1,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addCollaborator(
  propertyId: string,
  email: string,
  fullName: string,
  role: CollaboratorRole,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { owner } = await canManageProperty(supabase, user.id, propertyId);
  if (!owner) {
    return { ok: false, error: "Only the property owner can add staff." };
  }
  if (!COLLABORATOR_ROLES.includes(role)) {
    return { ok: false, error: "Unknown staff role." };
  }

  const provisioned = await provisionUser(email, fullName, "staff");
  if ("error" in provisioned) return { ok: false, error: provisioned.error };

  const admin = createAdminClient();
  const { error } = await admin.from("property_collaborators").insert({
    property_id: propertyId,
    user_id: provisioned.userId,
    role,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

// Unlinks the tenant from the property. The account itself is kept — they
// may rent elsewhere; account deletion is a platform-admin concern.
export async function removeTenant(
  propertyId: string,
  tenantId: string,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Server client: RLS's owner-or-manager delete policy authorizes this.
  const { error } = await supabase
    .from("property_tenants")
    .delete()
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeCollaborator(
  propertyId: string,
  userId: string,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS: only the property owner may delete collaborator assignments.
  const { error } = await supabase
    .from("property_collaborators")
    .delete()
    .eq("property_id", propertyId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<ManageResult> {
  const { supabase, user } = await signedInUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false, error: "Only admins can change roles." };
  }
  if (!ASSIGNABLE_USER_ROLES.includes(role)) {
    return { ok: false, error: "Unknown role." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
