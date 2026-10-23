# KANE HACK OS — task list

Legend: **W0** = must work on Oct 24 · **W1** = P1, rich agentic story · **W2** = P2, delight / next edition.
`A##` = acceptance test in blueprint `qa/ACCEPTANCE.md`. `G#` = SPEC §13 acceptance gate. `[D#]` = blocked on a decision in `PLAN.md §1`.
Every task that changes state must: validate input (zod), check role + team scope server-side, take an idempotency key where retriable, write `audit_events`, and return a receipt (id + server time).

Status: `[ ]` todo · `[~]` partial (note says what is missing) · `[x]` done · `[-]` cut. Updated Oct 22 after merging the nine engineer branches into `hack-os` (build, lint and typecheck green; migrations applied twice on a throwaway Postgres).

---

## E0. Groundwork and decisions

- [x] **T-000** W0. Stabilise and commit the in-flight hub refactor (`/t/[slug]/*`, `/admin`, `db/001–004`, redirects from `/submit` `/judging` `/resources` `/content-hour`). Run `npm run build`, `npm run lint`, migrate a fresh Neon branch, click through register → login → every hub tab → admin. Coordinate via `.claude/channel/`. — _committed as the hack-os baseline; lint + build green after the engineer merges (Oct 22)._
- [x] **T-001** W0. Resolve D1–D9 with the organiser. Record answers at the top of `PLAN.md`. — _D1–D5 recorded at the top of PLAN.md._
- [x] **T-002** W0. Confirm the official event date/time zone, team-registration lock, idea lock, **submission lock** and demo start as *separate* fields (DEPLOYMENT §2). Put them in `hack_events` (T-DB-01), not only in copy. — _separate lock fields in hack_events (005)._
- [ ] **T-003** W0. Create Neon branches `staging` and `production`, plus separate Blob stores. Add `vercel env` entries per environment: `DATABASE_URL`, `SESSION_SECRET`, `EXPORT_TOKEN`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`, `RECEIPT_SIGNING_KEY`. — _organiser: Neon branches, Blob stores and per-env Vercel vars not set up from here (agents may not touch Vercel/.env)._
- [x] **T-004** W0. Add `zod` and a `src/server/` service-layer folder convention (one file per domain: `help.ts`, `submission.ts`, …). Server actions, `/api/v1` and `/mcp` all call it.
- [x] **T-005** W0. Feature-flag helper `src/lib/flags.ts` (DB `settings` backed, cached 15s): `activation`, `match`, `idea`, `kane_ingest`, `live_sse`, `ship_pages`, `deck`, `photo_studio`, `social_publish`, `video`, `mcp`. Kill switches per DEPLOYMENT §8.
- [x] **T-006** W0. Shared helpers: `withAudit()`, `idempotent(key, fn)`, `serverNow()` (DB `now()`, never the client clock), stable error codes (`PAIR_EXPIRED`, `NOT_APPROVED`, `CONSENT_REQUIRED`, `TEAM_FULL`, `PRIVACY_RESTRICTED`, `KANE_RUN_UNVERIFIED`, `SUBMISSION_LOCKED`, `DOWNSTREAM_DEGRADED`, `RENDER_PENDING`, `RENDER_FAILED`, `IDEMPOTENT_REPLAY`, `OUTAGE_MANUAL_RECEIPT_REQUIRED`), each with a user-safe next action + manual route.

## E1. Data model and migrations

Migrations are numbered once, centrally. Each is idempotent (`if not exists`) and runs via `npm run db:migrate`.

- [x] **T-DB-01** W0. `005_event_core.sql`: `hack_events` (name, tz, starts_at, team_lock_at, idea_lock_at, submission_locks_at, demos_start_at, phase `arrival|build|verify|submit|showtime|recap`, phase_override, public_status, is_demo boolean), `audit_events` (append-only: REVOKE UPDATE/DELETE, trigger raising on update), `idempotency_keys` (key, scope, response jsonb, created_at), `integration_state`, `recovery_cases`, `outbox_events`.
- [x] **T-DB-02** W0. `006_people.sql`: `members.team_id` nullable; add `role` (`participant|mentor|photographer|judge|organizer|admin`), `display_name`, `public_code` (P-####), `checked_in_at`, `activated_at`, `guest_id`, `deleted_at`; `roster_guests` (luma_guest_id unique, email_ciphertext via pgcrypto, name, admission_status, source_version, imported_at); `member_consents` (append-only, categories `selfie_storage|photo_publication|face_matching|social_mention|teammate_discovery|idea_discovery|activity_publication`, policy_version). Backfill consents from `members.consent_social`.
- [x] **T-DB-03** W0. `007_help.sql`: `help_tickets` (code H-####, member_id, team_id, table_label, category, summary, priority, status `new|triaged|claimed|in_progress|resolved|closed|escalated|duplicate`, assigned_mentor_id, safe_run_id, source `web|mcp|paper`, created/claimed/resolved_at), `help_messages`. Atomic claim: `UPDATE … WHERE status IN ('new','triaged') RETURNING`.
- [x] **T-DB-04** W0. `008_submissions.sql`: `projects` (1:1 team, slug, project_type enum `application|agent|extension|plugin|workflow|ci_pipeline|validation_harness|tool|other`, repo_url, live_url, state), `submissions` (status `draft|preflighted|awaiting_confirmation|finalized|locked|withdrawn|organizer_exception`, receipt_code S-XXXX, finalized_by, finalized_at (server), immutable_snapshot jsonb, snapshot_sha256, signature, source `web|mcp|manual_offline`, exception_ref). Trigger: reject any UPDATE of snapshot fields once `finalized`. Backfill `projects` from `progress` (repo, live URL).
- [x] **T-DB-05** W0. `009_kane_runs.sql`: `kane_runs` (source, upstream_execution_id unique per source, status `running|passed|failed|blocked|errored|cancelled`, exit_code, commit_sha, started/finished_at, evidence_hash, source_verified bool, verification_state `reported|verified|manual_unverified`, raw_metadata redacted), `kane_test_members`, `evidence_artifacts` (object_key, sha256, kind, visibility `private|team|judges|public`, redaction_state).
- [x] **T-DB-06** W1. `010_teams.sql`: teams add `state`, `captain_id`, `max_size default 4`, `table_label`, `summary_public`, `recruiting_open`, `roster_locked_at`; `team_memberships` history with partial unique index `one_current_team_per_member … WHERE left_at IS NULL` (A10); `invitations` (hash, expires_at, accepted_at, one-time); `teammate_profiles`; `teammate_introductions`.
- [x] **T-DB-07** W1. `011_activation.sql`: `activation_sessions` (pair_token_hash unique, status, expires_at, browser_session_ref), `activation_checkpoints` (unique activation+checkpoint+status), `selfies` (object_key, captured_at, approved_at, deletion_due_at, template_consent_id), `member_identities` (provider, subject unique).
- [x] **T-DB-08** W1. `012_ideas.sql`: `ideas` (team_id, title, private_description, public_summary, discovery_opt_in, qualification `draft|qualifies|needs_work|ineligible`, status `draft|validated|shared|selected|frozen`), `idea_revisions` (user_submitted, assessment jsonb), `idea_similarity_edges`. Seed from `teams.idea`.
- [x] **T-DB-09** W1. `013_evidence_story.sql`: `defects` (signature unique per project, status `suspected|confirmed|not_a_bug|fixed|reverified`), `defect_verifications`, `milestones` (confidence `verified|participant_reported|inferred`, visibility, approved_by), `project_stories` (versioned content jsonb per `project-story.schema.json`), `deck_versions`, `render_jobs`, `published_assets`, `judge_scores` (unique submission+judge+rubric_version, `committed_at`, frozen flag).
- [x] **T-DB-10** W1. `014_media.sql`: evolve `event_photos` → add `status` `captured|identity_review|consent_checked|caption_drafted|approved|published|rejected`, `photographer_id`; `photo_people` (match_basis `qr_badge|manual_confirmation|opted_in_candidate`, reviewer, confirmed_at); `social_drafts`; `social_posts`.
- [x] **T-DB-11** W1. Extend `activity` with `source`, `source_event_id` (unique with source), `visibility`, `occurred_at`, `ingested_at`, `schema_version`, `payload`, `evidence_ref`, `signature_status` (SPEC §10 common event fields).
- [x] **T-DB-12** W1. Projection tables for metrics: `live_metrics(name, value, as_of, sample_n, freshness)` + `live_feed` (bounded, one item per team per rolling window).
- [-] **T-DB-13** W2. RLS policies per role and a separate DB role for the app (SPEC §1 "row-level security"). Until then, enforcement lives in the service layer. — _cut for this push: enforcement stays in the service layer (zod + role/team scope)._
- [~] **T-DB-14** W1. Retention: `deletion_due_at` job for selfies/face templates; consent revocation cascades to stop matching immediately. — _hourly /api/cron/retention counts due selfies; it deletes only with RETENTION_DELETE_SELFIES=1. Consent withdrawal holds photos at once._

## E2. Identity, sessions and roles

- [x] **T-AUTH-01** W0. Session v2: cookie carries `memberId` (+ teamId if any). Keep the team-password login for back-compat. Add staff login per role (replace the single admin cookie): `requireRole('organizer'|'mentor'|'judge'|'photographer'|'admin')`.
- [x] **T-AUTH-02** W0. Staff accounts: seed via `/ops/settings` (name, email, role, one-time code). Mentors need `/ops/help`; judges need `/judge`. — _scripts/seed-staff.mjs + /ops/login._
- [x] **T-AUTH-03** W1. Per-member **pairing code** (`/pair/start` → short code + QR; `/pair/confirm` binds a CLI/MCP bearer token, hashed, expiring, rotatable). Replay or expiry fails closed (A03, G1).
- [x] **T-AUTH-04** W1. GitHub OAuth (optional identity link, `member_identities`). Callback URL per env. No repo-content scope. — _needs GitHub OAuth app + callback per env._
- [x] **T-AUTH-05** W1. `/participants/me` GET/PATCH: profile + consent changes (append rows, never overwrite).
- [x] **T-AUTH-06** W1. Badge QR token: signed, revocable, rotatable, contains no PII; separate offline staff ID (`P-####`) for paper check-in (SPEC §3).
- [-] **T-AUTH-07** W2. MCP OAuth/PKCE for remote clients (until then, bearer from T-AUTH-03). — _W2, not in this push; bearer pairing covers MCP._

