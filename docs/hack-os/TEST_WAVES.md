# Test waves

How to run the 103 live designed tests in `.testmuai/tests` against the local app in groups of up to 4. The machine-readable plan is [`tests/fixtures/waves.json`](../../tests/fixtures/waves.json). What each variable points at is in [TEST_FIXTURES.md](TEST_FIXTURES.md).

**26 waves (W01–W26), all local (`http://localhost:3100`).** `.testmuai/tests` also holds 63 superseded test files (36 of them open production). They are in no wave: never glob `.testmuai/tests`, pass the wave's files.

## Rules

1. **Single-use credentials.** No wave holds two tests that use the same single-use variable: `organizer_one_time_code`, `mentor_one_time_code`, `second_mentor_one_time_code`, `judge_one_time_code` or `valid_pair_code`. A staff code is consumed by its first sign-in, and an activation code by its first pairing. A wave may hold one organizer, one mentor and one judge test together, because those are different variables. There are 21 organizer tests, so 21 waves carry one each; 103 tests at 4 per wave need at least 26 waves.
2. **Shared fixtures.** Tests that would interfere on the same record run in different waves:
   - Kestrel's idea is saved by t-159, t-160 and t-161. Each runs apart from the other two, from the five Radar tests (t-162–t-166) and from t-86 (private idea).
   - Pat's readiness check: t-46 and t-47.
   - Pat's consents and badge: t-140, t-141 (rotation), t-142, t-143, t-144. All five run apart.
   - Pat's activation: t-105, t-106, t-107, t-108, t-109 run apart from each other, from the consent and badge tests, and from t-8 and t-157, which check in `gst-pat`.
   - Help tickets: t-154 and t-157 run apart.
   - The Sparrow team: t-61, t-62, t-63 (milestones) and t-157 (help request as Sparrow).
   - Kane ingest baselines: t-115, t-116 and t-137 each run apart from the other ingests; t-118 and t-119 may share a wave.
   - TV: t-136 (phase override) runs apart from t-123, t-135, t-137, t-138, t-139 and t-158.
   - Kestrel's deck: t-125, t-127 and t-129.
   - demo-swift's Ship Page: t-97, t-98, t-99 and t-100.
   - Event policy: t-102 (privacy rule baseline) and t-104 (privacy rule change); t-103 (deadline change) stays out of the deadline wave.
   - demo-ledger: t-41 and t-111.
   - Dana's introduction: t-121 and t-122.
3. **One value per variable per wave.** `assurance.json` holds one value for each variable, so a wave's overrides apply to every test in it. A wave that overrides `participant_email` (t-110, t-111, t-112, t-128, t-131–t-134) holds no other test that signs in as Pat; a wave that sets `other_participant_email` to Dana (t-121, t-122) holds no test that uses Olu. Judge tests need `complete_submission_team_slug` = demo-finch (finalized), so they never share a wave with t-146 or t-157, which override it to a fresh draft team, or with t-128, which changes Finch's deck.
4. **Deadline.** The wave with t-145 moves the event's submission lock into the past. No finalize, preflight, Ship Page publish, deck publish, launch-kit or deadline-edit test runs in that wave.
5. **Re-seed before every wave.** Most tests change their fixtures. The seed also restores the event row (schedule, phase override, privacy rule) recorded by the first seed.

## Running a wave

From the repo root (it is also the checkout the dev server on :3100 serves). Never use `.env.local`: it points at production.

```sh
node --env-file=$HOME/hackos-local/env --import ./tests/support/register.mjs scripts/seed-local.mts > /dev/null
node --env-file=$HOME/hackos-local/env --import ./tests/support/register.mjs scripts/issue-test-codes.mts --wave W01
KANE_CLI_USER_AGENT=<agent> kane-cli testrun run $(jq -r '.waves[] | select(.id=="W01") | .tests[]' tests/fixtures/waves.json) --parallel 4 < /dev/null
```

Run `issue-test-codes` without `--wave` to get the base values back: no overrides, and the event schedule's clock.

## Waves

