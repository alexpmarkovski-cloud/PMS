# Launch Decisions

A running log of open questions raised during planning that haven't been settled yet — kept here instead of getting lost in chat history. When something gets decided, update its status and record the reasoning; don't delete the entry, so this doubles as a record of *why* a call was made later on.

**Status values:** `Open` (raised, not yet decided) · `Decided` (resolved — entry kept for the record).

---

## Engineering

### 1. Second AI provider for video input (Gemini)
**Status:** Open

Claude doesn't accept video input; Gemini (1.5/2.0/2.5 Pro and Flash) does, natively — it processes sampled frames and audio directly rather than requiring frame extraction upstream. The `case_media` table already has `video` as a placeholder value in its `media_type` enum, but nothing in the triage pipeline processes video today.

Adding Gemini for the video path means running two AI providers in production — separate API, billing, and reliability profile — not just a config flag on the existing Claude integration.

**Options raised:**
- Add Gemini for video-only cases; keep Claude for the core photo + lease + law triage call.
- Extract frames from video and feed them to Claude as images instead of adding a second provider.
- Don't support video at all for now; revisit post-launch.

### 2. Supabase Storage buckets and `storage.objects` RLS policies
**Status:** Open

`case_media.storage_path` and `leases.file_path` reference files, but the actual Storage buckets (and their access policies) haven't been created. Needs the same tenant/landlord/admin scoping already applied to the Postgres tables in `supabase/migrations/0002_rls.sql`.

Update: private `leases` (migration 0005) and `case-media` (migration 0008) buckets now exist — contract uploads and tenant maintenance-request photos respectively — accessed exclusively through server actions with the service-role key (signed URLs for viewing). Still open: proper `storage.objects` RLS policies if client-side access is ever wanted, and whether photo uploads should move to direct-to-storage (signed upload URLs) if the server-action round-trip becomes a bottleneck.

### 3. Supabase environment setup — local dev and production project
**Status:** Partially decided — local dev done; production still open

- **Local dev: done.** `supabase init` config, full seed (`supabase/seed.sql`, all tables + test logins), `.env.local` wiring, typed clients (`src/lib/supabase/`), and a `/api/health` connectivity check are in place and verified against the local Docker stack. See `supabase/README.md`.
- **Production: still open.** No hosted Supabase project has been created yet; who creates/links it (dashboard vs. CLI) and when is undecided. When it is created, mirror the auth settings from `supabase/config.toml` (via `supabase config push` or the dashboard) — notably `otp_expiry = 900` (15 min) and `max_frequency = "3m0s"` (OTP resend throttle), which only apply locally until pushed.

### 7. Authentication method
**Status:** Decided — passwordless email OTP

Login sends a 6-digit code by email (`signInWithOtp` + `verifyOtp`); no passwords in the product UI. Rationale: tenants use the app a few times a year, which is exactly where passwords fail (constant resets); OTP doubles as email verification; Supabase Auth supports it natively with no schema changes. Accounts are provisioned by the property manager — login never creates one (`shouldCreateUser: false`). Note: Supabase Auth still stores password hashes in its managed `auth` schema for the seeded dev users; that's harmless and invisible to the product.

**Update (portfolio release):** `/login` now also offers "Sign in with a password instead" for the seeded demo accounts (`admin` / `admin`, others `password123`; bare usernames resolve to `@example.com`), so anyone cloning the repo can explore every role without retrieving codes from Mailpit. OTP remains the primary flow, and the trivial credentials exist only in `supabase/seed.sql`.

**Production SMTP: Decided — Gmail / Google Workspace SMTP.** Locally, Mailpit captures OTP emails (`localhost:54324`); production needs a real SMTP provider configured in Supabase before login works outside local dev. Chose Gmail/Workspace SMTP (`smtp.gmail.com:587`, authenticated with an app password — Supabase's SMTP config takes username/password, not OAuth tokens, so this isn't "Sign in with Google," just using Gmail as the sending relay) over a transactional provider (Resend, Postmark, etc.) to avoid adding a new vendor — Supabase, Cloudflare, and Google Workspace are already in use.

Known tradeoffs, accepted for now: consumer/Workspace sending limits (~500–2,000/day — fine for the Utah pilot), no branded sending domain (mail comes from the Gmail/Workspace address, not `@` the product domain), and weaker deliverability than a transactional provider with SPF/DKIM on a dedicated domain — worth watching since a spam-foldered OTP is a user who can't log in at all. Revisit if OTP delivery problems show up, or before scaling past pilot volume. Ties into item 3's production setup.

Note: the app now also sends its own transactional email (maintenance-alert emails when a case reaches `ai_review_completed` — see migration 0006), separate from the auth emails Supabase sends. It uses the `SMTP_*` env vars (`.env.example`); locally it defaults to Mailpit's exposed SMTP port (54325), and production needs the same Gmail/Workspace SMTP credentials configured in the app's env, not just in Supabase.

