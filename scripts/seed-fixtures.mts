// Fixtures for the kane-cli suite in .testmuai/tests, on top of seed-local's demo data.
// Imported by scripts/seed-local.mts after its own wipe and seed; never run on its own.
// Like seed-local it is LOCAL ONLY and re-runnable: everything it creates is a demo-* team,
// an @demo.test person, a gst-* roster guest or a demo-run-* Kane run, which seed-local wipes.
// What each fixture is for, and which assurance.json variable points at it: docs/hack-os/TEST_FIXTURES.md.
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";
import * as F from "./fixtures-data.mts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("seed-fixtures: DATABASE_URL is not a local database; refusing.");

const { query } = await import("../src/lib/db.ts");
const { registerTeam } = await import("../src/lib/teams.ts");
const { hashPassword } = await import("../src/lib/password.ts");
const sub = await import("../src/server/submission.ts");
const help = await import("../src/server/help.ts");
const session = await import("../src/lib/session.ts");
const ideas = await import("../src/server/ideas.ts");
const story = await import("../src/server/story.ts");
const deck = await import("../src/server/deck.ts");
const auth = await import("../src/server/auth.ts");
const kane = await import("../src/server/kane.ts");
const { jar } = (await import("../tests/support/stubs/next-headers.mjs")) as { jar: Map<string, string> };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const emailHash = (e: string) => sha(e.trim().toLowerCase());
const warnings: string[] = [];
const soft = async <X,>(label: string, fn: () => Promise<X>): Promise<X | null> => {
  try {
    return await fn();
  } catch (e) {
    const err = e as { code?: string; userMessage?: string; message?: string };
    warnings.push(`${label}: ${err.code ?? ""} ${err.userMessage ?? err.message ?? String(e)}`.trim());
    return null;
  }
};

/** Act as `email` with a personal session (the cookie jar is the test loader's stub). */
async function actAs(email: string) {
  jar.clear();
  const [m] = await query<{ id: number }>("select id from members where lower(email) = lower($1)", [email]);
  await session.setMemberSession({ memberId: m.id, personal: true });
  return m.id;
}
async function memberRow(email: string) {
  const [m] = await query<Record<string, unknown> & { id: number; team_id: number | null; name: string }>(
    "select id, team_id, name, display_name, email, 'participant' as role, public_code, checked_in_at, activated_at, deleted_at from members where lower(email) = lower($1)",
    [email],
  );
  return m;
}
const staffRow = async (email: string) =>
  (await query<{ id: number; name: string; email: string; role: "mentor" | "organizer" | "judge" | "photographer" | "admin" }>("select id, name, email, role from staff_accounts where email = $1", [email]))[0];

// ── Teams and people ──────────────────────────────────────────────────────────
const teamId: Partial<Record<F.TeamKey, number>> = {};
const projectId: Partial<Record<F.TeamKey, number>> = {};
for (const k of Object.keys(F.T) as F.TeamKey[]) {
  const t = F.T[k];
  const r = await registerTeam({
    name: t.name, track: t.track, idea: t.idea, isSolo: !!("solo" in t && t.solo), password: t.password, photoUrl: null, captainConsent: true,
    members: t.people.map((p) => ({ ...p, photoUrl: null, linkedin: null, xHandle: null })),
  });
  teamId[k] = r.teamId;
  projectId[k] = (await query<{ id: number }>("select id from projects where team_id = $1", [r.teamId]))[0].id;
}
for (const l of F.LONERS) {
  await query("insert into members (team_id, name, email, email_hash, display_name) values (null, $1, $2, $3, $4)", [l.name, l.email, emailHash(l.email), l.display]);
}
await query("update members set display_name = $2 where lower(email) = $1", [F.P.email, F.P.display]);
await query("update members set display_name = $2 where lower(email) = $1", [F.O.email, F.O.display]);

// Personal passwords: everyone gets the demo password; staging captains get the
// staging team password as their personal one, so the captain can finalize.
const demoHash = await hashPassword(F.PERSONAL_PASSWORD);
await query("update members set password_hash = $1 where email like '%@demo.test' and password_hash is null", [demoHash]);
const stagingHash = await hashPassword(F.STAGING_PASSWORD);
const STAGING: F.TeamKey[] = ["wren", "tern", "robin", "gannet", "egret", "dove", "finch"];
for (const k of STAGING) await query("update members set password_hash = $1 where lower(email) = $2", [stagingHash, F.captainOf(k).email]);

// Consents. Everyone on a fixture team may be credited and photographed; Pat has
// photos on and X mentions off (the passport test flips them); Olu never opted in to discovery.
const fixtureEmails = Object.values(F.T).flatMap((t) => t.people.map((p) => p.email));
const mids = await query<{ id: number; email: string }>("select id, email from members where email = any($1::text[])", [fixtureEmails]);
for (const m of mids) {
  for (const c of ["photo_publication", "activity_publication"]) {
    await query("insert into member_consents (member_id, category, granted, source) values ($1, $2, true, 'web')", [m.id, c]);
  }
}
const pid = (await memberRow(F.P.email)).id;
const oid = (await memberRow(F.O.email)).id;
await query("insert into member_consents (member_id, category, granted, source) values ($1, 'social_mention', false, 'web')", [pid]);

