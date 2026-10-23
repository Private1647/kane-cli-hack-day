# Blueprint → task coverage matrix

Every item in `~/Downloads/kane-hack-os-blueprint` mapped to a task in [`TASKS.md`](TASKS.md). If an item has no task, it is listed under "Not ported" with the reason.

## SPEC.md sections

| § | Topic | Tasks |
|---|---|---|
| 0 | Five interfaces (Passport, Copilot, Mission Control, Ship Studio, Event Ops); MVP sources of truth; LLM boundaries | E4, E18/E19, E11, E12/E13, E17; T-ROS-01, T-SUB-02, T-KANE-05, T-SHIP-02; T-IDEA-02, T-JUDGE-02 |
| 1 | Roles and privileges (public, participant, captain, mentor, photographer, judge, organizer, superadmin); least privilege; opt-in exposure | T-AUTH-01/02, T-TEAM-05, T-OPS-06, T-SEC-02, T-DB-13 |
| 2 | Activation + selfie, two-run controller, state machine, installer, two install channels, participant data questions | T-ACT-01..08, T-PLG-03..05 |
| 3 | Hacker Passport front/back, actions, QR, generative slot, brand | T-PASS-01..06, T-AUTH-06, T-DS-09 |
| 4 | Personal vs team, team states, invitations, Matchmaker, Idea Validator, Idea Radar | T-TEAM-01..05, T-MATCH-01..04, T-IDEA-01..05 |
| 5 | 12 Codex skills, generative UI contract, optional hook | T-PLG-01, T-GUI-01..03, T-PLG-06 |
| 6 | Project types, Kane integrations, evidence ingestion, submission states, judging | T-DB-04/05, T-KANE-01..10, T-SUB-01..07, T-JUDGE-01..05 |
| 7 | Ship pages, slug/modes, 5 templates, HTML deck, customization levels, GTM kit, video | T-SHIP-01..10, T-DECK-01..08, T-GTM-01..04, T-VID-01..03 |
| 8 | Photographer studio + social loop | T-PHOTO-01..08 |
| 9 | Live TV strip, metric vocabulary, anti-gaming, screen modes, visual priority | T-LIVE-01..13 |
| 10 | Architecture, domain routing, core tables, event object fields, state machines, interoperability | PLAN §2, E1, T-DB-11, T-SEC-04, T-MCP-05 |
| 11 | API endpoints + MCP inventory | T-API-01/02, T-MCP-01..06 |
| 12 | Failure tolerance, Tier-0 trio, recovery route, rehearsal | E8, E9, T-ROS-03, T-OPS-05, E22, T-QA-06 |
| 13 | P0/P1/P2 sequencing, 13 acceptance gates | PLAN §4 waves; gates table below |
| 14 | Deployment steps 1–10 | T-002/003, T-DEP-01..07, T-QA-09/10 |
| 15 | Documentation + skill dependencies | T-DOC-01..05, T-PLG-01 |
| 16 | Verified gaps (Luma Plus, domain, logos, camera yield, face matching, video/X/plugin checks) | D3, D7, T-DS-09, T-ACT-06, T-PHOTO-08, T-PLG-05 |
| 17 | Inventory | this file |

## State machines

| Machine | States | Task |
|---|---|---|
| Activation | invited→paired→identity_confirmed→ready_for_camera→selfie_pending→selfie_confirmed/skipped→browser_verified→active (+action_required, recoverable_error) | T-ACT-01 |
| Team | recruiting→formed→active→roster_locked→submitted (+withdrawn) | T-TEAM-04 |
| Idea | draft→validated→shared→selected→frozen | T-IDEA-04 |
| Help | new→triaged→claimed→in_progress→resolved (+reopen, escalated, duplicate) | T-DB-03, T-HELP-03 |
| Submission | draft→preflighted/checked→awaiting_confirmation→finalized→locked (+withdrawn, organizer_exception) | T-SUB-01..03 |
| Defect | suspected→confirmed/not_a_bug→fixed→reverified | T-KANE-06 |
| Photo | captured→identity_review→consent_checked→caption_drafted→approved→published/rejected | T-PHOTO-04 |
| Renderer | queued→running→succeeded/failed/cancelled | T-DECK-05 |
| Ship page | DRAFT/UNLISTED/PUBLIC/HIDDEN_BY_MODERATION | T-SHIP-04 |
| TV phase | ARRIVAL/BUILD/VERIFY/SUBMIT/SHOWTIME/RECAP | T-LIVE-02 |

## Acceptance tests (qa/ACCEPTANCE.md)

