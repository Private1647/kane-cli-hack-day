# KANE HACK OS — implementation plan

Source blueprint: `~/Downloads/kane-hack-os-blueprint` (delivery pack v2.0, Oct 22 2026).
Companion task list: [`TASKS.md`](TASKS.md). Spec coverage matrix: [`COVERAGE.md`](COVERAGE.md).

This plan turns the blueprint into work on **this** repo (Next.js 16.4 / React 19.3 / Tailwind 4 /
Neon Postgres via `pg` / Vercel Blob, deployed on Vercel). It does not start a new app. Every blueprint
feature is either mapped onto something that already exists or added as a new module of the same
monolith (SPEC §10: "single modular monolith acceptable at event scale").

---

## Decisions (answered Oct 22)

- **D1 scope:** ship everything in one ~6h push. A manager agent plus parallel engineer agents work in git worktrees, and the manager merges. Wave labels now set the *priority order*, not separate release dates.
- **D2 submission:** our `/t/[slug]/submit` is the official submission. After finalize, a **public showcase page** at `/ship/{team-slug}` shows everything the team submitted (Product × Proof + deck).
- **D3 rubric:** follow the blueprint (`EVALUATION.md`): Harness innovation & Kane integration 30, Validation quality & evidence 25, Shipping velocity & automation 20, Technical execution & reliability 15, Creativity & demonstration 10. Anchors 0–5 × weight/5.
- **D4 admissions:** organiser supplies a Luma CSV. **Walk-ins** are admitted at the staff check-in desk and create a roster row with `source='walk_in'`.
- **D5 domain:** `kaneclihack.sh` is ours, managed in the organiser's Vercel account.

---

## 0. Ground truth and constraints

| Fact | Source | Consequence |
|---|---|---|
| Event day is **Sat Oct 24 2026**, America/Los_Angeles. Today is Oct 22. | `src/data/hackday.ts`, SPEC header, photo-pipeline README | Only ~2 days to the event. Everything is split into **Wave 0 (must work on Oct 24)**, **Wave 1 (nice for Oct 24 if time allows)** and **Wave 2 (post-event / next edition)**. The desktop agent's channel message mentions Nov 14. Confirm the date before anything else. |
| Site already has: team registration + password login, per-team hub `/t/[slug]/*` (dashboard, setup, brief, resources, submit checklist, photos, content hour, judging, help), `/admin` (teams table, nudges, export), notifications feed, setup ticks, per-member consent, selfie / team photo upload to private Blob, a local face-matching photo pipeline that posts to `/api/import/photo`, and Buffer CSV social drafts. | `src/app/**`, `db/001–004`, `photo-pipeline/` | Many blueprint features are **extensions**, not greenfield. Don't rebuild what works. |
| The blueprint is "a planning and starter-template pack, not a deployed application". Its SQL, OpenAPI and plugin are scaffolds. | README, SPEC §17 | Treat `schema.sql` / `openapi.yaml` as contracts to adapt. They are not migrations to paste in. |
| Before this build, submission was on **Devpost** and the site showed an older rubric. Both are superseded: our hub submission is official (D2) and the blueprint rubric applies (D3). | `hackday.ts`, `EVALUATION.md` | Resolved by the decisions above. |
| No authentic Kane CLI / TestMu logo files in the pack. The repo already has `public/logos` and the Kane AI mascot (last commit). | BRAND_ASSET_MANIFEST | Use only the repo's approved assets. Never fake a logo. |

### Non-negotiable principles (from README / SPEC, applied to every task)

1. Agent-first, human-confirmed, web fallback.
2. Kane drives browser onboarding but **never** takes the selfie.
3. Personal account and team membership are independent lifecycle records.
4. Verification evidence + human confirmation govern public claims. A failing test is a *detection*, not a confirmed bug.
5. One `project_story` powers page, deck, video, README and social.
6. Live counters carry provenance and freshness. During an outage, hold the last value with a stale banner and never show 0.
7. The default HTML deck is good with no customisation. Custom code is sandboxed on a separate origin.
8. **Check-in, help and final submission survive** failures of skills, external APIs and generators.
9. LLMs recommend, summarise, classify and draft. They never own deadlines, permissions, scoring, identity or publication.
10. Every mutation writes an audit event. Overrides append compensating events and never rewrite history.

