-- Per-request AI token usage (launch_decisions #18).
--
-- One row per model call made for a case, so usage is attributable per
-- maintenance request — and, through cases.property_id → properties, per
-- property and per owner. That chain is what makes it cheap to expose this
-- to landlords later (a second SELECT policy, no schema change) if usage
-- based pricing happens (item 16).
--
-- Deliberately NOT folded into case_events: those are readable by anyone
-- who can see the case (including tenants and maintenance via
-- can_access_case), and usage data has no business being in that blast
-- radius. Admin-only here.
--
-- Tokens only — no cost estimate. Provider pricing varies and changes over
-- time; cost is computed downstream from these counts rather than frozen
-- into the row.

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  provider text not null,                       -- 'gemini' | 'claude'
  model text not null,                          -- exact model id billed
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,     -- includes thinking/reasoning
  cached_input_tokens integer not null default 0,
  succeeded boolean not null default true,      -- false: billed but no usable verdict
  created_at timestamptz not null default now()
);

create index ai_usage_case_id_idx on ai_usage (case_id);
create index ai_usage_created_at_idx on ai_usage (created_at);

alter table ai_usage enable row level security;

-- Platform staff only. Landlords/staff/tenants get no rows at all.
-- To open this to property owners later, add (don't replace):
--   create policy "ai_usage_select_owner" on ai_usage for select using (
--     owns_property((select property_id from cases where id = ai_usage.case_id))
--   );
create policy "ai_usage_select_admin" on ai_usage
  for select using (is_admin());

-- Writes come only from the triage pipeline via the service-role client.
grant select on ai_usage to authenticated;
grant all on ai_usage to service_role;
