-- Local development seed data. Applied automatically by `supabase db reset`
-- (see config.toml → [db.seed]). Never run against production.
--
-- Demo logins (use "Sign in with a password" on /login; bare usernames
-- resolve to @example.com). These credentials are deliberately trivial and
-- exist ONLY in this local seed.
--   admin / admin            — platform admin (role management, AI usage)
--   landlord@example.com     — owns both properties          (password123)
--   tenant1@example.com      — 401 Maple St (current), one triaged + one pending case
--   tenant2@example.com      — 76 Canyon Rd (former tenant), no cases yet
--   manager@example.com      — staff; manager on 401 Maple St
--   maintenance@example.com  — staff; maintenance on 401 Maple St
--   attorney@example.com     — staff; attorney on 401 Maple St
-- All non-admin accounts use password123.
--
-- Fixed UUIDs throughout so rows can reference each other deterministically.

-- ---------------------------------------------------------------------------
-- Auth users. Inserting into auth.users fires the handle_new_user trigger,
-- which creates the matching public.profiles row (default role 'tenant').
-- ---------------------------------------------------------------------------
-- The empty-string token columns are required: GoTrue scans them as text
-- and a NULL there breaks login with "Database error querying schema".
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new,
   email_change_token_current)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'landlord@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Lana Landlord"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'tenant1@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Terry Tenant"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'tenant2@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Tina Tenant"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'admin@example.com',
   crypt('admin', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Admin"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'manager@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Mandy Manager","role":"staff"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'maintenance@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Manny Maintenance","role":"staff"}', now(), now(),
   '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777',
   'authenticated', 'authenticated', 'attorney@example.com',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Alan Attorney","role":"staff"}', now(), now(),
   '', '', '', '', '');

-- Email identities so password sign-in works locally.
insert into auth.identities
  (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u;

-- Promote roles created as 'tenant' by the trigger.
update profiles set role = 'landlord' where id = '11111111-1111-1111-1111-111111111111';
update profiles set role = 'admin'    where id = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- Jurisdiction: Utah (launch scope — exactly one row; see architecture.md).
-- summary_text here is placeholder copy, NOT verified legal content.
-- ---------------------------------------------------------------------------
insert into jurisdictions (id, state, county, city, summary_text, source_citation)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'UT', null, null,
   'PLACEHOLDER — replace with the hand-curated Utah landlord-tenant law summary. '
   'Key areas to cover: Utah Fit Premises Act (habitability baseline), landlord duty '
   'to maintain common areas / plumbing / heating, tenant duty of ordinary care and '
   'cleanliness, notice-and-cure timelines (corrective period after written notice), '
   'and renter''s right of repair-and-deduct under Utah Code 57-22-6.',
   'Utah Code Title 57, Chapter 22 (Utah Fit Premises Act) — PLACEHOLDER, verify before use');

-- ---------------------------------------------------------------------------
-- Properties (both owned by the landlord) and tenant assignments.
-- ---------------------------------------------------------------------------
insert into properties (id, landlord_id, address_line1, address_line2, city, state, postal_code)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '401 Maple St', 'Unit 2', 'Salt Lake City', 'UT', '84101'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '76 Canyon Rd', null, 'Provo', 'UT', '84604');

-- tenant1 currently rents 401 Maple St; tenant2 is a former tenant of
-- 76 Canyon Rd (kept for history — still able to log in).
insert into property_tenants (property_id, tenant_id, status)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'current'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'former');

-- Staff assignments on 401 Maple St: one of each tier for testing.
insert into property_collaborators (property_id, user_id, role)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'manager'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'maintenance'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', 'attorney');

-- Mandy gets the "AI review completed" alert emails for 401 Maple St, so
-- the alert flow works out of the box (emails land in Mailpit locally).
insert into property_alert_recipients (property_id, user_id)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555');