// ── Team states ──────────────────────────────────────────────────────────────
await query("update teams set recruiting_open = true, state = 'formed' where id = any($1::bigint[])", [[teamId.kestrel, teamId.heron]]);
await query("update teams set max_size = 4, recruiting_open = false where id = $1", [teamId.quartet]);
// An invite that expired yesterday (expired_team_invite).
const EXPIRED_INVITE = "KH7X-EXP9";
await query(
  `insert into invitations (team_id, invite_hash, created_by, expires_at, created_at)
   values ($1, $2, (select captain_id from teams where id = $1), now() - interval '1 day', now() - interval '2 days')`,
  [teamId.inviter, sha(`invite:${EXPIRED_INVITE.replace(/[^0-9A-Z]/g, "")}`)],
);
// A valid, unexpired invite to the full Quartet (full_team_invite_code): joining with it
// must be refused because the team is full, not because the code is missing or bad.
await query(
  `insert into invitations (team_id, invite_hash, created_by, expires_at)
   values ($1, $2, (select captain_id from teams where id = $1), now() + interval '2 days')`,
  [teamId.quartet, sha(`invite:${F.FULL_TEAM_INVITE.replace(/[^0-9A-Z]/g, "")}`)],
);
// Valid invites to team one (Kestrel) and team two (Heron) for the two-team join test.
for (const [k, inv] of [["kestrel", F.TEAM_ONE_INVITE], ["heron", F.TEAM_TWO_INVITE]] as const) {
  await query(
    `insert into invitations (team_id, invite_hash, created_by, expires_at)
     values ($1, $2, (select captain_id from teams where id = $1), now() + interval '2 days')`,
    [teamId[k], sha(`invite:${inv.replace(/[^0-9A-Z]/g, "")}`)],
  );
}

// ── Roster: approved guests for Pat, Olu and Quinn ───────────────────────────
for (const [gid, person, member] of [
  [F.GUEST.pat, F.P, true],
  [F.GUEST.olu, F.O, true],
  [F.GUEST.quinn, F.QUINN, false],
] as const) {
  const [g] = await query<{ id: number }>(
    `insert into roster_guests (source, luma_guest_id, name, email_hash, email_hint, approval_status, admission_status, source_version, staff_reference, member_id)
     values ('luma_csv', $1, $2, $3, $4, 'approved', 'admitted', 'demo-v1', 'demo-seed', (select id from members where lower(email) = $5)) returning id`,
    [gid, person.name, emailHash(person.email), `${person.email[0]}***@demo.test`, person.email],
  );
  if (member) await query("update members set guest_id = $2, admission_state = 'admitted' where lower(email) = $1", [person.email, g.id]);
}

// ── Staff: a second mentor ───────────────────────────────────────────────────
for (const s of F.STAFF2) await query("insert into staff_accounts (email, name, role) values ($1, $2, $3)", [s.email, s.name, s.role]);
const mentor = await staffRow("mentor@demo.test");

// ── Help tickets ─────────────────────────────────────────────────────────────
async function ticket(email: string, input: Record<string, unknown>) {
  const m = await memberRow(email);
  return help.createHelpTicket(
    { member: m as never, actor: { type: "member", id: m.id, label: m.name }, source: "web" } as never,
    input,
  );
}
const waiting = await ticket(F.P.email, { category: "kane_cli", summary: F.HELP.waitingSummary, details: "It prints the plan and then nothing for five minutes.", tried: "Re-ran with --dry-run; the plan is valid.", priority: "normal" });
const resolved = await ticket(F.P.email, { category: "test_manager", summary: F.HELP.resolvedSummary, details: "The test_url in run_end opens a 404.", tried: "Signed out and in again.", priority: "normal" });
await help.claimHelpTicket(resolved.ticket.code, mentor as never);
await help.transitionHelpTicket(resolved.ticket.code, mentor as never, "start" as never, {});
await help.transitionHelpTicket(resolved.ticket.code, mentor as never, "resolve" as never, { reason: "The project had been moved; re-linked the folder with kane-cli config set-project." });
// The sensitive ticket: Kit pasted a secret, a private-repo excerpt and selfie data
// into the description through the normal participant path (the app scrubs what it can).
const sensitive = await ticket("kit@demo.test", {
  category: "kane_cli",
  summary: F.HELP.sensitiveSummary,
  details: [
    `My env has token=${F.HELP.secretMarker}-sk-live-0000 and the run still fails.`,
    `From our private repo demo-org/kestrel-core (private): ${F.HELP.privateRepoMarker} const PAYMENT_KEY_PATH = "/srv/keys";`,
    `Selfie face template for my badge: ${F.HELP.biometricMarker} vector=[0.12,0.88,0.41]`,
  ].join("\n"),
  tried: "Re-ran with --headless.",
  priority: "high",
});
// Private contact details only ever in private free text (no phone field exists).
await ticket(F.O.email, { category: "other", summary: "Please call me if my table moves", details: `My phone is ${F.PRIVATE_PHONE}.`, priority: "low" });
await ticket(F.LONERS[0].email, { category: "other", summary: "Please call me about team matching", details: `My phone is ${F.PRIVATE_PHONE}.`, priority: "low" });
// Seeded tickets are an hour old so the participant's "5 new tickets per 15 minutes" limit stays free for the tests.
await query("update help_tickets set created_at = created_at - interval '1 hour' where member_id in (select id from members where email like '%@demo.test')");
// Biometric data (a selfie) and a private repository for the sensitive ticket's team.
await query("insert into selfies (member_id, object_key, captured_by, approved_at) values ((select id from members where email = 'kit@demo.test'), $1, 'participant', now())", [
  `selfies/demo/kit-${F.HELP.biometricMarker}.jpg`,
]);
const [kestrelRepo] = await query<{ id: number }>(
  `insert into repository_links (project_id, provider, repo_id, repo_full_name, default_branch, permission_scope, linked_by, last_commit_sha)
   values ($1, 'github', 'demo-repo-kestrel', 'demo-org/kestrel-core', 'main', '["private"]'::jsonb, $2, $3) returning id`,
  [projectId.kestrel, pid, F.SHA.kestrel],
);

