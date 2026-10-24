-- Property collaborators: landlord-designated staff with per-property,
-- per-tier access. The owner (properties.landlord_id, exactly one) manages
-- these assignments; collaborators never see billing (none exists yet) and
-- tiers are hardcoded rather than user-defined (launch_decisions.md #16).
--
--   manager     — day-to-day operations: tenants, leases, cases
--   maintenance — case/property details only (no leases, no tenant roster)
--   attorney    — read-only leases + case history for legal review
--
-- Tenants are provisioned by the owner or a manager (server-side, via the
-- service-role client); self-serve /signup now creates landlord accounts.

create type collaborator_role as enum ('manager', 'maintenance', 'attorney');

create table property_collaborators (
  property_id uuid not null references properties (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role collaborator_role not null,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

create index property_collaborators_user_id_idx on property_collaborators (user_id);

-- ---------------------------------------------------------------------------
-- Helpers. security definer for the same reason as 0002: policies that
-- subquery RLS-protected tables from other policies recurse without it.
-- ---------------------------------------------------------------------------

-- The signed-in user's collaborator tier on a property, or null.
create function collab_role(pid uuid) returns collaborator_role
language sql stable security definer set search_path = public as $$
  select role from property_collaborators
  where property_id = pid and user_id = auth.uid();
$$;

-- True when the signed-in user may manage people on the property: the
-- owner, or a manager collaborator. (Collaborator management itself is
-- owner-only; this governs tenants.)
create function manages_property(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_property(pid) or collab_role(pid) = 'manager';
$$;

-- True when the signed-in user oversees the target user somewhere: the
-- target is a tenant, collaborator, or owner of a property the caller
-- owns or manages. Lets owners/managers read the profiles (names) of the
-- people they administer.
create function manages_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties p
    where manages_property(p.id)
      and (
        p.landlord_id = target
        or exists (select 1 from property_tenants pt
                   where pt.property_id = p.id and pt.tenant_id = target)
        or exists (select 1 from property_collaborators pc
                   where pc.property_id = p.id and pc.user_id = target)
      )
  );
$$;

-- Case visibility now includes collaborators of the case's property (all
-- three tiers see cases; attorney needs history, maintenance the work).
create or replace function can_access_case(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
    where c.id = cid
      and (
        c.tenant_id = auth.uid()
        or owns_property(c.property_id)
        or collab_role(c.property_id) is not null
        or is_admin()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies. Additive: existing 0002 policies stay; multiple permissive
-- policies on the same command are OR'd together.
-- ---------------------------------------------------------------------------

alter table property_collaborators enable row level security;

-- Assignments are visible to the owner, managers of the property, the
-- collaborator themself, and admins. Only the owner adds/removes staff.
create policy "property_collaborators_select" on property_collaborators
  for select using (
    user_id = auth.uid()
    or is_admin()
    or manages_property(property_id)
  );
create policy "property_collaborators_insert_owner" on property_collaborators
  for insert with check (owns_property(property_id));
create policy "property_collaborators_delete_owner" on property_collaborators
  for delete using (owns_property(property_id));

-- properties: any collaborator tier can see the property they're assigned to.
create policy "properties_select_collaborator" on properties
  for select using (collab_role(id) is not null);

-- property_tenants: managers see the roster; owners and managers maintain it.
create policy "property_tenants_select_manager" on property_tenants
  for select using (collab_role(property_id) = 'manager');
create policy "property_tenants_insert_owner_or_manager" on property_tenants
  for insert with check (manages_property(property_id));
create policy "property_tenants_delete_owner_or_manager" on property_tenants
  for delete using (manages_property(property_id));

-- leases: managers (operations) and attorneys (legal review); not maintenance.
create policy "leases_select_collaborator" on leases
  for select using (collab_role(property_id) in ('manager', 'attorney'));

-- cases: every collaborator tier of the property.
create policy "cases_select_collaborator" on cases
  for select using (collab_role(property_id) is not null);
-- (case_media / case_events already flow through can_access_case, replaced
-- above.)

-- profiles: owners/managers can read the profiles of people they administer.
create policy "profiles_select_managed" on profiles
  for select using (manages_profile(id));

-- ---------------------------------------------------------------------------
-- Trigger: profile role now comes from signup metadata, clamped to the
-- self-serve/provisionable roles. 'admin' can never be minted this way —
-- metadata is client-influencable (signInWithOtp accepts arbitrary data),
-- so anything but the known-safe values falls through to 'tenant'.
-- 'landlord' is what /signup sets; 'staff' and 'tenant' are set by the
-- owner/manager provisioning actions (service role).
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case new.raw_user_meta_data ->> 'role'
      when 'landlord' then 'landlord'::user_role
      when 'staff' then 'staff'::user_role
      else 'tenant'::user_role
    end,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (verbs; RLS above restricts rows).
-- ---------------------------------------------------------------------------
grant select on property_collaborators to authenticated;
grant insert, delete on property_collaborators to authenticated;
grant insert, delete on property_tenants to authenticated;
grant all on property_collaborators to service_role;