## E3. Roster / admissions (Luma)

- [x] **T-ROS-01** W0. `/ops/roster/import`: upload a CSV in `fallback/roster-import-template.csv` format (`event_id,luma_guest_id,approval_status,display_name,checked_in_at,source_version,staff_reference`). Store `source_version` and a hash. Upsert by `luma_guest_id`. Show a diff (new / changed approval / removed) before commit.
- [x] **T-ROS-02** W0. Reconcile registered members ↔ roster by email (encrypted compare via hash column). Flag unmatched registrations as `NEEDS_RECONCILIATION`. Unapproved or unknown guests can't activate (A02).
- [x] **T-ROS-03** W0. `/ops/checkin`: search by name / P-code / QR scan (phone camera), mark checked in (server time, staff id), print/show badge. Works on a phone. Offline mode: export the last roster as CSV (T-FB-03). — _walk-ins admitted at the desk create roster rows with source=walk_in (D4); registration now adopts a teamless walk-in member by email._
- [~] **T-ROS-04** W2. Luma webhook `/webhooks/luma` (guest.registered/updated), signature verified, dedupe; only if Luma Plus is confirmed [D3]. — _/webhooks/luma built, off unless LUMA_WEBHOOK_SECRET is set; signature/payload format not checked against Luma docs; needs Luma Plus._

## E4. Activation and Hacker Passport