// ── Kane runs and evidence ───────────────────────────────────────────────────
type RunOpts = { team: F.TeamKey; upstream: string; status: string; exit: number | null; verified: boolean; sha?: string | null; ago: number; member?: string; objective?: string };
async function run(o: RunOpts) {
  const m = await memberRow(o.member ?? F.captainOf(o.team).email);
  const [r] = await query<{ id: number }>(
    `insert into kane_runs (project_id, team_id, member_id, source, upstream_execution_id, status, exit_code, has_terminal_event, commit_sha, objective,
                            source_verified, verification_state, started_at, finished_at, summary)
     values ($1, $2, $3, 'kanehack_cli', $4, $5, $6, $7, $8, $9, $10, $11, now() - make_interval(mins => $12 + 2), now() - make_interval(mins => $12), $13::jsonb)
     returning id`,
    [projectId[o.team], teamId[o.team], m.id, o.upstream, o.status, o.exit, o.exit !== null, o.sha ?? null, o.objective ?? `${F.T[o.team].name} critical flow`,
      o.verified, o.verified ? "verified" : "reported", o.ago,
      JSON.stringify({ family: "run", terminal: o.exit !== null ? { type: "run_end", status: o.status } : null, one_liner: o.objective ?? null })],
  );
  return r.id;
}
async function evidence(team: F.TeamKey, key: string, visibility: string, runId: number | null, kind = "report") {
  const digest = sha(`demo-evidence:${team}:${key}`);
  const [e] = await query<{ id: number }>(
    `insert into evidence_artifacts (project_id, object_key, sha256, kind, content_type, size_bytes, visibility, source_run_id, uploaded_by, verified_at, redaction_state, original_name)
     values ($1, $2, $3, $4, 'text/plain', 512, $5, $6, (select captain_id from teams where id = $7), now(), 'clean', $8) returning id`,
    [projectId[team], `evidence/demo/${team}/${key}.txt`, digest, kind, visibility, runId, teamId[team], `${key}.txt`],
  );
  if (runId) await query("update kane_runs set evidence_artifact_id = $2, evidence_hash = $3 where id = $1", [runId, e.id, digest]);
  return e.id;
}
// Team one (Kestrel): an unlisted private artifact that no submission lists, and the
// artifact the adapter fixtures reference by sha256.
const kestrelUnlisted = await evidence("kestrel", "unlisted-report", "private", null);
await evidence("kestrel", "adapter-evidence", "private", null, "ndjson");
// Milestone team (Sparrow): an earlier verified run and the verified run with evidence,
// plus the GitHub commit timeline for both commits.
const sparrowEarlier = await run({ team: "sparrow", upstream: F.RUN_IDS.sparrowEarlier, status: "passed", exit: 0, verified: true, sha: F.SHA.sparrowOld, ago: 150, objective: "Sparrow signup flow (first green run)" });
const sparrowVerified = await run({ team: "sparrow", upstream: F.RUN_IDS.sparrowVerified, status: "passed", exit: 0, verified: true, sha: F.SHA.sparrow, ago: 30, objective: "Sparrow signup and checkout flows" });
await evidence("sparrow", "earlier-run-report", "team", sparrowEarlier);
const sparrowEvidence = await evidence("sparrow", "verified-run-report", "team", sparrowVerified);
const [sparrowRepo] = await query<{ id: number }>(
  `insert into repository_links (project_id, provider, repo_id, repo_full_name, default_branch, linked_by, last_commit_sha)
   values ($1, 'github', 'demo-repo-sparrow', 'demo-org/sparrow', 'main', (select captain_id from teams where id = $2), $3) returning id`,
  [projectId.sparrow, teamId.sparrow, F.SHA.sparrow],
);
for (const [s, ago] of [[F.SHA.sparrowOld, 160], [F.SHA.sparrow, 40]] as const) {
  await query(
    "insert into repository_commits (repository_link_id, project_id, sha, ref, committed_at, pushed_at, author_login) values ($1, $2, $3, 'refs/heads/main', now() - make_interval(mins => $4), now() - make_interval(mins => $4), 'sparrow-captain')",
    [sparrowRepo.id, projectId.sparrow, s, ago],
  );
}
// A private run (anonymous visitors must not see it).
const ospreyRun = await run({ team: "osprey", upstream: F.RUN_IDS.privateOsprey, status: "passed", exit: 0, verified: true, sha: F.SHA.staging, ago: 25, objective: `Private run ${F.RUN_IDS.privateOsprey}` });
// TV fixtures on Ibis: success, failure (suspected defect), error, linked build, unlinked run.
const [ibisRepo] = await query<{ id: number }>(
  `insert into repository_links (project_id, provider, repo_id, repo_full_name, default_branch, linked_by, last_commit_sha)
   values ($1, 'github', 'demo-repo-ibis', 'demo-org/ibis', 'main', (select captain_id from teams where id = $2), $3) returning id`,
  [projectId.ibis, teamId.ibis, F.SHA.ibis],
);
await query("insert into repository_commits (repository_link_id, project_id, sha, ref, pushed_at) values ($1, $2, $3, 'refs/heads/main', now() - interval '50 minutes')", [ibisRepo.id, projectId.ibis, F.SHA.ibis]);
const tv = {
  passed: await run({ team: "ibis", upstream: F.RUN_IDS.tvPassed, status: "passed", exit: 0, verified: true, ago: 45, objective: "Ibis smoke suite" }),
  failed: await run({ team: "ibis", upstream: F.RUN_IDS.tvFailed, status: "failed", exit: 1, verified: true, ago: 40, objective: "Ibis checkout flow" }),
  error: await run({ team: "ibis", upstream: F.RUN_IDS.tvError, status: "errored", exit: 2, verified: true, ago: 35, objective: "Ibis login flow (browser crashed)" }),
  linked: await run({ team: "ibis", upstream: F.RUN_IDS.tvLinked, status: "passed", exit: 0, verified: true, sha: F.SHA.ibis, ago: 30, objective: "Ibis release suite on main" }),
  unlinked: await run({ team: "ibis", upstream: F.RUN_IDS.tvUnlinked, status: "passed", exit: 0, verified: false, sha: null, ago: 20, objective: "Ibis local run, no provenance" }),
};
await query(
  "insert into defects (project_id, signature, subject_key, title, detail, source_run_id, status, failure_class) values ($1, $2, 'run:ibis checkout flow', 'Checkout total is wrong after coupon', 'From the failing Ibis checkout run', $3, 'suspected', 'product')",
  [projectId.ibis, sha("demo-defect-ibis-checkout"), tv.failed],
);

