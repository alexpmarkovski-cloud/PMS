-- Maintenance alert recipients. When a case reaches ai_review_completed,
-- an email goes to each designated recipient for that property. The owner
-- and managers choose recipients; every recipient must be a registered
-- user already associated with the property (owner, collaborator, or
-- current tenant) — enforced in the app layer, where the email → user
-- lookup happens, and mirrored here as a belt-and-suspenders check.

create table property_alert_recipients (
  property_id uuid not null references properties (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, user_id)
);

-- True when the user is associated with the property: its owner, any
-- collaborator tier, or a *current* tenant. Former tenants don't qualify
-- as alert recipients.
create function is_property_member(pid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from properties where id = pid and landlord_id = uid)
      or exists (select 1 from property_collaborators
                 where property_id = pid and user_id = uid)
      or exists (select 1 from property_tenants
                 where property_id = pid and tenant_id = uid
                   and status = 'current');
$$;

alter table property_alert_recipients
  add constraint recipient_is_property_member
  check (is_property_member(property_id, user_id));

alter table property_alert_recipients enable row level security;

create policy "alert_recipients_select" on property_alert_recipients
  for select using (manages_property(property_id) or is_admin());
create policy "alert_recipients_insert" on property_alert_recipients
  for insert with check (manages_property(property_id));
create policy "alert_recipients_delete" on property_alert_recipients
  for delete using (manages_property(property_id));

grant select, insert, delete on property_alert_recipients to authenticated;
grant all on property_alert_recipients to service_role;