- [x] **T-ACT-01** W1. Activation state machine in `src/server/activation.ts`: `invited → paired → identity_confirmed → ready_for_camera → selfie_pending → selfie_confirmed|selfie_skipped → browser_verified → active` + `action_required`, `recoverable_error`. Every transition is an `activation_checkpoints` row (unique, so retries don't duplicate).
- [x] **T-ACT-02** W1. `/activate` page (W0 fallback = staff check-in). Steps: enter pair code or log in → confirm Luma match (show masked email) → identity fields (display name, GitHub, optional X, skills/interests) → **separate** consent toggles per category → camera checkpoint → receipt.
- [~] **T-ACT-03** W1. `HumanCameraCheckpoint` component: `getUserMedia`, live preview, **human-only shutter button** (no programmatic capture path, `isTrusted` check on the click), retake, confirm, upload to private Blob via signed upload. Deny camera → "Use phone" (QR to `/activate/phone?token=`) or "Skip photo" (A07). Never blocks registration. — _shutter only on event.isTrusted and the server refuses agent/bearer uploads, but a server cannot prove a human click._
- [x] **T-ACT-04** W1. Phone QR handoff: one-time token, same checkpoint, desktop polls for `selfie_confirmed`.
- [x] **T-ACT-05** W1. Browser crash / restart: reopening `/activate` resumes from the last checkpoint and never creates a second participant or selfie (A08). The resume endpoint (`/activate/resume`) is idempotent.
- [~] **T-ACT-06** W1. **Kane two-run controller** (in the `hack-onboard` skill + docs): run A = `kane-cli` objective fills approved fields on `/activate` and stops at `ready_for_camera` (page shows a machine-readable `data-checkpoint="awaiting_selfie"` marker). The controller polls `/activate/checkpoints`. Run B verifies the passport page shows `active` + receipt. Write the Kane objective text and the checkpoint contract doc. Do not use an undocumented pause primitive (SPEC §2). — _objective text, checkpoint API and data-checkpoint markers live (ACTIVATION_CONTRACT.md); the hack-onboard controller has not been run against a real kane-cli session._
- [x] **T-ACT-07** W1. Activation receipt (code, server time, checks passed, Kane run id if any) shown on screen and in `/passport`.
- [x] **T-ACT-08** W1. `/readiness` POST + `ReadinessDoctor` UI: OS/arch, Node, Git, Chrome, Codex, `kane-cli --version`, `kane-cli whoami`, official skill installed, plugin discovery, API reachability, browser test. Partial readiness allowed, each failure shows exact fix.
- [~] **T-PASS-01** W1. `/passport`: front (portrait or Doto monogram, first name + last initial, role tag BUILDER, handle, QR, activation ribbon with Kane verification status *only if proven*, edition code `KH/26`, small Kane mark). Back (skills, focus topics, consent state, GitHub/X if opted in, team card or "Looking for team", next action, approved milestones, help status). Flip by click / Enter / Space. — _Kane run B VERIFIED ribbon needs a source-verified kane_runs row; shows "Reported, unverified" otherwise._
- [x] **T-PASS-02** W1. `NextMissionCard`: derives one next action from `participant_state` ∈ `awaiting_selfie|needs_team|needs_idea|needs_kane_run|help_pending|submission_due|shipped`. Schema-driven, no generated code.
- [x] **T-PASS-03** W1. Passport actions: Join team, Create team, Find teammates, Check Kane readiness, Validate idea, Ask mentor, Open project, Show ticket.
- [x] **T-PASS-04** W1. States solo / member / shipped (design §3.2). Public vs private fields are split server-side (separate DTOs), not by CSS.
- [x] **T-PASS-05** W1. `/passport/badge`: printable badge (print CSS, 1 per page and 8-up sheet), QR = revocable token.
- [x] **T-PASS-06** W1. Light/dark: the site is dark-only today. Add a print/light variant for badge + print kit only (keep the site dark).

## E5. Teams and Matchmaker

- [x] **T-TEAM-01** W1. Decouple: a member can exist with no team (A04). Hub falls back to a "personal" view when `team_id` is null.
- [x] **T-TEAM-02** W1. Create team as an existing member (`/team/new`): reserves `projects.slug` (SPEC §7), captain = creator, state `recruiting`.
- [x] **T-TEAM-03** W1. Invitations: one-time, expiring invite codes/links; join requires explicit acceptance. Transaction: lock team row, check size ≤ `max_size` (4) and roster not locked, close the previous membership, open the new one. TEAM_FULL / unauthorized → clear error, no partial row (A10, A11, G3).
- [x] **T-TEAM-04** W1. Team states `recruiting → formed → active → roster_locked → submitted`. Roster auto-locks at the team lock time. Post-lock changes need an organizer approval with audit reason.
- [x] **T-TEAM-05** W1. Captain controls: remove member pre-lock, assign repo, table label, toggle recruiting + public summary. Captains can't change others' consents.
- [x] **T-MATCH-01** W1. `/match/profile`: opt-in discoverability, skills, interests, availability, learning goals, preferred work.
- [x] **T-MATCH-02** W1. `/match/suggestions`: rank complementary skills + shared interests with an explanation string per match. No hard assignments. Only `discoverable=true` profiles and `recruiting_open` teams.
- [x] **T-MATCH-03** W1. `/match` page: filters (skill, role, availability), people + team cards (`TeamMatchCard`), "Request intro" → `teammate_introductions` → target accepts → contact revealed in-app only (email/phone never shown).
- [x] **T-MATCH-04** W1. TV/arrival: aggregate counts only (looking-for-team N, open seats N) + QR (SPEC §4).

## E6. Ideas

- [x] **T-IDEA-01** W1. `/t/[slug]/idea`: idea form (title, private description, optional public summary, discovery opt-in, project_type). Every save writes `idea_revisions`.
- [x] **T-IDEA-02** W1. **Idea Validator** `/ideas/validate`: evaluate all 8 criteria (functional deliverable, agent use, Kane integration, repeatability, feedback loop, actual proof, engineering impact, feasible demo). Return `qualifies|needs_work|ineligible` + per-criterion evidence + exactly 3 actionable changes + a recommended Kane capability path (run / testmd / testrun / assurance / coverage / evidence / remote). LLM via AI Gateway with structured output. A **visible banner** says "Advisory. Not an official score" (A13, G4). Standalone harness counts as eligible.
- [x] **T-IDEA-03** W1. `IdeaChecklist` UI: ✓ / ! / ✗ per criterion, verdict pill, 3 changes, "Revalidate". Printable version (`fallback/03_TEAM_AND_IDEA_FORM.md`).
- [x] **T-IDEA-04** W1. Idea states `draft → validated → shared → selected → frozen`. Freeze at idea lock.
- [x] **T-IDEA-05** W2. **Idea Radar** `/ideas/radar`: embeddings over **opted-in public summaries only**. Labels `similar angle` / `possible overlap` / `complementary` + explanation. Actions: differentiate / request collaboration. Private descriptions are never embedded or returned (A12). Test: another team's private idea text produces zero hits.

## E7. Kane runs, evidence, defects, milestones

- [x] **T-KANE-01** W0. Manual proof entry (fallback): in the hub, paste a Kane run report link / run id + exit code + commit SHA. Stored as `verification_state='manual_unverified'`. Counts toward nothing trusted.
- [x] **T-KANE-02** W1. `/kane/runs` POST (`kane_record_run`): accepts `source_execution_id`, exit_code, run summary (parsed from NDJSON `run_end` / `testrun_done`), evidence sha256, commit sha. **Success is decided by exit status**. A missing end event = not success (A17). Dedupe on (source, execution id). Reject credential-looking fields.
- [x] **T-KANE-03** W1. `kanehack report` CLI helper (in E19): wraps `kane-cli … --agent`, captures NDJSON + exit code, redacts, uploads (with consent) to `/kane/runs` + evidence to `/kane/evidence`.
- [x] **T-KANE-04** W1. `/kane/evidence`: signed upload of evidence packs to private Blob. Validate type and size, zip-bomb/path-traversal/executable checks, quarantine on failure, sha256 dedupe (adversarial list).
- [x] **T-KANE-05** W1. Trust gate: `source_verified` only when the run is tied to a team's paired token + project and has a terminal event. Unsigned or invalid events never increment trusted counters (G5).
- [x] **T-KANE-06** W1. Defects: a failed run can open a `suspected` defect (signature dedupe). Human confirm → `confirmed` (excludes infra/auth errors). A later **passing run on a different SHA** linked via `defect_verifications` → `reverified` (A18, A19).
- [x] **T-KANE-07** W1. Milestones (`milestone_propose`): claim + evidence ids + visibility. The team approves public visibility. `verified` confidence only with evidence.
- [x] **T-KANE-08** W1. `KaneRunCard` + `EvidenceInspector` UI in the hub "Proof" tab: run id, status, SHA, freshness, evidence link (scoped), per-member pass/fail/blocked.
- [x] **T-KANE-09** W1. GitHub App webhooks `/webhooks/github`: HMAC-SHA256 over the raw body, delivery-id dedupe, push events → `repository_links` + commit timeline (for `builds_validated`, `median_time_to_proof`). Narrow permissions.
- [~] **T-KANE-10** W2. Coverage designed vs proven per team, from Kane `cover` output, team-only, never summed globally. — _per-team coverage read from kane_runs.summary.coverage (getProjectCoverage); no dedicated UI beyond /live._

## E8. Help desk (Tier-0)

- [x] **T-HELP-01** W0. `/t/[slug]/help`: replace the static page with a ticket form (category: Kane CLI / Test Manager / Auth / CI-Cloud / Mobile / Idea / GitHub / Other; priority; one-sentence summary; safe run id; what was tried) + the existing on-ground contact copy. Idempotent create → `H-####`. Members without a team can open tickets too.
- [x] **T-HELP-02** W0. "My tickets" list + `/help/[code]` status page: status, claimed mentor first name, messages, reply box. Polls every 10s (`AutoRefresh`).
- [x] **T-HELP-03** W0. `/ops/help` queue: new/claimed/in-progress columns, age, table, category. **Claim** is atomic. A concurrent second claim gets 409 "already claimed by X" (A15). Resolve, reopen (new history event), escalate, mark duplicate.
- [~] **T-HELP-04** W0. Staff notifications: Slack incoming webhook with a safe summary (code, table, category, never logs). If Slack fails → the web queue still has the ticket + optional sound alert (A14, A24). — _Slack pings go through outbox_events (slack.help) and are drained by /api/cron/outbox; needs SLACK_WEBHOOK_URL + CRON_SECRET. The web queue with opt-in sound works without Slack._
- [x] **T-HELP-05** W0. Paper ticket reconciliation: `/ops/help` "Add paper ticket" with the pre-printed `H-` number and the original timestamp + entry time (A16, `mentor-queue-template.csv`).
- [x] **T-HELP-06** W1. `help_diagnose`: docs-grounded suggestions before opening a ticket (links to `/docs`), optional.
- [x] **T-HELP-07** W1. Metrics: `help_open`, `help_median_claim_seconds`, `help_median_resolution_seconds` (staff/TV aggregate only, no content).

## E9. Submission / proof receipt (Tier-0)

- [x] **T-SUB-01** W0. Preflight `/submissions/preflight` + UI in `/t/[slug]/submit`: required = repo URL, **commit SHA** (40-hex, optional GitHub API existence check), project type, live demo or run command, Kane run report / evidence ref, Devpost URL [D4], harness description, Kane components used, limitations. Show missing/uncertain items. Deck/video are **never** required (BRIEF).
- [x] **T-SUB-02** W0. Finalize `/submissions/finalize`: captain or authorized member, explicit confirmation checkbox + typed team name, idempotency key. Server checks `now() < submission_locks_at`. Snapshot JSON → sha256 → HMAC signature with `RECEIPT_SIGNING_KEY` → receipt `S-XXXX`. A double click returns the same receipt (A21, G7).
- [x] **T-SUB-03** W0. Lock: after the deadline, finalize returns `SUBMISSION_LOCKED` with exact server times. A locked snapshot can't be mutated (DB trigger). Withdraw / organizer exception = new records.
- [x] **T-SUB-04** W0. `/submit/receipt/[code]`: immutable receipt view (team, SHA, evidence ids, server timestamp, signature, verify button). Visible to the team, judges and organizers. Downloadable as JSON/print.
- [x] **T-SUB-05** W0. Manual receipt intake in `/ops/recovery` (`fallback/05_MANUAL_SUBMISSION_RECEIPT.md`, `submission-ledger-template.csv`): officer + witness, actual received time, SHA, artifact hash, incident id. Source `manual_offline`. Never backdated (A22).
- [x] **T-SUB-06** W0. Keep the existing progress checklist + shipped-prize logic (`shippedMinimum`). The receipt shows prize eligibility separately.
- [x] **T-SUB-07** W1. Submission snapshot pins the deck version + ship story version if they exist. Later story edits never change the submission.

## E10. Judging

- [x] **T-JUDGE-01** W1. `/judge`: list of finalized submissions (frozen), a proof inspector per team (receipt, runs, evidence scoped to `judges`, Ship Page link), and a rubric form: categories per [D5], 0–5 anchors (0 absent, 1 incomplete, 2 weak, 3 credible, 4 strong, 5 exceptional), score = anchor × weight / 5, comment, "evidence or explain uncertainty".
- [x] **T-JUDGE-02** W1. Commit score: immutable after judge lock. Edits after freeze are rejected and audited (adversarial list). No AI-populated marks. AI summaries, if any, are labelled and never fill fields.
- [x] **T-JUDGE-03** W1. Mid-evaluation feedback (14:00, feedback only) vs final (16:00, scored) per `hackday.ts evaluations`. Demo queue for the top 7 + stage round.
- [x] **T-JUDGE-04** W1. Organizer aggregate view + CSV export. Awards only after judge lock (feeds SHOWTIME/RECAP).
- [x] **T-JUDGE-05** W0. Printed scorecard fallback (print CSS of the rubric).

## E11. Mission Control `/live`

- [x] **T-LIVE-01** W0. `/live` route, TV layout 1920×1080. Top fixed strip: event title, official server time, **submission countdown** (server-offset corrected), next agenda item, persistent QR (help + team finder).
- [x] **T-LIVE-02** W0. Phase modes `ARRIVAL | BUILD | VERIFY | SUBMIT | SHOWTIME | RECAP`, derived from `hack_events` times with an **operator override** in `/ops/settings`. Each mode's layout per SPEC §9: ARRIVAL = registrations, matching, seats, QR. BUILD = pulse, latest verified runs, SOS, tips. VERIFY = proven vs designed, fixed+reverified stories. SUBMIT = receipt checklist, hard clock, help. SHOWTIME = approved project cards / demo queue. RECAP = reviewed aggregates + share gallery.
- [x] **T-LIVE-03** W0. Panels rotate every 15–25s within a phase. Visual budget 50% people/story, 30% actions/deadlines, 20% metrics.
- [x] **T-LIVE-04** W0. "Last updated HH:MM" always visible. Status banner (`DELAYED` / `STALE` / `OFFLINE`) from `integration_state`. On fetch failure, keep the last values and never render 0 (A23, G12).
- [x] **T-LIVE-05** W0. Announcements panel (from `/ops` announcements).
- [x] **T-LIVE-06** W1. `/live/metrics` GET (`EventMetrics`: metrics, `as_of`, `freshness_state`) + `/live/stream` SSE with `Last-Event-ID` resume, heartbeat, and reconnect-then-reconcile against `/live/metrics`.
- [x] **T-LIVE-07** W1. Metric projection worker (cron every 30s, or on outbox): compute the full SPEC §9 vocabulary with provenance + sample size: `participants_checked_in`, `participants_activated` (with denominator), `teams_active`, `teams_verified`, `kane_executions` (split by status, **never labelled builds**), `builds_validated`, `test_members_executed`, `bugs_detected` (labelled *suspected*), `bugs_confirmed`, `fixed_and_reverified`, `evidence_packs`, `coverage` (per team only), `median_time_to_proof` (with N), `help_open`, `help_median_claim_seconds`, `help_median_resolution_seconds`, `submissions_finalized`, `photographs_published`, `team_spotlights`.
- [x] **T-LIVE-08** W1. `VerifiedMetric` + `MetricDefinitionPopover` (definition from `METRIC_DEFINITIONS.md`: numerator, denominator, source, trust gate). Big orbital number = one primary verified count per phase.
- [x] **T-LIVE-09** W1. `LiveActivityTicker`: public-visibility events only, capped at one item per team per rolling window. Kinetic proof notification = project + what was validated + optional evidence link. Statuses PROOF (teal) / DETECTED (grey) / LINKED (hairline).
- [x] **T-LIVE-10** W1. Anti-gaming: dedupe by stable ids, validate team authorship, separate platform outages from product regressions, no raw commit/test leaderboards, no cross-project coverage comparison.
- [x] **T-LIVE-11** W1. `is_demo_data` server gate: demo/fictional values can never render on the production `/live`. The staging TV shows an "ILLUSTRATIVE" chip.
- [x] **T-LIVE-12** W1. Home page `/` stats strip reuses `/live/metrics` with freshness (UI_ROUTES `/`).
- [~] **T-LIVE-13** W2. Private Ops TV variant (help queue ages, incidents), replay wall, galaxy. — _private Ops TV at /live?ops=1 (help ages, incidents, integrations, audited phase override); replay wall and galaxy not built._

## E12. Ship pages and Studio

- [x] **T-SHIP-01** W1. `project_stories` editor `/studio/[slug]`: fields from `templates/project-story.schema.json` (pitch, creation_type, problem, what_we_built, how_it_works[], harness{summary,components,stages}, proof[] {claim, confidence, source, run_id, evidence_id, commit_sha}, impact[] {claim, measure, unit, baseline, source}, limitations, links, team[] {publicly_credited}, visuals[], consent_reviewed). Versioned. `PUT /projects/{id}/story`. — _/studio/[slug] story editor (studio-deck); finalize also builds the story from the submission._
- [x] **T-SHIP-02** W1. Claim/evidence review table: every proof claim must bind to a real run/evidence id or be marked `unverified` (rendered grey, never teal). Block unsupported verification metrics. Impact numbers need a source + baseline or are shown as qualitative.
- [x] **T-SHIP-03** W1. `/ship/[slug]` **Product × Proof** template: huge name + lime square stop, one-line consequence headline, creation/proof toggle (keyboard + ARIA tabs), media stage (real submitted captures; placeholders are labelled), 4 columns (product, harness, evidence, repo), 4-step harness story (`HarnessFlow`), evidence timeline, outcome, team (only `publicly_credited`), TestMu mark small bottom-right, "Validated with Kane CLI · TestMu AI" only where true.
- [x] **T-SHIP-04** W1. Page modes `DRAFT | UNLISTED | PUBLIC | HIDDEN_BY_MODERATION`. Drafts are unguessable/unauthorized for visitors (adversarial). Slug rename → redirect. Never reveal a private idea early.
- [~] **T-SHIP-05** W1. `/showcase/{id}/publish`: explicit team approval + consent receipt (everyone credited has consented). Publishes an immutable version id. — _publish happens at finalize (typed team name + per-person activity_publication consent) or from the Studio (typed slug + consent check); consent is re-checked on every render._
- [x] **T-SHIP-06** W1. `/ship` gallery: published projects, filter by project type / award category. Static fallback = ISR snapshot.
- [x] **T-SHIP-07** W1. OG image per Ship Page (`opengraph-image.tsx`, 1200×630) in site style.
- [~] **T-SHIP-08** W1. Mobile 390px + 1080p TV presentable (P1 acceptance). — _responsive layouts written; no pixel QA at 390/1080 yet._
- [x] **T-SHIP-09** W2. Template variants sharing the same story: Proof Atlas (provenance graph), Launch Film (video-led), Terminal Zine (mono journal), Shipping Ledger (timeline incl. red states), Confidence Specimen. Template switch preserves claims and consents. — _six templates over one public DTO (studio-deck)._
- [~] **T-SHIP-10** W2. Optional vanity `/{slug}` redirect after collision/SEO checks. — _vanityTarget() helper exists in story.ts; no /{slug} route wired._

## E13. HTML deck

- [x] **T-DECK-01** W1. Deck scene model (`deck.json`) + theme (`theme.json`, see `templates/deck-theme.example.json`). Default template `kane-ship-5@1.0.0`: **Creation, See it work, Harness, Proof, Outcome** (GTM_KIT_SPEC), generated from the approved story.
- [x] **T-DECK-02** W1. `/ship/[slug]/deck` public presenter: 16:9 responsive scaling, keyboard (←/→/Home/End), swipe, presenter remote, slide outline, accessible headings, print CSS (one slide per page), OG.
- [x] **T-DECK-03** W1. `/studio/[slug]/deck` editor: edit headline/body per slide, slide type, theme (ink/surface/card/lime grounds), insert/remove/duplicate/reorder, reset to default, version history, optimistic concurrency (`expected_version`), JSON import/export. `POST /decks/{id}/versions`.
- [x] **T-DECK-04** W1. Publish an immutable version, pinned by submission if one exists.
- [~] **T-DECK-05** W1. PDF export: `POST /decks/{id}/render` → `render_jobs` (queued → running → succeeded|failed|cancelled, retries with version/hash guard) → headless Chromium in a Vercel Function prints `/ship/[slug]/deck?print=1` → Blob. `GET /renders/{id}`. Failure never blocks submission (G8, G10). — _PDF = browser print from the presenter (?print=1); the render job is recorded honestly as browser_print. No headless Chromium worker._
- [x] **T-DECK-06** W1. Offline: downloadable single-file HTML deck (static copy) works with no network (G8). Also ship the blueprint `ui/deck.html` re-skinned as the offline starter.
- [~] **T-DECK-07** W2. Level 2 custom blocks/tokens. Level 3 participant HTML/CSS on a **separate origin** `preview.<domain>` in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin), strict CSP, no cookies, no event API access; crash → restore last-known-good (G9). — _level-3 custom HTML previews in a sandboxed iframe without same-origin; no separate preview.<domain> origin yet._
- [x] **T-DECK-08** W2. PPTX export only if a converter is verified editable; otherwise show "unavailable". — _shown as "unavailable"._