// ── Submissions ──────────────────────────────────────────────────────────────
const baseDraft = (k: F.TeamKey, runId: number | null, withRepo = true) => ({
  project_name: `${F.T[k].name.replace("Demo ", "")} Relay`,
  project_type: "application",
  one_line_pitch: `${F.T[k].name} ships every change behind a Kane CLI verdict.`,
  problem: "Teams merge on a green build, not on proof that the flows work.",
  what_we_built: "A web app plus a Kane CLI suite that runs on every preview deploy.",
  how_it_works: "Open a PR\nKane runs the critical flows\nEvidence is sealed\nThe bot posts a verdict",
  harness_summary: "GitHub webhook -> kane-cli testrun on the preview URL -> sealed evidence -> PR verdict.",
  kane_components: ["testrun", "sealed_evidence", "ci"],
  repo_url: withRepo ? `https://github.com/demo-org/${k}` : "",
  commit_sha: withRepo ? F.SHA.staging : "",
  demo_url: `https://example.com/${k}`,
  demo_video_url: "",
  limitations: "Covers checkout and signup only.",
  kane_run_ids: runId ? [String(runId)] : [],
  evidence_refs: runId ? `https://example.com/${k}/kane-report` : "",
});
const receipts: Partial<Record<F.TeamKey, string>> = {};
async function submission(k: F.TeamKey, mode: "complete" | "no_repo" | "no_evidence" | "finalized") {
  const captain = F.captainOf(k).email;
  await actAs(captain);
  await sub.getSubmissionContext(teamId[k]!);
  const runId = mode === "no_evidence" ? null : await run({ team: k, upstream: `demo-run-${k}-pass`, status: "passed", exit: 0, verified: true, sha: F.SHA.staging, ago: 60 });
  if (runId) {
    // The run's sealed report, shared with judges, linked to the run before the draft
    // is saved, so the finalized snapshot's evidence lists it (evidence_artifact_id).
    const evId = await evidence(k, "kane-report", "judges", runId);
    // An evidence-backed claim the judge view lists (milestones shared with judges):
    // proposed by the captain, approved by a teammate, as the Proof tab does it.
    const cap = await memberRow(captain);
    const ms = await kane.proposeMilestone({ kind: "member", member: cap as never }, {
      title: `${F.T[k].name.replace("Demo ", "")} critical flows pass on ${F.SHA.staging.slice(0, 7)}`,
      claim: "Signup and checkout pass end to end on the submitted commit (verified Kane run with a sealed report).",
      evidence_ids: [evId],
      source_run_id: runId,
      visibility: "judges",
    });
    const mate = F.T[k].people[1];
    if (mate) await kane.approveMilestone((await memberRow(mate.email)) as never, ms.milestone_id, "approve");
    await actAs(captain);
  }
  await sub.saveDraft(slugOf(k), baseDraft(k, runId, mode !== "no_repo"));
  if (mode === "finalized") {
    const fin = await sub.finalizeSubmission(slugOf(k), { confirm_phrase: F.T[k].name, confirm: "on", publish_showcase: "on", idempotency_key: `demo-${k}-final` });
    receipts[k] = fin.data.receipt_code;
  }
}
const slugOf = F.slugOf;
for (const k of ["wren", "tern", "robin", "dove"] as const) await submission(k, "complete");
await submission("gannet", "no_repo");
await submission("egret", "no_evidence");
// Finch's deck is published before it finalizes, so the receipt pins it (pinned-deck test).
// Finalize only pins an approved/published deck, and publishing a deck needs a published
// Ship Page: story → publish page → save + publish deck, the order a team would use.
await soft("finch deck", async () => {
  await actAs(F.captainOf("finch").email);
  const access = await story.authorizeStudio(slugOf("finch"), { write: true });
  const content = await story.seedStory(access.project, await story.getTeamPeople(access.project.team_id));
  const saved = await story.saveStory(access, { content: { ...content, one_line_pitch: content.one_line_pitch || "Finch Relay replays a failing Kane run as a shareable bug report.", what_we_built: content.what_we_built || "A relay that turns a failed Kane run into a bug report a teammate can replay.", consent_reviewed: true }, expected_version: 0 });
  await story.publishShowcase(access, { story_version: saved.data.version, confirm_phrase: slugOf("finch") });
  const ed = await deck.getEditableDeck(access);
  const dv = await deck.saveDeckVersion(access, { deck: ed.defaultDeck, expected_version: 0, reason: "fixture" });
  await deck.publishDeck(access, { version: dv.data.version, confirm_phrase: "publish deck" });
});
for (const k of ["finch", "heron", "ledger"] as const) await submission(k, "finalized");
// Sparrow (milestones): finalized with a public Ship Page, linking its verified run.
await actAs(F.captainOf("sparrow").email);
await sub.getSubmissionContext(teamId.sparrow!);
await sub.saveDraft(slugOf("sparrow"), { ...baseDraft("sparrow", sparrowVerified), commit_sha: F.SHA.sparrow, repo_url: "https://github.com/demo-org/sparrow", project_name: "Sparrow" });
receipts.sparrow = (await sub.finalizeSubmission(slugOf("sparrow"), { confirm_phrase: F.T.sparrow.name, confirm: "on", publish_showcase: "on", idempotency_key: "demo-sparrow-final" })).data.receipt_code;
// The locked roster: Ledger is finalized and its roster locked.
await query("update teams set state = 'roster_locked', roster_locked_at = now(), recruiting_open = false where id = $1 and state <> 'submitted'", [teamId.ledger]);
await query("update teams set roster_locked_at = coalesce(roster_locked_at, now()) where id = $1", [teamId.ledger]);
await query("update projects set name = $2 where id = $1", [projectId.outage, F.OFFLINE.projectName]);

