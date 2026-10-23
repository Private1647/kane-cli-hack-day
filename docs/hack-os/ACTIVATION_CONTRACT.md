# Activation contract: Kane two-run controller

Owner: identity (`src/server/activation.ts`, `/activate`, `/api/v1/activate/*`).
Readers: kane-mcp (`hack-onboard` skill, `kanehack` CLI, `/mcp` tools) and admissions-ops (`/ops/checkin`).

Kane drives the boring parts of activation in a real Chrome window. **A person always takes, or skips, the selfie.**
Kane has no "pause for camera" primitive, and we don't rely on one (SPEC §2). The controller runs Kane **twice**:

- **Run A** fills the approved fields and stops at a marker on the page.
- The participant does the camera step themselves.
- **Run B** checks that the finished passport shows the activation receipt.

The server's stored state is the only source of truth. The controller polls it and never infers state from Kane's output alone.

---

## 1. States

```
invited ─► paired ─► identity_confirmed ─► ready_for_camera ─► selfie_pending ─► selfie_confirmed ─┐
   │          │                                  │                    │                             ├─► active
   │          └─► action_required ◄──┘           └──────────► selfie_skipped ◄──┘                    │   (+ browser_verified
   └─► expired         (not on roster)                                                              ┘    checkpoint, run B)
                                   recoverable_error  (selfie upload failed; retry / phone / skip)
```

| status | meaning | `/activate` step | `data-checkpoint` |
|---|---|---|---|
| `invited` | an activation code was issued (by the desk or `activate/start`) and nobody has used it yet | code | `awaiting_participant` |
| `paired` | this browser is signed in as the member | admission → identity | `awaiting_participant` |
| `action_required` | not on the approved roster (`NOT_APPROVED`) | blocked | `blocked` |
| `identity_confirmed` | name, GitHub, X, skills and interests saved | consent | `awaiting_participant` |
| `ready_for_camera` | consents recorded, one row per category | camera | **`awaiting_selfie`** |
| `selfie_pending` | the camera or phone link has been opened | camera | **`awaiting_selfie`** |
| `recoverable_error` | the selfie upload failed and nothing was lost | camera | **`awaiting_selfie`** |
| `selfie_confirmed` / `selfie_skipped` | the person clicked the shutter and confirmed, or skipped | receipt | `active` |
| `active` | receipt `AC-XXXXXX` issued with the server time; `members.activated_at` is set | receipt | `active` |
| `expired` | a code was used up or replaced by an existing session | (none) | (none) |

- **Every transition writes a checkpoint row.** The row goes in `activation_checkpoints (activation_id, checkpoint, status, actor, run_id, payload)`, with `actor` set to participant, kane, staff or system. A unique index makes retries no-ops.
- **Moves are serialised.** The session row is locked with `FOR UPDATE` while it moves.
- **Illegal moves fail.** They return `409 CONFLICT` with a reload hint.
- **Extra checkpoint names that don't change the status:**
  - `admission` (`confirmed` | `roster_pending`)
  - `consents` (`recorded:<n>`)
  - `kane_run_a_started`
  - `kane_run_a_stopped`
  - `browser_verified`

**One deviation from SPEC §2.** `browser_verified` is recorded *after* `active`, and the status stays `active`. Run B's job is to verify the finished passport, and the participant must never wait on Kane to finish activation. The passport ribbon reads **VERIFIED** only when the reported run id exists in `kane_runs` with `source_verified = true`. Until then it reads "Reported · unverified".

## 2. Page markers (for Kane objectives)

The `/activate` wrapper always carries:

- `data-checkpoint` is one of `awaiting_participant`, `awaiting_selfie`, `active` or `blocked`.
- `data-activation-status` is the raw status, or `signed_out`.
- `data-activation-step` is one of `code`, `admission`, `identity`, `consent`, `camera` or `receipt`.

The receipt code is in `[data-testid="activation-receipt"]`. The code form is `[data-testid="activation-code-form"]`. The phone page (`/activate/phone?token=…`) also carries `data-checkpoint="awaiting_selfie"`.

## 3. API (all return the standard envelope)

| Call | Auth | Use |
|---|---|---|
| `POST /api/v1/pair/start` `{label?}` | none | Get a `user_code`, a secret `device_code` and a `verification_url` (`/pair?code=`). The code lasts 10 minutes. |
| `POST /api/v1/pair/confirm` `{device_code}` | none | Poll this every `interval` seconds. While pending you get `needs_action`. Once approved you get the bearer token, **once only**. A replay, a denial or an expired code returns `410 PAIR_EXPIRED`. |
| `POST /api/v1/activate/start` | bearer | Returns `activation_url`, a one-time code that lasts 30 minutes. If the person is already active, it returns the passport link instead. |
| `GET /api/v1/activate/checkpoints` | bearer or cookie | Returns `status`, `step`, `checkpoint` (the marker), `awaiting_human`, `receipt` and the checkpoint rows. |
| `POST /api/v1/activate/checkpoints` `{checkpoint, run_id?, payload?}` | bearer or cookie | `checkpoint` must be one of `kane_run_a_started`, `kane_run_a_stopped` or `browser_verified`. `browser_verified` needs a `run_id` and a session that is already `active`. **No selfie checkpoint can be set through the API.** |
| `POST /api/v1/activate/resume` | bearer or cookie | Idempotent. Returns the same session and the step to resume at. |
| `POST /api/v1/activate/selfie` (multipart) | browser cookie or the phone `handoff` token. **A bearer is refused (403).** | Only the camera component calls this. |
| `GET/PATCH /api/v1/participants/me` | bearer or cookie | Reads or updates the passport DTO. Consent changes made with a bearer need `explicit_confirmation: true`. |
| `GET/POST /api/v1/readiness` | bearer or cookie | Used by hack-doctor (§6). |