| Test | Task(s) | Wave |
|---|---|---|
| A01 one participant per verified guest | T-ROS-02, T-ACT-01 | 1 |
| A02 unapproved guest refused | T-ROS-02 | 0 |
| A03 stolen/replayed/expired pair token | T-AUTH-03 | 1 |
| A04 personal without team | T-TEAM-01 | 1 |
| A05 Kane fills activation form | T-ACT-06 | 1 |
| A06 selfie human handoff | T-ACT-03, T-ACT-06 | 1 |
| A07 camera denied | T-ACT-03/04 | 1 |
| A08 browser crash at camera | T-ACT-05 | 1 |
| A09 Codex plugin missing | T-PLG-05, T-ACT-02 | 1 |
| A10 double-join race | T-DB-06, T-TEAM-03 | 1 |
| A11 unauthorized join / full roster | T-TEAM-03 | 1 |
| A12 private idea leakage via radar | T-IDEA-05 | 2 |
| A13 validator covers 8 criteria, no official score | T-IDEA-02 | 1 |
| A14 help ticket from Codex | T-HELP-01/04, T-MCP-03 | 0 (web) / 1 (MCP) |
| A15 concurrent claim | T-HELP-03 | 0 |
| A16 offline paper help | T-HELP-05 | 0 |
| A17 NDJSON + exit status | T-KANE-02 | 1 |
| A18 suspected ≠ confirmed | T-KANE-06, T-LIVE-07 | 1 |
| A19 fixed + reverified on new SHA | T-KANE-06 | 1 |
| A20 photo consent + approval | T-PHOTO-01/04 | 0 / 1 |
| A21 finalize twice / stale clock | T-SUB-02/03 | 0 |
| A22 submission API down | T-SUB-05 | 0 |
| A23 TV stream disrupted | T-LIVE-04/06 | 0 / 1 |
| A24 Slack/X/renderer down | T-HELP-04, T-DECK-05, T-PHOTO-05 | 0 |

## SPEC §13 gates

G1 T-AUTH-03 · G2 T-ACT-03/05 · G3 T-TEAM-03, T-IDEA-05 · G4 T-IDEA-02 · G5 T-KANE-05/06 · G6 T-HELP-02..04 · G7 T-SUB-01..03 · G8 T-DECK-02/05/06 · G9 T-DECK-07 · G10 T-QA-08 · G11 T-PHOTO-01/04 · G12 T-LIVE-04/06 · G13 T-QA-07

## Metrics (METRIC_DEFINITIONS.md + SPEC §9)

All 19 metrics are listed in T-LIVE-07. Rules 1–9 (anti-gaming and disclosure): T-LIVE-04/10/11, T-KANE-05/06, T-KANE-10. Live board rotations: T-LIVE-02/03.

## MCP tools (25 + social_publish)

Read: event_get_brief, participant_get_status, team_find, idea_check_overlap, harness_get_capabilities, help_get_status, submission_preflight, deck_get, showcase_preview → T-MCP-02.
Write: participant_update_profile, activation_begin, activation_get_checkpoint, readiness_report, team_create, team_join, idea_validate, kane_record_run, milestone_propose, help_diagnose, help_create, submission_finalize, demo_generate, deck_update, showcase_publish, social_draft → T-MCP-03. social_publish (organizer, not a participant tool) → T-PHOTO-06.
Error codes → T-006. Envelope → T-MCP-04. Privacy/injection → T-MCP-05.

## Skills (plugin/skills/*)

hack-onboard, hack-doctor, hack-team, hack-idea, hack-harness, hack-verify, hack-progress, hack-help, hack-demo, hack-showcase, hack-gtm, hack-submit → T-PLG-01 (backing tools: E4, T-ACT-08, E5, E6, T-DOC-02, T-KANE-02/03, T-KANE-07, E8, E13, E12, E16, E9).

## Blueprint files

| File | Task |
|---|---|
| README.md, BRIEF.md, EVALUATION.md | PLAN §0, T-DOC-01/03, T-JUDGE-01 |
| SPEC.md | all |
| design/DESIGN_SYSTEM.md, tokens.json, ui/theme.css | PLAN §3 (semantics only, theme kept), E21 |
| design/UI_ROUTES.md | PLAN §6, T-GUI-03 |
| design/SHIP_TEMPLATES.md | T-SHIP-03/09 |
| design/BRAND_ASSET_MANIFEST.md | T-DS-09, T-DOC-05 |
| ui/index, passport, ship, deck, live, idea, match, gallery .html | Visual references for E4, E12, E13, E11, E6, E5, T-SHIP-06; deck.html re-skinned as offline starter (T-DECK-06) |
| ui/previews/*.png | Visual reference only |
| ui/render_validate.py, create_gallery.py, export_deck_preview.py | Not ported. Prototype tooling. Our equivalent is T-QA-05 (Playwright screenshots) and T-DECK-05 (PDF) |
| api/openapi.yaml | T-API-01/02 |
| api/MCP_TOOLS.md | E18 |
| backend/schema.sql | E1 (adapted, see PLAN §5) |
| backend/METRIC_DEFINITIONS.md | T-LIVE-07/08 |
| plugin/plugin.json, mcp.json, README.md, GENERATIVE_UI_CONTRACT.md | T-PLG-02, T-GUI-01..03, T-MCP-04 |
| templates/project-story.schema.json + example | T-SHIP-01 |
| templates/deck-theme.example.json | T-DECK-01 |
| templates/GTM_KIT_SPEC.md, GTM_COPY_TEMPLATES.md | E13, E14, E16 |
| ops/DEPLOYMENT.md | E24, T-QA-07..10 |
| qa/ACCEPTANCE.md | E25 |
| docs/DOCUMENTATION_INDEX.md | T-DOC-02, T-PLG-01 |
| fallback/00–10 *.md, print-kit.html, 5 CSV templates | E22, T-ROS-01, T-HELP-05, T-SUB-05, T-OPS-05 |

## Not ported, deliberately

- **FIELDWORK visual style** (warm paper, ultraviolet `#5B4DF7`, Georgia italic, large radii). You asked to keep the site's original theme. Only the semantics are adopted (PLAN §3).
- **Stackchan NFC/voice** (SPEC §13 P2): listed only as W2 delight. No task until hardware scope is defined.
- **Redis**: replaced by a Postgres outbox + Vercel Cron/Queues (PLAN §2).