// ── Ideas and Radar ──────────────────────────────────────────────────────────
for (const [k, r] of Object.entries(F.RADAR) as [keyof typeof F.RADAR, (typeof F.RADAR)[keyof typeof F.RADAR]][]) {
  const optIn = k !== "shrike";
  const priv =
    k === "kestrel"
      ? `${F.PRIVATE_IDEA_MARKER}: our private plan is a coupon-abuse detector we won't share before demos.`
      : "private" in r
        ? r.private
        : `Private notes for ${F.T[k].name}.`;
  await query("update ideas set title = $2, public_summary = $3, discovery_opt_in = $4, project_type = $5, private_description = $6, status = $7 where team_id = $1", [
    teamId[k], `${F.T[k].name.replace("Demo ", "")} idea`, r.summary, optIn, r.type, priv, optIn ? "shared" : "draft",
  ]);
  await query("insert into member_consents (member_id, category, granted, source) values ((select captain_id from teams where id = $1), 'idea_discovery', $2, 'web')", [teamId[k], optIn]);
}
await query("update ideas set private_description = private_description || $2 where team_id = $1", [teamId.heron, ` Call Olu at ${F.PRIVATE_PHONE} for the demo slot.`]);
const pRow = await memberRow(F.P.email);
const radar = await soft("radar check", () => ideas.ideaRadar({ member: pRow as never, actor: { type: "member", id: pRow.id, label: pRow.name } } as never, teamId.kestrel!));
const radarLabels = Object.fromEntries((radar?.matches ?? []).map((m: { team_slug: string; label: string }) => [m.team_slug, m.label]));
for (const [k, want] of [["plover", "possible_overlap"], ["curlew", "similar_angle"], ["avocet", "complementary"]] as const) {
  if (radarLabels[slugOf(k)] !== want) warnings.push(`radar: ${slugOf(k)} is ${radarLabels[slugOf(k)] ?? "absent"}, expected ${want}`);
}
for (const k of ["shrike", "lark"] as const) if (radarLabels[slugOf(k)]) warnings.push(`radar: ${slugOf(k)} should not be compared, got ${radarLabels[slugOf(k)]}`);
await query("delete from idea_similarity_edges where source_idea_id = (select id from ideas where team_id = $1)", [teamId.kestrel]);