| Wave | Tests | Single-use credentials | Overrides | Notes |
|---|---|---|---|---|
| W01 | t-1 Mentor shared diagnostics exclude restricted information<br>t-93 Unconfirmed biometric candidate is not identified automatically<br>t-111 Locked roster resists an unapproved captain change<br>t-151 Judge is denied an unlisted other-team evidence item | org, mentor, judge | `participant_email`=lena@demo.test | Locked roster: Lena is Ledger's captain. |
| W02 | t-6 Reconcile real-time paper check-in after backend recovery<br>t-102 Prevent participant edits to signed event policy<br>t-123 TV displays consented aggregates and QR without contacts<br>t-141 Rotating a lost badge invalidates its earlier QR link | org | `offline_receipt_id`=CHK-OFF042 | t-6 uploads the check-in ledger slip CHK-OFF042. t-141 rotates Pat's badge. |
| W03 | t-7 Reject normal check-in for guest marked not admitted<br>t-79 Participant is denied organizer announcement publication<br>t-96 Anonymous visitor cannot open draft or moderation-hidden Ship Pages<br>t-121 Request an introduction without private contact disclosure | org | `other_participant_email`=dana@demo.test | Introductions go to Dana (discoverable). |
| W04 | t-8 Import versioned Luma CSV and check in approved guest<br>t-138 Anonymous attendee cannot change live TV phase<br>t-144 Passport saves independent photo and social consent choices<br>t-164 Possible overlap has explained, qualified guidance | org | none |  |
| W05 | t-9 Admit and check in walk-in with recorded provenance<br>t-106 Expired and replayed pair tokens fail closed<br>t-139 Live TV retains fixed information across rotating panels<br>t-165 Similar angle has explanation and participant options | org | none |  |
| W06 | t-10 Mentor cannot override denied roster admission<br>t-82 Unconfirmed announcement remains unpublished<br>t-128 Publish immutable submission-pinned deck version<br>t-137 TV distinguishes completed run statuses from verified builds | org, mentor | `participant_email`=finch.captain@demo.test, `participant_password`=staging-team-pass | t-128 signs in as Finch's captain and publishes Finch's deck. |
| W07 | t-33 Record an outage submission and inspect its signed manual receipt<br>t-87 Anonymous request cannot reveal private Kane run details<br>t-124 Opted-in matching profile yields explained suggestions<br>t-161 Application idea receives full advisory eligibility review | org | `offline_receipt_id`=S-OFF042 | t-33 records the manual submission receipt S-OFF042 for demo-outage. |
| W08 | t-34 Preflight reports missing repository and missing evidence<br>t-95 Consent-checked photo gains captions and alt text before approved gallery release<br>t-109 Human selfie handoff ends in activation receipt<br>t-129 Export the five default scenes with correct PDF breaks | org, pair | none |  |
| W09 | t-41 Privileged recovery leaves finalized snapshot unchanged<br>t-105 Other person's Luma guest cannot be paired<br>t-120 Non-opted-in participant remains absent from matching<br>t-158 Live TV holds its last count during stream interruption | org | none |  |
| W10 | t-42 Reconcile signed offline help receipt with actual time and audit<br>t-47 Working manual readiness check is reported rather than verified<br>t-85 Anonymous event visitor cannot see non-opted-in identity<br>t-122 Accept a pending introduction without private contact disclosure | org | `other_participant_email`=dana@demo.test | t-122 imports t-121 (request, then accept), Dana again. |
| W11 | t-43 Replayed offline help receipt does not duplicate recovery event<br>t-84 Anonymous unpublished photo stays out of gallery and direct access<br>t-156 Reopening a resolved ticket adds its own history event<br>t-160 Standalone validation harness is reviewed without a separate app | org | none | t-43 imports t-42, so it signs in with the organizer code twice. |
| W12 | t-46 Broken member readiness check shows partial status and fix<br>t-83 Organizer schedules a staff-only notice without public leakage<br>t-103 Save an Admin change to the official submission deadline<br>t-142 Public badge scan withholds staff-only check-in information | org | none | t-103 moves the official submission lock (the next seed restores it). |
| W13 | t-61 Unsupported public milestone stays unpublished<br>t-81 Unresolved placeholders block announcement publication<br>t-133 No-footage video identifies screenshot walkthrough<br>t-149 Judge reviews the frozen submission with the weighted human rubric | org, judge | `participant_email`=stills.captain@demo.test | Launch kit as the solo Stills captain. |
| W14 | t-62 Approved evidence-backed milestone becomes public<br>t-90 Visitor retrieves a Kane workflow for a selected version entitlement<br>t-92 Unapproved consented photo cannot reach public gallery<br>t-166 Complementary ideas provide explained collaboration | org | none |  |
| W15 | t-63 Compare run proof and keep drafted milestone team-only<br>t-91 Unconsented attendee photo remains outside the public gallery<br>t-163 Nonconsented summary is excluded from Radar | org | none |  |
| W16 | t-80 Organizer confirms a public announcement and inspects audit<br>t-104 Save an Admin change to event privacy rules<br>t-125 Sandbox hostile custom deck and block credential access<br>t-143 Public badge does not expose unconsented profile or camera picture | org | none | t-104 changes the privacy rule; t-102 runs in another wave. |
| W17 | t-86 Anonymous request cannot reveal a team's private idea<br>t-101 Keep anonymous visitors out of private event settings<br>t-135 TV restores reconciled metrics after SSE outage<br>t-154 Participant help request progresses through mentor resolution | org, mentor | none |  |
| W18 | t-88 Anonymous visitor sees published gallery but not unpublished photo<br>t-99 Publish approved evidence-backed story at canonical Ship Page<br>t-155 Staff web intake remains usable when automation and Slack fail<br>t-159 Unsupported feature idea receives independent warning and advisory review | org | none |  |
| W19 | t-94 No biometric suggestion for attendee without separate enrollment<br>t-108 Signing back in restores the pending Selfie step<br>t-127 Restore default deck after invalid custom HTML<br>t-147 Retry finalization without creating another receipt | org, pair | none |  |
| W20 | t-97 Public Ship Page excludes claims without approval or evidence<br>t-110 Concurrent team joins preserve one active membership<br>t-113 Four-person team rejects a fifth member<br>t-152 Judge cannot change a frozen submission or project | judge | `participant_email`=gia@demo.test | Join race: the joiner is the teamless Gia. |
| W21 | t-98 Editing Ship Page story leaves finalized submission receipt intact<br>t-118 Valid run_end evidence records a team execution<br>t-134 Reviewed story produces complete factual launch kit<br>t-150 Judge cannot see unrelated participant personal details | judge | `participant_email`=reel.captain@demo.test | Launch kit as the solo Reel captain. |
| W22 | t-100 Optional Ship Page templates preserve required story sections<br>t-119 Valid testrun_done evidence records a team execution<br>t-132 Unsupported KPI and testimonial stay out of launch claims<br>t-148 Judge authors the final score instead of accepting an AI decision | judge | `participant_email`=claims.captain@demo.test | Launch kit as the solo Claims captain. |
| W23 | t-107 Camera denial permits selfie skip and activation<br>t-130 Failed video render does not block final submission<br>t-136 Authorized organizer overrides the TV phase<br>t-162 Private idea cannot shape Radar comparison clues | org, pair | none | t-136 overrides the TV phase, so no other TV test shares this wave. |
| W24 | t-112 Captain cannot change a teammate's personal consent<br>t-114 Expired invitation cannot add a team member<br>t-115 Untrusted Kane events leave trusted run totals unchanged<br>t-145 Refuse finalization at the authoritative server deadline | none | `participant_email`=hugo@demo.test; clock: `submission_locked` | Hugo captains Heron, which contains Olu. Deadline wave: the server submission lock is moved 2 minutes into the past, so no finalize, preflight, publish or launch-kit test runs here. |
| W25 | t-116 Failed Kane execution remains a suspected detection<br>t-126 Deny cross-team deck editing<br>t-131 Unapproved launch post does not publish<br>t-146 Finalize reviewed team submission before lock and inspect immutable receipt | none | `participant_email`=draftpost.captain@demo.test, `complete_submission_team_slug`=demo-wren | Launch kit as the solo Draftpost captain. t-146 finalizes the fresh draft demo-wren, so no judge test shares this wave. |
| W26 | t-117 Other team cannot retrieve an unlisted evidence artifact<br>t-140 Another participant cannot change the owner's passport consents<br>t-153 Only one staff claimant wins competing help claims<br>t-157 Critical web operations survive optional integration outages | org, mentor, mentor2 | `complete_submission_team_slug`=demo-tern, `submission_captain_email`=tern.captain@demo.test | The only wave with the second mentor code. t-157 finalizes demo-tern (captain tern.captain) and checks in gst-pat; no judge, activation or Sparrow test here. |