## E14. Video (P2)

- [x] **T-VID-01** W2. `/studio/[slug]/video`: 60s storyboard (0–6 name/outcome, 6–22 real demo, 22–38 Kane flow, 38–52 evidence/failure, 52–60 impact + QR + small TestMu). Upload real footage only.
- [-] **T-VID-02** W2. Captions, source timecodes, optional voiceover, render MP4 via queue with retries. The fallback screenshot montage is labelled as such. Never synthesize a green run. — _W2: no MP4 render pipeline in this push._
- [x] **T-VID-03** W0. Fallback copy: "upload a screen recording / use the HTML deck; no penalty" (`07_MEDIA_AND_DECK_FALLBACK.md`).

## E15. Photographer studio and social

- [x] **T-PHOTO-01** W0. Keep the existing pipeline (face match → `/api/import/photo` → team gallery, Buffer CSV). Gate import on **per-member** `photo_publication` consent for every matched person. Unknown consent → hold, don't publish (A20, G11).
- [x] **T-PHOTO-02** W1. In-app `/photo` (photographer role): capture/upload → private storage → identify via **QR/badge scan or manual lookup** (reliable path); opted-in face candidates are suggestions only and need a per-photo human confirm.
- [x] **T-PHOTO-03** W1. `/photo/[id]/drafts`: fetch the team's verified latest milestone, 3 caption styles + alt text (LLM drafts), checks for consent, claims backed by milestone/evidence, image rights, duplicates.
- [x] **T-PHOTO-04** W1. `/ops/media`: consent-checked queue, approve/reject, state machine `captured → identity_review → consent_checked → caption_drafted → approved → published|rejected`. Port the pipeline's localhost review page here.
- [x] **T-PHOTO-05** W1. `social_draft` / `/social/drafts`, `/social/{id}/approve` (organizer). Without X API: copy text + download assets for manual posting (existing Buffer CSV export stays).
- [~] **T-PHOTO-06** W2. `/social/{id}/publish` via the X API from the official account only, after approval, rate-limited, idempotent (`remote_post_id` unique). Publish the post id to the public activity feed. — _X publishing is env-gated and organizer-only; not exercised against the real X API._
- [x] **T-PHOTO-07** W1. Consent revocation: stops matching immediately, deletes templates per retention, unpublishes where policy says so. — _passport.updateProfile now also triggers the photo hold on withdrawal._
- [-] **T-PHOTO-08** W2. In-app face-matching enrolment (separate explicit consent), replacing the local pipeline enrolment. — _W2: enrolment stays in the local pipeline._

