# Hack OS: screen and option inventory (as built)

Generated from the hack-os code on 2026-10-22 by reading every page.tsx, its components and its actions. Labels are verbatim. Local test URL: http://localhost:3100. Demo data comes from `npm run db:seed:local` (teams demo-orbit / demo-atlas / demo-nova, participant gia@demo.test, staff organizer/mentor/judge/photographer @demo.test).


Who can see what (applies throughout):
- Team cookie: set by /login or /register, and by the hub's password plus "Who are you?" step. It opens /t/*. Navbar "My team" only shows with this cookie.
- Member cookie: set by /passport/login or /activate. getMember() accepts either cookie.
- Staff: logged in at /ops/login with email + one-time code, or the admin password. Roles are organizer, mentor, judge, photographer, and admin. Admin passes every role check. The admin password gives a staff identity with id=null, which cannot score.
- isAdmin(): true for the admin cookie or organizer/admin staff. It lets staff open any hub read-only ("Viewing as admin").

================================================================
GLOBAL CHROME

Navbar (src/components/Navbar.tsx)
- Logo plus event name → /
- Links: Schedule (/#schedule), Challenge (/#challenge), Prizes (/#prizes), Judges (/#judges), Rules (/#rules), Live (/live), Showcase (/ship), Help (/help), Passport (/passport).
- Mobile: "Toggle menu" hamburger.
- The active link turns lime (not for the /# links).

Account (src/components/Account.tsx), right side of the navbar
- Team cookie present: "My team · {team name}" → /t/{slug}
- Otherwise: "Log in" → /login, and "Register" → /register

Footer (src/components/Footer.tsx)
- The day: Schedule, The challenge, Prizes, Judges, Rules (/#…)
- Your team: Register, Log in, Team hub (/me)
- In the hub: Resources (/resources), Submit (/submit), Content hour (/content-hour), Judging (/judging). These are all redirect routes.

Hub tabs (src/lib/hub.ts, in order)
- Dashboard (/t/{slug}), Setup, Brief, Idea, Proof, Resources, Submit, Studio (→ /studio/{slug}, outside the hub), Photos, Content hour, Judging, Help.

Studio tabs (src/app/studio/[slug]/shell.tsx)
- Story (/studio/{slug}), Template & preview, Deck, Video, GTM kit, then "← Team hub" → /t/{slug}

Ops nav (src/app/ops/nav.ts, filtered by role; admin sees everything)
- Overview /ops [organizer]
- Check-in [organizer, mentor]
- Roster [organizer]
- Help [organizer, mentor]
- Submissions [organizer]
- Media [organizer, photographer]
- Judging, Integrations, Recovery, Announcements, Nudges, Settings, Override, Audit [organizer]
- Ops bar also shows "Kane Hack OS · Ops" → /ops, then "{name} · {ROLE}", then "Sign out".

================================================================
REDIRECTS

From next.config.ts (308):
- /admin → /ops
- /admin/:path* → /ops/:path*

From route.ts files, via redirectToHub (307):
- If the team cookie is present, they go to the team's hub tab. Otherwise they go to /login?next={tab}.
- /me → /t/{slug}, or /login
- /resources → /t/{slug}/resources, or /login?next=resources
- /submit → /t/{slug}/submit, or /login?next=submit
- /content-hour → /t/{slug}/content-hour, or /login?next=content-hour
- /judging → /t/{slug}/judging, or /login?next=judging

Other redirects:
- /team/[slug] (route.ts, 308) → /t/{slug}
- /ops/integrations/health (page, redirect) → /ops/integrations
- /studio (page): if logged in with a team → /studio/{teamSlug}. Otherwise a sign-in prompt.
- /ship/[slug]: a renamed slug gets permanentRedirect → /ship/{newSlug}

Redirects after form actions:
- register → /t/{slug}?welcome=1
- login → hub tab (from next)
- passport login → next, default /passport
- passport sign out → /passport/login
- create team → /team/{slug}/manage?created=1
- join team → /t/{slug}
- leave team (team/actions) → /team
- ops login → next, default /ops

================================================================
PUBLIC PAGES

/ | public
PURPOSE: Event landing pitch.
SECTIONS: Hero (CTAs) → NowNext strip ("Now …" / "Next …" + countdown) → HomeStats (Checked in, Teams active, Kane executions, Submissions finalized + freshness stamp; hidden before any data exists) → Schedule (key times only, "Log in for the full day") → Challenge (tracks) → Prizes → Judges (LinkedIn/X links) → Rules → Closer (CTAs) → Mentions → BootScreen (intro animation overlay).
ACTIONS:
- "Register your team" → /register (Hero and Closer)
- "Log in" → /login (Hero and Closer)
- NowNext "Next" link: before the event → /register; during → that schedule item's href (e.g. /submit#idea, /judging#mid)
- "Mission Control →" → /live
- Schedule items with an href link to /submit#…, /judging#…, /content-hour
STATES:
- NowNext text by phase: before = "Doors open at 9:30"; during = current item + "Live"; after = "That's a wrap…"
- Stats: "Live numbers unavailable right now" when the database is down.

/register | public (no login needed)
PURPOSE: Register a team or solo project and get a hub at /t/{slug}.
SECTIONS: PageHeader "Solo or squad, Get your page." Then a 5-step wizard, or 4 steps when solo. Stepper: 01 Team, 02 You, 03 Teammates, 04 Photo, 05 Finish.
FIELDS:
- Team step:
  - Mode toggle "We're a team" / "I'm solo"
  - "Team name" (or "Project or handle name"; text, max 40). Shows a live slug check under it: "Your page: /t/{slug}" or "Taken."
  - Track (radio chips)
  - "One-line idea" (text, max 200)
- You step:
  - Selfie (PhotoInput: "Take a selfie" / "Upload a photo" / "Remove")
  - "Full name"
  - "Email"
  - "LinkedIn" (prefix linkedin.com/in/)
  - "X / Twitter" (prefix @)
  - "Photos from the day": "Yes, include me" / "No thanks" (required choice)
- Teammates step (team mode only):
  - Rows with Name + Email and × to remove
  - "+ Add their photo and socials (optional)" per row
  - "+ Add another teammate · n/max"
- Photo step: group photo (Take a photo / Upload / Replace / Remove)
- Finish step:
  - "Team password" and "Confirm password" (min 4)
  - "Check it over" summary with an "Edit" link per row
ACTIONS:
- "← Back"
- "Next →". Label changes to "Skip, I'll add them later →" (no teammates) or "Skip for now →" (no photo).
- "Register team →" / "Register solo →" → /t/{slug}?welcome=1
STATES:
- Registration closed: only "Registration is closed. Find an organizer at the help desk…" is shown.
- Errors are checked per step.

/login | public
PURPOSE: Team login into the hub.
SECTIONS: PageHeader "Your team hub, Everything for the day." → form.
FIELDS: "Team name" (text); "Team password" (password).
ACTIONS:
- "Open team hub →" → /t/{slug}/{next tab}
- "Register your team" → /register
STATES: Error message. ?next= is carried through.

/me | route only (see Redirects)

/passport | public. Signed-out and signed-in views differ.
PURPOSE: The personal Hacker Passport: identity, next mission, settings.

Signed-out view:
- SECTIONS: "Your Hacker Passport." intro; "Sign in" card.
- FIELDS: "Your email"; "Password" (or "One-time code").
- ACTIONS:
  - "Open my passport →"
  - "Use a one-time code instead" / "Use a password instead"
  - "Have an activation code from the desk? Activate →" → /activate
  - "Not registered yet? Register →" → /register

Signed-in view:
- SECTIONS:
  - Left: the card, which can be flipped ("Flip passport"). Front shows name, role, handle, portrait, badge QR (→ /passport/b/{token}), and team. Back shows Skills, Focus, Team, Next, Milestones, Help, Sharing, Links.
  - Right: breadcrumb "Hack Day / Passport", name, P-code · team label · check-in status. GitHub flash banner. "Your stage" track (Solo, On a team, Shipped). NextMissionCard. Actions grid.
  - Panels below: Activation; Kane readiness; Profile and privacy (wide); Badge; Sign-in and devices.
- Mission cards (by participant state; primary action first, extra actions after "+"):
  - needs_activation: "Activate your passport", "Start activation" → /activate, + "Check Kane readiness" → /readiness
  - awaiting_selfie: "Open the camera step" → /activate
  - help_pending: "Show ticket" → /help/{code}, + "Ask a mentor" → hub help
  - needs_team: "Find teammates" → /match, + "Create team" → /team/new, + "Join team" → /team/join
  - needs_idea: "Validate idea" → hub idea
  - needs_kane_run: "Open project proof" → hub proof, + readiness
  - submission_due: "Open submission" → hub submit, + "Open project" → hub
  - submission_locked: "Go to the help desk"
  - shipped: "Open showcase" → /ship/{slug}, + "Open studio" → /studio/{slug}
- Actions grid (each shown only when it applies):
  - Join team (/team/join) and Create team (/team/new): only with no team
  - Find teammates (/match): no team, or team size under 5
  - Check Kane readiness (/readiness): always
  - Validate idea (/t/{slug}/idea): has a team
  - Ask mentor (hub help, or /help)
  - Open project (/t/{slug}): has a team
  - "Show ticket {code}" (/help/{code}): open ticket
- Activation panel: "Start activation →" or "Resume activation →" → /activate. When active, shows Receipt, Server time, Kane browser check status.
- Kane readiness panel: last report counts; "Open the readiness doctor →" → /readiness
- Profile and privacy panel:
  - GitHub status pill; "Verify with GitHub →" → /api/v1/auth/github/start (only if enabled and not verified)
  - Fields: "Display name", "X handle", "GitHub username", "Skills", "Interests"
  - 7 consent toggles: "Store my selfie for my passport", "Allow public team and event photos of me", "Match event photos to my selfie", "Mention my X handle in approved official posts", "Show me in teammate matching", "Share my team's short idea summary for matching", "Show my verified activity on the live wall"
  - "Save changes"
- Badge panel:
  - "Print my badge" → /passport/badge
  - "Lost my badge: rotate QR" (asks to confirm first)
- Sign-in and devices panel:
  - "Personal password" (8+) and "Set password"
  - "One-time code for another device" (shows the code)
  - Paired CLI / MCP clients list, each with "Revoke". Empty state links to /pair.
  - "Sign out" → /passport/login
- STATES: GitHub flash after ?github=linked / failed / taken / disabled / cancelled.

/passport/login | public
PURPOSE: Personal (member) login.
SECTIONS: PageHeader "Sign in, Just you." → form.
FIELDS: "Your email"; "Password" (team or personal) or "One-time code".
ACTIONS:
- "Open my passport →" → next (default /passport)
- toggle "Use a one-time code instead"
- "Team login" → /login
- "Activate" → /activate

/passport/badge | logged-in member (1-up), or organizer (8-up / ?codes=)
PURPOSE: Printable badge(s), ink on white.
SECTIONS: Toolbar, then badge(s): name, role tag (BUILDER / MENTOR / …), team, QR, "Offline ID" P-code.
ACTIONS:
- Print button
- "1 per page"
- "8-up sheet (checked in)" (organizers only)
- "Back to passport" → /passport
STATES: Signed out shows "Sign in to print your badge." with "Sign in →" → /passport/login?next=/passport/badge.

/passport/b/[token] | public (what a badge QR opens); staff see extra info
PURPOSE: Public passport view for a scanned badge.
SECTIONS:
- Passport front
- Name
- Staff only (when signed in as staff): Offline ID, Admission, Checked in, Help. "Open in check-in →" → /ops/checkin?q={P-code}
- Pills: "Activated" / "Not activated"; "Verified · Kane browser check"
- Back: Skills, Focus, Team (links to the showcase if public), Links
STATES: Revoked, expired, or invalid token shows a "Badge" down alert with a link to "Help desk" (/help).

/pair | logged-in member (signed out shows a prompt)
PURPOSE: Approve a `kanehack pair` / MCP device pairing code.
STATES and ACTIONS:
- Signed out: "Sign in first…" → "Sign in →" /passport/login?next=/pair?code=…
- No code: "Code from your terminal" (XXXX-XXXX) → "Look up →"
- Valid code: shows Code, Device, Signed in as, Expires. Buttons "Approve this device →" and "Deny".
- After approve: "Approved" + "See paired devices →" → /passport#devices
- Denied: message
- Expired or used code: stale alert, then the code entry form

/activate | public. Steps depend on server-stored state.
PURPOSE: Passport activation wizard.
SECTIONS: Left step rail: 01 Sign in, 02 Registration, 03 Identity, 04 Privacy, 05 Selfie, 06 Receipt. Step content on the right.
Steps:
1. Signed out: "Enter your activation code". FIELDS: "Activation code" (XXXX-XXXX); then "Your registration email" if needed. ACTIONS: "Continue →"; "Registered with a team? Sign in personally →" → /passport/login?next=/activate.
2. Admission, "Is this your registration?" Shows Name / Email / Source.
   - Matched: "Yes, that's me →" / "That's not me"
   - Roster pending: "Continue →"
   - Not approved or blocked: alert linking to /help, plus "I've been admitted at the desk, check again"
3. Identity, "Confirm who you are". FIELDS: "What should we call you?", "GitHub username", "X handle", "Skills", "Interested in". ACTIONS: "Verify with GitHub instead →"; "Confirm identity →".
4. Privacy, "Your privacy, one switch each": the same 7 consent toggles. "Save my choices →".
5. Selfie, "Human camera checkpoint". Pills "Waiting on you" / "Last upload failed".
   - Camera buttons: "Open camera" → "Shutter" → "Use this photo" / "Retake"
   - "Other options: phone camera or skip →": "Use my phone instead" (shows a QR and polls "Waiting for your phone…"), "Skip the photo. It never blocks anything."
   - Selfie storage turned off: "Continue without a photo →"
6. Receipt, "You're activated": receipt code, server time, checks list. "Open my passport →" → /passport; "Check Kane readiness" → /readiness.
STATES: Flag "activation" off shows a degraded alert linking to /passport.

/activate/phone?token= | public; the one-time token is the only credential
PURPOSE: Take the selfie on a phone (opened from the desktop QR).
SECTIONS: "Hi {name}", then the camera checkpoint (Open camera / Shutter / Use this photo / Retake).
STATES:
- Invalid token: "Phone link" stale alert
- Selfie storage off: degraded alert
- Done: "Photo saved… your receipt is {code}"

/readiness | logged-in member (signed out sees "Sign in →" /passport/login?next=/readiness)
PURPOSE: Kane CLI readiness checklist (11 checks).
SECTIONS:
- Counts: Passing / Need a fix / Not reported, plus freshness ("paired machine" or "self-reported")
- Check list, each with status pill (Verified · server saw it, ✓ Reported OK, Needs a fix, Check this, Not reported) and "Fix:" text
- Aside "Let your agent run it": text linking /pair, curl command to copy
- Aside "Check by hand": per check, command to copy and a radio Works / Broken / Not sure
ACTIONS: "Run browser checks and save".

================================================================
TEAM FORMATION

/team | logged-in member (signed out sees a prompt)
PURPOSE: Personal team home.
SECTIONS: "Signed in as" card (badge code, checked in); team card or "no team" options; aside "Matchmaker right now" (Looking for a team, Open seats).
ACTIONS:
- With a team: "Open team hub →" → /t/{slug}; "Roster & invites" → /team/{slug}/manage
- No team: "Start a team →" /team/new; "Join with a code →" /team/join; "Find teammates →" /match
- Signed out: "Team sign in →" /login; "Passport" /passport
STATES: After the team lock, the copy says you can still ship solo.

/team/new | logged-in member
PURPOSE: Create a team; you become captain.
FIELDS:
- "Team name"
- "Track" (select)
- toggle "Going solo"
- toggle "Recruiting" (disabled when solo)
- "Public summary" (textarea, 280)
- "Shared-device password" (optional, 8+)
ACTIONS: "Create team →" → /team/{slug}/manage?created=1
STATES:
- Signed out: "Sign-in options →" /team
- Already on a team: "Your team →" /team/{slug}/manage
- After the lock: warning banner

/team/join?code= | public to look up; member to confirm
PURPOSE: Two-step invite-code join.
FIELDS: "Invite code" (ABCD-EFGH) with "Look up code →" (GET form); then the checkbox "Yes, I want to join {team}" (notes "This moves you out of X" if you are on another team).
ACTIONS: "Join team →" → /t/{slug}
STATES:
- Invalid code: error + form
- Preview card: team, n/cap, track, expiry, summary
- Signed out: "Sign-in options →"
- Invite made for someone else
- Roster locked
- Team full

/team/[slug]/manage | team member or organizer. Others see a message + "Team hub →"
PURPOSE: Roster, invites, captain and organizer controls.
SECTIONS:
- Header: breadcrumb "Team / roster & invites", name, state
- "Team created." banner (?created=1)
- Roster panel
- Invites panel (member, not locked)
- Captain controls (captain only)
- Organizer override (organizer only)
- Aside: Lifecycle (recruiting → formed → active → roster locked → submitted), links, Leave team
FIELDS:
- Invite: "Expires after" (2h / 8h / 24h / 3 days), "Only for P-code"
- Captain settings: toggle "Recruiting", "Skills you're looking for", "Public summary", "Table", "Repository"
- Override:
  - "Change" select: Add a participant (by P-code) / Remove a member / Change captain / Reopen the roster / Lock the roster now / Change team size
  - Then, depending on the choice: "Participant P-code", "Member", or "Team size (1–4)"
  - "Reason" (required, min 10)
ACTIONS:
- "New invite" → shows "Invite code · shown once" plus a link to copy
- Per invite: "Revoke"
- Per roster row (captain, not self, unlocked): "Make captain", "Remove" (confirm)
- "Save settings"
- "Apply override"
- "We're formed" (captain, while recruiting); "Start building" (captain, while recruiting or formed)
- "Team hub →", "Idea lab" (/t/{slug}/idea), "Matchmaker" (/match)
- Leave team: checkbox + "Leave team". A captain with other members sees "Make someone else captain first".
STATES: Locked roster hides invites and buttons. Team full shows a "Team full" pill.

/match | public counts; logged-in member for everything else
PURPOSE: Matchmaker / team finder.
SECTIONS: Counts strip (Looking, Open seats, Recruiting teams, freshness, QR) → filter form → "Teams with open seats" cards → "People looking" cards; aside "Intro requests" and "Your profile".
FIELDS:
- Filter: Skill, Role, Available, Show (People and teams / People / Teams), then "Filter"
- Profile: toggle "Discoverable", "Strengths", "Interests", "Preferred work", "Availability", "Want to learn", "One line about you", then "Save profile"
- Intro: "Message" textarea
ACTIONS:
- Team card: "Ask to join →" (only when you have no team); otherwise "You're on a team already."
- Person card: "Request intro →"
- Intro form: "Send request" / "Cancel"
- Incoming proposed intro: "Accept" / "Decline". Outgoing: "Withdraw".
- Accepted intros show contact details; "LinkedIn →"
STATES:
- Flag "match" off: degraded alert
- Signed out: "Sign-in options →" /team
- "You're not discoverable yet" banner
- Empty results
- Suggestions failed to load

================================================================
TEAM HUB /t/[slug] (shell: src/app/t/[slug]/hub.tsx)

Gate (all tabs):
- Step 1, no team cookie: "Enter your team password" → "Open team page →"
- Step 2, cookie but no member chosen: "Who are you?" member select → "That's me →". On ?welcome=1 also shows "You're registered." with a link to copy.
- Staff (isAdmin) skip both steps and see the tab read-only ("Viewing as admin").
- Photos tab only: signed-out visitors see the public gallery instead of the gate.
- 404 if the slug is unknown.

Header (on every tab):
- Eyebrow "{Team|Solo} hub · {track}", team name, idea
- On non-dashboard tabs: "Signed in as {name}" + "Not you? Switch" / "Lock this device"
- Bell (notifications dropdown: pinned + feed; toast pop-ups with link and "Dismiss")
- Tab nav
- Mentions footer

/t/[slug] (Dashboard) | team member (staff read-only)
PURPOSE: Team progress checklist and roster.
SECTIONS:
- Photo consent prompt "One question for you" (if you haven't answered)
- Progress {done}/{total} + "Shipped minimum met" pill
- Checklist groups:
  - Idea: Devpost idea
  - Essentials: Repo, Live URL or run command, Kane CLI run report
  - Content · pick two or more: Video, Blog, X post, HN post
- Aside: "Signed in as" card (name, email, "Not you? Switch", "Lock this device"); Team n/max roster; "+ Add teammate"; "Share your page" link to copy; Activity feed
FIELDS:
- Per checklist row: checkbox + link input + "Save" (active only when changed). Shows "Due {time}" or "{who} · {time}".
- Add teammate: Name, Email, then "Add" / "Cancel"
- Consent prompt: "Yes, include me" / "No thanks"
STATES: Refreshes every 20s. Staff view is read-only.

/t/[slug]/setup | hub
PURPOSE: Pre-hack setup checklist, ticked per member.
SECTIONS: "Before 11:00 — Before you build, Do this first." counter n/N, Hermes statue. Step cards: Get online, Sign in to TestMu AI, Redeem your OpenAI coupon, Install Kane CLI, Register your team.
ACTIONS: Per card, the checkbox "Mark '{title}' done" (disabled for staff); value to copy; "{link label} →".

/t/[slug]/brief | hub
PURPOSE: Full event brief.
SECTIONS: Schedule (full, not key-only), Challenge, Assurance loop (Codex builds / Kane proves it; links), Rules. Static content, schedule links only.

/t/[slug]/idea | hub
PURPOSE: Idea lab: private idea, validator, freeze.
SECTIONS:
- State track: Draft → Validated → Shared → Selected → Frozen; "Ideas freeze at …" or pill "Frozen at …"
- Left: "Your idea" (Revision n), "Lock it in" (captain), "Revisions" list
- Right: "Idea Validator" (verdict pill, checklist or an advisory intro), buttons
FIELDS:
- "Working title"
- "What you're making" (project type select)
- "The idea" (private)
- toggle "Share a public summary with other teams"
- "Public summary"
- Validator: toggle "Use AI for this check"
ACTIONS:
- "Save idea"
- "Validate idea" (members only, when the flag is on)
- "Lock in this idea" (captain, when the idea is validated or shared and not locked)
- "Idea Radar" → /t/{slug}/idea/radar
- "Printable checklist" → /t/{slug}/idea/print
- "Roster & invites" → /team/{slug}/manage
STATES:
- Flag "idea" off: alert with "Print the paper worksheet" (/t/{slug}/idea/print?blank=1)
- Stale check: "your idea changed since this check"
- Verdict pills: Needs work / Ineligible as written / Not checked yet / …
- Locked or staff: read-only

/t/[slug]/idea/radar | hub (Idea tab highlighted)
PURPOSE: Overlap check against other teams' opt-in public summaries.
SECTIONS: "How it works"; "Your shared summary" (Shared / Not shared, link to the idea tab); results.
ACTIONS:
- "Check for overlap →" shows matches labelled possible overlap / similar angle / complementary
- Per match: "Request collaboration →"
STATES: Flag off: alert. Staff: explanatory note. "Nothing close among shared ideas."

/t/[slug]/idea/print | ?blank=1 is public; filled version needs team member or staff
PURPOSE: Paper team-and-idea worksheet (ink on white).
SECTIONS: Members table (max 4), invite code line, Type, "Eight-part validator (Y / N / U)", Improvement actions, an "Important" note.
ACTIONS: Print button. If not authorized: "Print a blank worksheet instead →".

/t/[slug]/proof | hub
PURPOSE: Kane runs, defects, milestones, evidence, coverage, commits.
SECTIONS (in order):
- Summary: Runs reported, Verified passes, Suspected defects, Confirmed open, Fixes re-verified; freshness; ingest-degraded alert
- "Report a run": install/pair commands to copy, and a manual form
- Runs (KaneRunCard: exit code, completion event, commit, duration, test table; "Why it is / isn't source-verified" expander; evidence link; report link)
- Defects (DF-n)
- Milestones (MS-n) + propose form
- Evidence (inspector + upload)
- Coverage (Designed / Proven / Criteria)
- GitHub commit timeline
FIELDS:
- Manual run: "Kane report link", "Exit code" (0 passed / 1 failed / 2 didn't run / 3 timed out), "Commit SHA (40 chars)", "Run / session id", "What it checked"
- Milestone: "Milestone", "The claim, in one or two sentences", "Backing run", "Evidence", "Who can see it" (Team only / Judges (teammate approves) / Public (teammate approves))
- Evidence upload: "Kind", run (optional), file (max 50 MB), "Visible to" (Team / Team + judges)
ACTIONS:
- "Log run (unverified)"
- Defect buttons:
  - Suspected: Cause select + "Confirm it's a real bug" / "Not a bug"
  - Confirmed: "We fixed it (re-run to verify)" / "Not a bug"
  - Otherwise: "Reopen"
- "Propose milestone"
- "Approve for {visibility}" (a teammate, or the solo builder) / "Withdraw"
- "Upload evidence"
- Evidence download link
STATES: No project record: alert. Refreshes every 30s. Staff are read-only.

/t/[slug]/resources | hub
PURPOSE: Resource library.
SECTIONS: Side index, then groups: Kane CLI, The Assurance loop, OpenAI, Build ideas, Content skills, Recording and demo. Cards with "Open →" links.

/t/[slug]/submit | hub
PURPOSE: Official submission: draft → preflight → finalize → receipt.
SECTIONS:
- StatusBand: "Official submission", Draft / Preflighted / receipt code; pills; "Locks … · server time …"
- If not frozen: SubmissionForm (left), aside Preflight / Finalize
- If frozen: Finalized view
- "Team credits"
- "Shipped prize bundle" checklist (same rows as the dashboard)
FIELDS (SubmissionForm, 7 groups):
- 01 The creation: "Project name", "Project type", "One-line pitch" (170), "Problem", "What we built", "How it works" (one step per line)
- 02 The harness: "Harness description"; "Kane components used" checkboxes (kane-cli run, generate, testmd run, testrun run, context ingest / extract / review, design tests, cover, maintain, sealed evidence packs, Test Manager, …); "4-step harness flow" (4 inputs)
- 03 Source and demo: "Repository URL", "Commit SHA", "Live demo URL", "…or run command"
- 04 Evidence: "Kane runs for this project" (checkbox list with trust pills), "Run report / evidence links"
- 05 Media: "Demo video URL"; screenshots ("Add screenshots", each with alt text, "Cover image" / "Make cover", remove)
- 06 Outcome: "Measured impact (up to 3)" (claim / value / unit / baseline / source), "Known limitations"
- 07 Links: "Devpost project", "Social posts"
ACTIONS:
- "Save draft"
- "Run preflight" (member, unlocked, draft exists)
- Finalize panel:
  - checkbox "We checked the saved draft…"
  - toggle "List our showcase publicly"
  - type the team name to confirm
  - "Finalize submission" (disabled until the name matches, the box is checked, and preflight passes)
- "Preview your showcase page (saved draft) →" → /ship/{projectSlug}
- When locked: "Ask the help desk →" → /t/{slug}/help
- Finalized view:
  - "Open receipt →" → /submit/receipt/{code}
  - "View page →" → /ship/{slug}; "HTML deck →" → /ship/{slug}/deck
  - Visibility: Public / Unlisted / Off (or "Organizers have hidden this page…")
- Credits: "Yes, name me" / "No, leave me off"
STATES:
- Withdrawn-by-organizer banner
- Locked: pill "Not submitted · locked"
- "{n} min left" when under an hour
- Preflight items: Ready / Missing / Uncertain / Optional
- Staff: "Viewing as staff. Only team members can finalize."

/t/[slug]/photos | public gallery; team members also manage photos
PURPOSE: Team photos from the day, plus photo settings.
SECTIONS:
- Gallery: count, grid, each with "Download"
- Signed out: "On this team? Sign in →" → /t/{slug}
- Members also see:
  - "Team photo" / "Your photo" editor (take / upload / replace / remove)
  - "Your photo consent": "Yes, include me" / "No thanks"
  - Aside "Your selfie · optional"
  - "Your handles": LinkedIn profile, X handle, then "Save handles"
  - Team list with each person's consent and links
STATES: "No photos yet."

/t/[slug]/content-hour | hub
PURPOSE: 5:00–6:00 content plan.
SECTIONS: Time bar. Steps, each linking to the matching resource: Record the video, Generate the blog…, Thread…, Post to HN, Finalize your submission.
ACTIONS:
- "Get the prompt pack" → /resources#content-skills
- "Final submission checklist" → /submit#final

/t/[slug]/judging | hub
PURPOSE: How judging works.
SECTIONS: JudgingTeaser ("100 points, Kane counts most."); JudgingBody (Rubric "Same rubric, Every track." and "Stage · 6:00 – 7:00 Top 7"); Judges. Static.

/t/[slug]/help | hub
PURPOSE: Team help desk.
SECTIONS: "Ask a mentor" form; "Your team's tickets" list; mentors on the floor ("Reach out to mentors").
FIELDS (ticket):
- "Category": Kane CLI, Test Manager, Auth / sign-in, CI / Cloud, Mobile, Idea, GitHub, Other
- "Table"
- "What's wrong?" (one sentence)
- "Priority": Low / Normal / High / Urgent
- "What have you tried?"
- "Kane run ID" (optional)
- "Anything else" (optional)
ACTIONS:
- "Open ticket →": shows a confirmation and "Follow {H-code} →" → /help/{code}
- "Check the docs first": suggestions from the docs, marked "Advisory/Rule-based draft"
- Ticket rows → /help/{code}
STATES: Staff: "Viewing as staff: tickets are opened by participants."

================================================================
HELP / RECEIPT / SHOWCASE

/help | public (signed-in member can open tickets)
PURPOSE: Help for anyone, including people without a team.
SECTIONS: PageHeader "Stuck? Ask a mentor." → view → mentors section.
STATES and ACTIONS:
- Staff: "Open the mentor queue →" → /ops/help
- Signed out: "Sign in →" → /login?next=help; "Can't sign in?" paper-ticket note
- On a team: "hub Help tab" link → /t/{slug}/help
- Same HelpDesk form and list as the hub tab.

/help/[code] | member or staff (signed out: "Sign in →" /login?next=help)
PURPOSE: One ticket's status.
SECTIONS:
- Header "Help / Ticket" (back to the hub help or /help), H-code
- Status + priority + freshness; summary; headline per status (waiting / claimed / in progress / escalated / resolved / closed / duplicate)
- Facts: Category, Table, Opened / Asked (slip), Claimed, Team, Kane run, Resolved, Merged into
- Tried / details; "Updates" message list
FIELDS:
- "Reply to the mentor" → "Send reply"
- When closed: "Still stuck? Say why" → "Reopen {code}" (not for duplicates)
ACTIONS:
- Staff: "Open in the mentor queue →" → /ops/help/{code}
- Merged-into link → /help/{orig}
STATES: Refreshes every 10s while open. Not found: "Back to help →".

/submit/receipt/[code] | team, judges, organizers (others get 404)
PURPOSE: Immutable submission receipt (prints as ink on paper).
SECTIONS:
- Header: code, team, status, Signed/Unsigned, "Received after lock · escalate" (manual receipts)
- Timing (server clock)
- What was submitted
- Evidence
- Prize eligibility (web submissions only)
- Integrity
ACTIONS:
- "Verify receipt" → pills for hash match/mismatch and signature valid/invalid/unsigned
- "Download JSON" → /submit/receipt/{code}/json
- Print
- "Showcase page →" → /ship/{slug}
STATES: A manual offline receipt shows officer / witness / incident rows and a disclaimer.

/ship | public
PURPOSE: Showcase gallery of public projects.
SECTIONS: PageHeader "Built fast, Shipped with proof." → filter chips "All · n" plus per-type "· n" (?type=) → project cards (cover, type, name, pitch, team, "Verified · n" or "Team reported").
ACTIONS: Card → /ship/{slug}.
STATES: "No public projects yet…" / "No public projects of this type yet."

/ship/[slug] | public, or unlisted (link only), or draft/hidden (team and organizers only)
PURPOSE: Public project showcase.
SECTIONS:
- ModeBanner (non-public): Draft preview / Off / Unlisted / Hidden by moderation
- Utility bar: "Showcase / Made at …" (→ /ship) + "Copy link" ("Copied ✓")
- Hero: type, name, pitch, summary; buttons; credits line
- Stage with tabs "The creation" (screenshots/video picker) and "The proof" (harness flow, runs with pills, "Full evidence timeline ↓")
- 4 stats: Product, Harness, Evidence, Repo (links to the commit)
- 01 The creation
- 02 The harness
- 03 Evidence ("Run report" links, participant-reported links)
- 04 Outcome + Known limitations
- 05 Ship it forward: team list and links
- Footer
ACTIONS:
- "See the proof →" (#proof)
- "HTML deck →" → /ship/{slug}/deck
- "Live demo ↗"
- "Present the HTML deck →"
- "Repository", "Submitted commit", "Live demo" (external)
STATES: 404 if the slug is unknown or the page isn't visible to you. A renamed slug redirects with a 308.

/ship/[slug]/deck | public (needs flag ship_pages and a published deck, else 404)
PURPOSE: Present the published HTML deck.
SECTIONS: Header "Ship Page / Deck" (→ /ship/{slug}), "Download offline HTML" (→ /ship/{slug}/deck/offline); presenter.
ACTIONS:
- Previous slide / Next slide
- "Present" (full screen, F)
- "Outline" (slide list)
- "Notes" (speaker notes, N)
- Print link → ?print=1
- ?print=1 view: "Print / Save as PDF"

================================================================
SHIP STUDIO (team only; staff read-only)

Gate:
- Signed out: "Sign in to your team first" + "Open team hub →" /t/{slug} + "Public Ship Page" /ship/{slug}
- Other team: "This studio belongs to another team"
Header:
- Breadcrumb "{team} / Ship studio" (→ /t/{slug}), project name
- "Public · v{n}" + "/ship/{slug} →", or "Not published"
- "Viewing as staff · read-only"
- Tabs

/studio | public page that redirects
PURPOSE: Sends a member to /studio/{teamSlug}. Otherwise: "Sign in to your team hub first…" + "Sign in →" /login.

/studio/[slug] (Story) | team
PURPOSE: Edit the one reviewed story and publish the Ship Page.
SECTIONS:
- 01 The creation: "Project name", "Creation type", "One-line pitch (outcome)", "Problem", "What we built", "How it works" (list, "Add step")
- 02 The harness: "Harness summary", "Stages" ("Add stage"), "Components" ("Add component")
- 03 Claim / evidence review "Proof": per claim "Claim", "Confidence", "Source", "Kane run", "Evidence artifact", "Commit SHA"; review pills Verified / Blocked / Team-reported; "+ Add proof claim"; remove
- 04 Outcome "Impact": "Claim", "Measure", "Unit", "Baseline", "Source"; "+ Add outcome"; "Limitations (what isn't verified yet)" ("Add limitation")
- 05 Links and media: "GitHub repository", "Live demo", "Repo commit", "Ship Page" (disabled); Visuals ("Kind", "Source (https or /path)", "Alt text", toggle "Approved", remove, "+ Add visual")
- 06 Team and consent: per person toggle "Credit publicly" (with consent status); toggle "We reviewed consent for everyone credited and pictured"
- History "Versions": "Load into editor"
- Sticky save bar: "Version n" / "Not saved yet", then "Save new version" (disabled if there are save errors)
- 07 Publish "Approve the public Ship Page": list of blockers; type the slug to confirm; "Approve and publish story v{n}". Before the first save: "Save your story first." Read-only: "Read-only: only team members can publish."

/studio/[slug]/preview | team
PURPOSE: Choose a showcase template and preview it.
SECTIONS: Template cards (6; ?template=), each with name, blurb, "Best for:", and a "Current" tag. Then the rendered preview of the latest saved story.
ACTIONS:
- Template card → ?template={id}
- "Use {name}" (write access, when the template isn't already in use)
- "See the publish checklist →" → /studio/{slug}#publish
STATES: "Nothing saved yet…" warning.

/studio/[slug]/deck | team
PURPOSE: HTML deck editor.
SECTIONS:
- Slides: outline list with Move up / Move down / Duplicate / Remove, and insert (max 20)
- Slide editor: "Slide type", "Ground" (radio), "Eyebrow", "Headline", "Body", Items / Stages / gaps list, "Media (https:// or /path…)", "Media alt text", "Speaker notes (published with the deck)"
- Theme "Look": "Density", "Headline font", "Ship Page QR on outcome"
- Files: "Reset to default" (confirm), "Import deck.json", "Export deck.json", "Download offline HTML (v{n})"
- Exports "PDF and PPTX": "Open print view →" or "Print the offline copy →", "Record PDF export", PPTX shown as "Unavailable" with "Check again"
- History "Deck versions": "Load"
- Publish "Publish a deck version": type to confirm (disabled until the Ship Page is published, a version is saved, and there are no unsaved changes)
- "Save new version"
- Advanced "Custom HTML deck (sandboxed preview)": textarea (200,000 bytes), "Save and preview in sandbox", "Preview without saving", "Restore default"; sandboxed iframe
- Fallback panel: "offline deck starter" link → /studio/{slug}/deck/export?starter=1
STATES: Flag "deck" off: alert + "Download the offline deck starter".

/studio/[slug]/video | team
PURPOSE: 60-second video storyboard (rendering not available).
SECTIONS: "Video is optional" note; panel "Real footage, honest captions" with pill "MP4 render · unavailable". 5 scenes: Name and outcome, See it work, Kane flow, Evidence, Why it matters.
FIELDS per scene: "Footage" (kind), "Footage link", file chooser ("Choose a file…" / "Replace file"), "Source in", "Source out", "Caption (on screen)", "Voiceover (optional)". Plus toggles "Label this as a screenshot walkthrough" and "Our team reviewed the captions".
ACTIONS: "Save storyboard (v{n})".
STATES: Footage pills (Real footage / Stills · labelled / Needs footage). "Storyboard complete…" message.

/studio/[slug]/gtm | team
PURPOSE: Launch kit.
SECTIONS:
- Badges: "Shipped · Verified submission" / "Not shipped yet"; "Verified with Kane CLI" / "Kane run not verified"
- Claims list with confidence pills
- Launch copy (KitEditor): X post, Thread (4 posts), README excerpt, Alt text, Elevator pitch, OG title, OG description. Each can be copied; edit mode shows fields.
- Social cards: 4 formats, each with "Download PNG"
ACTIONS:
- "Draft the kit" / "Regenerate from story"
- "Edit text" / "Stop editing"
- "Save edits"
- "Approve for sharing" (disabled until the Ship Page is published)
STATES: Pill "Awaiting team approval".

================================================================
LIVE / JUDGE / PHOTOGRAPHER

/live | public; ?ops=1 needs organizer or mentor
PURPOSE: Mission Control TV (full screen, live via SSE).
SECTIONS:
- Top bar: logo (exits to /), "Ops · private", Official time, Submissions lock countdown, Next on the agenda
- Freshness alert
- Main: Story panels rotating every 15–25s (title + "Panel n of m"). Each phase shows a different set of panels:
  - arrival: welcome, teams, activation, activity
  - build: activity, proof, tips, help
  - verify: loops, lesson, activity
  - submit: checklist, help
  - showtime: cards, activity
  - recap: aggregates, gallery
- Aside "What to do now": phase next-step CTA (e.g. "Scan: find a team" /match, "Stuck? Scan for help" /help, "Open Submit" /submit, "Browse the showcase" /ship), Announcements, Help line
- Metric strip with rings
- Footer: connection status, "Pause rotation" / "Resume rotation"
- QR codes: /help, /match, /ship
STATES:
- ?ops=1 while signed out: "Staff only." + "Staff sign in →" /ops/login?next=/live?ops=1 + "Public TV"
- Ops view: help queue table (Code, Category, Table, Status, Mentor), Open incidents, Integrations. Organizers also get PhaseControl ("Set phase", "Reason (audited)", "Apply").
- Offline: renders a snapshot with an offline banner
- Demo data chip

/judge | judge or organizer (others see StaffGate "Staff sign in →" /ops/login?next=/judge)
PURPOSE: Judge console.
SECTIONS:
- PageHeader jumps: "Printable scorecard" (/judge/scorecard), "Teams" (#queue)
- Admin-password warning; locked banner
- "Demo queue · top 7" (confirmed or not), linking to /judge/{id}?round=stage
- "Finalized submissions · n"
- "In progress · n"
- Each row: team, table, project, receipt, round pills (Mid / Final / Stage: not started / draft / n pts / committed), "Inspect & score →" → /judge/{id}

/judge/[id] | judge or organizer
PURPOSE: Proof inspector + score form.
SECTIONS:
- "← All teams"
- Header: table, type, team, members
- Left:
  - Receipt
  - Submitted snapshot / Current draft: "Ship page /ship/{slug} →", "Repository ↗", "Live demo ↗"
  - Kane runs ("Run report ↗")
  - Evidence ("Open ↗" → /judge/evidence/{id})
  - Milestones
  - Detections
- Right:
  - Round tabs: Mid evaluation / Final evaluation / Stage demo (Stage disabled until finalized; ?round=)
  - ScoreForm: per category (Harness innovation and Kane integration 30, Validation quality and evidence 25, Shipping velocity and automation 20, Technical execution and reliability 15, Creativity and demonstration 10) an anchor radio + evidence field; running total; "Comments" (or "Feedback for the team" for Mid); uncertainty field; checkbox "I'm ready to commit…"
  - "Save draft" / "Commit score"
STATES:
- Committed score is frozen (read-only)
- Judging locked
- Admin-password account cannot score

/judge/scorecard | public blank card; judges can print one card per submission (?all=1)
PURPOSE: Paper rubric card.
ACTIONS:
- "Print blank card" / "Print n cards"
- "One card per submission" (judges)
- "← Judge console"

/photo | photographer or organizer
PURPOSE: Photographer studio.
SECTIONS: Capture: "Take a photo" (camera), "Upload files". Then "Your recent photos" / "Recent photos · n" grid with status pills, linking to /photo/{id}.
STATES: Flag photo_studio off: alert pointing to /ops/media.

/photo/[id] | photographer or organizer
PURPOSE: Identify people in one photo and run the consent gate.
SECTIONS:
- "← Studio"
- Header: status / hold reason
- Image
- "People in frame · n", each with Match / Consent pills
- "Identify someone": "Scan badge QR" / "Stop camera"; "Find a person" (P-code, name or team) + "Search"; then "This person is in the photo"
- "Team": select + "Set team"; "Nobody identifiable in frame"
- "Consent gate": problems list + "Run consent check"
ACTIONS:
- Per person: "Yes, that's them" / "Not them" / "Remove"
- "Captions & social drafts →" → /photo/{id}/drafts
STATES: Published or rejected photos are locked.

/photo/[id]/drafts | photographer or organizer
PURPOSE: Caption drafts.
SECTIONS: "← Photo #id", "Captions", photo.
ACTIONS:
- "Draft 3 captions" / "Draft 3 more" (only after the consent check)
- Per draft (status draft): text + alt-text fields + "Save edit & re-check"
- Otherwise: text to copy + checks list
- Link → /ops/media#social
STATES: "Run the consent check on the photo first."

================================================================
OPS (/ops/*): staff header bar + role-filtered nav (see above)
Signed out: StaffGate shows "Staff only…" with a link to /ops/login?next=. Wrong role: "This section is for X staff… Check-in desk →".

/ops/login | public
PURPOSE: Staff sign-in.
FIELDS: "Staff email" + "One-time code", or "Admin password".
ACTIONS: "Sign in →" → next (default /ops); toggle "Use the admin password instead" / "Use email and code".

/ops | organizer
PURPOSE: Overview.
SECTIONS:
- Alerts: deploy freeze (→ /ops/settings#freeze), open incidents (→ /ops/recovery#incidents), integration problems (→ /ops/integrations)
- Phase pill, server time, lock countdown
- Stats: Registered; On roster (/ops/roster); Checked in (/ops/checkin); Reconcile (/ops/roster?filter=needs_reconciliation); Help open (/ops/help); Receipts (/ops/submissions)
- Last announcement
- Shortcuts: Check-in desk, Import Luma CSV, Announce, Recovery, Integrations, Settings, Audit log, Override
- Teams table with AdminBar
ACTIONS:
- "Registration open · close it" / "closed · reopen it"
- "Nudges" → /ops/nudges
- "Teams CSV" / "Members CSV" (/ops/export?type=)
- "Sign out"
- Table: search, track filter, filter (All teams / Shipped minimum / Missing items / Solo only / No team photo / Not everyone consented); team name → /ops/t/{slug}

/ops/checkin | organizer, mentor
PURPOSE: Check-in desk.
SECTIONS: Stats (Checked in, Walk-ins, Not admitted, No roster match) → "Find a person" → results → "Walk-in" → "If the network drops" (links to /ops/roster/print, /ops/roster/export, /ops/recovery/print/stock, /ops/recovery).
FIELDS:
- Search ("Name, P-1234, Luma id or exact email") + submit; "Scan QR" / "Stop scan"
- Walk-in: "Full name", "Email", "Name on badge", "Note"
ACTIONS:
- Hit rows: pills (No roster match / Admitted · check in / Needs reconciliation / Not admitted)
- "Badge" → /ops/checkin/badge/{code}
- "Check in {first} →"
- Organizer only: "Organizer: admit anyway…" → "Why admit?" + "Admit and check in"
- Mentor: "Ask an organizer…"
- "Admit as walk-in and check in"
- "Admit walk-in →": on success, "Print or show badge →"

/ops/checkin/badge/[code] | organizer, mentor
PURPOSE: Printable P-code badge.
ACTIONS: "← Check-in"; "Print badge".
STATES: "No member with code X."

/ops/roster | organizer
PURPOSE: Admissions roster and reconciliation.
SECTIONS:
- SubNav: Roster / Import CSV / Printable roster / Check-in desk
- Stats
- "Reconcile registrations now"
- "CSV export" (/ops/roster/export)
- Guests: search "Name, Luma id or P-code"; filter chips All / Admitted / Checked in / Not here yet / Walk-ins / Not admitted / Needs reconciliation / No registration
- Table: Name, Source, Luma, Admission, Checked in, Member (P-code → check-in)
- "Registered, not on the roster · n"

/ops/roster/import | organizer
PURPOSE: Luma CSV import with a diff.
FIELDS: "CSV file", "Source version".
ACTIONS:
- "Preview changes" → diff tables New / Changed / Not in this file / Rejected rows
- checkbox "Mark the n guests missing… as not admitted"
- "Import n changes" (confirm)
- Template download link
- "Recent imports" list

/ops/roster/print | organizer
PURPOSE: Signed printable roster.
ACTIONS: SubNav; "Print roster".
SECTIONS: Admitted table and Not admitted / reconcile table (✓, Name, P-code, Team, Source, In); signature.

/ops/help | mentor, organizer
PURPOSE: Mentor queue.
SECTIONS: Slack alerts; sound toggle; filter All / Mine; metrics; three columns Waiting / Claimed / In progress; Recently finished; Paper tickets (two expanders).
ACTIONS:
- Card actions: "Claim" (when claimable), "Start" (claimed and it's yours or you're an organizer), "Resolve", "Details →" → /ops/help/{code}
- "Add one paper ticket": "Slip number", "Opened at", "Status on slip", "Team", "Participant", "Table", "Category", "Priority", "Safe run ID", "Problem in one sentence", "What was tried", "Claimed by", "Claimed at", "Resolved at", "Staff initials", "Resolution / next action". Then "Add paper ticket".
- "Import mentor-queue CSV": "CSV file" / "Or paste rows" → "Import CSV"
STATES: Refreshes every 10s. "! " marks tickets waiting over 10 minutes.

/ops/help/[code] | mentor, organizer
PURPOSE: Work one ticket.
SECTIONS: Facts (Team links to /ops/t/{slug}; Duplicate of link); Actions; Messages (staff-only notes marked).
ACTIONS:
- "Claim"
- "Start" (owner)
- "Release to queue" (reason)
- "Mark resolved" (resolution)
- "Escalate" (reason required)
- "Mark duplicate" (original code)
- "Save triage" (category / priority / table)
- "Close" (organizer only)
- When closed: "Reopen"
- Reply: "Reply or note" + checkbox "Staff-only note…" → "Send"

/ops/integrations | organizer
PURPOSE: Health of outside dependencies.
SECTIONS:
- Problem alerts
- "Run checks now"
- Systems list: Database, Blob, Slack, GitHub, Luma, Kane ingest, Renderer, X, Cron, AI Gateway, Live TV stream. Each shows a status pill (Paused / Down / Degraded / Verified OK / OK · not rechecked / Unknown), last OK / error, what it affects, and the manual fallback.
- Outbox stats: Queued, Retrying, Gave up, Sent 24h
ACTIONS:
- "Pause · mark status…" opens "Pause X" / "Resume X" (reason) and "Mark status" ("Status", "What we know")
- "Drain outbox"
- "Requeue"

/ops/integrations/health | redirect → /ops/integrations

/ops/judging | organizer
PURPOSE: Aggregate scores, demo queue, lock, awards.
SECTIONS: Open/Locked pill; drafts count; aggregate table (#, Team → /judge/{id}, Final, per-category columns, Stage, Mid notes, Drafts); Demo queue; Judge lock; Awards.
ACTIONS:
- "Summary CSV" / "Scores CSV" (/ops/judging/export?type=)
- "Printable scorecard"
- Demo queue: slot selects + "Confirm demo queue"
- Judge lock: type the phrase + "Lock judging". When locked: "Reason to reopen" + "Reopen judging".
- Awards (only after lock): "Award" + "Team" → "Record award"; "Remove"

/ops/media | organizer, photographer
PURPOSE: Photo review queue and social posts.
SECTIONS: Status counts; "Photo studio →" (/photo); "Review queue · n"; "Social posts · n" ("Buffer CSV (approved)" → /api/v1/social/export); recent published/rejected.
ACTIONS:
- Photo cards:
  - "Approve" with "Alt text" (organizer; status consent_checked or caption_drafted)
  - "Publish to gallery" (organizer; approved)
  - "Download"
  - "Hold" / "Unpublish & hold"
  - "Reject" (reason)
- Draft posts:
  - "Approve post" / "Approve (re-runs checks)", "Reject" (organizer; draft)
  - When approved: "Post to X" (only if X is ready), "Mark posted by hand" (URL), "Reject"
  - "View post ↗"
STATES: Photo uploads off, or X not configured: alerts.

/ops/announcements | organizer
PURPOSE: TV and hub announcements.
SECTIONS: Compose (preapproved template buttons; "Title", "Body", "Link", "Where" (TV + hub / TV only / Hub feed only / Staff only), "When" (Now / In 5/15/30 minutes / In 1 hour)); Scheduled list; Published list.
ACTIONS:
- "Publish announcement →" (confirm; blocked while [placeholders] remain)
- Per row: Retract → reason + "Take down"
- "Nudges" link

/ops/nudges | isAdmin (admin cookie or organizer). Otherwise the login prompt.
PURPOSE: Team reminders.
SECTIONS: "← All teams" (/ops); "Schedule reminders" → "Seed schedule reminders"; "Send or schedule a nudge"; Upcoming list; Sent list.
FIELDS: Title, Body, Link, "Audience" (All teams / a team), "When" (Now / At a time on event day / Minutes from now), then time or minutes.
ACTIONS: "Send nudge →" / "Schedule nudge →"; delete per nudge.

/ops/override | organizer
PURPOSE: Signed, witnessed exceptions.
FIELDS:
- "Override": Admit a roster guest / Revoke admission / Undo a mistaken check-in / Record a deadline exception / Compensating note
- "Target"
- "Record type" (note only)
- "Reason"
- "Witness (a second person)"
- "Incident id"
- Type "override" to confirm
ACTIONS: "Apply signed override". Recent overrides list; "In the audit log" → /ops/audit?action=override.

/ops/recovery | organizer, mentor (organizer-only sections marked)
PURPOSE: Paper/offline fallbacks and reconciliation.
SECTIONS:
- Jump links: Incidents, Manual check-in, Paper help, Manual receipt, CSV ledgers, Reconciliation, Print kit
- Incidents (organizer): "Open incident" ("Subsystem", "Severity", "What's happening"); per incident "Close {code}" with "What restored service"
- Manual check-in: links to /ops/checkin, /ops/roster/print, /ops/recovery/print/stock
- Paper help ticket: "Paper ticket id", "Opened at (paper time)", "Participant P-code", "Team", "Table", "Category", "Priority", "Problem in one sentence", "What has been tried" → "Add paper ticket"
- Manual submission receipt (organizer): "Paper receipt id", "Team slug", "Received at (actual)", "Submitted by (P-code)", "Project name", "Repository URL", "Exact commit SHA", "…or archive SHA-256", "Live / demo URL", "Harness / Kane components", "Evidence ids…", "Known caveats…", "Submission officer", "Independent witness", "Incident id", checkbox for participant confirmation → "Record manual receipt" (confirm)
- CSV ledgers (organizer): "Ledger" select + "CSV file" → "Upload ledger"; template downloads
- Reconciliation table (organizer): Ref, Record, Paper time, Entered, State (Needs review / Manual · unverified / Exception); "Download as CSV" (/ops/recovery/reconciliation)
- Print kit cards: /ops/recovery/print, …/signage, …/stock, /ops/roster/print, /print/brief.html, /print/tv-fallback.html

/ops/recovery/print | organizer, mentor
PURPOSE: The 11 fallback documents.
ACTIONS: "Print all 11" / "Print {file}"; doc chips "All" plus each document (?doc=); "QR signage" and "Paper stock" links.
STATES: Database unreadable alert; "Blanks" alert → /ops/settings#values.

/ops/recovery/print/signage | organizer, mentor
PURPOSE: QR posters for /activate, /help, /match, /live.
ACTIONS: "Print all posters".

/ops/recovery/print/stock | organizer, mentor
PURPOSE: Pre-numbered slips.
ACTIONS: Kind chips "P-OFF badges" / "H- help tickets" / "S- receipt stubs" (?kind&from&count); next-batch link; "Print n slips".

/ops/settings | organizer
PURPOSE: Event policy.
SECTIONS (jump links): Deadlines, Phase, Status, Flags, Staff & roles, Event values, Deploy freeze.
FIELDS:
- Deadlines (datetime): Doors open, Team registration locks, Idea locks, Submission locks (official), Demos start, Event ends, plus a reason
- Phase: "Follow the schedule" / "Force {PHASE}", plus reason
- Status: "Public event status", Registration Open/Closed, reason
- Flags (toggles): activation, match, idea, kane_ingest, live_sse, ship_pages, deck, photo_studio, social_publish, video, mcp, …
- Staff: Email, Name, Role. Per staff account: "Issue code", "Deactivate" / "Reactivate"
- Revoke participant tokens: "P-code", reason
- Event values: Venue, Wi-Fi network/password, On-ground help, … plus privacy rules and brand notes textareas
- Freeze: reason
ACTIONS:
- "Save deadlines" (confirm)
- "Set phase"
- "Save status"
- "Save flags"
- "Save staff"
- "Revoke tokens" (confirm)
- "Save event values"
- "Freeze deploys" / "Lift freeze"

/ops/submissions | organizer (otherwise the login prompt)
PURPOSE: All submissions.
SECTIONS: Stats (Finalized x/y, Open drafts, Manual receipts, Lock (server)); "All teams" table; "After the deadline"; "Manual receipt (offline backup)".
ACTIONS:
- Table: search ("team, project or S-code"); filter (All teams / Finalized / locked / Not finalized / Manual receipts / Hidden showcases)
- Columns: Team/project, Status, Receipt, Finalized, Commit, Showcase
- "Manage" / "Close" per row:
  - "Hide by moderation" / "Restore" (reason)
  - "Rename (old link redirects)" (new slug)
  - "Withdraw (history is kept)" (reason)
- "Mark every finalized submission locked" (disabled before the lock)
- Manual receipt form: team, "Actually received at", "Project name", project type, "Repository URL / approved equivalent", "Live / demo URL", "Exact commit SHA", "…or archive SHA-256", "Harness description / Kane components", "Evidence IDs…", "Known caveats…", "Submitted by (participant)", "Independent witness", "Incident / reference ID", checkbox "The participant read back and confirmed…" → "Record manual receipt". After saving: "Open receipt →" / "Record another".

/ops/audit | organizer
PURPOSE: Append-only audit log.
FIELDS (filters): actor type, actor, action, resource type, resource id.
ACTIONS: "Filter"; "Clear"; "Apply a signed override →" (/ops/override); resource link narrows the filter; "Details" expander per row; "Older →" (paging).

/ops/t/[slug] | isAdmin (otherwise the login prompt)
PURPOSE: Staff read-out of one team.
SECTIONS: "← All teams" (/ops); header (solo/team, track, registered, link /t/{slug}); Members · n (selfie, mailto email, LinkedIn, X); Progress n/N (+ "shipped"); Team photo; Consent per person; Event gallery · n; Activity. Read-only, links only.

================================================================
NOTES FOR THE WIREFRAME MAP

1. There are two separate login systems: team (/login, which opens the hub) and member (/passport/login, which opens the passport, pair, readiness, team and match pages). The navbar "My team" only appears with the team cookie. Someone logged in only through the passport sees "Log in / Register" in the navbar.
2. Some links point at old routes that now redirect:
   - The footer and several in-hub buttons point at /resources#…, /submit#…, /content-hour and /judging. These redirect to the hub tab, and browsers keep the #fragment.
   - Live TV's "Open Submit" points at /submit.
   - The Studio tab in the hub jumps out to /studio/{slug}.
3. There is a URL with no page: /t/[slug]/notifications is a route.ts, not a screen. It feeds the notifications bell in the hub header.
================================================================
EVENT-DAY-FLOW BRANCH (event-day-flow, from hack-os, 2026-10-23)

Participants do nothing before the event: check in at the desk (/ops/checkin, unchanged), sit down, then
Profile → Team → Activate → Codex → Hub. A progress bar (src/components/FlowProgress.tsx) sits on
/register, /team, /match and /activate. Sessions are personal only (hd_member, personal: true); there is no
team password and no team cookie. The header shows the profile photo (or initials) top right and a
"Continue →" link to wherever the person is (/me).

Added
- /register: profile builder. (a) name, Luma email (linked to the roster guest by email hash, silently),
  skills, interests, optional GitHub/X, personal password (8+). An email that already has an account needs
  its password or a desk one-time code (sign-in code or desk activation code); never adopted silently.
  (b) photo: explicit "Store my photo" consent, human shutter (HumanCameraCheckpoint), or skip.
  (c) "Are you looking to form a team?" yes → /match, no → /team. ?edit=profile / ?edit=photo reopen a step.
- /team (rebuilt): create a team (captain, max 4, "open seats in matchmaking" toggle) or join with an invite
  code (?code= prefilled); on a team: roster with avatars, invites, join requests, captain settings, leave.
- /match (rebuilt): the pool (name, photo, skills, interests; never email/phone), teams with open seats,
  "Ask to join" (any teammate accepts on /team and the requester is added), intros, leave pool.
- /activate (rebuilt): 3-step checklist: TestMu AI sign-up (link + tick), TestMu AI plan (server-side claim,
  stubbed outside production), OpenAI Codex credit code (from the uploaded pool) + tick. All done → /setup.
  /activate?code=… (desk activation code) → /passport/login?mode=code.
- /me: resume (redirects to the current step).
- /ops/matchmaking: everyone in the pool with skills; tick 2–4 and form a team (audited).
- /ops/activation: Codex code upload (preview, dedupe), inventory, per-participant checklist progress with
  masked codes, audited reveal / revoke / reassign, CSV export (/ops/activation/export).
- /api/v1/profile/photo: the photo upload (personal session, browser only).

Changed
- /passport: lean profile (avatar, name, skills, interests, team, edit profile / photo, remove photo,
  paired devices + /pair link, password, one-time code for another device, sign out).
- /passport/login: personal password or desk code (sign-in or activation code). No team password.
- /t/[slug]/*: opens for any personally signed-in member of the team; no password gate or "Who are you?".
  The dashboard's "Add teammate" is now "+ Invite a teammate" → /team.
- Navbar: "Passport" link removed; right side is Sign in / Start here, or Continue → + avatar.
- Footer: Your day (Start here, Sign in, Continue, Set up Codex) and During the event (Matchmaking, Help,
  Live, Judging).

Removed (redirect in next.config.ts)
- /login → /passport/login · /team/new, /team/join, /team/[slug]/manage → /team (query kept) ·
  /activate/phone → /register · /docs → /setup · /resources, /content-hour → /me.
- The team-first register form, the team-password hub gate, the Kane-driven activation steps (consent
  wizard, selfie, phone handoff UI). The /api/v1/activate/* routes and MCP tools stay for kanehack.

Kept unchanged: hub tabs and submission, /studio, /ship, /judge, /judging, /live, /ops/* (check-in, help,
recovery, roster import, settings…), /setup, /pair, /readiness, /help.

Placeholders: src/data/activation-steps.ts ([CODEX_REDEEM_INSTRUCTIONS], [CODEX_REDEEM_URL]).
Codex code upload format: CSV with a `code` header column (other columns kept per code as `extra`), or one
code per line; 4–128 chars of letters, digits, '-', '_', '.'; duplicates skipped.
TestMu AI claim: POST TESTMU_TRIAL_CLAIM_URL (default https://backend.lambdatest.com/api/trials/hack-day/claim)
only when VERCEL_ENV or HACKOS_ENV is production; elsewhere a stub (TESTMU_CLAIM_STUB=success |
not_registered | invalid | error | timeout), or a non-TestMu mock URL.
