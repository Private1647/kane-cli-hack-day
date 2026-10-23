# Test waves

How to run the 89 designed tests in `.testmuai/tests` against the local app in groups of up to 4. The machine-readable plan is [`tests/fixtures/waves.json`](../../tests/fixtures/waves.json). What each variable points at is in [TEST_FIXTURES.md](TEST_FIXTURES.md).

**28 waves: 14 local (L01–L14, 53 tests) and 14 production-URL waves (P01–P14, 36 tests) that must not run as written.**

## Rules

1. **Single-use credentials.** No wave holds two tests that use the same single-use variable: `organizer_one_time_code`, `mentor_one_time_code`, `second_mentor_one_time_code`, `judge_one_time_code` or `valid_pair_code`. A staff code is consumed by its first sign-in, and an activation code by its first pairing. A wave may hold one organizer, one mentor and one judge test together, because those are different variables. There are 13 local organizer tests, which sets the lower bound of 13 local waves.
2. **Shared fixtures.** Tests that would interfere on the same record run in different waves:
   - Kestrel's idea is saved by t-55, t-54 and t-53. These run apart from each other, from the five Radar tests and from t-86 (private idea).
   - Pat's readiness check is changed by t-46 and t-47.
   - Pat's consents and badge are changed by t-20 and t-16, read by t-17, rotated by t-18 and read by t-19. All five run apart.
   - Pat's new help tickets come from t-3 and t-44.
   - The Sparrow milestones are proposed by t-62, t-63 and t-61.
   - The organizer tests are already one per wave.
   - Production-URL waves also keep apart: the Kane baseline counters (t-26, t-27) from the other ingests, the TV phase override (t-77) from the other TV tests, and the Pat activation flows (t-14, t-13, t-15, t-12, t-11) from each other.
3. **One value per variable per wave.** `assurance.json` holds one value for each variable, so a wave can only override a variable for every test in it. Judge tests need `complete_submission_team_slug` = demo-finch (finalized), so they never share a wave with t-31 or t-44, which override it to a fresh draft team. The production waves that need a different participant (join race, locked roster, captain, launch teams) each get their own wave.
4. **Deadline.** L10 moves the event's submission lock into the past for t-32. No other submission test runs in L10.
5. **Re-seed before every wave.** Most tests change their fixtures, and the seed is fast and re-runnable.

## Running a wave

```sh
RUN=<checkout serving http://localhost:3100>   # has the local .env.local
REPO=<this repo>                               # has .testmuai/
cd "$RUN" && node --env-file=.env.local --import ./tests/support/register.mjs scripts/seed-local.mts > /dev/null
cd "$RUN" && node --env-file=.env.local --import ./tests/support/register.mjs scripts/issue-test-codes.mts --repo "$REPO" --wave L01
cd "$REPO" && KANE_CLI_USER_AGENT=<agent> kane-cli testrun run $(jq -r '.waves[] | select(.id=="L01") | .tests[]' tests/fixtures/waves.json) --parallel 4 < /dev/null
```

The run checkout stays on the commit it was created from. Copy `scripts/{seed-local,seed-fixtures,fixtures-data,issue-test-codes}.mts` into it, or `git -C "$RUN" checkout --detach hack-os`. Run `issue-test-codes` without `--wave` to get the base values back: no overrides, and the event schedule's clock.

## Local waves

