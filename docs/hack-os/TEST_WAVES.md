# Test waves

How to run the 102 unattended live designed tests in `.testmuai/tests` against the local app in groups of up to 4. The machine-readable plan is [`tests/fixtures/waves.json`](../../tests/fixtures/waves.json). What each variable points at is in [TEST_FIXTURES.md](TEST_FIXTURES.md). Where tests may run, and how their steps are worded, is decided in [`requirements/test-environment.md`](../../requirements/test-environment.md).

**27 waves (W01–W27), all local (`http://localhost:3100`).** Re-planned on 2026-10-23 after the suite was redesigned from the test-environment note: no live test opens `kaneclihack.sh`. `.testmuai/tests` also holds superseded test files (some open production). They are in no wave: never glob `.testmuai/tests`, pass the wave's files.

## Rules

1. **Single-use credentials.** No wave holds two tests that use the same single-use variable: `organizer_one_time_code`, `organizer_followup_one_time_code`, `mentor_one_time_code`, `second_mentor_one_time_code`, `judge_one_time_code`, `superadmin_one_time_code`, `valid_pair_code`. A staff code is consumed by its first sign-in, and an activation code by its first pairing. `organizer_followup_one_time_code` is a second organizer code issued beside the first (issuing a code normally retires the account's unused ones).
2. **Shared fixtures.** Tests that would interfere on the same record run in different waves:
   - Dana's introduction: t-92, t-93, t-94.
   - Finch is the judged submission: t-109, t-135, t-136, t-137, t-138, t-139.
   - Kane ingest baselines: t-101, t-102, t-104, t-105, t-113.
   - Kane ingest vs TV run metrics: t-104, t-105, t-113.
   - Kestrel and Heron rosters (Gia joins both): t-96, t-98, t-101, t-102, t-103, t-104, t-105, t-107.
   - Kestrel deck: t-106, t-108, t-110.
   - Kestrel's idea is saved: t-86, t-144, t-145, t-146, t-147, t-148, t-149, t-150, t-151.
   - Live TV stream pause: t-95, t-111, t-112, t-113, t-115, t-153, t-154, t-171.
   - Pat's activation: t-178, t-179, t-180.
   - Pat's activation vs his badge, consents and check-in: t-121, t-125, t-126, t-127, t-128, t-129, t-170, t-178, t-179, t-180.
   - Pat's consents and badge: t-125, t-126, t-127, t-128, t-129.
   - Pat's help tickets: t-141, t-143.
   - Pat's readiness check: t-46, t-47.
   - Pelican gallery manifest: t-84, t-88, t-159.
   - Sparrow milestones: t-61, t-62, t-63.
   - TV matching counts: t-91, t-94, t-95.
   - TV phase override: t-95, t-111, t-112, t-113, t-114, t-115, t-153, t-154, t-171.
   - build-phase clock (TV and hub phase): t-81, t-82, t-95, t-112, t-113, t-115, t-152, t-153, t-154.
   - check-in of gst-pat and the ledger: t-120, t-121, t-170.
   - demo-ledger: t-97, t-169.
   - demo-swift Ship Page: t-161, t-162, t-163, t-164.
   - event policy settings: t-167, t-168.
   - help desk during integration outage: t-140, t-141, t-143, t-170.
   - submission lock: t-109, t-130, t-131, t-132, t-134, t-161, t-162, t-163, t-164, t-167, t-170, t-172, t-173, t-174, t-175, t-176.
3. **One value per variable per wave.** `assurance.json` holds one value for each variable, so a wave's overrides apply to every test in it. A wave that overrides `participant_email` or `other_participant_email` holds no other test that uses that variable; `issue-test-codes` also swaps `participant_display_name` / `other_participant_display_name` to match. Judge tests need `complete_submission_team_slug` = demo-finch (finalized), so they never share a wave with tests that override it.
4. **Clocks.** The wave with the deadline test moves the event's submission lock 2 minutes into the past (`clock: submission_locked`); no finalize, preflight, Ship Page, deck, launch-kit or deadline-edit test runs there. The TV run-metrics test needs the build phase (`clock: build_phase`); no other /live or announcement test shares its wave.
5. **Eve.** The pending-selfie test signs in as `eve@demo.test`, the fixture stopped at the camera step, and runs in a wave of its own.
6. **Re-seed before every wave.** Most tests change their fixtures. The seed also restores the event row (schedule, phase override, privacy rule).

## Running a wave

From the repo root (it is also the checkout the dev server on :3100 serves). Never use `.env.local`: it points at production.

```sh
node --env-file=$HOME/hackos-local/env --import ./tests/support/register.mjs scripts/seed-local.mts > /dev/null
node --env-file=$HOME/hackos-local/env --import ./tests/support/register.mjs scripts/issue-test-codes.mts --wave W01
KANE_CLI_USER_AGENT=<agent> kane-cli testrun run $(jq -r '.waves[] | select(.id=="W01") | .tests[]' tests/fixtures/waves.json) --parallel 4 --headless < /dev/null
```

Run `issue-test-codes` without `--wave` to get the base values back: no overrides, and the event schedule's clock.

## Not run unattended

- t-181 Attended selfie handoff stops automation at awaiting_selfie (`.testmuai/tests/attended-selfie-handoff-stops-automation-at-awaiting-selfie_test.md`): A person must press the camera shutter (Kane never takes the selfie); run it attended.

Expected local failures: photo upload, evidence files and screenshots are stored in Vercel Blob, which is not configured locally.

## Waves

| Wave | Tests | Single-use credentials | Overrides | Notes |
|---|---|---|---|---|
| W01 | t-1 Mentor shared diagnostics exclude restricted information<br>t-99 Four-person team rejects a fifth member<br>t-113 TV distinguishes completed run statuses from verified builds<br>t-170 Critical web operations survive optional integration outages | org, mentor | `other_participant_email`=rowan@demo.test, `complete_submission_team_slug`=demo-tern, `participant_email`=tern.captain@demo.test, `participant_password`=staging-team-pass; clock: `build_phase` | Rowan is teamless; the invite is valid, the team is full. TV run metrics show only from the build phase, so the clock is build_phase. Finalizes demo-tern as its captain and checks in gst-pat; no judge or activation test here. |
| W02 | t-42 Reconcile signed offline help receipt with actual time and audit<br>t-62 Approved evidence-backed milestone becomes public<br>t-107 Deny cross-team deck editing<br>t-163 Publish an approved claim with the default Ship Page template | org | `participant_email`=swift.captain@demo.test | Ship Page as the Swift captain. |
| W03 | t-43 Replayed offline help receipt does not duplicate recovery event<br>t-63 Compare run proof and keep drafted milestone team-only<br>t-131 Finalize reviewed team submission before lock and inspect immutable receipt<br>t-164 Optional Ship Page templates retain the complete story | org | `complete_submission_team_slug`=demo-wren, `participant_email`=swift.captain@demo.test | Finalizes the fresh draft demo-wren, so no judge test shares this wave. Ship Page as the Swift captain. |
| W04 | t-46 Broken member readiness check shows partial status and fix<br>t-102 Failed Kane execution remains a suspected detection<br>t-114 Authorized organizer overrides the TV phase<br>t-158 Without biometric enrollment use manual photo lookup | org | none | Overrides the TV phase, so no other /live test shares this wave. |
| W05 | t-47 Working manual readiness check is reported rather than verified<br>t-104 Valid run_end evidence records a team execution<br>t-144 Unsupported feature idea receives independent warning and advisory review<br>t-160 Anonymous visitor cannot retrieve draft or moderation-hidden Ship Pages | none | none |  |
| W06 | t-61 Unsupported public milestone stays unpublished<br>t-103 Other team cannot retrieve an unlisted evidence artifact<br>t-162 Story revision leaves finalized submission snapshot unchanged<br>t-169 Privileged recovery leaves finalized snapshot unchanged | org, org2, superadmin | `participant_email`=swift.captain@demo.test | Ship Page as the Swift captain. Uses the superadmin code and a second organizer code. |
| W07 | t-81 Unresolved placeholders block announcement publication<br>t-86 Anonymous request cannot reveal a team's private idea<br>t-97 Locked roster resists an unapproved captain change<br>t-136 Judge cannot see unrelated participant personal details | org, judge | `participant_email`=lena@demo.test | Locked roster: Lena captains the locked demo-ledger. |
| W08 | t-82 Unconfirmed announcement remains unpublished<br>t-96 Sequential team joins preserve one active membership<br>t-124 Mentor cannot override denied roster admission<br>t-161 Unsupported claims stay off the public Ship Page | org, mentor | `participant_email`=swift.captain@demo.test | Ship Page as the Swift captain. |
| W09 | t-84 Anonymous unpublished photo stays out of gallery and direct access<br>t-123 Reject normal check-in for guest marked not admitted<br>t-139 Judge reviews the frozen submission with the weighted human rubric<br>t-174 Failed video render does not block final submission | org, judge | `participant_email`=glitch.captain@demo.test | Finalizes demo-glitch as its captain. |
| W10 | t-85 Anonymous event visitor cannot see non-opted-in identity<br>t-91 Non-opted-in participant remains absent from matching<br>t-126 Another participant cannot change the owner's passport consents<br>t-149 Possible overlap has explained, qualified guidance | none | none |  |
| W11 | t-87 Anonymous request cannot reveal private Kane run details<br>t-94 Opted-in matching profile yields explained suggestions<br>t-125 Public badge does not expose unconsented profile or camera picture<br>t-150 Similar angle has explanation and participant options | none | `other_participant_email`=dana@demo.test | Suggestions show Dana. |
| W12 | t-88 Anonymous visitor sees published gallery but not unpublished photo<br>t-95 TV displays consented aggregates and QR without contacts<br>t-133 Record an outage submission and inspect its signed manual receipt<br>t-175 No-footage video identifies screenshot walkthrough | org | `offline_receipt_id`=S-OFF042, `participant_email`=stills.captain@demo.test | Records the manual submission receipt S-OFF042 for demo-outage. Launch kit as the Stills captain. |
| W13 | t-90 Visitor retrieves a Kane workflow for a selected version entitlement<br>t-98 Captain cannot change a teammate's personal consent<br>t-127 Public badge scan withholds staff-only check-in information<br>t-151 Complementary ideas provide explained collaboration | none | `other_participant_email`=kit@demo.test | Kit is Pat's teammate on demo-kestrel. |
| W14 | t-92 Request an introduction without private contact disclosure<br>t-106 Sandbox hostile custom deck and block credential access<br>t-128 Passport saves independent photo and social consent choices<br>t-155 Missing photo consent prevents public release | none | `other_participant_email`=dana@demo.test | Introductions go to Dana (discoverable). |
| W15 | t-93 Accept a pending introduction without private contact disclosure<br>t-108 Restore default deck after invalid custom HTML<br>t-129 Rotating a lost badge invalidates its earlier QR link<br>t-156 Unapproved consented photo remains private | none | `other_participant_email`=dana@demo.test | t-93 imports t-92 (request, then accept), Dana again. |
| W16 | t-100 Expired invitation cannot add a team member<br>t-109 Publish immutable submission-pinned deck version<br>t-115 Live TV retains fixed information across rotating panels<br>t-121 Import versioned Luma CSV and check in approved guest | org | `other_participant_email`=rowan@demo.test, `participant_email`=finch.captain@demo.test, `participant_password`=staging-team-pass | Publishes Finch's deck as Finch's captain. |
| W17 | t-101 Untrusted Kane events leave trusted run totals unchanged<br>t-110 Export the five default scenes with correct PDF breaks<br>t-111 TV restores reconciled metrics after SSE outage<br>t-157 Unconfirmed biometric candidate cannot become photo identity | org | none | Pauses the Live TV stream. |
| W18 | t-105 Valid testrun_done evidence records a team execution<br>t-143 Reopening a resolved ticket adds its own history event<br>t-145 Standalone validation harness is reviewed without a separate app<br>t-165 Anonymous visitor receives no private settings data | none | none |  |
| W19 | t-112 Anonymous attendee cannot change live TV phase<br>t-140 Only one staff claimant wins competing help claims<br>t-178 Another participant's approved Luma guest cannot be claimed | mentor, mentor2 | none |  |
| W20 | t-120 Reconcile real-time paper check-in after backend recovery<br>t-135 Judge authors the final score instead of accepting an AI decision<br>t-159 Approved consented photo reaches public gallery with draft<br>t-172 Unapproved launch post does not publish | org, judge | `offline_receipt_id`=CHK-OFF042, `participant_email`=draftpost.captain@demo.test | Uploads the check-in ledger slip CHK-OFF042. Launch kit as the solo Draftpost captain. |
| W21 | t-122 Admit and check in walk-in with recorded provenance<br>t-138 Judge cannot change a frozen submission or project<br>t-167 Admin saves the official submission lock<br>t-173 Unsupported KPI and testimonial stay out of launch claims | org, judge | `participant_email`=claims.captain@demo.test | Launch kit as the Claims captain. |
| W22 | t-130 Refuse finalization at the authoritative server deadline<br>t-166 Participant cannot change signed event policy<br>t-171 Live TV holds its last count during stream interruption | org | none; clock: `submission_locked` | Deadline wave: the server submission lock is moved 2 minutes into the past; no finalize, preflight, publish or launch-kit test runs here. Pauses the Live TV stream. |
| W23 | t-132 Retry finalization without creating another receipt<br>t-137 Judge is denied an unlisted other-team evidence item<br>t-142 Staff web intake remains usable when automation and Slack fail<br>t-176 Reviewed story produces complete factual launch kit | org, judge | `participant_email`=reel.captain@demo.test | Launch kit as the Reel captain. |
| W24 | t-134 Preflight reports missing repository and missing evidence<br>t-147 Private idea cannot shape Radar comparison clues<br>t-153 Organizer confirms a public announcement and inspects audit<br>t-179 Expired and replayed pairing tokens authorize no pairing | org | none |  |
| W25 | t-141 Participant help request progresses through mentor resolution<br>t-146 Application idea receives full advisory eligibility review<br>t-152 Participant is denied organizer announcement publication | mentor | none |  |
| W26 | t-148 Nonconsented summary is excluded from Radar<br>t-154 Organizer schedules a staff-only notice without public leakage<br>t-168 Admin saves an updated privacy rule<br>t-180 Camera denial permits selfie-free passport activation | org | none |  |
| W27 | t-182 Resume the pending Selfie checkpoint after personal reauthentication | none | `participant_email`=eve@demo.test | Eve is the fixture stopped at the camera step. |