## E16. GTM kit

- [x] **T-GTM-01** W1. From the approved story: X short post + optional 4-post thread, README excerpt (run creation, build harness, execute Kane, evidence, limitations), project highlight card, alt text. Use the `templates/GTM_COPY_TEMPLATES.md` structures. Every claim is flagged with confidence/evidence.
- [x] **T-GTM-02** W1. Social cards: 1200×630 OG, 1080×1080, 1080×1350, 1080×1920 end card (`next/og`, site style, small TestMu bottom-right).
- [x] **T-GTM-03** W1. Generator guard: can't produce a post linking an unpublished Ship Page; can't publish without approval (P1 acceptance).
- [x] **T-GTM-04** W1. Team badges ("Shipped", "Verified with Kane CLI" only when true).

## E17. Ops console (`/admin` → `/ops`)

- [x] **T-OPS-01** W0. Move `/admin` → `/ops` (308 redirect). Overview: registrations, check-ins, teams, help, receipts, metrics, announcements.
- [x] **T-OPS-02** W0. `/ops/settings`: deadlines, phase override, roles/staff, registration toggle (exists), brand assets, privacy rules, feature flags. Every change is audited with a reason (signed event policy).
- [x] **T-OPS-03** W0. Announcements (`/ops/announcements`): compose → TV + hub feed (reuse `notifications`). Preloaded templates from `fallback/09_ANNOUNCEMENTS.md`.
- [x] **T-OPS-04** W0. `/ops/integrations` (`/ops/integrations/health`): status of DB, Blob, Slack, GitHub webhooks, Luma, Kane ingest, renderer, X, cron/outbox lag. Pause/retry. Writes `integration_state` → drives the TV banner.
- [x] **T-OPS-05** W0. `/ops/recovery`: SEV incident open/close (`recovery_cases`), manual check-in, manual help, **manual submission receipt** (T-SUB-05), CSV batch upload `manual_offline` with original timestamps, signer ids, hashes, a reconciliation view (`activity-reconciliation-template.csv`), and the printable kit link.
- [x] **T-OPS-06** W0. Audit log viewer (filter by actor/resource). Superadmin can revoke sessions and pause subsystems; never edit finalized submissions.
- [x] **T-OPS-07** W0. Keep existing nudges/scheduled notifications and team export.
- [x] **T-OPS-08** W1. `/ops/override`: signed manual override with compensating events + witness.

