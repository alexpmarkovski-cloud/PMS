-- Row-level security. Supabase exposes every table over PostgREST by
-- default, so access control lives here, not just in application code.
--
-- Role model:
--   tenant   — sees only their own leases/cases and the property they live at
--   landlord — sees properties they own and cases tied to those properties
--   admin    — sees everything (used for support/dispute resolution)
--
-- All cross-table checks go through `security definer` helper functions.
-- Policies that subquery each other's tables directly (properties ↔
-- property_tenants) trigger "infinite recursion detected in policy"
-- (42P17), because each subquery re-enters the other table's RLS. The
-- definer functions run as the owner and bypass RLS inside the check,
-- breaking the cycle.

-- (named current_user_role because CURRENT_ROLE is a reserved SQL keyword)
create function current_user_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create function is_admin() returns boolean
language sql stable as $$
  select current_user_role() = 'admin';
$$;

-- True when the signed-in user is an assigned tenant of the property.
create function is_tenant_of_property(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from property_tenants
    where property_id = pid and tenant_id = auth.uid()
  );
$$;

-- True when the signed-in user is the landlord of the property.
create function owns_property(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties
    where id = pid and landlord_id = auth.uid()
  );
$$;

-- Case visibility shared by cases, case_media, and case_events: the tenant
-- who filed it, the landlord of its property, or an admin.
create function can_access_case(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
    where c.id = cid
      and (
        c.tenant_id = auth.uid()
        or owns_property(c.property_id)
        or is_admin()
      )
  );
$$;

-- True when the signed-in user is the tenant who filed the case.
create function is_case_tenant(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
    where c.id = cid and c.tenant_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table properties enable row level security;
alter table property_tenants enable row level security;
alter table leases enable row level security;
alter table jurisdictions enable row level security;
alter table cases enable row level security;
alter table case_media enable row level security;
alter table case_events enable row level security;

-- profiles: a user can read/update their own row; admins read all.
create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

-- properties: landlords manage their own properties; tenants can read the
-- property they're assigned to; admins read all.
create policy "properties_select" on properties
  for select using (
    landlord_id = auth.uid()
    or is_admin()
    or is_tenant_of_property(id)
  );
create policy "properties_insert_landlord" on properties
  for insert with check (landlord_id = auth.uid());
create policy "properties_update_landlord" on properties
  for update using (landlord_id = auth.uid());

-- property_tenants: visible to the landlord of that property, the tenant
-- themself, and admins.
create policy "property_tenants_select" on property_tenants
  for select using (
    tenant_id = auth.uid()
    or is_admin()
    or owns_property(property_id)
  );

-- leases: visible to the tenant on the lease, the landlord of the property,
-- and admins.
create policy "leases_select" on leases
  for select using (
    tenant_id = auth.uid()
    or is_admin()
    or owns_property(property_id)
  );

-- jurisdictions: reference data, readable by any authenticated user; only
-- admins write it (it's hand-curated, not user-submitted).
create policy "jurisdictions_select_authenticated" on jurisdictions
  for select using (auth.role() = 'authenticated');
create policy "jurisdictions_write_admin" on jurisdictions
  for all using (is_admin()) with check (is_admin());

-- cases: tenant who filed it, landlord of the property, and admins.
create policy "cases_select" on cases
  for select using (
    tenant_id = auth.uid()
    or is_admin()
    or owns_property(property_id)
  );
create policy "cases_insert_tenant" on cases
  for insert with check (tenant_id = auth.uid());

-- case_media: same visibility as the parent case. Tenants may also insert
-- attachments onto their own case (client-side upload flow).
create policy "case_media_select" on case_media
  for select using (can_access_case(case_id));
create policy "case_media_insert_tenant" on case_media
  for insert with check (is_case_tenant(case_id));

-- case_events: same visibility as the parent case. Writes go through a
-- service role from the API layer, not directly from clients.
create policy "case_events_select" on case_events
  for select using (can_access_case(case_id));

-- ---------------------------------------------------------------------------
-- Table privileges. RLS restricts *rows*; these grants restrict *verbs*.
-- Explicit rather than relying on platform default privileges so behavior
-- is identical local and in production. anon gets nothing — every read in
-- this app requires a signed-in user. service_role bypasses RLS but still
-- needs table privileges, so it's granted everything.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select on profiles, properties, property_tenants, leases,
                jurisdictions, cases, case_media, case_events
  to authenticated;
grant insert on cases, case_media to authenticated;
grant update on profiles, properties to authenticated;
grant insert on properties to authenticated;

grant all on all tables in schema public to service_role;
