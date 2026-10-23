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
    await c.query("delete from codex_credit_codes where code like 'DEMO-CDX-%'");
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
// The suite also edits the event itself (Admin deadline and privacy rule, the TV
// phase override, public status). The first seed records the event as it is;
// every later seed puts it back, so each wave starts from the same schedule.
{
  const cols = "starts_at, team_lock_at, idea_lock_at, submission_locks_at, demos_start_at, ends_at, phase_override, public_status, settings";
  const [base] = await query<{ value: string }>("select value from settings where key = 'fixture:event_baseline'");
  if (!base) {
    await query(`insert into settings (key, value) select 'fixture:event_baseline', to_jsonb(e)::text from (select ${cols} from hack_events where id = current_event_id()) e`);
  } else {
    await query(
      `update hack_events h set starts_at = r.starts_at, team_lock_at = r.team_lock_at, idea_lock_at = r.idea_lock_at, submission_locks_at = r.submission_locks_at,
              demos_start_at = r.demos_start_at, ends_at = r.ends_at, phase_override = r.phase_override, public_status = r.public_status, settings = r.settings, updated_at = now()
         from jsonb_populate_record(null::hack_events, $1::jsonb) r
        where h.id = current_event_id()`,
      [base.value],
    );
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

// People with no team yet, in the matchmaking pool (event-day flow: profile and
// photo step done, "looking for a team?" = yes).
for (const [name, mail, short, skills, interests] of [
  ["Gia Park", "gia@demo.test", "Gia P.", ["python", "ci"], ["agents"]],
  ["Pax Reed", "pax@demo.test", "Pax R.", ["react", "design"], ["voice"]],
  ["Uma Sol", "uma@demo.test", "Uma S.", ["playwright", "qa"], ["dev tools"]],
] as const) {
  await query(
    `insert into members (team_id, name, email, email_hash, display_name, skills, interests, looking_for_team, photo_step_at)
     values (null, $1, $2, $3, $4, $5, $6, true, now())`,
    [name, mail, emailHash(mail), short, skills, interests],
  );
  await query(
    `insert into teammate_profiles (member_id, discoverable, skills, interests) select id, true, $2, $3 from members where email = $1
     on conflict (member_id) do update set discoverable = true, skills = excluded.skills, interests = excluded.interests`,
    [mail, skills, interests],
  );
}

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
for (const e of ["gia@demo.test", "pax@demo.test", "uma@demo.test"]) {
  await query("insert into member_consents (member_id, category, granted, source) values ($1, 'teammate_discovery', true, 'web')", [mid(e)]);
}

// OpenAI Codex credit codes for the /activate checklist (fake, local only).
for (let i = 1; i <= 10; i++) {
  await query("insert into codex_credit_codes (code, batch, extra) values ($1, 'demo', $2) on conflict (code) do nothing", [`DEMO-CDX-${String(i).padStart(4, "0")}`, JSON.stringify({ amount: "250" })]);
}

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
  // On the roster and checked in at the desk, but no profile yet: walk /register with this email.
  ["Jo New", "jo@demo.test", "gst-jo", "approved"],
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
await query("update roster_guests set checked_in_at = now() where luma_guest_id in ('gst-ana','gst-ben','gst-jo') and staff_reference = 'demo-seed'");
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
  // Event-day flow: there is no team password; everyone signs in with the personal password above.
  teams: ["demo-orbit", "demo-atlas", "demo-nova"],
  matchmaking_pool: ["gia@demo.test", "pax@demo.test", "uma@demo.test"],
  register_with_roster_email: "jo@demo.test",
  staff_codes: staffCodes,
  admin_password: "(ADMIN_PASSWORD from .env.local)",
  orbit_receipt: fin.data.receipt_code,
  atlas_ticket: ticket.ticket.code,
  p_codes: Object.fromEntries(pcodes.map((p) => [p.email, p.public_code])),
  fixtures: fixtureSummary,
}, null, 2));
if (fixtureSummary.warnings.length) console.error(`seed-local: ${fixtureSummary.warnings.length} fixture warning(s), see "fixtures.warnings" above.`);
await pool.end();
