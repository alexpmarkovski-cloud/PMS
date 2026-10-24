import type { Database } from "@/lib/supabase/database.types";

export type TenantStatus = Database["public"]["Enums"]["tenant_status"];
export type CaseStatus = Database["public"]["Enums"]["case_status"];
export type ResponsibleParty =
  Database["public"]["Enums"]["responsible_party"];

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  current: "Current",
  former: "Former",
};

// Job lifecycle. ai_review_completed is set automatically by the triage
// pipeline when it lands (not built yet). Any collaborator tier may adjust
// status (attorneys correct verdict routing), but only the owner, a
// manager, or maintenance may set completed — enforced in setCaseStatus.
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  pending_ai_review: "Pending AI review",
  ai_review_completed: "AI review completed",
  landlord_responsible: "Landlord responsible",
  tenant_responsible: "Tenant responsible",
  completed: "Completed",
};

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsibleParty, string> = {
  landlord: "Landlord responsible",
  tenant: "Tenant responsible",
  unclear: "Responsibility unclear",
};