// ── Matching profiles ────────────────────────────────────────────────────────
async function profile(email: string, discoverable: boolean, p: { skills: string[]; interests: string[]; availability?: string; goals?: string; bio?: string }) {
  const m = await memberRow(email);
  await query(
    `insert into teammate_profiles (member_id, discoverable, skills, interests, availability, learning_goals, bio)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [m.id, discoverable, p.skills, p.interests, p.availability ?? null, p.goals ?? null, p.bio ?? null],
  );
  await query("insert into member_consents (member_id, category, granted, source) values ($1, 'teammate_discovery', $2, 'web')", [m.id, discoverable]);
}
await profile(F.P.email, true, { skills: ["frontend", "kane-cli"], interests: ["checkout flows"], availability: "all-day", goals: "Ship a Kane-verified release", bio: "Building Kestrel." });
await profile(F.O.email, false, { skills: ["python"], interests: ["agents"] });
await profile(F.LONERS[0].email, true, { skills: ["accessibility audits", "Playwright-to-Kane test migration"], interests: ["Kane CLI testrun suites in CI"], availability: F.MATCH.availability, goals: "Pair on a CI harness", bio: "Looking for a team that ships web apps." });
await profile("hugo@demo.test", true, { skills: ["agents", "evaluation"], interests: ["flaky tests"], availability: "afternoon", bio: "Heron captain." });

// ── Photos ───────────────────────────────────────────────────────────────────
// Published files are plain files under public/photos/event/fixtures (Next serves
// public/ before the /photos route, and Blob isn't configured locally). The
// unpublished photo deliberately has no file there, so a direct request goes
// through the app's /photos guard and must 404.
function png(rgb: readonly [number, number, number], w = 64, h = 48) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const photoDir = path.join(process.cwd(), "public/photos", F.PHOTO_DIR);
rmSync(photoDir, { recursive: true, force: true });
mkdirSync(photoDir, { recursive: true });
const photographer = await staffRow(F.PHOTOGRAPHER);
const photoIds: Record<string, number> = {};
for (const ph of F.PHOTOS) {
  const pathname = `${F.PHOTO_DIR}/${ph.file}`;
  if (ph.status === "published") writeFileSync(path.join(photoDir, ph.file), png(ph.rgb));
  const [row] = await query<{ id: number }>(
    `insert into event_photos (team_id, photo_key, pathname, width, height, caption, alt_text, status, photographer_id, source, captured_at, consent_checked_at, approved_by, approved_at)
     values ($1, $2, $2, 64, 48, $3, $4, $5, $6, 'studio', now() - interval '1 hour', now() - interval '50 minutes', $6, now() - interval '45 minutes') returning id`,
    [teamId.pelican, pathname, ph.marker, `${ph.marker}: the Pelican team at their table`, ph.status, photographer.id],
  );
  photoIds[ph.marker] = row.id;
}
// Private studio photos for the photography tests, one per review state (none is in a gallery).
{
  const who = {
    candidate: [F.BIOMETRIC_ENROLLED, "opted_in_candidate", false],
    noConsent: [F.LONERS[1].email, "qr_badge", true],
    noBiometric: null,
    unapproved: [F.captainOf("pelican").email, "qr_badge", true],
    publishable: [F.captainOf("pelican").email.replace(".captain@", ".mate@"), "opted_in_candidate", false],
  } as const;
  for (const [k, ph] of Object.entries(F.STAGED_PHOTOS) as [keyof typeof F.STAGED_PHOTOS, (typeof F.STAGED_PHOTOS)[keyof typeof F.STAGED_PHOTOS]][]) {
    const pathname = `${F.PHOTO_DIR}/${ph.file}`;
    writeFileSync(path.join(photoDir, ph.file), png(ph.rgb));
    const [row] = await query<{ id: number }>(
      `insert into event_photos (team_id, photo_key, pathname, width, height, caption, status, photographer_id, source, rights_basis, captured_at)
       values ($1, $2, $2, 64, 48, $3, $4, $5, 'studio', 'staff_photographer', now() - interval '20 minutes') returning id`,
      [teamId.pelican, pathname, ph.marker, ph.status, photographer.id],
    );
    photoIds[ph.marker] = row.id;
    const p = who[k];
    if (p) {
      await query(
        `insert into photo_people (photo_id, member_id, match_basis, reviewer_staff_id, confirmed_at)
         values ($1, (select id from members where email = $2), $3, $4, ${p[2] ? "now()" : "null"})`,
        [row.id, p[0], p[1], p[2] ? photographer.id : null],
      );
    }
  }
}

// ── Studio: stories, decks and launch-kit states (production-only tests) ─────
async function studioStory(k: F.TeamKey, opts: { deck?: boolean } = {}) {
  return soft(`studio ${k}`, async () => {
    await actAs(F.captainOf(k).email);
    const access = await story.authorizeStudio(slugOf(k), { write: true });
    const people = await story.getTeamPeople(teamId[k]!);
    const content = await story.seedStory(access.project, people);
    const saved = await story.saveStory(access, { content, expected_version: 0 });
    await query("update project_stories set reviewed_by = $2, reviewed_at = now() where project_id = $1", [projectId[k], (await memberRow(F.captainOf(k).email)).id]);
    let deckId: number | null = null;
    if (opts.deck) {
      const ed = await deck.getEditableDeck(access);
      deckId = (await deck.saveDeckVersion(access, { deck: ed.defaultDeck, expected_version: 0, reason: "fixture" })).data.id;
    }
    return { version: saved.data.version, deckId };
  });
}
const kestrelStudio = await studioStory("kestrel", { deck: true });
for (const k of ["reel", "glitch", "stills", "draftpost", "claims"] as const) await studioStory(k);
await query(
  `insert into render_jobs (project_id, source_version, kind, status, error_code, attempt_count, idempotency_key, started_at, finished_at)
   values ($1, 1, 'mp4_video', 'failed', 'RENDER_FAILED', 3, $2, now() - interval '20 minutes', now() - interval '19 minutes')`,
  [projectId.glitch, `demo-render-glitch-${Date.now()}`],
);
await submission("glitch", "complete");
await soft("draftpost kit", async () => {
  const gtm = await import("../src/server/gtm.ts");
  await actAs(F.captainOf("draftpost").email);
  const access = await story.authorizeStudio(slugOf("draftpost"), { write: true });
  await gtm.generateKit(access, {});
});

// ── Ship Page (t-96..t-100) ──────────────────────────────────────────────────
// Swift: finalized with a public Ship Page (finalize publishes story v1), then a
// saved but unpublished v2 whose one proof claim is "verified", bound to Swift's
// verified run and its verified sealed report. The tests edit, publish and
// switch templates on this project; projects are 1:1 with teams, so every
// ship_*_slug that goes with ship_team_name is demo-swift.
await submission("swift", "finalized");
await soft("ship swift v2", async () => {
  await actAs(F.captainOf("swift").email);
  const access = await story.authorizeStudio(slugOf("swift"), { write: true });
  const v1 = await story.getStory(projectId.swift!);
  if (!v1) throw new Error("finalize did not save a story version");
  const [r] = await query<{ id: number; evidence_artifact_id: number }>("select id, evidence_artifact_id from kane_runs where upstream_execution_id = 'demo-run-swift-pass'");
  const content = {
    ...v1.content,
    proof: [{ claim: F.SHIP.approvedClaim, confidence: "verified", source: "", run_id: String(r.id), evidence_id: String(r.evidence_artifact_id), commit_sha: F.SHA.staging }],
    consent_reviewed: true,
  };
  await story.saveStory(access, { content, expected_version: v1.version });
});
// Eve: mid-activation, stopped at the human camera checkpoint (t-108 signs out and back in).
await soft("eve selfie pending", async () => {
  const activation = await import("../src/server/activation.ts");
  const m = (await memberRow(F.SELFIE_PENDING.email)) as never;
  await activation.confirmAdmission(m, true).catch(() => null);
  await activation.saveIdentity(m, { display_name: F.SELFIE_PENDING.display } as never);
  await activation.saveActivationConsents(m, {
    selfie_storage: true, photo_publication: false, face_matching: false, social_mention: false,
    teammate_discovery: false, idea_discovery: false, activity_publication: false,
  });
});
// Puffin: published with a private marker in its story, then hidden by an organizer.
await submission("puffin", "finalized");
await soft("ship puffin hidden", async () => {
  await actAs(F.captainOf("puffin").email);
  const access = await story.authorizeStudio(slugOf("puffin"), { write: true });
  const v1 = await story.getStory(projectId.puffin!);
  if (!v1) throw new Error("finalize did not save a story version");
  const content = { ...v1.content, what_we_built: `Organizer-hidden page. ${F.SHIP.hiddenMarker}`, one_line_pitch: `Puffin (${F.SHIP.hiddenMarker})`, consent_reviewed: true };
  const saved = await story.saveStory(access, { content, expected_version: v1.version });
  await story.publishShowcase(access, { story_version: saved.data.version, confirm_phrase: slugOf("puffin") });
  const showcase = await import("../src/server/showcase.ts");
  await showcase.moderateShowcase((await staffRow("organizer@demo.test")) as never, { slug: slugOf("puffin"), hide: "on", reason: "Fixture: hidden by moderation" });
});
// Martin: a saved, never-published story (showcase stays draft) that carries the private idea marker.
await soft("ship martin draft", async () => {
  await actAs(F.captainOf("martin").email);
  const access = await story.authorizeStudio(slugOf("martin"), { write: true });
  const content = await story.seedStory(access.project, await story.getTeamPeople(teamId.martin!));
  content.what_we_built = `Draft only. ${F.PRIVATE_IDEA_MARKER}: notes that must stay private until publishing.`;
  await story.saveStory(access, { content, expected_version: 0 });
  await query("update ideas set private_description = $2 where team_id = $1", [teamId.martin, `${F.PRIVATE_IDEA_MARKER}: Martin's private plan.`]);
});
for (const [k, want] of [["swift", "public"], ["puffin", "hidden_by_moderation"], ["martin", "draft"]] as const) {
  const [p] = await query<{ showcase_state: string }>("select showcase_state from projects where id = $1", [projectId[k]]);
  if (p?.showcase_state !== want) warnings.push(`ship: ${slugOf(k)} is ${p?.showcase_state}, expected ${want}`);
}