---

## 1. Decisions needed (owner: you)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Event date and scope for Oct 24 | (a) Ship Wave 0 only for Oct 24, rest after; (b) attempt full P0 from SPEC §13 | **(a).** The full SPEC P0 needs Windows/macOS dry runs, a Codex plugin, an MCP server and a Kane-driven activation ceremony. That doesn't fit in 48h. |
| **D2** | Identity model | (a) Keep team-first registration and add "personal" by letting a member exist without a team; (b) rebuild as participant-first per SPEC §4 | **(a) now, converging to (b).** Migration 005 makes `members.team_id` nullable and adds per-member login. The data then has the SPEC shape without breaking hub URLs. |
| **D3** | Admission source of truth | Luma API (needs Luma Plus) / signed CSV import | **CSV import** with `luma_guest_id` reconciliation. Add the webhook later if Plus is confirmed. |
| **D4** | Official submission | **Decided (D2 above): our `/t/[slug]/submit` is the official, immutable submission**, and a public `/ship/{team-slug}` showcase follows finalize. Devpost is an optional link only. | Decided. |
| **D5** | Rubric | **Decided (D3 above): the blueprint rubric** — Harness & Kane 30, Validation & evidence 25, Shipping velocity 20, Technical execution 15, Creativity 10; anchors 0–5 × weight/5; no AI scores. | Decided. |
| **D6** | Login | Team password (today) / email magic link / GitHub OAuth | Keep the team password and add **per-member pairing codes** (for CLI/MCP) plus optional GitHub OAuth (P1). |
| **D7** | Domain | `kaneclihack.sh` per blueprint vs current Vercel domain | Confirm the registrar and DNS owner. Don't announce `install.sh` or `/mcp` until they are deployed and tested. |
| **D8** | Agent host | Blueprint targets Codex (`$hack-*` skills). The event is "Built with OpenAI". | Ship skills in the portable `SKILL.md` format, so they work in Codex and Claude Code. |
| **D9** | Verified colour on a lime-accent theme | See §3 | Teal `#2DD4BF` + ✓ glyph + the word VERIFIED. Lime stays action-only. |

---

## 2. Architecture (adapted to this stack)

```
                    ┌────────────── Vercel (Fluid Compute, Node runtime) ──────────────┐
 Browser / TV ──►   │ Next.js App Router                                                 │
 Codex / Claude ──► │  /(public)  /passport /activate /match /idea /live /ship /docs     │
 kanehack CLI ──►   │  /t/[slug]/* (team hub = SPEC /team/{slug})  /studio/[slug]/*      │
 Photo pipeline ──► │  /ops/* (was /admin)  /judge  /photo                               │
                    │  /api/v1/*  REST (route handlers, zod-validated, idempotency keys)  │
                    │  /mcp       Streamable HTTP MCP (same service layer as /api/v1)     │
                    │  /api/v1/live/stream  SSE (Node streaming, Last-Event-ID resume)    │
                    │  /webhooks/{github,luma,renderer}  HMAC-verified                    │
                    │  Cron: projections, outbox drain, nudges, health                     │
                    └────┬───────────────────────────┬────────────────────────┬──────────┘
                         │                           │                        │
                  Neon Postgres                Vercel Blob (private)     Render worker
                  (authoritative state,        selfies, photos,          (Vercel Function +
                   outbox, audit, projections)  evidence, decks, PDFs)    headless Chromium for PDF/OG)
```

