// The eleven fallback documents from the blueprint (fallback/00–10), as
// Markdown with {{placeholders}} for the real event values. Wording follows
// the blueprint; only the blanks it asked staff to fill are filled here.
// A value that isn't set yet prints as a blank line to write on.

export type DocValues = {
  eventName: string;
  eventSlug: string;
  site: string;
  date: string;
  timezone: string;
  lock: string;
  teamLock: string;
  ideaLock: string;
  demos: string;
  venue: string;
  wifi: string;
  helpContact: string;
  supportChannel: string;
  incidentCommander: string;
  incidentBackup: string;
  admissionLead: string;
  photographerLead: string;
  mentorDispatcher: string;
  kaneInfra: string;
  submissionOfficer: string;
  witness: string;
  rosterVersion: string;
  policyVersion: string;
  privacyRules: string;
};

export type FallbackDoc = { id: string; file: string; title: string; md: string };

const BLANK = "__________________";

export function fallbackDocs(v: DocValues): FallbackDoc[] {
  const f = (s: string) => (s && s.trim() ? s.trim() : BLANK);
  const fill = (md: string) =>
    md.replace(/\{\{(\w+)\}\}/g, (_, k: keyof DocValues) => {
      const val = v[k];
      return typeof val === "string" ? f(val) : BLANK;
    });

  const docs: FallbackDoc[] = [
    {
      id: "00",
      file: "00_EVENT_FAILURE_MATRIX.md",
      title: "Event-day fallback matrix",
      md: `# Event-day fallback matrix | print and post in \`/ops/recovery\`

**Tier 0 must survive:** check-in, getting help, and official submission. Do not close the event because media/X/dashboard/skill installation is unavailable.

| Failure | Attendee fallback | Staff action | Evidence retained |
|---|---|---|---|
| Codex or plugin unavailable | Browser \`/activate\`, official Kane CLI | Provide one-page setup, mark agent mode delayed | Participant ID, readiness issue |
| Installer error | Download & inspect pinned version, manual official CLI install | Provide offline approved installer where available | Version, checksum, reason |
| Kane unavailable or credits exhausted | Direct browser registration, approved test evidence manual | Label Kane verification pending and contact product infra ({{kaneInfra}}) | Session ID, TestMu incident ID |
| Chrome/browser run fails | Manual authenticated form; try a safe reconnect later | Issue checkpoint ID and photo QR | Activation checkpoint ledger |
| Selfie/camera blocked | Open phone camera via pairing QR or skip optional photo | Staff-assisted camera only with consent | Photo consent and completion ID |
| Luma webhook/API down | Import latest signed guest CSV (\`/ops/roster/import\`) | Verify identity against approved roster; reconcile changes later | Guest roster version + staff ID |
| GitHub OAuth down | Enter public repo URL; confirm owner later | Require commit SHA when available | Repo URL + verification pending |
| Idea AI or matching down | Printable validator + team board | Update roster/idea sheet manually | Submitted sheet/revision |
| Kane run telemetry down | Upload \`.evidence\` reference or paste run URL when safe | Mark \`manual_unverified\` until checked | Run id, exit code, SHA, artifact hash |
| Mentor notifications down | Physically visit mentor table / QR form | Post help tickets to paper queue, call on-duty mentor | Ticket numbered card |
| Entire backend outage | Printed badges / paper help / manual submission | Incident commander ({{incidentCommander}}) opens numbered ledger and informs TV | Signed numbered receipts |
| Realtime TV out | Cached TV view with \`STALE\` label + static announcements | Read printed agenda and status verbally | Incident timeline |
| Video/deck render failed | Upload screen recording; use HTML template/print PDF | Offer five-slide deck starter; no submission penalty | File hash + submission URL |
| Photo tags or X API down | Manual opt-in lookup, download approved caption | Hold social publishing; do not auto-post | Consent and pending draft |
| Official submission API down | Manual signed timestamped acceptance | Two-person witness, queue reconciliation | Submission receipt form + artifact hash |

**Safety rule:** No fallback may turn an unverified outcome into a verified status. Staff overrides append compensating events with reason and witness, never overwrite history.`,
    },
    {
      id: "01",
      file: "01_STAFF_RUNBOOK.md",
      title: "Staff quick runbook",
      md: `# Staff quick runbook | event-critical operations

## Assign before opening

- Incident commander: {{incidentCommander}}  Backup: {{incidentBackup}}
- Admission lead: {{admissionLead}}  Photographer lead: {{photographerLead}}
- Mentor dispatcher: {{mentorDispatcher}}  Kane/product infra: {{kaneInfra}}
- Submission officer: {{submissionOfficer}}  Witness: {{witness}}
- Support channel/phone: {{supportChannel}}  Last known good roster version: {{rosterVersion}}
- Official submission deadline with time zone: **{{lock}}** (from the server's event record, NOT inferred from a landing-page headline)

## Five-minute briefing

1. Show all staff \`/ops/recovery\` and printed form locations.
2. Verify laptop/phone manual check-in (\`/ops/checkin\`), printer, time sync, backup Wi-Fi ({{wifi}}) and one offline roster copy.
3. Point to emergency help desk, record ticket sequence prefix \`H-\`, submission receipt prefix \`S-\` and badge prefix \`P-\`.
4. Explain consent: selfie optional, matching optional and separate, photo publication separate; QR identification is preferred fallback.
5. Announce TV freshness and official deadline ({{lock}}) to everyone in room.

## Severity and response

- **SEV-0:** Can't register any new attendee OR help requests lost OR official submissions unavailable. Stop nonessential deployments, switch to printed forms, announce service interruption, assign two-person receipt team, reconcile later.
- **SEV-1:** Kane/API auth/grid service degraded. Run direct browser/manual paths, publish truthful amber notice. No fabricated proof metrics.
- **SEV-2:** Photo/social/video/showcase themes down. Keep intake open; queue render/publish until working.

## Short scripts

Check-in: "Your approved registration is confirmed. We're activating your personal passport now. Team registration comes next. Selfie and public-photo permissions are optional and separate."

Kane setup outage: "We can register you and let you start building now. We'll reconnect your Codex/Kane skills once the integration is ready. Your participation won't be lost."

Mentor help: "I've logged help request [H-ID] for [table/category]. The mentor dispatcher has it. Please keep your run ID and don't share passwords or tokens."

Submission outage: "Submission services are degraded. We are accepting time-stamped official backup receipts. Your current code, evidence and project information will be locked as of the recorded receipt time."

TV outage banner: "LIVE ACTIVITY FEED DELAYED. Official submission deadline and help desk remain active. Last confirmed update: [time]."

## Deploys during the event

- Turn on **Deploy freeze** in \`/ops/settings\` before the submission window. Only Tier-0 fixes ship while it's on.
- If a deploy breaks anything, use Vercel **Instant Rollback** to the last good production deployment. Database data is unaffected.
- Health: \`/health/live\` (function up) and \`/health/ready\` (database reachable). Integrations: \`/ops/integrations\`.

## Resolution/reconciliation checklist

- Record incident start and resolution timestamps, relevant service, staff names.
- Import manual records with source \`manual_offline\`, preserve original paper ID, attach witness and input hash.
- Resolve duplicates by Luma guest ID, team ID, repo SHA and idempotency key; do not erase conflict evidence.
- Notify affected participants only after actual state is confirmed; update TV freshness.
- Export audit ledger and store securely with retention policy.`,
    },
    {
      id: "02",
      file: "02_PERSONAL_REGISTRATION_FORM.md",
      title: "Manual personal Hacker Passport form",
      md: `# Manual personal Hacker Passport form (OFFLINE FALLBACK)

**Receipt ID:** P-OFF-________ **Date/time/time zone:** ________ ({{timezone}}) **Staff initials:** ________

Luma approval proof (guest ID or offline roster row): __________________________

Attendee chosen display name: ______________________________________________

Verified admission match? YES / NO / ESCALATED  Matched by: ____________________

GitHub handle (optional; OAuth linking later): ______________________________

X/Twitter handle (optional): ______________________  Verify later? YES / NO

Skills/interest tags for team matching (optional): ___________________________

**Explicit decisions (check separately):**

- [ ] Store a personal selfie for the event passport. [ ] Decline/skip selfie.
- [ ] Allow public team/event photos with human review. [ ] Do not publish my image.
- [ ] Allow opt-in reference matching of event photos against selfie. [ ] No face matching.
- [ ] Allow X handle mention in approved official posts. [ ] No social handle mention.
- [ ] Join discoverable teammate matching. [ ] Remain private.
- [ ] Share short project idea publicly for similarity/matching. [ ] Idea stays private.

Consent copy/version displayed: {{policyVersion}}  Captured by participant/staff: __________________

Activation state: \`PAIRED / CAMERA_PENDING / SELFIE_SKIPPED / ACTIVE / REVIEW_REQUIRED\`

Next step link/code: ____________________  Recovery case ID if needed: ____________________

**Privacy:** No password, access key, private repository token or raw face matching template belongs on this form. Transfer to encrypted backend when restored; restrict paper access and destroy per approved retention plan.`,
    },
    {
      id: "03",
      file: "03_TEAM_AND_IDEA_FORM.md",
      title: "Team formation and idea validation worksheet",
      md: `# Team formation and idea validation worksheet

**Team record ID:** T-______  **Team name:** __________________  **Captain:** __________________

Members (max per official event rules: 5; team registration locks {{teamLock}}):

| Participant ID | Display name | Joining confirmation | Skill / interest |
|---|---|---|---|
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |

Open roles/skills sought: ________________________________  Table/location: __________

Team invite code (do not use personal passwords): ______________  Creator initials: ______

**Idea summary** (idea locks {{ideaLock}}): _____________________________________________________________

Type: [ ] Product [ ] App [ ] Agent [ ] Workflow [ ] Extension [ ] Plugin [ ] CI [ ] Standalone validation harness [ ] Other

**Eight-part validator** (mark Y/N/U for each, where U means uncertain):

1. Functional creation and demonstrable outcome: ___
2. AI coding agent meaningfully involved: ___
3. Kane components solve a real assurance problem: ___
4. Repeatable/reusable verification harness: ___
5. Results drive diagnosis, improvement or release decision: ___
6. Actual verifiable evidence planned: ___
7. Credible shipping/quality efficiency impact: ___
8. Event-day feasible MVP and demo: ___

**Improvement actions:**

1. __________________________________________________________________________
2. __________________________________________________________________________
3. __________________________________________________________________________

Distinctiveness claim/possible overlap (no ownership accusation): ______________

Idea summary discoverable to other teams? YES / NO   Captain consent: _____________

**Important:** Similarities may coexist; don't veto an eligible idea because of overlap. Find a distinctive validation architecture or testable proof. AI pre-score is not official judging.`,
    },
    {
      id: "04",
      file: "04_MENTOR_TICKET.md",
      title: "Emergency mentor help ticket",
      md: `# Emergency mentor help ticket

**Ticket:** H-______ **Opened (date, time, zone):** ____________________ ({{timezone}}) **Staff:** ______

Participant ID: ____________________ Team ID/name: __________________________

Table: ________  Category: [ ] Kane CLI [ ] Test Manager [ ] Auth [ ] CI/Cloud [ ] Mobile [ ] Idea [ ] GitHub [ ] Other

Priority: [ ] Low [ ] Normal [ ] High [ ] Urgent (blocked on critical deadline)

Problem in one sentence: _______________________________________________________

Safe run ID / evidence reference (NO secret logs): _____________________________

What has been tried? ___________________________________________________________

Status: [ ] OPEN [ ] TRIAGED [ ] CLAIMED [ ] IN PROGRESS [ ] RESOLVED

Claimed by mentor: _____________________ Time: __________

Resolution/next action: _______________________________________________________

Resolved by: __________________ Time: ___________ Participant confirms? YES / NO

Reconcile with portal ticket ID: ________________________ (mentor dispatcher: {{mentorDispatcher}})

**No passwords, API keys, customer data or full private conversations on tickets.**`,
    },
    {
      id: "05",
      file: "05_MANUAL_SUBMISSION_RECEIPT.md",
      title: "Official manual submission receipt",
      md: `# Official manual submission receipt (BACKUP)

**IMPORTANT: Use only during verified submission service outage or explicit organizer-approved exception. Keep duplicate carbon/photo copies.**

Receipt: S-__________  Event ID: {{eventSlug}}  Team ID: __________

**Received at actual date/time with time zone:** __________________________________

**Verified official lock time with time zone:** {{lock}}

Submission by participant ID/name: _____________________________________________

Project name/type: _____________________________________________________________

Repository URL / approved equivalent: __________________________________________

**Exact commit SHA or uploaded archive SHA-256:** _______________________________

Live/demo URL: ________________________________________________________________

Harness description / Kane components: _________________________________________

Evidence ID(s), run URL(s), artifact hashes (no secrets): _______________________

App/workflow demo or video link (optional for backup): __________________________

Known caveats / unmet validation claims: _______________________________________

Participant confirmed the frozen contents: [ ] YES [ ] NO

Accepted as received in backup mode: [ ] YES [ ] NO / requires escalation

Primary submission officer: {{submissionOfficer}}  Signature/initials: ________

Independent witness: {{witness}}  Signature/initials: ________

Incident/reference ID: _______________________  Manual source sequence: ________

**Participant acknowledgement:** "This form confirms receipt at the timestamp recorded above. It does not yet prove successful reconciliation to the online submission system. Keep your copy and unchanged artifacts."

After recovery: canonical online receipt ID: ___________ reconciled by: _____________

Never backdate. For ambiguous boundary timing, preserve raw evidence and escalate to the event director under published policy.`,
    },
    {
      id: "06",
      file: "06_PHOTO_AND_SOCIAL_APPROVAL.md",
      title: "Photographer & social approval checklist",
      md: `# Photographer & social approval checklist

Photo intake: PHOTO-______ Photographer: ______ Date/time: ______ Team/table: ______  (photographer lead: {{photographerLead}})

Image storage private reference: __________________________

People shown and actual human-confirmed identities: _____________________________

For EACH visible person: signed appropriate photo-publication consent? YES / NO / UNKNOWN

Face matching consent checked separately? YES / NO / NOT USED

X handle mentions separately opted in? YES / NO / NOT USED

The caption is supported by actual milestone ID/evidence ref: ____________________

Three proposed captions (may be copyedited):

1. Punchy: ______________________________________________________________
2. Witty: _______________________________________________________________
3. Product/evidence story: _______________________________________________

Alt text: __________________________________________________________________

Claim check: [ ] Real source verified [ ] No implied fabricated results [ ] No duplicate spam

Approval: [ ] Approved [ ] Needs edits [ ] Hold [ ] Delete / do not publish

Organizer/staff reviewer: ______________________________ Time: _______________

X publishing via official account: [ ] Published, post ID __________ [ ] Not published [ ] Manual copy shared

**Hard stop:** Unknown identity, unconsented person, private screen/credentials, or unverifiable performance claim means HOLD, not auto-post. Camera matching alone is never permission to publish.`,
    },
    {
      id: "07",
      file: "07_MEDIA_AND_DECK_FALLBACK.md",
      title: "Manual media, HTML deck and showcase fallback",
      md: `# Manual media, HTML deck and showcase fallback

**Submission remains accepted even when media rendering fails.**

## Five-slide fill-in deck

1. **What we created:** \`[Project]\` enables \`[user/problem/outcome]\`. Show screenshot or console demo.
2. **See it working:** Three steps of the real user journey or harness invocation. Include one actual screenshot.
3. **Harness architecture:** \`Agent/code → Kane components → Result/evidence → Feedback/decision\`. Name only components used.
4. **The proof:** One real run and its evidence ID. Include a negative path/failure if you have one. State what remains uncertain.
5. **What improved:** Describe saved work, reduced verification effort, better coverage/quality, or more confidence. Use numbers ONLY if measured. End with repo and Share Page QR.

If the HTML editor fails, use the deck starter from the help desk; it runs locally with edit/export/print controls. Alternatively create five slides in any editor and export as PDF, preserving all five points. If a PPTX converter fails, PDF or HTML fulfills the showcase requirement.

## 60-second capture plan

| Time | Beat | Content |
|---|---|---|
| 00–06s | Hook / project name | A single verified/clearly aspirational claim |
| 06–22s | Product/harness in action | Real screen recording or annotated screenshots |
| 22–38s | Kane validation workflow | Actual command and result sequence |
| 38–52s | Evidence | Run ID, screenshot, finding or closed verification loop |
| 52–60s | Why it matters | Impact statement + \`{{site}}/ship/{slug}\` link |

If the video renderer is unavailable: upload a user-edited recording, or create a slideshow from actual screenshots; label it as a screenshot walkthrough. Never fabricate test proof or performance results.

## Manual Ship Page minimum

Project name / clear pitch / demo media / creation description / Kane harness / verified evidence / limitations / GitHub revision / team with opt-in social handles / HTML deck link / TestMu authentic footer mark / consent-approved media / share image. Choose default Product × Proof unless the team explicitly prefers another mode.

## Ready-to-edit social post

\`We built [creation] at {{eventName}}. It [real user outcome]. The interesting part is our validation harness: [specific Kane component + feedback decision]. Here's what we actually verified: [evidence link or plain factual summary]. Demo, code and proof → [Ship Page URL] #KaneCLI\`

## Optional 4-part X thread

1. \`What we built: [name + problem]\`
2. \`How it works: [two concrete actions / architecture]\`
3. \`How Kane verified it: [tested behavior + evidence reference]\`
4. \`What we learned / what isn't covered yet: [truthful gap]. Full story: [link]\`

Every public share requires organizer/team approval and separately opted-in names/photos.`,
    },
    {
      id: "08",
      file: "08_PARTICIPANT_QUICKSTART.md",
      title: "Participant quickstart and outage card",
      md: `# {{eventName}} | participant quickstart and outage card

**Mission:** Build anything with an AI coding agent, including a standalone verification harness. Use Kane CLI to create repeatable verification and show real evidence. Ask for help early.

Wi-Fi: **{{wifi}}**  ·  Help on the ground: **{{helpContact}}**  ·  Official submission lock: **{{lock}}**

## Happy path

1. Confirm your Luma registration with staff, activate your **personal** Hacker Passport.
2. Use the verified \`{{site}}\` install instructions when available. Never paste private credentials into chat.
3. Confirm Kane CLI installed/authenticated using the official CLI help and \`kane-cli --version\`, \`kane-cli whoami\`.
4. Let Kane perform browser registration; click your own selfie capture if you consent, or skip / use phone QR.
5. Create/join a team separately (team registration locks {{teamLock}}), or use the teammate finder.
6. Run the idea checklist, choose meaningful Kane components, start building.
7. Capture test results and evidence as you go. Do not wait for submission hour.
8. Ask Codex for \`$hack-help\`, or use the QR helpdesk if that integration fails.
9. Submit project, repository revision and actual Kane proof before the **official hard deadline: {{lock}}**.
10. Generate/approve your optional Ship Page, HTML deck, 60s video and social kit.

## If an integration fails

- Codex skill/plugin missing: ask staff for the manual web route, continue building with the official Kane CLI.
- Webcam unavailable: use the selfie QR on your phone, or skip the optional image.
- Kane/remote execution down: preserve your tests/config and output, request mentor or product-infrastructure assistance. Do not assert verification that didn't run.
- Submissions down: go immediately to the staffed submission station for a numbered, time-stamped, signed receipt.

**Event URLs:** \`{{site}}/activate\`, \`/match\`, \`/live\`, \`/help\`, \`/ship\`. Your team hub has Submit, Help and Idea under \`/t/your-team\`.`,
    },
    {
      id: "09",
      file: "09_ANNOUNCEMENTS.md",
      title: "Preapproved staff announcements",
      md: `# Preapproved staff announcements (fill placeholders; don't announce unverified availability)

**Opening:** "Welcome to {{eventName}}. Build anything, including a validation harness itself. The real challenge is making agent-built software more trustworthy and faster to ship. Your personal passport is separate from team registration. Scan the activation QR; ask staff if anything fails."

**Team matching:** "Still looking for teammates? Scan the Team Finder QR. Share your skills and interests if you want to be discoverable. Teams choose whom to invite."

**First verification nudge:** "Your product is not done when the build is green. Run a meaningful Kane validation and capture the real evidence before adding more scope."

**Midday:** "Have a working core? Focus the next block on the harness: what do you verify, what happens when it fails, and what evidence informs your next action?"

**One hour before official lock:** "Stop expanding scope. Verify the critical workflow, capture evidence, rehearse the demo and check submission completeness. The submission clock on Mission Control is authoritative after organizer confirmation."

**Degraded service:** "[Service] is degraded. Check-in, help and submission remain available at [manual station]. Public TV metrics may be delayed. No submission will rely solely on the failed media/skill integration."

**Final submission:** "The official submission lock is {{lock}}. Submit now or, if the official service is down, bring your frozen project and evidence to the supervised backup receipt desk before the deadline."

**Showtime:** "The strongest work is not necessarily the largest app or the most tests. Show what you built, how Kane validated it and the evidence that supports your shipping decision."`,
    },
    {
      id: "10",
      file: "10_OFFLINE_LEDGER_PROCEDURE.md",
      title: "Entire backend outage: offline intake procedure",
      md: `# Entire backend outage: offline intake procedure

1. Activate incident SEV-0 and state the start time, officer and reason in the bound staff ledger or write-once numbered CSV; never silently rewrite. Incident commander: {{incidentCommander}}.
2. Print/display a static banner on TV (\`{{site}}/print/tv-fallback.html\`): \`ONLINE EVENT RECORDS DELAYED / STAFF DESK ACTIVE / LAST VERIFIED SYNC HH:MM\`.
3. Continue admissions against the last signed/exported approved Luma roster (version {{rosterVersion}}). Mark unconfirmed rows \`NEEDS_RECONCILIATION\`; do not create phantom approvals.
4. Create new personal IDs as temporary \`P-OFF-####\`; issue a physical card with no sensitive data or reusable session token. Match back to the canonical guest ID on recovery.
5. Record team changes in a separate numbered team ledger; require all participants' consent. Do not displace another team without organizer confirmation.
6. Record mentor help with H-ticket numbered paper. Pin only category and table in the publicly visible queue.
7. For submissions, capture the official server/backup trusted clock at actual receipt time and two signatures; include the exact commit SHA/artifact hash and evidence references. Never backdate a late arrival (lock: {{lock}}). Use official policy to handle borderline/late ambiguity.
8. After services recover, upload batches in \`/ops/recovery\` as \`manual_offline\` with original timestamps, signer IDs, hashes and source file; issue the canonical receipt; send confirmation only after successful reconciliation.
9. Keep an incident summary, affected attendee list, conflict list, retention/deletion plan and corrections log.`,
    },
  ];
  return docs.map((d) => ({ ...d, md: fill(d.md) }));
}