// ── Biometric enrollment (t-93) ──────────────────────────────────────────────
// Enrolled the way the passport models it: selfie storage and face matching
// consent, and a stored selfie whose face template is tied to that consent.
{
  const m = await memberRow(F.BIOMETRIC_ENROLLED);
  await query("insert into member_consents (member_id, category, granted, source) values ($1, 'selfie_storage', true, 'web')", [m.id]);
  const [c] = await query<{ id: number }>("insert into member_consents (member_id, category, granted, source) values ($1, 'face_matching', true, 'web') returning id", [m.id]);
  await query(
    "insert into selfies (member_id, object_key, captured_by, approved_at, face_template_key, template_consent_id) values ($1, $2, 'participant', now(), $3, $4)",
    [m.id, `selfies/demo/pelican-mate.jpg`, `faces/demo/pelican-mate.tpl`, c.id],
  );
}

// ── Optional integrations staged as down ─────────────────────────────────────
await query(
  `update integration_state set status = 'down', last_error_at = now(), last_error_code = 'NOT_CONFIGURED',
          detail = 'Staged local outage fixture: not configured on this machine'
    where system in ('slack', 'x', 'renderer')`,
);

// ── Signed CSV fixtures (tests/fixtures) ─────────────────────────────────────
const fixturesDir = path.join(process.cwd(), "tests/fixtures");
mkdirSync(fixturesDir, { recursive: true });
const signDigest = (hex: string) => {
  const key = process.env.RECEIPT_SIGNING_KEY ?? process.env.SESSION_SECRET ?? "";
  return createHmac("sha256", key).update(hex).digest("hex");
};
const csvLine = (cells: string[]) => cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
function writeSigned(name: string, header: string[], rows: string[][]) {
  const text = [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n";
  writeFileSync(path.join(fixturesDir, name), text);
  const digest = sha(text);
  writeFileSync(
    path.join(fixturesDir, name.replace(/\.csv$/, ".sig.json")),
    JSON.stringify({ file: name, sha256: digest, hmac_sha256: signDigest(digest), key: "RECEIPT_SIGNING_KEY from the local .env.local", signed_by: "scripts/seed-fixtures.mts" }, null, 2) + "\n",
  );
}
const ROSTER_HEADER = ["event_id", "luma_guest_id", "approval_status", "display_name", "checked_in_at", "source_version", "staff_reference", "email"];
const luma: [string, string, string, string][] = [
  [F.GUEST.pat, F.P.name, F.P.email, "approved"],
  [F.GUEST.olu, F.O.name, F.O.email, "approved"],
  [F.GUEST.quinn, F.QUINN.name, F.QUINN.email, "approved"],
  ["gst-ana", "Ana Rivera", "ana@demo.test", "approved"],
  ["gst-ben", "Ben Ito", "ben@demo.test", "approved"],
  ["gst-cara", "Cara Diaz", "cara@demo.test", "approved"],
  ["gst-dev", "Dev Shah", "dev@demo.test", "approved"],
  ["gst-eve", "Eve Moss", "eve@demo.test", "approved"],
  ["gst-finn", "Finn Lake", "finn@demo.test", "approved"],
  ["gst-gia", "Gia Park", "gia@demo.test", "approved"],
  [F.GUEST.hal, "Hal Declined", "hal@demo.test", "declined"],
  // Changed since the seeded roster: Ivy came off the waitlist, and Rowan (registered,
  // no roster row yet) is new, so the import preview has real changes to apply.
  [F.GUEST.ivy, "Ivy Waitlist", "ivy@demo.test", "approved"],
  [F.GUEST.rowan, "Rowan Price", "rowan@demo.test", "approved"],
];
writeSigned("luma-roster-signed.csv", ROSTER_HEADER, luma.map(([id, name, email, st]) => ["kane-hack-sf-2026", id, st, name, "", F.LUMA_SOURCE_VERSION, "demo-seed", email]));
// The paper check-in ledger: /ops/recovery's checkin-ledger-template.csv, one
// signed slip per row (slip id, the attendee's Luma guest id, the time on the
// slip, the delayed-entry reason, the desk staff's id and initials, a witness).
writeSigned("offline-checkin-ledger.csv", ["receipt_id", "attendee_id", "checked_in_at", "timezone", "delay_reason", "staff_id", "staff_signature", "witness_id"], [
  [F.OFFLINE.checkinReceiptId, F.GUEST.quinn, F.OFFLINE.time.replace("T", " "), "America/Los_Angeles", F.OFFLINE.reason, F.OFFLINE.checkinStaff, F.OFFLINE.checkinSignature, F.OFFLINE.witness],
]);

// ── Live metrics: project once so /live starts fresh ─────────────────────────
// Through the app's own cron route (metrics.ts imports a .tsx the node loader can't run).
await soft("live projection", async () => {
  const base = process.env.SITE_URL ?? "http://localhost:3100";
  const res = await fetch(`${base}/api/cron/metrics`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`cron/metrics returned ${res.status} (is the dev server on ${base}?)`);
});
jar.clear();

export const fixtureSummary = {
  teams: Object.fromEntries((Object.keys(F.T) as F.TeamKey[]).map((k) => [k, slugOf(k)])),
  tickets: { waiting: waiting.ticket.code, resolved: resolved.ticket.code, sensitive: sensitive.ticket.code },
  receipts,
  runs: { sparrowVerified, sparrowEarlier, ospreyRun, ...tv },
  evidence: { kestrelUnlisted, sparrowEvidence },
  photos: photoIds,
  deck_api_id: kestrelStudio?.deckId ?? null,
  repo_links: { kestrel: kestrelRepo.id },
  radar: radarLabels,
  expired_invite: EXPIRED_INVITE,
  warnings,
};