- **Service layer** `src/server/<domain>/*.ts`: one function per use case (e.g. `finalizeSubmission`). Server actions, `/api/v1` and `/mcp` all call it, so RBAC, consent, deadline and audit live in one place (SPEC §11: "tools must map to real APIs").
- **No Redis to start.** Use a Postgres transactional outbox (`outbox_events`) drained by Vercel Cron or Vercel Queues. Idempotency is a unique index on `idempotency_key`. SPEC allows "Redis/managed queue". Postgres is enough for 150 attendees.
- **Realtime.** SSE for `/live` (Node runtime, no Edge). The hub and help status use short polling, as `AutoRefresh` already does.
- **Server clock is authority.** Event config (deadlines, phases) lives in `hack_events` / `settings`, not hard-coded strings. `hackday.ts` stays the copy source.
- **Environments.** `dev`, `staging` and `production` each get their own Neon branch and Blob store. Staging is seeded with fictional data flagged `is_demo_data=true`.

---

## 3. Design: keep the original theme, adopt FIELDWORK semantics

The blueprint's FIELDWORK 2.0 visuals (warm paper, ultraviolet, Georgia italic, 22–29px radii) are **not** adopted. The site keeps its own identity:
black ink, off-white text, grey body, hairline rules, a single lime accent, IBM Plex Mono body, Inter Tight display, Doto dot-matrix numerals,
Silkscreen eyebrows, square buttons, corner `brackets`, halftone statue art and `Decode`/`Reveal` motion (`src/app/globals.css`, `components/ui/*`).

What we take from FIELDWORK is its **meaning system, component inventory and layout ideas**.

### 3.1 Token mapping (FIELDWORK → this site)

| FIELDWORK token | Meaning | This site | Notes |
|---|---|---|---|
| canvas `#F5F4F0` | app background | `--ink #000` | unchanged |
| paper `#FFFEFA` | primary cards | `--surface #0b0b0b` | unchanged |
| surface `#EAE9E4` | secondary fills | **new** `--surface-2 #141414` | inputs, segmented controls |
| line `#DDDDD7` | hairlines | `--hairline #37383a` | unchanged |
| ink `#191B24` | titles, data | `--bright #f2f2f2` | unchanged |
| muted `#666A74` | secondary text | `--lightgray #7e7e7e` | check AA on `#0b0b0b` (≈4.9:1, passes) |
| **signal** `#5B4DF7` | action/identity accent, **not proof** | `--lime #daff52` | Lime means "act here / you are here", never "passed". |
| signalDeep | hover | `--lime-deep #1f2606` | unchanged |
| lilac `#DDD9FF` | passport object | **new** `--card #f2f2f2` passport face (inverted: ink on bright) with halftone portrait | The passport is the one bright object on black, like the lilac card on paper. |
| midnight `#171927` | TV | `--ink` | Already dark. `/live` just scales type. |
| **verified** `#087F68` | source-backed success only | **new** `--verified #2DD4BF` + `--verified-deep #0B2B27` | Hue ≈173°, far enough from lime (≈73°). Always paired with ✓ and the word VERIFIED. |
| warning `#A46516` | waiting on a human / deadline | **new** `--warning #FFB020` + `--warning-deep #2B1F05` | Selfie pending, awaiting confirmation, help waiting. |
| danger `#C14848` | confirmed error | **new** `--danger #FF5A4F` + `--danger-deep #2B0E0C` | Confirmed defect, failed finalize, outage banner. |
| (none) | suspected / unverified | `--lightgray` outline pill + "SUSPECTED" / "UNVERIFIED" | Grey on purpose, so a detection never looks like a confirmed result. |

Typography mapping: FIELDWORK display grotesk → **Inter Tight** (`font-display`). Editorial italic "single phrase" → **lime Doto** or a Plex Mono italic phrase (one per hero, never in evidence or status).
Mono labels → **Silkscreen** eyebrows / **Plex Mono** IDs. Big counters → **Doto**. Shape → **square + `brackets`** instead of rounded shells. Status pills may be rounded-full (small, as in the blueprint).