| Wave | Tests | Single-use credentials | Overrides | Why it is grouped this way |
|---|---|---|---|---|
| L01 | t-9 Admit and check in walk-in with recorded provenance<br>t-10 Mentor cannot override denied roster admission<br>t-40 Judge authors the final score instead of accepting an AI decision<br>t-55 Application idea receives full advisory eligibility review | judge, mentor, org | none | Organizer walk-in, mentor override denial, judge final score, application idea save. |
| L02 | t-44 Critical web operations survive optional integration outages<br>t-1 Mentor shared diagnostics exclude restricted information<br>t-46 Broken member readiness check shows partial status and fix<br>t-85 Anonymous event visitor cannot see non-opted-in identity | mentor, org | `complete_submission_team_slug`=demo-tern | t-44 finalizes a fresh complete draft (demo-tern), so no judge test shares this wave. |
| L03 | t-8 Import versioned Luma CSV and check in approved guest<br>t-2 Only one staff claimant wins competing help claims<br>t-38 Judge cannot change a frozen submission or project<br>t-54 Standalone validation harness is reviewed without a separate app | judge, mentor, org, mentor2 | none | The only wave with the second mentor code (t-2, competing claims). |
| L04 | t-80 Organizer confirms a public announcement and inspects audit<br>t-3 Participant help request progresses through mentor resolution<br>t-36 Judge cannot see unrelated participant personal details<br>t-53 Unsupported feature idea receives independent warning and advisory review | judge, mentor, org | none | t-3 creates Pat's new help ticket; kept apart from t-44, which also creates one. |
| L05 | t-83 Organizer schedules a staff-only notice without public leakage<br>t-37 Judge is denied an unlisted other-team evidence item<br>t-60 Complementary ideas provide explained collaboration<br>t-58 Possible overlap has explained, qualified guidance | judge, org | none | Radar reads (complementary, overlap); no idea save in this wave. |
| L06 | t-6 Reconcile real-time paper check-in after backend recovery<br>t-39 Judge reviews the frozen submission with the weighted human rubric<br>t-59 Similar angle has explanation and participant options<br>t-57 Nonconsented summary is excluded from Radar | judge, org | `offline_receipt_id`=CHK-OFF042 | t-6 uses the check-in receipt id printed on tests/fixtures/offline-checkin-ledger.csv. |
| L07 | t-42 Reconcile signed offline help receipt with actual time and audit<br>t-56 Private idea cannot shape Radar comparison clues<br>t-86 Anonymous request cannot reveal a team's private idea<br>t-47 Working manual readiness check is reported rather than verified | org | none | Paper help receipt H-OFF042; Radar private-idea and anonymous private-idea checks. |
| L08 | t-43 Replayed offline help receipt does not duplicate recovery event<br>t-62 Approved evidence-backed milestone becomes public<br>t-20 Passport saves independent photo and social consent choices<br>t-84 Anonymous unpublished photo stays out of gallery and direct access | org | none | t-43 imports t-42 and replays H-OFF042 (self-contained after a re-seed). |
| L09 | t-33 Record an outage submission and inspect its signed manual receipt<br>t-63 Compare run proof and keep drafted milestone team-only<br>t-16 Public badge does not expose unconsented profile or camera picture<br>t-88 Anonymous visitor sees published gallery but not unpublished photo | org | `offline_receipt_id`=S-OFF042 | t-33 records the manual submission receipt S-OFF042 for demo-outage. |
| L10 | t-7 Reject normal check-in for guest marked not admitted<br>t-32 Refuse finalization at the authoritative server deadline<br>t-79 Participant is denied organizer announcement publication<br>t-87 Anonymous request cannot reveal private Kane run details | org | none; clock: `submission_locked` | Deadline wave: the server submission lock is moved into the past, so no other submission test runs here. |
| L11 | t-4 Staff web intake remains usable when automation and Slack fail<br>t-31 Finalize reviewed team submission before lock and inspect immutable receipt<br>t-61 Unsupported public milestone stays unpublished<br>t-17 Another participant cannot change the owner's passport consents | org | `complete_submission_team_slug`=demo-wren | t-31 finalizes the fresh complete draft demo-wren, so no judge test shares this wave. |
| L12 | t-82 Unconfirmed announcement remains unpublished<br>t-35 Retry finalization without creating another receipt<br>t-19 Public badge scan withholds staff-only check-in information<br>t-45 Live TV holds its last count during stream interruption | org | none | t-19 reads the badge link; t-18 (rotation) runs in another wave. |
| L13 | t-81 Unresolved placeholders block announcement publication<br>t-34 Preflight reports missing repository and missing evidence<br>t-18 Rotating a lost badge invalidates its earlier QR link<br>t-5 Reopening a resolved ticket adds its own history event | org | none | t-18 rotates Pat's badge; t-5 reopens the resolved ticket. |
| L14 | t-41 Privileged recovery leaves finalized snapshot unchanged | none | none | Break-glass admin password (reusable); kept alone so the other waves stay at 4. |

