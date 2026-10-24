-- Attorney capability expansion (launch_decisions #16 matrix update).
-- Attorneys review the AI's informational verdicts and may now correct a
-- case's status (e.g. re-route landlord_responsible → tenant_responsible).
-- Marking a job 'completed' remains owner/manager/maintenance-only — that
-- rule is value-dependent, so it's enforced in the status server action,
-- not here.
--
-- They also gain read access to the tenant roster and tenant names for
-- the properties they're assigned to — needed to locate the right
-- contract (lease read access was already granted in 0004). Maintenance
-- stays excluded from all tenant personal info.

-- Case updates: every collaborator tier, plus owner and admin.
create or replace function can_update_case(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
    where c.id = cid
      and (
        owns_property(c.property_id)
        or collab_role(c.property_id) is not null
        or is_admin()
      )
  );
$$;

-- Roster visibility for attorneys (managers already have it via 0004).
create policy "property_tenants_select_attorney" on property_tenants
  for select using (collab_role(property_id) = 'attorney');

-- Tenant/staff names for attorneys: manages_profile now also matches
-- properties where the caller is an attorney collaborator.
create or replace function manages_profile(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from properties p
    where (owns_property(p.id) or collab_role(p.id) in ('manager', 'attorney'))
      and (
        p.landlord_id = target
        or exists (select 1 from property_tenants pt
                   where pt.property_id = p.id and pt.tenant_id = target)
        or exists (select 1 from property_collaborators pc
                   where pc.property_id = p.id and pc.user_id = target)
      )
  );
$$;