## E18. Event REST API + MCP server

- [x] **T-API-01** W1. `/api/v1/*` route handlers for every OpenAPI path, built on the service layer: auth/start, auth/callback, pair/start, pair/confirm, participants/me (GET/PATCH), activate/checkpoints, activate/selfie, activate/resume, readiness, teams, teams/join, teams/{id}/invites, match/profile, match/suggestions, ideas, ideas/validate, ideas/radar, kane/runs, kane/runs/{id}, kane/evidence, projects/{id}/milestones, projects/{id}/defects, help, help/{id}, help/{id}/claim, help/{id}/resolve, ops/help, submissions/preflight, submissions/finalize, submissions/receipt/{id}, projects/{id}/story, decks/{id}/versions, decks/{id}/render, renders/{id}, showcase/{id}/publish, media, social/drafts, social/{id}/approve, social/{id}/publish, live/metrics, live/stream, ops/announcements, ops/integrations/health, ops/recovery, ops/override, webhooks/github, webhooks/luma, webhooks/renderer (webhooks/kane only if a verified integration exists). `MutationRequest` {idempotency_key ≥8, payload} → `MutationReceipt` {id, status, receipt, server_time}. Bearer auth, correlation ids, rate limits per team/participant.
- [x] **T-API-02** W1. Fill per-operation request/response schemas in our copy of `openapi.yaml` (`docs/hack-os/openapi.yaml`). Generate zod from it or the reverse.
- [x] **T-MCP-01** W1. `/mcp` Streamable HTTP server (`@modelcontextprotocol/sdk`), bearer auth from pairing (T-AUTH-03).
- [x] **T-MCP-02** W1. Read tools: `event_get_brief`, `participant_get_status`, `team_find`, `idea_check_overlap`, `harness_get_capabilities`, `help_get_status`, `submission_preflight`, `deck_get`, `showcase_preview`.
- [x] **T-MCP-03** W1. Write tools: `participant_update_profile`, `activation_begin`, `activation_get_checkpoint`, `readiness_report`, `team_create`, `team_join`, `idea_validate`, `kane_record_run`, `milestone_propose`, `help_diagnose`, `help_create`, `submission_finalize`, `demo_generate` (returns `queued`), `deck_update`, `showcase_publish`, `social_draft` (photographer). `social_publish` is organizer-only, not a participant tool. Finalize/publish/team change/consent/social require `explicit_confirmation`. — _after the merge every write tool delegates to the owning service (teams, help, submission, story/deck, passport/activation)._
- [x] **T-MCP-04** W1. Base envelope on every tool: `schema_version, status ok|needs_action|partial|error, message, data, evidence[], actions[] (requires_human_confirmation), links[] (HTTPS allowlist), ui_resource|null, warnings[], request_id, server_time` + Generative UI fields (`ui_type`, `design_version`, `fallback.text`, `freshness`).
- [x] **T-MCP-05** W1. Prompt-injection guard: tool inputs from READMEs, issues or page copy are never authority for identity, publishing, scoring or deadlines. RBAC/consent/clock are enforced server-side regardless of agent text. No stack traces in outputs.
- [-] **T-MCP-06** W2. MCP Apps `ui_resource` cards for compatible hosts (never claim render in Codex CLI). — _W2: text + Gen-UI registry only._