Rules carried over verbatim: tap targets ≥44px; visible focus (lime outline); state always expressed in text + icon, not colour alone; `prefers-reduced-motion` honoured
(already in globals); no fake dashboards, success graphs or decorative terminal text; demo data visibly labelled (a fixed "ILLUSTRATIVE / DEMO DATA" chip like the blueprint's `prototype-note`, rendered in our style);
breakpoints 360 / 390 / 820 / 1440 and TV 1920×1080; no horizontal page scroll.

### 3.2 Screen translations

| Blueprint screen (`ui/*.html`) | Our version |
|---|---|
| **Passport** (lilac card on dotted plinth, right "mission console", solo/team/shipped states, flip front/back) | Bright `--card` passport on a black `brackets` plinth with the halftone treatment from `components/hero/halftone.ts` applied to the opted-in selfie (or a Doto monogram). Right column: Silkscreen eyebrow, Inter Tight headline, `NextMissionCard` with a lime arrow button, 3-state segmented control. Flip = CSS 3D, keyboard `Enter/Space`. |
| **Mission Control** (dark TV, phase tabs, giant headline, orbital big number, 5-metric strip, activity feed, lilac next-step card) | Already dark. Phase tabs = square hairline buttons, active lime. Headline in Inter Tight with one Doto lime phrase. The big number in Doto inside a hairline ring (reuse `machines/Antikythera` ring style). Metric strip = hairline-divided cells with ⓘ definition popovers. Activity rows with status pills (VERIFIED teal / DETECTED grey / LINKED hairline). Next-step card inverted (bright bg, ink text) like the passport. |
| **Ship page** (huge name + signal square period, creation/proof toggle, lilac media stage, template chips) | Huge Inter Tight name with a **lime square** full stop, creation/proof segmented toggle, media stage on `--surface` with `brackets`, template picker as hairline chips. TestMu mark small bottom-right (existing `public/logos`). |
| **Deck** (16:9 stage alternating midnight/paper/lilac/signal) | Alternate **ink / surface / bright-card / lime** slide grounds. Same 5 scenes. Present mode, print CSS. |
| **Idea Lab** (8-item checklist, radar opt-in) | `StepBlock`-style numbered list with ✓ / ! / ✗ per criterion, the verdict in a pill, 3 action items. |
| **Match** (filters + builder/team cards) | Hairline filter chips, cards with `brackets`, skills as mono tags, "Request intro" lime CTA. |
| **Print kit** (`fallback/print-kit.html`) | Print stylesheet: black-on-white inversion of our theme (ink on paper) for ink economy, same fonts. |

---

## 4. Waves (what ships when)

### Wave 0: must work on Oct 24 (event-safe core, scoped to fit)
Goal: the SPEC §12 Tier-0 trio (**check-in, help, submission**) plus the fallbacks, on top of the existing hub.

1. Commit/stabilise the current hub refactor (coordinate with desktop agent).
2. Migration 005: participants-light (`members.team_id` nullable, `role`, `checked_in_at`, `luma_guest_id`), `audit_events`, `help_tickets`/`help_messages`, `submissions` (official immutable submission), `kane_runs` (manual + CLI report), `event_config`, `integration_state`, `recovery_cases`, `announcements`, `idempotency_keys`.
3. Roster CSV import + staff check-in screen (`/ops/checkin`), with a QR lookup by member code.
4. Help desk v1: participant ticket from hub → `/ops/help` queue with atomic claim → status back in hub. Slack webhook notify (optional) and paper ticket IDs (H-####) reconciled.
5. Official submission v1: `/t/[slug]/submit` preflight (repo URL, commit SHA, Kane run report/evidence link, optional Devpost link) → finalize → immutable snapshot + receipt code + server timestamp. Locks at server deadline. Manual receipt intake in `/ops/recovery`.
6. `/live` Mission Control v1: phase (operator-set), server clock, submission countdown, next agenda item, help/team QR, announcements, trusted counts (checked-in, teams, receipts, help open) with `as_of` + stale banner.
7. Ops console: rename `/admin` → `/ops` (redirect), add announcements, phase override, integration health, recovery and audit log view.
8. Print kit + CSV templates in `public/print/`, plus a staff runbook page.
9. Design tokens added (`--verified`, `--warning`, `--danger`, `--surface-2`, `--card`) + `StatusPill`, `DegradedServiceAlert`, `FreshnessStamp`.
10. Rehearsal: acceptance tests A10, A11, A14–A16, A21–A24 (scoped), 20 simultaneous help tickets, submission at the boundary, TV stream cut.

### Wave 1: rich agentic story (P1; partially for Oct 24 if Wave 0 is green by Oct 23 evening)
Hacker Passport + activation ceremony (manual web path first, Kane-driven path second), team invites/roster lock, Matchmaker, Idea Validator, Kane run adapter (NDJSON + exit code), evidence store,
defects/milestones, metrics projection + SSE, Ship Page (Product × Proof), HTML deck + PDF, photographer `/photo` queue in-app (absorbing the pipeline's review page), `/judge`, event MCP server, 12 skills + plugin manifest, `kanehack` CLI + installer, GitHub App webhooks.

### Wave 2: delight (P2)
Idea Radar embeddings, deck custom blocks + sandboxed custom HTML on `preview.` origin, 60s video automation, X API publishing, template variants (Atlas / Film / Zine / Ledger / Specimen),
Stackchan NFC/voice, replay wall / galaxy, personalised recap, MCP Apps UI resources, Luma webhooks, face-matching enrolment in-app.

---

## 5. Data model plan

Blueprint `schema.sql` has 40+ tables keyed by `uuid` with `event_id`. The repo uses `bigint identity` and a single event. Plan:

- **Keep `bigint` ids** for existing tables. New tables use `bigint` too, plus a public `code` (`H-0042`, `S-7KQ2`, `P-0142`) wherever a human or paper form references it.
- Add **`hack_events`** (single row now) and put `event_id` on new tables only, so a second edition is possible without rewriting.
- Map blueprint → repo:

| Blueprint table | Repo | Action |
|---|---|---|
| hack_events, event_agenda | `settings`, `hackday.ts` schedule | New `hack_events` (deadlines, phase, status); agenda stays in `hackday.ts`, with optional DB override later |
| luma_guests | none | New `roster_guests` (CSV import, `source_version`, `admission_status`) |
| participants | `members` | Extend `members`: nullable `team_id`, `role`, `display_name`, `slug`, `checked_in_at`, `activated_at`, `guest_id`, `deleted_at` |
| participant_identities | `members.linkedin/x_handle` | New `member_identities` (github OAuth subject, x handle verified) |
| participant_consents | `members.consent_social` | New append-only `member_consents` (category, granted, policy_version, revoked_at). Migrate the existing value as `photo_publication` + `social_mention` |
| selfies | `members.photo_url` | New `selfies` (object key, captured_at, deletion_due_at). Keep `photo_url` as the current pointer |
| activation_sessions / checkpoints | none | New |
| teams | `teams` | Add `state`, `captain_id`, `max_size` (4), `table_label`, `summary_public`, `recruiting_open`, `invite_code_hash`, `roster_locked_at` |
| team_members | `members.team_id` | New `team_memberships` history (joined_at, left_at) with **partial unique index one-active-team-per-member** |
| invitations, teammate_profiles, teammate_introductions | none | New |
| ideas, idea_revisions, idea_similarity_edges | `teams.idea` (text) | New; seed `ideas` from `teams.idea` |
| projects, repository_links | `progress` items (repo, live url) | New `projects` (1:1 team, `slug` reserved at team creation), backfill from progress |
| kane_runs, kane_test_members, evidence_artifacts, defects, defect_verifications, milestones | `progress['kane-cli-run-report']` link | New |
| activity_events | `activity` | Extend `activity` with `source`, `source_event_id` (unique), `visibility`, `occurred_at`, `payload`, `signature_status` |
| help_tickets, help_messages (+claims) | none (help page is static copy) | New |
| submissions (+snapshots) | Devpost + progress | New (official submission, see D2) |
| judge_scores | none | New |
| photos, photo_people, social_drafts, social_posts | `event_photos`, pipeline sqlite | Extend `event_photos` → `photos` status machine; drafts move into DB (P1) |
| project_stories, deck_versions, render_jobs, published_assets | none | New (P1) |
| announcements | `notifications` (kind) | Reuse `notifications` with `kind='announcement'` + `visibility` |
| integration_state, recovery_cases, audit_events, outbox_events | none | New (Wave 0) |

Mandatory DB gates from `schema.sql` footer: submission immutability trigger (no UPDATE on `immutable_snapshot` once `finalized`), append-only `audit_events` (no UPDATE/DELETE grant),
team size enforced inside a transaction with `SELECT … FOR UPDATE` on the team row, event-scoped FK consistency, PII encryption for roster emails (`pgcrypto`), retention columns.
RLS: the app connects as one role today, so authorization is enforced in the service layer. Adding RLS policies is a P1 hardening task (T-SEC-02).

---

## 6. Route plan (all 30 SPEC routes)

| SPEC route | Implementation | Wave |
|---|---|---|
| `/` | Existing home + live stats strip with freshness | 1 |
| `/activate` | New, activation state machine | 1 (manual path W0 via staff check-in) |
| `/passport`, `/passport/badge` | New, member-scoped | 1 |
| `/match` | New | 1 |
| `/team/new` | Existing `/register` (team) + new "create team" for an already-registered member | 1 |
| `/team/{slug}` | Existing `/t/[slug]` (add `/team/[slug]` → redirect) | 0 |
| `/idea`, `/idea/radar` | `/t/[slug]/idea` (+ `/radar`) | 1 / 2 |
| `/docs` | Existing `/t/[slug]/resources` + public `/docs` | 1 |
| `/help`, `/help/{id}` | `/t/[slug]/help` (form + my tickets), `/help/[code]` | 0 |
| `/live` | New TV route | 0 |
| `/ship`, `/ship/{slug}`, `/ship/{slug}/deck` | New public | 1 |
| `/studio/{slug}`, `/deck`, `/video` | New team-scoped | 1 / 1 / 2 |
| `/submit`, `/submit/receipt/{id}` | `/t/[slug]/submit` (existing checklist + preflight/finalize), `/submit/receipt/[code]` | 0 |
| `/photo`, `/photo/{id}/drafts` | New staff (photographer role) | 1 |
| `/judge` | New staff (judge role) | 1 |
| `/ops`, `/ops/help`, `/ops/media`, `/ops/integrations`, `/ops/recovery`, `/ops/settings` | `/admin` → `/ops` + subpages | 0 (help, recovery, settings, integrations) / 1 (media) |

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| 2-day runway | Wave 0 is deliberately small. Anything not green by **Oct 23 18:00 PT** is feature-flagged off, and the paper fallback covers it. |
| Uncommitted hub refactor + a second agent editing the same tree | Commit it first (T-000). Use the channel to claim files. Number migrations centrally. |
| Kane browser "pause for camera" isn't a Kane primitive | Two-run checkpoint controller (SPEC §2). The manual web path ships first. |
| Codex plugin install/discovery unverified | Repo skills under `.agents/skills` + web fallback. Never claim installable until tested in a fresh session. |
| Lime vs verified confusion | Teal + ✓ + word. Lint rule / review checklist item. |
| False metrics on TV | Metrics come only from the projection with provenance. The demo flag is gated server-side. |
| Privacy (selfies, face matching, private ideas) | Consent table, per-photo human confirmation, ideas never leave team scope unless opted in, retention job. |
