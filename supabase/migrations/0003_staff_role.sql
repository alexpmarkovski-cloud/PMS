-- Add the 'staff' platform role for landlord-provisioned collaborator
-- accounts (managers, maintenance, attorneys). Their per-property tier
-- lives in property_collaborators (migration 0004) — 'staff' only marks
-- the account as neither a tenant, a property owner, nor platform admin.
--
-- Kept in its own migration: a new enum value can't be referenced in the
-- same transaction that adds it, and each migration file runs in one.

alter type user_role add value 'staff';
