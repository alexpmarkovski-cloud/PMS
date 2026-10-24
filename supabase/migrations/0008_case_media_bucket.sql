-- Maintenance-request submissions.
--
-- 1. Private 'case-media' bucket for tenant-uploaded photos (media_type
--    'video' exists in the enum but uploads are photos-only until the
--    video question is decided — launch_decisions item 1). Like 'leases',
--    access is service-role only: uploads happen in the submit server
--    action, viewing via signed URLs. storage.objects RLS remains open
--    (launch_decisions item 2).
-- 2. Tighten the case insert policy: 0002's version only checked
--    tenant_id = auth.uid(), which let a tenant file a case against any
--    property. Now the tenant must actually be assigned to the property.
--    (The submit action additionally requires *current* tenancy.)

insert into storage.buckets (id, name, public)
values ('case-media', 'case-media', false)
on conflict (id) do nothing;

drop policy "cases_insert_tenant" on cases;
create policy "cases_insert_tenant" on cases
  for insert with check (
    tenant_id = auth.uid() and is_tenant_of_property(property_id)
  );