## 4. The controller (hack-onboard)

```
0. token ← pairing (kanehack login): pair/start → show user_code → person approves at /pair → poll pair/confirm.
1. GET /participants/me. If state ≠ needs_activation / awaiting_selfie → already active: show passport link, stop.
2. Ask the person (in chat) only for missing identity values and for each consent separately.
   Never assume a consent. Never ask for or handle a photo.
3. POST /activate/start → activation_url.
4. POST /activate/checkpoints {checkpoint:"kane_run_a_started", run_id}.
5. RUN A  (kane-cli run … --agent, objective below). Exit when the marker is reached.
6. POST /activate/checkpoints {checkpoint:"kane_run_a_stopped", run_id, payload:{exit_code}}.
7. Tell the person: "Your browser is at the camera step. Press the shutter yourself (or Skip / Use my phone)."
8. Poll GET /activate/checkpoints every 3–5 s until data.status ∈ {selfie_confirmed, selfie_skipped, active}
   (give up politely after ~10 min; the person can finish later, nothing is lost).
9. RUN B  (objective below) against /passport.
10. If run B passed: POST /activate/checkpoints {checkpoint:"browser_verified", run_id:<run B id>}, and report
    run B to /api/v1/kane/runs (kane-mcp) so it can become source-verified.
11. Return: receipt code, server time, passport URL, and which checks ran. Never claim VERIFIED yourself.
```

### Run A objective (fill and stop)

```
kane-cli run "Open {{activation_url}}. If an 'Activation code' field is shown and already filled, click Continue.
If the page asks 'Is this your registration?' and shows the name {{display_name}}, click \"Yes, that's me\".
On 'Confirm who you are', set 'What should we call you?' to {{display_name}}, 'GitHub username' to {{github}},
'X handle' to {{x_handle}}, 'Skills' to {{skills}}, 'Interested in' to {{interests}}, then click 'Confirm identity'.
On 'Your privacy, one switch each', turn ON exactly these switches and leave every other switch OFF: {{consents_on}}.
Click 'Save my choices'. STOP as soon as the page has an element with data-checkpoint=\"awaiting_selfie\".
Do not click 'Open camera', the shutter, 'Use this photo', 'Use my phone instead' or 'Skip the photo'.
Report the text of the step heading you stopped on." --agent --variables '{…}'
```

- Pass only values the person confirmed in chat. Leave empty fields empty.
- `consents_on` is the human-readable labels from `CONSENT_COPY` in `src/server/passport.ts`.
- If run A ends at `data-checkpoint="blocked"`, the roster check refused the person (`NOT_APPROVED`). Stop and send them to the check-in desk. Staff can admit a walk-in, and then the person clicks "check again".

### Run B objective (verify)

```
kane-cli run "Open {{site}}/passport. Verify the page shows the name {{short_name}} and the Activation panel shows
receipt {{receipt_code}}. Do not change anything on the page." --agent
```

## 5. Failure handling

| Situation | What happens |
|---|---|
| Chrome crashes or the tab closes | Reopen `/activate`, or call `POST /activate/resume`. The flow continues from the stored status. One session and one current selfie per member: the `selfies_current_idx` index and the member-row lock make sure of that. |
| A code is reused, or it expired | `PAIR_EXPIRED`. If this browser is already signed in, `/activate` just resumes. |
| The person isn't on the roster | `action_required` plus `NOT_APPROVED`. The desk admits them as a walk-in (`roster_guests.source='walk_in'`), then they retry. |
| The roster hasn't been imported yet | The person isn't blocked. The `admission` checkpoint is set to `roster_pending`, and the desk confirms at check-in. |
| The camera is denied or missing | The page offers "Use my phone instead" (a one-time `/activate/phone?token=` link that lasts 15 minutes, with the desktop polling) or "Skip the photo". |
| The upload fails | The status becomes `recoverable_error`. Retake, use the phone or skip. Nothing is lost. |
| `selfie_storage` consent is off | There is no camera step. "Continue without a photo" moves to `selfie_skipped`. |
| The person revokes `selfie_storage` later | The selfie row is marked deleted and the Blob object is removed. `face_matching` is revoked with it. |
| Activation is turned off by the `activation` flag | `/activate` shows a degraded banner. Check-in at the desk and `/passport` still work. |

## 6. Readiness (hack-doctor)

Post `POST /api/v1/readiness` with `{checks:[{id,status,detail?,version?}], client?, idempotency_key?}`. Check ids:

- `os_arch`
- `node`
- `git`
- `chrome`
- `codex`
- `kane_version`
- `kane_whoami`
- `kane_skill`
- `plugin_discovery`
- `api_reachability`
- `browser_test`

Partial reports are fine. The response lists the exact fix for every check that isn't passing.

A check reported by the machine is never shown as VERIFIED. The one exception is `api_reachability` on a bearer report, because the server itself saw that request arrive.

## 7. Calls other areas may use

- `issueActivationCode({memberId}|{guestId}, staffActor, minutes?)` in `src/server/activation.ts`. Use it at check-in to hand an activation code to a walk-in or a Luma guest who has no account yet.
- `issueMemberLoginCode(memberId, staffActor)` in `src/server/pairing.ts`. Use it for a one-time personal sign-in code (for example, someone who lost their team password).
- `getBadgeToken` / `rotateBadgeToken` / `revokeBadgeTokens` / `resolveBadgeToken` in `src/server/passport.ts`. These cover the badge QR. The offline ID is `members.public_code` (`P-####`).
- `getPassport(memberId)` / `toPublicPassport(p)`. These return the private and public DTOs.