### 12. Error reporting — Sentry vs plain logging
**Status:** Open

The baseline is now in place: root `error.tsx` / `global-error.tsx` boundaries render branded fallbacks instead of Next's default error screen, and `src/proxy.ts` wraps its auth check in try/catch (public routes fail open, `/dashboard` fails closed to `/login`) so one Supabase blip can't 500 the whole site. All of it logs via `console.error`, which in production lands in the host's function logs (Vercel) — passive, limited retention, no alerting.

Open: adopt Sentry (the standard Next.js pairing — captured stack traces, alerting, client + server coverage) vs staying on plain logs. Sentry is a new vendor with its own free tier; the SMTP decision (item 7) deliberately avoided new vendors, so this should be an explicit call, not a default.

### 15. Payment provider — Stripe
**Status:** Decided — Stripe (provider only; billing model still open, see item 16)

Landlord/property-manager accounts will pay for the service; tenants never will. Chose Stripe over Paddle/Lemon Squeezy (Merchant-of-Record processors that collect and remit sales tax/VAT for you as reseller of record): Stripe is the de facto standard for subscription SaaS billing, has first-class Next.js support and webhook patterns that match this app's existing `/api/*` route handlers, and Checkout + Billing + the Customer Portal cover subscription signup and self-serve plan/invoice management with minimal custom code. A Merchant-of-Record's main advantage — not dealing with sales tax registration across many jurisdictions — isn't a launch concern for a single-state (Utah) pilot; Stripe Tax is available later as an add-on if multi-state sales tax becomes real, without switching providers. No integration code exists yet — this is a vendor decision only, recorded in architecture.md.

### 16. Billing model — pricing granularity and what "admin" actually means
**Status:** Partially decided — roles settled and implemented; pricing granularity still open