## E19. Plugin, skills, installer, CLI

- [x] **T-PLG-01** W1. Author the 12 skills as real `SKILL.md` files (repo: `plugin/skills/*` and `.agents/skills/*`): `hack-onboard`, `hack-doctor`, `hack-team`, `hack-idea`, `hack-harness`, `hack-verify`, `hack-progress`, `hack-help`, `hack-demo`, `hack-showcase`, `hack-gtm`, `hack-submit`. Start from the blueprint outlines, wire them to the real MCP tool names, and remove the "proposed" wording only once the tools are live. Each has procedure, completion, fallback and privacy rules. Reuse the official `@testmuai/kane-cli-skill` for CLI syntax (don't copy or modify it).
- [x] **T-PLG-02** W1. `plugin.json` + `mcp.json` (pointing at the deployed `/mcp`). Version 0.1.0 → bump on release.
- [x] **T-PLG-03** W1. `kanehack` CLI (small Node package): `pair`, `doctor`, `report` (wrap kane-cli NDJSON + exit code), `help`, `submit --preflight`. Prints deep links.
- [x] **T-PLG-04** W1. `install.sh` + PowerShell `install.ps1`: inspectable, versioned, checksummed, no silent sudo, no reading arbitrary repos. Checks OS/arch, Node, Codex, Git, Chrome, Kane CLI, auth, official skill, plugin discovery, API reachability, browser test, capture consent. Serve at `/install.sh` as an immutable release.
- [ ] **T-PLG-05** W1. Verify skill + MCP discovery in a **fresh** Codex session on clean macOS (and Windows if claimed) before announcing (A09). — _not done: needs a fresh Codex session on clean macOS/Windows against the deployed /mcp._
- [~] **T-PLG-06** W2. Optional consented lifecycle hook (redacted metadata only, no transcripts/source/secrets). — _opt-in hook documented; no hook shipped._

## E20. Generative UI registry

- [x] **T-GUI-01** W1. `src/components/gen/registry.tsx`: map `ui_type` → first-party component: `builder_passport`, `readiness_check`, `idea_checklist`, `idea_radar`, `team_match`, `mentor_ticket`, `kane_run`, `metric_pulse`, `submission_receipt`, `deck_preview`, `ship_preview`, `social_review`. Unknown types render the `fallback.text` only.
- [~] **T-GUI-02** W1. Every component has a text + action equivalent (confirm/cancel, evidence link, review draft, ask mentor, receipt). `aria-live` for async status. Show success only after a server receipt. — _every card has fallback text; aria-live and receipt-gated success not audited per component._
- [x] **T-GUI-03** W1. Remaining design-system components: `BuilderPassport`, `FaceOptInBadge`, `HumanCameraCheckpoint`, `NextMissionCard`, `TeamMatchCard`, `IdeaChecklist`, `IdeaOverlapMap`, `SkillReadiness`, `EvidenceInspector`, `ProductProofSwitch`, `HarnessFlow`, `VerifiedMetric`, `MetricDefinitionPopover`, `LiveActivityTicker`, `KaneRunCard`, `HelpSOSCard`, `DemoSlide`, `DeckThemeCustomizer`, `DeckVersionHistory`, `MediaConsentReview`, `SocialApprovalCard`, `SubmissionReceipt`, `DegradedServiceAlert` (built inside their epics; tracked here for completeness), plus `MissionActionCard`, `ReadinessDoctor`, `MentorTicket`, `ShipStoryBuilder`, `DeckStudio`, `VideoStoryBoard`, `SubmissionGate` from UI_ROUTES.

## E21. Design system port (keep the original theme)

- [x] **T-DS-01** W0. Add tokens to `globals.css` `:root` + `@theme inline`: `--surface-2`, `--card`, `--verified`, `--verified-deep`, `--warning`, `--warning-deep`, `--danger`, `--danger-deep`. Contrast-check each on `--ink` and `--surface` (target ≥4.5:1 for text).
- [x] **T-DS-02** W0. `ui/StatusPill.tsx`: variants `verified` (teal, ✓), `pending` (amber, ◷), `danger` (red, ✗), `suspected`/`unverified` (grey outline), `accent` (lime, action only). Text label is always present.
- [x] **T-DS-03** W0. `ui/DegradedServiceAlert.tsx`, `ui/FreshnessStamp.tsx` ("Last updated 14:05 · DELAYED"), `ui/DemoDataChip.tsx` (fixed "ILLUSTRATIVE / DEMO DATA").
- [x] **T-DS-04** W0. Form primitives: extend `components/forms/fields.tsx` with segmented control, toggle with description (consents), and confirm-with-typing (finalize).
- [x] **T-DS-05** W1. `ui/Ring.tsx` (orbital big number, from the `machines/*` style), `ui/Flip.tsx` (passport), `ui/QR.tsx` (server-generated SVG, no third-party fetch).
- [x] **T-DS-06** W1. TV type scale for `/live` (min 24px body at 1080p, numbers in Doto).
- [x] **T-DS-07** W1. Print stylesheet (ink-on-paper inversion) for badge, receipts, scorecard, print kit.
- [ ] **T-DS-08** W1. Review rule in the PR checklist: lime never denotes a pass; teal only from verified evidence; every status has text. — _no PR checklist file yet._
- [x] **T-DS-09** W1. Brand: the Kane mark from `public/logos` in nav (exists). TestMu small bottom-right on Ship Pages, deck footer and video end card. `KH/26` edition monogram is original art. No fabricated logos.

## E22. Fallback / print kit (Tier-0)

- [x] **T-FB-01** W0. Port `fallback/print-kit.html` + docs 00–10 into `/ops/recovery/print` (print CSS) and `public/print/*.pdf`: failure matrix, staff runbook, personal registration form, team & idea form, mentor ticket, manual submission receipt, photo/social approval, media & deck fallback, participant quickstart, announcements, offline ledger procedure. Fill in the real event values (deadline, Wi-Fi, contacts).
- [x] **T-FB-02** W0. CSV templates downloadable from `/ops/recovery`: roster import, team roster, mentor queue, submission ledger, activity reconciliation. Importers accept them back (T-ROS-01, T-HELP-05, T-SUB-05).
- [x] **T-FB-03** W0. "Last signed roster" export (CSV + printable) for offline check-in. Pre-numbered P-OFF / H / S paper stock.
- [~] **T-FB-04** W0. Static cached fallbacks: `/live` cached view with STALE label, static event brief for `/`. — _public/print/brief.html and tv-fallback.html use hardcoded times (18:00 lock); they don't follow /ops/settings edits. /live holds last values with a STALE banner._
- [x] **T-FB-05** W0. QR signage: activation/help/team finder/live QR posters (print).

## E23. Security and privacy

- [x] **T-SEC-01** W0. Security headers (CSP, HSTS when safe, frame-ancestors, referrer), body/media size caps, rate limits on login/help/finalize. — _CSP keeps unsafe-inline scripts (App Router); HSTS only on VERCEL_ENV=production._
- [ ] **T-SEC-02** W1. Authorization tests for every route: team A can't read team B's private idea, unlisted evidence or draft Ship Page; a judge can't edit after freeze; a participant can't modify a finalized snapshot. — _no automated authorization tests yet._
- [~] **T-SEC-03** W1. SSRF/open-redirect guard for participant URLs (protocol allowlist, private network deny, safe preview proxy). — _https-only URL checks on participant links; no private-network deny or preview proxy._
- [x] **T-SEC-04** W1. Webhook signature verification + replay dedupe (GitHub, Luma, renderer). — _GitHub + renderer verified; Luma webhook format unconfirmed._
- [x] **T-SEC-05** W1. Evidence upload hardening (path traversal, zip bombs, executables, scripts, embedded credentials → quarantine).
- [~] **T-SEC-06** W1. PII: encrypt roster emails, never put tokens in event payloads, redact logs, publish privacy/consent page + `/.well-known/security.txt`. — _roster emails hashed (AES-GCM only with ROSTER_EMAIL_KEY), logs redacted; no /.well-known/security.txt or privacy page yet._
- [~] **T-SEC-07** W1. Hook/MCP flood protection, stale JWT/token rejection, duplicate publication idempotency. — _rate limits on login/help, idempotent publish/finalize; no per-token MCP flood limit._

## E24. Deploy, domain, observability

- [x] **T-DEP-01** W0. Health endpoints `/health/live`, `/health/ready` (DB, Blob).
- [x] **T-DEP-02** W0. Vercel Cron: outbox drain, metric projection, scheduled nudges (exists?), retention job. `CRON_SECRET` protected. — _vercel.json: outbox + metrics every minute, health every 5 min, retention hourly. Needs a Pro plan (Hobby allows daily crons only) and CRON_SECRET._
- [~] **T-DEP-03** W0. Error monitoring + structured logs with correlation ids. Alerts on help queue age, ingestion freshness, TV staleness, 5xx rate. — _structured JSON logs with request ids and redaction; no alerting on queue age / TV staleness / 5xx._
- [ ] **T-DEP-04** [D7] Domain `kaneclihack.sh` (+ `www` 301, `preview.` sandbox origin later): add records from Vercel's instructions only, TLS, HSTS without subdomains until all are ready, DNSSEC if supported. Register OAuth/GitHub App/X callback URLs. — _organiser (D5): kaneclihack.sh is in the organiser's Vercel account; agents did not touch DNS._
- [x] **T-DEP-05** W0. Freeze nonessential deploys before the submission window. Enable rollback via Vercel instant rollback.
- [ ] **T-DEP-06** W1. Staging seeded with fictional data marked synthetic. Never linked to public metrics.
- [ ] **T-DEP-07** W2. Post-event closeout: archive receipts + scores, preserve approved Ship Pages, export per consent, revoke keys, delete selfies/templates at the retention date, provenance-based report.

## E25. QA, rehearsal and acceptance

- [ ] **T-QA-01** W0. Automated tests (Vitest + Playwright, or kane-cli `testmd`) for Wave 0: A10, A11, A14, A15, A16, A21, A22, A23, A24. Each test records build_commit, platform, steps, expected, actual, artifact, reviewer.
- [ ] **T-QA-02** W1. The remaining P0 matrix A01–A09, A12, A13, A17–A20 as their features land.
- [ ] **T-QA-03** W1. P1 acceptance list (validator, matching consent, Ship Page 390px/1080p + keyboard, real proof values, deck editor + PDF + reset, sandbox isolation, text alternatives, generator guard).
- [ ] **T-QA-04** W1. Adversarial suite (prompt injection, malicious evidence, SSRF, consent revocation, floods/replays, the 6 attack focuses).
- [~] **T-QA-05** W0. Visual review: screenshots at 390×844, 768×1024, 1440×900, `/live` at 1920×1080, plus on the physical TV. Contrast, clipping, focus order, iPhone safe area, printable badge/receipt. — _live TV checked at 1920×1080; phone widths not visually reviewed._
- [ ] **T-QA-06** W0. Rehearsal (SPEC §12): 25–50 simulated arrivals, forced browser crash at the selfie checkpoint (W1), auth outage, queue delay, 3 duplicate webhooks, **20 simultaneous help tickets**, a last-minute submission outage → manual receipt → reconciliation.
- [ ] **T-QA-07** W1. Load: 150 attendees in the event app (signup burst, SSE connections, help burst, submission peak). The 500 TestMu sessions are a **separate** infra test owned by engineering.
- [ ] **T-QA-08** W1. Chaos: drop webhooks, kill the render worker, revoke an OAuth session, exhaust model credits, force the offline receipt flow.
- [ ] **T-QA-09** W1. Two-platform dry run (macOS + Windows): clean machines, existing Kane installs, broken Chrome, declined webcam, no X handle, two-person team, web offline, submission at the boundary, independent recovery operator.
- [ ] **T-QA-10** W0. Go/no-go checklist (DEPLOYMENT §7–9). If an integration is unknown, switch to manual mode and show reduced functionality visibly.

## E26. Content, docs and brand

- [x] **T-DOC-01** W0. Update `hackday.ts` copy to the BRIEF language where agreed ("Build anything. Engineer the confidence to ship it."; a standalone harness is a valid entry) without contradicting the published rules [D4/D5]. — _BRIEF language in hackday.ts; Devpost is no longer described as the official submission (D2)._
- [ ] **T-DOC-02** W1. Public `/docs`: the Kane capability catalog with links from `docs/DOCUMENTATION_INDEX.md` (CLI reference, modes, auth, generate, testrun, assurance, coverage, evidence, remote, real devices, TMS), plus a version/entitlement selector (`harness_get_capabilities`). Don't invent `kane-cli explore`.
- [ ] **T-DOC-03** W1. Participant handbook + judge brief (from EVALUATION.md) + staff runbook pages.
- [~] **T-DOC-04** W1. Evidence provenance contract + activation checkpoint contract docs (for skills + judges). — _ACTIVATION_CONTRACT.md written; evidence provenance contract not yet a separate doc._
- [ ] **T-DOC-05** W1. Brand gate: verify SVG metadata, light/dark, viewBox, legibility, OG crop, deck print before marking brand done.

---

## Suggested execution order (Oct 22 → Oct 24)

**Oct 22 (today):** T-000, T-001/002, T-003–006, T-DB-01..05, T-DS-01..04, T-AUTH-01/02, start T-HELP-01..03.
**Oct 23 AM:** T-HELP-04/05, T-SUB-01..06, T-KANE-01, T-ROS-01..03, T-OPS-01..06.
**Oct 23 PM:** T-LIVE-01..05, T-FB-01..05, T-PHOTO-01, T-SEC-01, T-DEP-01..03/05, T-QA-01/05/06, T-QA-10 go/no-go at 18:00 PT. Wave 1 work starts only if Wave 0 is green.
**Oct 24:** deploy freeze; operate; incident commander; reconcile.
**After the event:** Wave 1 → Wave 2 in epic order E4 → E5 → E7 → E11 (full) → E12/E13 → E18/E19 → E6 → E10 → E15/E16 → rest.
