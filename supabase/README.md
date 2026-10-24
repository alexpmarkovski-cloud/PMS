# Supabase — Local Dev & Schema

## Local development

Requires Docker and the Supabase CLI.

```bash
supabase start     # boots the local stack (Postgres :54322, API :54321, Studio :54323)
supabase db reset  # replays migrations + seed.sql from scratch (or: npm run db:reset)
```

The Next.js app reads the local URL/keys from `.env.local` (see `.env.example`). After changing the schema, regenerate the TypeScript types with `npm run db:types`. Verify wiring end-to-end via `npm run dev` → `http://localhost:3000/api/health` (expects `{"ok":true,"jurisdictions":1}`), or browse data in Studio at `http://localhost:54323`.

**Seeded demo logins** — on `/login`, choose "Sign in with a password instead". Bare usernames resolve to `@example.com`. (The emailed one-time-code flow also works; codes land in Mailpit at `localhost:54324`.)

| Login | Password | Role | Data |
|---|---|---|---|
| `admin` | `admin` | admin | Sees everything; role management + AI token usage |
| `landlord@example.com` | `password123` | landlord (Property Owner) | Owns both properties |
| `tenant1@example.com` | `password123` | tenant | 401 Maple St (**current**); 1 case AI-reviewed + 1 pending |
| `tenant2@example.com` | `password123` | tenant | 76 Canyon Rd (**former** tenant); no cases |
| `manager@example.com` | `password123` | staff | **Manager** on 401 Maple St — tenant roster + job statuses |
| `maintenance@example.com` | `password123` | staff | **Maintenance** on 401 Maple St — job statuses, no leases/roster |
| `attorney@example.com` | `password123` | staff | **Attorney** on 401 Maple St — read-only roster/contracts; can edit case statuses (not "completed") |

The seed's Utah law summary and lease texts are **placeholders**, not verified legal content.

## Schema

Migrations, applied in order:

- `migrations/0001_init.sql` — core tables (`profiles`, `properties`, `property_tenants`, `leases`, `jurisdictions`, `cases`, `case_media`, `case_events`), enums, indexes, and the `pgvector` extension (provisioned, unused until Phase 2 — see `architecture.md` → Legal Corpus Phasing).
- `migrations/0002_rls.sql` — row-level security policies for the tenant / landlord / admin role model. Required before exposing this project's API publicly; Supabase serves every table over PostgREST by default.
- `migrations/0003_staff_role.sql` — adds the `staff` value to `user_role` for owner-provisioned collaborator accounts.
- `migrations/0004_property_collaborators.sql` — per-property staff tiers (`manager` / `maintenance` / `attorney`) in `property_collaborators`, their RLS policies, and the metadata-driven (clamped) role in `handle_new_user`.
- `migrations/0005_tenant_status_case_lifecycle.sql` — `current`/`former` tenant status on `property_tenants`, the reworked `case_status` lifecycle (`pending_ai_review → ai_review_completed → landlord_responsible | tenant_responsible → completed`), case-update policies, and the private `leases` Storage bucket.
- `migrations/0006_alert_recipients.sql` — `property_alert_recipients`: who gets the automatic email when a case reaches `ai_review_completed`. Managed by the owner/managers; recipients must be registered people on the property (owner, staff, or a current tenant — DB check constraint). The app sends these through SMTP (locally Mailpit's `smtp_port = 54325`, exposed in `config.toml`; the seed pre-registers `manager@example.com` on 401 Maple St).
- `migrations/0007_attorney_capabilities.sql` — attorneys can now update cases (`can_update_case` covers all collaborator tiers; the "completed is owner/manager/maintenance-only" rule is value-dependent and enforced in the app's status action) and read the tenant roster/names for their properties (contract review).
- `migrations/0008_case_media_bucket.sql` — private `case-media` bucket for tenant-submitted maintenance photos (uploads via the submit server action, viewing via signed URLs), and a tightened `cases` insert policy: the tenant must actually be assigned to the property they're filing against. Submitted cases sit at `pending_ai_review` until the triage pipeline (item 13) is built.
- `migrations/0009_ai_usage.sql` — per-request AI token usage (`ai_usage`), one row per model call, keyed by `case_id`. Tokens only — no in-app cost estimate; cost is computed downstream from the raw counts. **Admin-only** via RLS (`is_admin()`); landlords, staff, and tenants get zero rows. Deliberately not folded into `case_events`, which tenants and maintenance can read. Commented-in the file: the one-policy change to expose it to property owners later.

## Apply

With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to a project:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Or paste each file into the SQL editor in the Supabase dashboard, in order.

## Notes

- `jurisdictions` is hand-curated reference data (state/county/city law summaries), not user-submitted — only admins can write to it. Launch has exactly one row (Utah).
- `case_media` holds one row per attachment (a case can have several photos), each with its own Storage path and a `media_type` (`photo` today; `video` exists in the enum but nothing in the triage pipeline processes it yet — see the note in `0001_init.sql`).
- `cases` holds the current verdict; `case_events` is an append-only audit trail of everything that happened to a case (verdict generated, landlord notified, confirmed, etc.) and should never be updated or deleted, only inserted into.
- The `handle_new_user` trigger auto-creates a `profiles` row (default role `tenant`) whenever someone signs up via Supabase Auth. Landlord/admin roles are assigned by updating that row afterward — no self-serve role escalation.