**Decided (and scaffolded in migrations 0003/0004):**
- `admin` stays platform staff (support/dispute resolution, sees everything) — not a landlord's employee and never billed.
- The landlord (displayed as "Property Owner"; enum value unchanged) is the single owner per property and pays for everything. Display names live in `src/lib/roles.ts` — the DB keeps `landlord`/`admin`.
- Owner-designated staff are per-property assignments in `property_collaborators` with **hardcoded** tiers — `manager` (day-to-day ops: tenants, leases, cases — the landlord view minus property/staff management), `maintenance` (jobs-only view; no tenant personal info or contracts), `attorney` (read-only roster + contracts for legal review, and may edit case statuses to correct the AI verdict's routing — but not mark jobs completed; that stays owner/manager/maintenance). Custom landlord-defined roles were considered and rejected for now: real feature, no demand yet, easy to misconfigure. Capability logic lives as per-tier flags in `src/app/dashboard/role-views.tsx` (one shared property card, thin per-role fetchers).
- Only the owner adds/removes staff; owners **and managers** add/remove tenants. Tenants and staff never self-serve sign up — they're provisioned from the dashboard (service-role `createUser`, no password, normal OTP login); `/signup` now creates landlord accounts only.

**Still open (blocks Stripe integration design):** flat fee per owner account vs. per-property vs. per-unit; trial period; what happens to properties/cases (and tenants' access) when a subscription lapses.

### 13. Triage pipeline failure states (`case_status` has no `failed` value)
**Status:** Partially decided — pipeline built; `failed` enum value still deferred

The triage pipeline now exists (`src/lib/triage.ts`): on submit, the AI review runs after the response is sent (`after()`), reading the case's photos + lease text + jurisdiction law, requesting a structured verdict, writing it to the case, flipping status to `ai_review_completed` (which fires the alert email from item 14's flow), and logging a `verdict_generated` case_event. On failure the case **stays at `pending_ai_review`** and a `triage_failed` case_event records the error; staff retry via a "Run AI review" button on the case page. Still deferred: a visible `triage_failed` status value in `case_status` (today a failed case is indistinguishable from a never-run one without reading events), and automated retry/backoff. (`case_status` was reworked in migration 0005 to `pending_ai_review → ai_review_completed → landlord_responsible | tenant_responsible → completed`.)

### 17. AI provider for testing vs production — Gemini then Claude
**Status:** Decided

The triage pipeline is provider-switched via `AI_PROVIDER` env (`gemini` | `claude`, see `.env.example`): **Gemini in dev/testing** (free monthly API credit covers test-cycle costs), **Claude in production** (architecture.md's choice — Claude Opus for the vision + lease + law reasoning). Both providers get the same prompt, the same structured-output JSON schema, and the same validation; only the API call differs, so switching is one env var. Model ids are env-overridable (`GEMINI_MODEL`, `ANTHROPIC_MODEL`). Caveat: test-vs-prod on different model families means production behavior isn't literally what was tested — acceptable for pilot, revisit if verdict quality diverges.


### 18. AI usage tracking — per-case token counts
**Status:** Decided — tokens only, admin-only for now

Every triage model call writes a row to `ai_usage` (migration 0009): `case_id`, provider, model, input/output/cached tokens, `succeeded`. Calls that bill but produce no usable verdict (refusal, unparseable output) are recorded with `succeeded = false`, so failed spend isn't invisible. **Tokens only — no in-app cost estimate.** Provider pricing varies by model/tier and changes over time; cost is computed downstream from the raw counts rather than frozen into the row (an earlier pass added a rate table + `estimated_cost_usd` column — removed as unnecessary complexity once it was clear cost would be calculated outside the app).

Rejected: folding this into `case_events`, whose rows are readable by anyone who can see the case — including tenants and maintenance. Usage data doesn't belong in that blast radius.

**Visibility: platform admin only** (`is_admin()` RLS). Landlords, staff, and tenants get zero rows. Because the table keys on `case_id` — and `cases.property_id → properties.landlord_id` already chains to the owner — exposing per-property usage to landlords later is one additional SELECT policy (sketched in the migration), no schema change or backfill. That decision waits on the billing model (item 16): if pricing ends up usage-based, owners should see what drives their bill; if it's a flat fee, they probably shouldn't.

---

## Product & Business

### 4. Affiliate monetization program
**Status:** Open

Amazon Associates (and similar programs) require an existing sales history to qualify, so v1 links to plain product searches instead of tagged affiliate links (see readme.md → Non-Goals). Open: which program to apply to, and at what traffic level it's worth revisiting.

### 5. Marketplace booking integration (Thumbtack / TaskRabbit / alternatives)
**Status:** Open

Neither platform offers accessible public booking APIs today, so v1 links out to a search rather than embedding booking (see readme.md → Non-Goals). Open: which platforms (if any) become viable to integrate once there's traffic to justify chasing partner access.

### 6. PMS plug-in integration — which vendor first
**Status:** Open

v1 is a standalone web app reached via a link/QR code per property, not integrated into a property management system (see readme.md → Non-Goals). Open: which vendor (AppFolio, Buildium, Yardi, etc.) to integrate with first once there's demand to justify a multi-month integration.

### 14. Terms of Service — content must be written before launch
**Status:** Open

`/terms` exists as a placeholder page ("terms are being developed"), and the hidden `/signup` flow requires checking an "I agree to the Terms of Service" box before an account can be created — so users are currently agreeing to a document with no content. Real ToS text (drafted or attorney-reviewed) must replace the placeholder before launch; until then, the acceptance checkbox is legally hollow.

Note the tension with item 7: that entry records "accounts are provisioned by the property manager — login never creates one (`shouldCreateUser: false`)". That remains true for `/login` itself, but the signup flow reached from its no-account error now creates accounts self-serve (`shouldCreateUser: true`). The handoff is enforced server-side: the login server action confirms with Supabase that the email has no account, then issues a short-lived (15 min) HMAC-signed token in an httpOnly cookie; `/signup` verifies the token server-side before rendering, and the signup actions take the email from the token — never from the client. If self-signup becomes an openly advertised path, revisit item 7's rationale and review the ToS/acceptance flow at the same time.

Remaining gap, accepted for now: the Supabase project itself has `enable_signup = true`, so a direct API call with the public anon key can still create an account outside the UI (no ToS acceptance recorded). Closing it means `enable_signup = false` plus server-side account creation via the admin client — decide before launch alongside the ToS content.

---

## Future Businesses

### Integration with Rental Listing Sites
### Integration with Commercial & Retail Real Estate
### Integration with HOA/Condo Communities
### Integration with Builder / Multi-Family Developers

### From Gemini
Commercial & Retail Real Estate (Triple Net Leases): In commercial properties, retail tenants typically sign Triple Net (NNN) leases. This means the tenant is responsible for almost all operational costs, maintenance, and taxes, except for structural building failures (like the roof or foundation). Disputes happen constantly over whether a broken HVAC system or plumbing leak falls under structural building failure or tenant neglect. Your contract parsing angle is incredibly valuable here.

Home Warranty Companies: When a homeowner files a claim for a broken appliance, the warranty provider has to determine if the issue is a covered failure or if it is a pre-existing condition caused by lack of maintenance. Your image analysis coupled with policy contract parsing fits this business model perfectly.

Short-Term/Vacation Rentals (Airbnb/VRBO Management): Quick turnovers require instant decisions. If a guest breaks something, the property manager needs to instantly know: Is this normal wear-and-tear (landlord cost) or guest negligence (charge the guest's deposit)?
