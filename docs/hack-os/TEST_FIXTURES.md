# Local fixtures for the kane-cli suite

The 89 designed tests in `.testmuai/tests` read 96 `{{variables}}` from `.testmuai/variables/assurance.json`. That file is gitignored, because it holds demo passwords and single-use codes. This page says what each variable points at in a **local** database and how it gets there. Wave order and grouping are in [TEST_WAVES.md](TEST_WAVES.md).

Nothing here touches production. Every script refuses a `DATABASE_URL` that is not `localhost` or `127.0.0.1`.

## How the values are made

| Step | Command (run from the checkout that serves http://localhost:3100) | What it does |
|---|---|---|
| 1. Seed | `node --env-file=.env.local --import ./tests/support/register.mjs scripts/seed-local.mts` | Wipes and recreates the demo world: seed-local's own teams, then `scripts/seed-fixtures.mts`. It also writes `tests/fixtures/*.csv` and the placeholder photos under `public/photos/event/fixtures/`, which is gitignored. Safe to re-run. |
| 2. Codes | `node --env-file=.env.local --import ./tests/support/register.mjs scripts/issue-test-codes.mts --repo <repo with .testmuai> [--wave Lnn]` | Issues fresh single-use credentials and reads every other value back from the database. Writes all 96 values and keeps each description and `secret` flag. With `--wave`, it also applies that wave's overrides and clock from `tests/fixtures/waves.json`. Exits with code 2 if any value is empty. |
| 3. Check | `KANE_CLI_USER_AGENT=… kane-cli testrun run --dry-run < /dev/null` (repo root) | The plan must be valid and print no `unresolved_variables` warning. |

`scripts/fixtures-data.mts` holds the names, slugs, markers and passwords that both scripts share.

The seed and code scripts call the app's own services through the test loader: `registerTeam`, `saveDraft`/`finalizeSubmission`, `createHelpTicket`/`claimHelpTicket`/`transitionHelpTicket`, `ideaRadar`, `authorizeStudio`/`saveStory`/`saveDeckVersion`/`generateKit`, `issueStaffLoginCode`, `issueActivationCode`/`redeemActivationCode`, and `recordRunSchema`/`guardRunInput`. Seeded history (Kane runs, evidence rows, photos, roster rows, invitations, profiles) is written to the schema directly, the same way `seed-local.mts` already does. Live metrics are projected through the app's own `/api/cron/metrics` route, so the dev server must be running when you seed.

## The cast

| Who | Login | Role in the suite |
|---|---|---|
| Pat Quill `pat@demo.test` | password `demo-pass-1234` | `participant_email`. Captain of **demo-kestrel**, which is team one and the idea team. Approved guest `gst-pat`. Owns the waiting and resolved help tickets. Discoverable. |
| Olu Bankole `olu@demo.test` | `demo-pass-1234` | `other_participant_email`. On **demo-heron**, which is team two. Approved guest `gst-olu`. Not opted in to matching, so he is the non-opted-in fixture. |
| Dana Cole `dana@demo.test` | `demo-pass-1234` | Teamless and discoverable. The introduction target in waves P11 and P12. |
| Gia Park `gia@demo.test` | `demo-pass-1234` | Teamless. The joiner in the join race (wave P01). |
| Rowan Price `rowan@demo.test` | `demo-pass-1234` | Teamless and registered, but not on the seeded roster. Only the signed Luma CSV adds `gst-rowan`. |
| `<bird>.captain@demo.test` | `demo-pass-1234`, except staging captains (see below) | The captain of `demo-<bird>`. Solo teams have only a captain. |
| Staging captains: wren, tern, robin, gannet, egret, dove, finch | personal password = team password `staging-team-pass` | Finalizing is a personal step (captain only, personal sign-in at `/passport/login`). A captain can therefore sign in personally with the same password the test knows. |
| organizer@, mentor@, mentor2@, judge@, photo@ `demo.test` | one-time codes from `issue-test-codes` | Staff. Codes are single use and last 3 days. Each run of `issue-test-codes` retires the earlier ones. |
| Break-glass admin | `ADMIN_PASSWORD` from `.env.local` | `superadmin_credentials`. Use the password field at `/ops/login`. It gives the admin role. |

## Variable map

### Help desk

| Variable | Maps to |
|---|---|
| `mentor_email`, `mentor_one_time_code` | `mentor@demo.test`. The code is fresh on every run. |
| `second_mentor_email`, `second_mentor_one_time_code` | `mentor2@demo.test` (Mina Mentor), created by seed-fixtures. Fresh code. |
| `participant_email`, `participant_password` | Pat, `demo-pass-1234`. |
| `waiting_ticket_code` | Pat's `new` ticket "kane-cli testrun hangs after the plan step [fixture:waiting]". The H-code is read back after each seed. |
| `resolved_ticket_code` | Pat's ticket "Test Manager link 404s… [fixture:resolved]". It was claimed, started and resolved by mentor@ with a resolution note. |
| `sensitive_ticket_code` | Kit Lowe's (demo-kestrel) high-priority ticket "Diagnostics for my failing Kane run [fixture:sensitive]". It was created through the normal participant path with three restricted markers in the description: a secret `token=KHSECRET-MARKER-41A7…` (the intake scrubs this to `token=[redacted: secret]`), a private-repo excerpt `PRIVATE-REPO-MARKER-9C2` (demo-org/kestrel-core, linked to Kestrel as a private repository), and selfie face-template text `BIOMETRIC-MARKER-5F8`. Kit also has a selfie row whose object key carries the biometric marker. Every mentor-facing read (queue, ticket page, `/help/<code>` as staff, `/api/v1/help/<code>`, `/api/v1/ops/help`) redacts the private-repo excerpt and the face template on read (`src/server/help-rules.ts`) and says what was hidden; Kit still sees his own text. The markers are not passed to the test, so it has to recognise them by their names. |
| `organizer_email`, `organizer_one_time_code` | `organizer@demo.test`. Fresh code. |
| `outage_environment` | Local rehearsal description. Slack, X and the renderer are not configured and are staged `down` in `integration_state`. There is no AI gateway key, so diagnose and drafts fall back to rules. Help, check-in and submissions stay up. |
| `paper_slip_number` | A fresh `H-T#####` on every run, so no earlier slip collides with it. The seed wipes `H-T%` and `H-OFF%` codes. |

### Admissions and recovery

| Variable | Maps to |
|---|---|
| `signed_luma_csv` | Absolute path to `tests/fixtures/luma-roster-signed.csv`. This is the roster-import template (`event_id,luma_guest_id,approval_status,display_name,checked_in_at,source_version,staff_reference,email`) with every demo guest, plus two real changes against the seeded roster: `gst-rowan` (Rowan Price, a registered member with no roster row yet) is new, and `gst-ivy` goes from waitlist to approved. The import preview therefore shows 1 added and 1 changed. `luma-roster-signed.sig.json` holds its sha256 and an HMAC with the local `RECEIPT_SIGNING_KEY`, which is the same scheme as the app's `signDigest`. |
| `luma_source_version` | `demo-luma-export-2026-10-22.v3`. It is also the `source_version` column of that CSV. |
| `approved_luma_guest_id` | `gst-pat`: approved, admitted, linked to Pat, not checked in. It is in the signed CSV. |
| `other_approved_luma_guest_id` | `gst-olu`: approved, linked to Olu. |
| `not_admitted_guest_id` | `gst-hal`: declined, so `not_admitted`. Created by seed-local. |
| `walkin_name`, `walkin_email` | Wendy Walker, `wendy.walkin@demo.test`. Not on the roster. The seed wipes any walk-in row a test creates. |
| `offline_checkin_ledger` | Absolute path to `tests/fixtures/offline-checkin-ledger.csv` (the `/ops/recovery` check-in ledger, `checkin-ledger-template.csv`), plus `.sig.json`. One signed slip: `receipt_id` `CHK-OFF042`, `attendee_id` `gst-quinn` (Quinn Archer, approved, not checked in), `checked_in_at` = the paper time in America/Los_Angeles, `delay_reason` = `offline_reconciliation_reason`, `staff_id`/`staff_signature` = Sam Ortiz / S.O., `witness_id` = Morgan Reyes. Upload it as "Check-in ledger" under CSV ledgers. |
| `offline_receipt_id` | The base value is `H-OFF042`, a paper help slip (t-42, t-43). Wave overrides: `CHK-OFF042` for the check-in ledger (t-6) and `S-OFF042` for the manual submission receipt (t-33). The app gives each receipt kind its own format: help `H-…`, submission `S-…`. |
| `offline_receipt_time` | `2026-10-23T00:15`, local time in America/Los_Angeles, in the form the date-time picker takes. It is in the past, because the app refuses paper times from the future. |
| `offline_reconciliation_reason` | "Venue Wi-Fi outage at the check-in desk; paper slip entered after the backend recovered". |
| `outage_team_slug`, `outage_project_name`, `outage_commit_sha`, `outage_witness`, `outage_incident_id` | **demo-outage**, project renamed "Outage Relay", with no submission yet. SHA `9b1c2d3e…8b9c`, witness "Morgan Reyes (volunteer lead)", incident `INC-901`. |
| `superadmin_credentials` | The `ADMIN_PASSWORD` value. |
| `integration_outage_fixture` | The same staged `integration_state` outage. It also names the fresh guests (`gst-pat`, `gst-quinn`) and the fresh teams (demo-tern, demo-wren). Re-seed between runs. |

### Activation and passport

| Variable | Maps to |
|---|---|
| `valid_pair_code` | A fresh activation code (`issueActivationCode`) for Pat and `gst-pat`, valid for 24 h. It is single use, so `issue-test-codes` mints one per wave. |
| `expired_pair_token` | An activation code for Pat that expired 60 minutes before issue. |
| `replayed_pair_token` | An activation code for Pat that `issue-test-codes` redeems once itself, so any later use is a replay. Side effect: Pat has a `paired` activation session. |

### Teams

| Variable | Maps to |
|---|---|
| `team_one_slug`, `idea_team_slug` | **demo-kestrel**: Pat (captain) and Kit, recruiting open. It holds Kane runs from the adapter fixtures, an unlisted evidence artifact, a deck, and the private idea. |
| `team_two_slug` | **demo-heron**: Hugo (captain) and Olu, recruiting open. It has a finalized submission for the judge tests. |
| `locked_team_slug` | **demo-ledger**: Lena (captain) and Leo. Finalized, with `state = roster_locked`. In wave P02, `participant_email` is set to `lena@demo.test`. |
| `full_team_slug` | **demo-quartet**: four members. `max_size` = 4 = `TEAM_SIZE_CAP`. |
| `invite_team_slug`, `expired_team_invite` | **demo-inviter**. The invite `KH7X-EXP9` expired a day ago. Only its hash is stored, as the app does. |

### Kane

| Variable | Maps to |
|---|---|
| `kane_adapter_credential` | `Bearer khk_…`: a fresh `member_tokens` bearer for Pat (team one), labelled "demo-fixture kane adapter". It is what `kanehack pair` would mint. Earlier fixture tokens are revoked. The app's route is `/api/v1/kane/runs` (the tests say `/kane/runs`). |
| `valid_run_end_fixture` | A JSON body for `POST /api/v1/kane/runs`: `exit_code` 0, `run_summary.terminal = run_end/passed`, one passed member, Kestrel's commit, and `evidence_sha256` of Kestrel's private "adapter-evidence" artifact. The execution id is fresh on every run. |
| `valid_testrun_done_fixture` | The same with `family: testrun`, `terminal: testrun_done`, and two members. |
| `failed_kane_run_fixture` | `exit_code` 1, `terminal run_end/failed`, and one failed member with a failure line. A failed run opens a *suspected* defect. |
| `invalid_hash_kane_event` | The run_end body with `evidence_sha256` that is not a sha256. The server rejects it (VALIDATION_FAILED). |
| `unsigned_kane_event` | No completion event (`terminal: null`). It can never be source-verified. |
| `team_one_unlisted_evidence_ref` | `EV-<id>`: a private evidence artifact on Kestrel that no submission lists. The API id is the number. |
| `error_kane_run_fixture`, `linked_commit_run_fixture`, `unlinked_run_fixture` | Seeded runs on **demo-ibis**: errored (exit 2, verified); passed and verified with repo `demo-org/ibis` (`demo-repo-ibis`) and a pushed commit; passed but unverified with no SHA. Ibis also has a passed run and a failed run with a suspected defect. |
| `private_run_team_slug`, `private_run_marker` | **demo-osprey**, run `demo-run-private-osprey-5X2 (KR-<id>)`. |

### Submissions and judging

| Variable | Maps to |
|---|---|
| `submission_team_password` | `staging-team-pass`, the team password for every staging team and the staging captains' personal password. |
| `complete_submission_team_slug` | The base value is **demo-finch**: finalized, public Ship Page, deck v1 saved before finalizing. The judge tests use this. Overrides: **demo-tern** in L02 (t-44) and **demo-wren** in L11 (t-31). These are complete saved drafts with a verified passing run on the same SHA. |
| `submission_receipt_id` | Finch's receipt `S-…`. |
| (judge evidence) | Each submission team's verified run (`demo-run-<bird>-pass`) has a sealed-report artifact with visibility `judges`. It is linked to the run before the draft is saved, so the finalized snapshot's `evidence` lists `evidence_artifact_id`, and the draft carries an `evidence_refs` link. Each team also has a verified milestone shared with judges, proposed by the captain and approved by the teammate through `proposeMilestone`/`approveMilestone`. Finch and Heron show 1 evidence item and 1 milestone in the judge inspector. Kestrel's unlisted artifact stays private, and `getJudgeEvidence` refuses it. Opening an artifact at `/judge/evidence/<id>` returns 404 locally because Blob is not configured. |
| `retry_submission_team_slug` | **demo-robin**: a complete draft. |
| `deadline_submission_team_slug` | **demo-dove**: a complete draft. The app has no per-team deadline; see the approximations below. |
| `preflight_missing_repo_team_slug` | **demo-gannet**: a draft with a linked verified run, but no repository URL or SHA. |
| `preflight_missing_evidence_team_slug` | **demo-egret**: a draft with a repo URL and SHA, but no linked run or evidence refs. |
| `judge_one_time_code` | `judge@demo.test`. Fresh code. |

### Milestones

| Variable | Maps to |
|---|---|
| `milestone_team_name`, `milestone_team_password`, `milestone_team_slug`, `milestone_project_slug` | **Demo Sparrow** / `sparrow-team-pass` / `demo-sparrow`. It is solo, so the builder can approve their own claim. It is finalized with a public Ship Page at `/ship/demo-sparrow`. |
| `milestone_verified_run_id` | `KR-<id>`: the verified run with a team-visible evidence artifact. An earlier verified run and two pushed commits (`repository_commits`) make the "compare" timeline. |

### Ideas and Radar

These are word-overlap labels. No AI key is set locally, and the seed checks them with the app's own `ideaRadar`.

| Variable | Maps to |
|---|---|
| `private_idea_marker` | `KESTREL-PRIVATE-IDEA-7Q4Z`, inside Kestrel's `private_description`. |
| `possible_overlap_radar_fixture` | **demo-plover**: an application, Jaccard 0.94 with Kestrel's public summary, so possible overlap. |
| `similar_angle_radar_fixture` | **demo-curlew**: an agent, 0.36, a build type like Kestrel's, so similar angle. |
| `complementary_radar_fixture` | **demo-avocet**: a validation harness, 0.21, harness against application, so complementary. |
| `nonconsented_radar_fixture` | **demo-shrike**: public summary identical to Kestrel's, but `discovery_opt_in = false` and `idea_discovery` consent false, so it must never be compared. |
| `private_radar_fixture` | **demo-lark**: opted in with an unrelated public summary (a Figma plugin). Its *private* text (`ZEPHYR-QUILLWORK-PRIVATE-3K9` plus Kestrel's own wording) would overlap if private text leaked into the Radar. |
| `unsupported_feature_idea` | "running the Kane CLI browser suite in desktop Safari and Firefox (Kane CLI drives Chrome on desktop)". |

### Matching

| Variable | Maps to |
|---|---|
| `match_strength_fixture` … `match_learning_goal_fixture` | "Playwright-to-Kane test migration", "accessibility audits", "Saturday 10:00-16:00 PT", "Kane CLI testrun suites in CI". Dana's profile carries the same values, so Pat gets a complementary suggestion. |
| `non_opted_in_profile_identifier` | `Olu Bankole (P-####)`, Olu's display name and public code. |
| `matching_population_fixture` | Computed from the database on every run: who is opted in (discoverable profile and `teammate_discovery` consent), who of them is teamless, and how many people are not opted in. |
| `private_phone_fixture` | `+1 415 555 0142`. See the approximations below. |

### Live TV and photos

| Variable | Maps to |
|---|---|
| `live_nonzero_count_fixture` | The count of checked-in roster guests (seed-local checks in `gst-ana` and `gst-ben`), projected into `live_metrics` by the seed. |
| `photo_team_slug` | **demo-pelican**. Every member has consented to photo publication. |
| `published_photo_marker`, `published_gallery_manifest` | `PELICAN-PUB-1`. The manifest is both published `event_photos` rows (id, caption marker, path), read from the database rather than from the page. |
| `unpublished_photo_marker`, `unpublished_photo_url` | `PELICAN-UNPUB-1` (status `approved`, not published), at `http://localhost:3100/photos/event/fixtures/pelican-unpub-1.png`. |

### Studio and launch kit (production-URL tests only)

| Variable | Maps to |
|---|---|
| `deck_api_id` | Kestrel's deck version id. The seed saves the default deck through `saveDeckVersion`, and it is used only as the security-probe target. |
| `launch_complete_team_slug` | **demo-reel**: a saved story, marked reviewed. |
| `launch_failed_video_team_slug` | **demo-glitch**: a reviewed story, a complete submission draft, and a failed `mp4_video` render job (`RENDER_FAILED`, 3 attempts). |
| `launch_no_footage_team_slug` | **demo-stills**: a reviewed story with no recording. |
| `launch_unapproved_team_slug` | **demo-draftpost**: a reviewed story and a generated launch kit that nobody approved. |
| `launch_claims_team_slug` | **demo-claims**: a reviewed story. |
| `unsupported_kpi_claim`, `unsupported_testimonial_claim` | "Cut checkout regressions by 87% across 40 paying customers" and "\"Kane saved our launch\" - VP Engineering, Acme Corp". Neither is in any story. |

## Approximations and known gaps

1. **36 of the 89 tests open `https://kaneclihack.sh`, which is production.** The URL is hard-coded in their steps, and `kane-cli testrun run` has no base-URL override. Their fixtures exist locally, but running them would drive the production site. Waves P01–P14 are marked `runnable_locally: false`. They need a redesign through kane-cli with a localhost start URL. The test files were not edited.
2. **`private_phone_fixture`:** the app has no phone field. The number is seeded only in private free text: Olu's and Dana's help tickets and Heron's private idea. Its absence from public pages is still a real check, but nothing could ever render it from a profile field.
3. **`deadline_submission_team_slug`:** the app has one event-wide `submission_locks_at` and no per-team deadline. Wave L10 (`"clock": "submission_locked"`) moves the event lock 2 minutes into the past. The next `issue-test-codes` without that clock, or the next seed, restores it from the `fixture:submission_locks_at` setting.
4. **Finalizing needs a personal sign-in.** A team-password session can't finalize; the app asks for `/passport/login`. The tests only pass `submission_team_password`, so staging captains have that as their personal password too (`<bird>.captain@demo.test`). A test that never signs in personally will see the app's "personal step" message.
5. **Offline check-in ledger:** fixed. `/ops/recovery` CSV ledgers now take a check-in ledger. Each slip becomes a reconciliation row (slip id, paper time, entry time, reason, signer) that links to the roster, the desk and its audit events, and checks the admitted guest in at the paper time. Replaying a slip id changes nothing. The seed deletes `CHK-OFF%` slips.
6. **Backdating reason:** the paper help intake on `/ops/help` has a "Why entered late" field, required once the slip time is 15+ minutes old, and keeps it on the `help.paper_entry` audit row and a staff-only note. The slip time is a date plus a 24-hour time in the event zone (the time box also takes `2026-10-23T00:15`). `/ops/recovery` has its own paper intake (owned by the recovery area), which t-42 drives; it has no reason field there yet.
7. **Kane "hash" and "signature":** Kane events carry no hash or signature in this app. "Invalid hash" is modelled as a malformed `evidence_sha256`, which the schema refuses. "Unsigned" is a report with no completion event, which is never source-verified. Both leave trusted totals unchanged.
8. **`offline_receipt_id`** changes per wave (H-/CHK-/S-), because one value can't match the help, check-in and submission formats at once.
9. **Idea validator:** the rule-based validator recommends the `remote` capability for Safari or Firefox wording. It has no separate "unsupported feature" finding, so t-53's ac-153 may fail on the app, not the fixture.
10. **Launch kit:** "reviewed" is set by writing `project_stories.reviewed_by/at`, because the seed has no review screen to click. Real footage and approved screenshots are not seeded: Blob is not configured locally and the upload path needs it. These are production-URL tests anyway.
11. **Photos:** Blob is not configured locally, so published placeholder PNGs are plain files under `public/photos/event/fixtures/`. Next serves `public/` before the `/photos` route. The unpublished photo has no file there, so a direct request goes through the app's guard and gets 404. The directory is gitignored and is never deployed.
12. **Re-seed before each wave.** Most tests mutate their fixtures: they finalize, claim, rotate a badge or save an idea. Seeding takes a few seconds.
13. **Time-sensitive:** the event is 2026-10-24 (team lock 11:00 PT, idea lock 12:00 PT). After the team lock, `syncRosterLocks` locks every roster, which breaks the joinable-team fixtures. Shift `hack_events` if you run the suite later.
14. **t-43 imports t-42**, so one test signs in with the organizer code twice. The second sign-in only works if the session from the imported steps is still active.
15. **Team login on `/help`:** `/help`'s "Sign in" link goes to `/login` (team name + team password). t-3 and t-44 tell the agent to sign in there with `participant_email`/`participant_password`, a person's email and personal password, so the team login refuses them. No fixture value can be both a team name and Pat's sign-in email for the 30 other tests. The fix belongs in the app: point that link at `/passport/login?next=/help`, which opens Pat's hub since b226f17. t-44's other team-hub step (`complete_submission_team_slug` + `submission_team_password`) does work at `/login`: the slug slugifies to itself.