## Production-URL waves (do not run as written)

These tests open `https://kaneclihack.sh` in their steps, and `kane-cli testrun run` has no base-URL override. They are planned with the same rules so they are ready once they are redesigned with a local start URL. Their fixtures already exist locally.

| Wave | Tests | Single-use credentials | Overrides | Why it is grouped this way |
|---|---|---|---|---|
| P01 | t-21 Concurrent team joins preserve one active membership<br>t-89 Visitor retrieves a Kane workflow for a selected version entitlement<br>t-75 Anonymous attendee cannot change live TV phase<br>t-25 Expired invitation cannot add a team member | none | `participant_email`=gia@demo.test | The join race needs a teamless participant. |
| P02 | t-22 Locked roster resists an unapproved captain change<br>t-24 Four-person team rejects a fifth member<br>t-29 Valid run_end evidence records a team execution<br>t-30 Valid testrun_done evidence records a team execution | none | `participant_email`=lena@demo.test | The locked-roster test needs the locked team's captain. |
| P03 | t-23 Captain cannot change a teammate's personal consent<br>t-28 Other team cannot retrieve an unlisted evidence artifact<br>t-76 TV distinguishes completed run statuses from verified builds<br>t-65 Deny cross-team deck editing | none | `participant_email`=hugo@demo.test | The captain test needs the captain of the team that contains Olu. |
| P04 | t-67 Publish immutable submission-pinned deck version<br>t-27 Failed Kane execution remains a suspected detection<br>t-78 Live TV retains fixed information across rotating panels | none | `participant_email`=finch.captain@demo.test, `participant_password`=staging-team-pass | The pinned-deck test needs a demo-finch member; t-27's baseline is kept away from t-29/t-30. |
| P05 | t-71 Failed video render does not block final submission<br>t-26 Untrusted Kane events leave trusted run totals unchanged<br>t-51 TV displays consented aggregates and QR without contacts | none | `participant_email`=glitch.captain@demo.test | t-26's baseline is kept away from the other Kane ingests. |
| P06 | t-72 No-footage video identifies screenshot walkthrough<br>t-74 TV restores reconciled metrics after SSE outage | none | `participant_email`=stills.captain@demo.test |  |
| P07 | t-73 Reviewed story produces complete factual launch kit<br>t-77 Authorized organizer overrides the TV phase | org | `participant_email`=reel.captain@demo.test | t-77 overrides the TV phase, so no other TV test shares this wave. |
| P08 | t-69 Unapproved launch post does not publish | none | `participant_email`=draftpost.captain@demo.test |  |
| P09 | t-70 Unsupported KPI and testimonial stay out of launch claims | none | `participant_email`=claims.captain@demo.test |  |
| P10 | t-14 Browser restart recovers awaiting-selfie checkpoint<br>t-68 Export the five default scenes with correct PDF breaks<br>t-52 Opted-in matching profile yields explained suggestions | pair | none | One valid pair code per wave. |
| P11 | t-13 Camera denial permits selfie skip and activation<br>t-66 Restore default deck after invalid custom HTML<br>t-49 Request an introduction without private contact disclosure | pair | `other_participant_email`=dana@demo.test | Introductions go to Dana (discoverable); Olu stays the non-opted-in fixture. |
| P12 | t-15 Human selfie handoff ends in activation receipt<br>t-64 Sandbox hostile custom deck and block credential access<br>t-50 Accept a pending introduction without private contact disclosure | pair | `other_participant_email`=dana@demo.test | t-50 imports t-49; re-seed first so Dana has no pending introduction. |
| P13 | t-48 Non-opted-in participant remains absent from matching<br>t-12 Expired and replayed pair tokens fail closed | none | none | t-12 is kept out of the waves where a valid pair code drives Pat's activation. |
| P14 | t-11 Other person's Luma guest cannot be paired | none | none |  |
