import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type CollaboratorRole = Database["public"]["Enums"]["collaborator_role"];

// Display names decouple what users see from the enum values stored in
// Postgres — the DB says 'landlord', people see "Property Owner".
export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: "Tenant",
  landlord: "Property Owner",
  staff: "Staff",
  admin: "Admin",
};

export const COLLABORATOR_LABELS: Record<CollaboratorRole, string> = {
  manager: "Manager",
  maintenance: "Maintenance",
  attorney: "Attorney",
};