-- ---------------------------------------------------------------------------
-- Leases. extracted_text is a shortened stand-in for real lease text; the
-- file_path values point at Storage objects that don't exist yet (bucket
-- setup is an open item in launch_decisions.md).
-- ---------------------------------------------------------------------------
insert into leases (id, property_id, tenant_id, file_path, extracted_text, version, effective_date)
values
  ('cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'leases/cccccccc-0000-0000-0000-000000000001/original.pdf',
   'RESIDENTIAL LEASE AGREEMENT (seed placeholder). Landlord shall maintain plumbing, '
   'heating, and electrical systems in good working order. Tenant is responsible for '
   'damage caused by negligence or misuse, including drain blockages caused by improper '
   'disposal. Tenant shall replace HVAC filters and smoke-detector batteries. Landlord '
   'shall be notified in writing of any condition requiring repair.',
   1, '2026-01-01'),
  ('cccccccc-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333',
   'leases/cccccccc-0000-0000-0000-000000000002/original.pdf',
   'RESIDENTIAL LEASE AGREEMENT (seed placeholder). Standard maintenance split: '
   'landlord maintains structure and building systems; tenant maintains cleanliness '
   'and reports issues promptly.',
   1, '2026-03-01');

-- ---------------------------------------------------------------------------
-- Cases.
--   Case 1: AI review completed — verdict says landlord-responsible.
--   Case 2: newly submitted, still pending AI review (verdict fields null).
-- ---------------------------------------------------------------------------
insert into cases
  (id, tenant_id, property_id, lease_id, jurisdiction_id, description, status,
   responsible_party, confidence, cited_sources, reasoning_summary, model_used)
values
  ('dddddddd-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Water is leaking from the ceiling of the bathroom, directly below the upstairs unit''s plumbing. Getting worse over the past two days.',
   'ai_review_completed',
   'landlord', 0.91,
   '[{"type":"lease_clause","reference":"Maintenance of building systems","quote":"Landlord shall maintain plumbing, heating, and electrical systems in good working order."},
     {"type":"statute","reference":"Utah Fit Premises Act, Utah Code 57-22-4","quote":"Owner duty to maintain plumbing in a condition fit for habitation (seed placeholder quote)."}]'::jsonb,
   'The photographed ceiling staining and active drip pattern indicate a plumbing failure originating outside the tenant''s unit. The lease assigns building-system plumbing maintenance to the landlord, and the Utah Fit Premises Act places habitability-level plumbing repairs on the owner. No evidence of tenant negligence is visible.',
   'claude-opus-4-8'),
  ('dddddddd-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Kitchen sink is draining very slowly, standing water after washing dishes.',
   'pending_ai_review',
   null, null, '[]'::jsonb, null, null);

-- Multiple photos on case 1 (the multi-attachment path), one on case 2.
-- storage_path values point at a bucket that doesn't exist yet (open item).
insert into case_media (id, case_id, storage_path, media_type, position)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
   'case-media/dddddddd-0000-0000-0000-000000000001/ceiling-wide.jpg', 'photo', 0),
  ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001',
   'case-media/dddddddd-0000-0000-0000-000000000001/ceiling-closeup.jpg', 'photo', 1),
  ('eeeeeeee-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001',
   'case-media/dddddddd-0000-0000-0000-000000000001/floor-towels.jpg', 'photo', 2),
  ('eeeeeeee-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000002',
   'case-media/dddddddd-0000-0000-0000-000000000002/sink.jpg', 'photo', 0);

-- Audit trail for case 1 (submitted → verdict → landlord notified).
insert into case_events (case_id, event_type, actor_id, payload)
values
  ('dddddddd-0000-0000-0000-000000000001', 'case_submitted',
   '22222222-2222-2222-2222-222222222222',
   '{"media_count": 3}'::jsonb),
  ('dddddddd-0000-0000-0000-000000000001', 'verdict_generated',
   null,
   '{"model": "claude-opus-4-8", "responsible_party": "landlord", "confidence": 0.91}'::jsonb),
  ('dddddddd-0000-0000-0000-000000000001', 'landlord_notification_queued',
   null,
   '{"channel": "email", "recipient": "landlord@example.com"}'::jsonb),
  ('dddddddd-0000-0000-0000-000000000002', 'case_submitted',
   '22222222-2222-2222-2222-222222222222',
   '{"media_count": 1}'::jsonb);
