-- Tenant status + case lifecycle rework + lease storage.
--
-- 1. property_tenants gains current/former status. Former tenants keep
--    their login (history stays reachable); they're just flagged. Only
--    current tenants get a signup notification when provisioned — that
--    branch lives in the app layer (invite email vs. silent create).
-- 2. case_status is replaced with the product's actual job lifecycle:
--      pending_ai_review    — AI triage hasn't produced its verdict yet
--      ai_review_completed  — verdict in; responsible_party carries who
--                             (set automatically by the triage pipeline
--                             when it lands — pipeline not built yet)
--      landlord_responsible — routed to the landlord's queue
--      tenant_responsible   — routed to tenant guidance
--      completed            — closed by landlord/manager/maintenance
-- 3. A private 'leases' Storage bucket for contract uploads. Access is
--    service-role only for now (server actions); client-side storage RLS
--    is still launch_decisions.md item 2.

-- ---------------------------------------------------------------------------
-- Tenant status
-- ---------------------------------------------------------------------------
create type tenant_status as enum ('current', 'former');

alter table property_tenants
  add column status tenant_status not null default 'current';

-- Owners and managers may flip current/former.
create policy "property_tenants_update_owner_or_manager" on property_tenants
  for update using (manages_property(property_id))
  with check (manages_property(property_id));

-- ---------------------------------------------------------------------------
-- Case lifecycle. Swap the enum: detach the column, rebuild the type,
-- map old values onto the new lifecycle, reattach.
-- ---------------------------------------------------------------------------
alter table cases alter column status drop default;
alter table cases alter column status type text using status::text;
drop type case_status;

create type case_status as enum (
  'pending_ai_review',
  'ai_review_completed',
  'landlord_responsible',
  'tenant_responsible',
  'completed'
);

update cases set status = case status
  when 'pending_review'                 then 'pending_ai_review'
  when 'awaiting_landlord_confirmation' then 'ai_review_completed'
  when 'landlord_notified'              then 'landlord_responsible'
  when 'tenant_guidance_delivered'      then 'tenant_responsible'
  when 'resolved'                       then 'completed'
  else 'pending_ai_review'
end;

alter table cases
  alter column status type case_status using status::case_status;
alter table cases
  alter column status set default 'pending_ai_review';

-- Status changes: the owner, manager/maintenance collaborators, and
-- admins. (Attorneys are read-only; tenants never edit cases.) The
-- "only these roles may mark completed" rule is the same set, so one
-- policy covers it.
create function can_update_case(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
    where c.id = cid
      and (
        owns_property(c.property_id)
        or collab_role(c.property_id) in ('manager', 'maintenance')
        or is_admin()
      )
  );
$$;

create policy "cases_update_staff" on cases
  for update using (can_update_case(id))
  with check (can_update_case(id));

grant update on property_tenants, cases to authenticated;

-- ---------------------------------------------------------------------------
-- Lease contract uploads: private bucket, served via signed URLs from
-- server actions (service role). No storage.objects policies yet — anon
-- and authenticated clients cannot touch the bucket directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('leases', 'leases', false)
on conflict (id) do nothing;
