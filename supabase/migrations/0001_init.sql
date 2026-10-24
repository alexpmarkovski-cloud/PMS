-- Property Maintenance AI Triage System — initial schema
-- Roles: tenant, landlord (property manager), admin.
-- pgvector is enabled now but unused until the legal corpus spans more than
-- one jurisdiction (see architecture.md → Legal Corpus Phasing).

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create type user_role as enum ('tenant', 'landlord', 'admin');
create type responsible_party as enum ('landlord', 'tenant', 'unclear');
-- 'video' exists for future use — no model in the triage pipeline processes
-- video today; a submitted video would need frame extraction upstream first.
create type media_type as enum ('photo', 'video');
create type case_status as enum (
  'pending_review',            -- verdict generated, no action taken yet
  'awaiting_landlord_confirmation', -- landlord-responsible, waiting on human confirmation
  'landlord_notified',         -- confirmed and sent to landlord/PM
  'tenant_guidance_delivered', -- tenant-responsible, guidance shown
  'resolved'
);

-- One row per authenticated user, mirroring auth.users. Role drives access.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'tenant',
  full_name text,
  created_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references profiles (id) on delete restrict,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null, -- USPS abbreviation, e.g. 'UT'
  postal_code text not null,
  created_at timestamptz not null default now()
);

-- Which tenant is assigned to which property/unit.
create table property_tenants (
  property_id uuid not null references properties (id) on delete cascade,
  tenant_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (property_id, tenant_id)
);

-- Signed leases. `extracted_text` is what gets included in the triage
-- request context (Phase 1: pasted in full; later phases may chunk it).
create table leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  tenant_id uuid not null references profiles (id) on delete restrict,
  file_path text not null, -- Supabase Storage path to the source PDF
  extracted_text text not null,
  version integer not null default 1,
  effective_date date,
  created_at timestamptz not null default now()
);

-- Curated legal reference material by jurisdiction. Phase 1 (Utah only)
-- only ever has one row and `summary_text` is pasted directly into the
-- triage request. `embedding` stays null until Phase 2 introduces
-- pgvector-based retrieval across multiple jurisdictions.
create table jurisdictions (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  county text,
  city text,
  summary_text text not null,
  source_citation text not null,
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  unique (state, county, city)
);

-- One row per tenant-submitted issue, holding the AI's structured verdict.
-- responsible_party / confidence / cited_sources / disclaimer map directly
-- to the Claude structured-output schema (architecture.md). Attachments
-- (one or more photos) live in `case_media`, not on this row.
create table cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references profiles (id) on delete restrict,
  property_id uuid not null references properties (id) on delete restrict,
  lease_id uuid not null references leases (id) on delete restrict,
  jurisdiction_id uuid references jurisdictions (id) on delete restrict,
  description text not null,
  status case_status not null default 'pending_review',
  responsible_party responsible_party,
  confidence numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  cited_sources jsonb not null default '[]'::jsonb,
  reasoning_summary text,
  disclaimer text not null default
    'This is an automated, informational assessment and not legal advice. It may be incomplete or incorrect — consult a licensed attorney for decisions with legal or financial consequences.',
  model_used text,
  created_at timestamptz not null default now()
);

-- Attachments for a case — a tenant may submit several photos (and, later,
-- video) for the same issue. `position` controls display order.
create table case_media (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  storage_path text not null, -- Supabase Storage path
  media_type media_type not null default 'photo',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- Append-only audit trail: every state change and model call for a case.
-- Kept separate from `cases` (which holds current state) so the history
-- of a dispute — including the exact model output at the time — is never
-- overwritten by a later update.
create table case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  event_type text not null, -- e.g. 'verdict_generated', 'landlord_confirmed', 'guidance_viewed'
  actor_id uuid references profiles (id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cases_tenant_id_idx on cases (tenant_id);
create index cases_property_id_idx on cases (property_id);
create index case_media_case_id_idx on case_media (case_id);
create index case_events_case_id_idx on case_events (case_id);
create index leases_property_id_idx on leases (property_id);

-- Auto-create a profile row when a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
