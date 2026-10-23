// Demo data for a LOCAL database, for browser walkthroughs and kane-cli suites.
//   node --env-file=.env.local --import ./tests/support/register.mjs scripts/seed-local.mts
// Refuses any DATABASE_URL that is not localhost: never point it at Neon.
// Re-running is safe: it wipes only rows it created (emails @demo.test, teams tagged demo-).
// Prints the credentials it set; staff login codes are single use, so re-run for fresh ones.
import { createHash, randomInt } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("seed-local: DATABASE_URL is not a local database; refusing.");
  process.exit(1);
}
process.env.SESSION_SECRET ||= "local-dev-session-secret-0123456789abcdef";

const { query, pool } = await import("../src/lib/db.ts");
const { registerTeam } = await import("../src/lib/teams.ts");
const { hashPassword } = await import("../src/lib/password.ts");
const sub = await import("../src/server/submission.ts");
const help = await import("../src/server/help.ts");
const session = await import("../src/lib/session.ts");

const PERSONAL_PASSWORD = "demo-pass-1234";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const emailHash = (e: string) => sha(e.trim().toLowerCase());

// ── Wipe a previous seed ────────────────────────────────────────────────────
// Consents, audit rows and finalized snapshots are append-only by trigger, so the
// wipe runs on one connection with triggers off. Local databases only (checked above).
{
  const c = await pool.connect();
  try {
    await c.query("begin");
    // Replica mode skips FK cascades too, so only the guarded tables are cleared here...
    await c.query("set local session_replication_role = replica");
    const demoMembers = "(select id from members where email like '%@demo.test')";
    const demoProjects = "(select id from projects where slug like 'demo-%' or team_id in (select id from teams where slug like 'demo-%'))";
    await c.query(`delete from member_consents where member_id in ${demoMembers}`);
    await c.query(`delete from judge_scores where submission_id in (select id from submissions where project_id in ${demoProjects})`);
    for (const t of ["submissions", "project_stories", "deck_versions", "published_assets", "video_plans"]) {
      await c.query(`delete from ${t} where project_id in ${demoProjects}`);
    }
    // ...and the rest goes through the normal cascades.
    await c.query("set local session_replication_role = origin");
    await c.query(`delete from help_tickets where member_id in ${demoMembers}`);
    // Fixture paper tickets and receipts the suite enters (seed-fixtures.mts, issue-test-codes.mts).
    await c.query("delete from help_tickets where code like 'H-OFF%' or code like 'H-T%'");
    await c.query("delete from kane_runs where upstream_execution_id like 'demo-run-%'");
    await c.query(`delete from kane_runs where project_id in ${demoProjects}`);
    // Paper check-in slips the suite enters through /ops/recovery (offline-checkin-ledger.csv).
    await c.query("delete from checkin_reconciliations where receipt_id like 'CHK-OFF%' or guest_id in (select id from roster_guests where luma_guest_id like 'gst-%')");
    await c.query("delete from roster_guests where staff_reference = 'demo-seed' or luma_guest_id like 'gst-%' or email_hash = encode(sha256(convert_to('wendy.walkin@demo.test', 'UTF8')), 'hex')");
    await c.query("delete from roster_guests where member_id in " + demoMembers);
    await c.query("delete from roster_imports where source_version like 'demo-%'");
    await c.query("delete from notifications where title like 'Event desk %' or title like 'Staff desk %'");
    await c.query("delete from staff_accounts where email like '%@demo.test'");
    await c.query(`delete from projects where id in ${demoProjects}`);
    await c.query("delete from teams where slug like 'demo-%'");
    await c.query("delete from members where email like '%@demo.test'");
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

// A deadline wave (issue-test-codes.mts) may have moved the submission lock into the past: put it back.
{
  const [saved] = await query<{ value: string }>("select value from settings where key = 'fixture:submission_locks_at'");
  if (saved) {
    await query("update hack_events set submission_locks_at = $1::timestamptz", [saved.value]);
    await query("delete from settings where key = 'fixture:submission_locks_at'");
  }
}

// ── Teams ───────────────────────────────────────────────────────────────────
type Seat = { name: string; email: string };
async function team(name: string, password: string, track: string, idea: string, people: Seat[], solo = false) {
  const r = await registerTeam({
    name, track, idea, isSolo: solo, password, photoUrl: null, captainConsent: true,
    members: people.map((p) => ({ ...p, photoUrl: null, linkedin: null, xHandle: null })),
  });
  return r;
}
await team("Demo Orbit", "orbit-team-pass", "Web App", "An agent that turns every PR into an evidence-backed ship decision.", [
  { name: "Ana Rivera", email: "ana@demo.test" },
  { name: "Ben Ito", email: "ben@demo.test" },
  { name: "Cara Diaz", email: "cara@demo.test" },
]);
await team("Demo Atlas", "atlas-team-pass", "AI Agent and Voice", "A voice agent whose flows are re-verified by Kane on every deploy.", [
  { name: "Dev Shah", email: "dev@demo.test" },
  { name: "Eve Moss", email: "eve@demo.test" },
]);
await team("Demo Nova", "nova-team-pass", "Wildcard", "A standalone validation harness for browser extensions.", [{ name: "Finn Lake", email: "finn@demo.test" }], true);

// A participant with no team yet (for Matchmaker / create / join flows).
await query("insert into members (team_id, name, email, email_hash, display_name) values (null, 'Gia Park', 'gia@demo.test', $1, 'Gia P.')", [emailHash("gia@demo.test")]);

// Every demo person can sign in personally with the same password.
const pw = await hashPassword(PERSONAL_PASSWORD);
await query("update members set password_hash = $1, email_hash = coalesce(email_hash, encode(sha256(convert_to(lower(trim(email)), 'UTF8')), 'hex')) where email like '%@demo.test'", [pw]);

const teams = await query<{ id: number; slug: string; name: string }>("select id, slug, name from teams where slug like 'demo-%' order by id");
const bySlug = Object.fromEntries(teams.map((t) => [t.slug, t]));
const members = await query<{ id: number; email: string; team_id: number | null }>("select id, email, team_id from members where email like '%@demo.test' order by id");
const mid = (e: string) => members.find((m) => m.email === e)!.id;

// Consents for the Orbit crew so the showcase can credit them.
for (const e of ["ana@demo.test", "ben@demo.test", "cara@demo.test"]) {
  for (const c of ["photo_publication", "activity_publication", "teammate_discovery", "idea_discovery"]) {
    await query("insert into member_consents (member_id, category, granted, source) values ($1, $2, true, 'web')", [mid(e), c]);
  }
}
await query("insert into member_consents (member_id, category, granted, source) values ($1, 'teammate_discovery', true, 'web')", [mid("gia@demo.test")]);

// ── Roster (as if the Luma CSV was imported) ────────────────────────────────
const roster: [string, string, string, string][] = [
  ["Ana Rivera", "ana@demo.test", "gst-ana", "approved"],
  ["Ben Ito", "ben@demo.test", "gst-ben", "approved"],
  ["Cara Diaz", "cara@demo.test", "gst-cara", "approved"],
  ["Dev Shah", "dev@demo.test", "gst-dev", "approved"],
  ["Eve Moss", "eve@demo.test", "gst-eve", "approved"],
  ["Finn Lake", "finn@demo.test", "gst-finn", "approved"],
  ["Gia Park", "gia@demo.test", "gst-gia", "approved"],
  ["Hal Declined", "hal@demo.test", "gst-hal", "declined"],
  ["Ivy Waitlist", "ivy@demo.test", "gst-ivy", "waitlist"],
];
for (const [name, email, gid, approval] of roster) {
  const admitted = approval === "approved" ? "admitted" : "not_admitted";
  await query(
    `insert into roster_guests (source, luma_guest_id, name, email_hash, email_hint, approval_status, admission_status, source_version, staff_reference, member_id)
     values ('luma_csv', $1, $2, $3, $4, $5, $6, 'demo-v1', 'demo-seed', (select id from members where lower(email) = $7))`,
    [gid, name, emailHash(email), `${email[0]}***@demo.test`, approval, admitted, email],
  );
}
// Ana and Ben are already at the venue.
await query("update roster_guests set checked_in_at = now() where luma_guest_id in ('gst-ana','gst-ben') and staff_reference = 'demo-seed'");
await query("update members set checked_in_at = now() where email in ('ana@demo.test','ben@demo.test')");

// ── Staff, each with a single-use login code ────────────────────────────────
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const code = () => `${Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join("")}-${Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join("")}`;
const staffCodes: Record<string, string> = {};
for (const [email, name, role] of [
  ["organizer@demo.test", "Olive Organizer", "organizer"],
  ["mentor@demo.test", "Milo Mentor", "mentor"],
  ["judge@demo.test", "Jada Judge", "judge"],
  ["photo@demo.test", "Pia Photographer", "photographer"],
] as const) {
  const [s] = await query<{ id: number }>("insert into staff_accounts (email, name, role) values ($1, $2, $3) returning id", [email, name, role]);
  const c = code();
  await query("insert into staff_login_codes (staff_id, code_hash, expires_at) values ($1, $2, now() + interval '3 days')", [s.id, sha(c.replace(/[^0-9A-Z]/g, ""))]);
  staffCodes[role] = c;
}

// ── Orbit: proof, a finalized submission and a public showcase ──────────────
const orbit = bySlug["demo-orbit"];
await sub.getSubmissionContext(orbit.id);
const [proj] = await query<{ id: number }>("select id from projects where team_id = $1", [orbit.id]);
const goodSha = "4f2c9e1b7a3d5c8e0f1a2b3c4d5e6f708192a3b4";
const [passRun] = await query<{ id: number }>(
  `insert into kane_runs (project_id, team_id, source, upstream_execution_id, status, commit_sha, source_verified, verification_state, started_at, finished_at)
   values ($1, $2, 'kanehack_cli', 'demo-run-pass', 'passed', $3, true, 'verified', now() - interval '20 minutes', now() - interval '18 minutes') returning id`,
  [proj.id, orbit.id, goodSha],
);
await query(
  `insert into kane_runs (project_id, team_id, source, upstream_execution_id, status, commit_sha, source_verified, verification_state, started_at, finished_at)
   values ($1, $2, 'kanehack_cli', 'demo-run-fail', 'failed', $3, true, 'verified', now() - interval '50 minutes', now() - interval '48 minutes')`,
  [proj.id, orbit.id, "0".repeat(40)],
);
await session.setMemberSession({ memberId: mid("ana@demo.test"), personal: true });
await sub.saveDraft("demo-orbit", {
  project_name: "Orbit", project_type: "validation_harness",
  one_line_pitch: "Every pull request becomes an evidence-backed ship decision.",
  problem: "Agent-written code ships on a green build, not on proof.",
  what_we_built: "A PR bot that runs Kane CLI flows against the preview and posts a verdict.",
  how_it_works: "Open a PR\nKane runs the critical flows on the preview\nEvidence is sealed\nThe bot posts ship / hold",
  harness_summary: "GitHub webhook → kane-cli testrun on the preview URL → sealed evidence → PR verdict.",
  kane_components: ["testrun", "sealed_evidence", "ci"], repo_url: "https://github.com/example/orbit", commit_sha: goodSha,
  demo_url: "https://example.com/orbit", demo_video_url: "", limitations: "Only covers the checkout flow today.",
  kane_run_ids: [String(passRun.id)],
});
const fin = await sub.finalizeSubmission("demo-orbit", { confirm_phrase: "Demo Orbit", confirm: "on", publish_showcase: "on", idempotency_key: "demo-orbit-final" });

// ── Atlas: a saved draft, an idea shared for the Radar, and an open help ticket
const atlas = bySlug["demo-atlas"];
await sub.getSubmissionContext(atlas.id);
await query("update ideas set title = 'Atlas voice QA', public_summary = 'Voice agent flows re-verified by Kane on every deploy.', discovery_opt_in = true where team_id = $1", [atlas.id]);
await query("update ideas set title = 'Orbit PR gate', public_summary = 'A PR bot that gates merges on Kane evidence.', discovery_opt_in = true where team_id = $1", [orbit.id]);
await session.setMemberSession({ memberId: mid("dev@demo.test"), personal: true });
await sub.saveDraft("demo-atlas", { project_name: "Atlas", project_type: "agent", one_line_pitch: "Voice agent with Kane-verified flows." });
const devRow = (await query<Record<string, unknown>>("select id, team_id, name, display_name, email, 'participant' as role, public_code, checked_in_at, activated_at, deleted_at from members where id = $1", [mid("dev@demo.test")]))[0];
const ticket = await help.createHelpTicket(
  { member: devRow as never, actor: { type: "member", id: mid("dev@demo.test"), label: "Dev Shah" }, source: "web" },
  { category: "kane_cli", summary: "kane-cli whoami says token expired after login", priority: "high", table_label: "T12" },
);

await query("insert into notifications (team_id, kind, title, body, visibility) values (null, 'announcement', 'Lunch is served', 'Working lunch in the atrium until 14:00.', 'public')").catch(() => {});

// Fixtures for the kane-cli suite (.testmuai/tests): see docs/hack-os/TEST_FIXTURES.md.
const { fixtureSummary } = await import("./seed-fixtures.mts");

const pcodes = await query<{ email: string; public_code: string | null }>("select email, public_code from members where email like '%@demo.test' order by id");
console.log(JSON.stringify({
  personal_password: PERSONAL_PASSWORD,
  teams: { "demo-orbit": "orbit-team-pass", "demo-atlas": "atlas-team-pass", "demo-nova": "nova-team-pass" },
  staff_codes: staffCodes,
  admin_password: "(ADMIN_PASSWORD from .env.local)",
  orbit_receipt: fin.data.receipt_code,
  atlas_ticket: ticket.ticket.code,
  p_codes: Object.fromEntries(pcodes.map((p) => [p.email, p.public_code])),
  fixtures: fixtureSummary,
}, null, 2));
if (fixtureSummary.warnings.length) console.error(`seed-local: ${fixtureSummary.warnings.length} fixture warning(s), see "fixtures.warnings" above.`);
await pool.end();
