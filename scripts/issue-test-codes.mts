// Fill .testmuai/variables/assurance.json for the kane-cli suite, against a LOCAL database only.
//
//   node --env-file=.env.local --import ./tests/support/register.mjs scripts/issue-test-codes.mts \
//        [--repo <checkout with .testmuai>] [--wave <id from tests/fixtures/waves.json>]
//
// Run it after scripts/seed-local.mts and before every test wave. Staff one-time
// codes and activation (pair) codes are single use, so each run issues fresh ones:
// organizer, mentor, mentor2, judge and photographer codes, a valid / an expired /
// an already-used pair code, a Kane adapter bearer token, fresh Kane event ids and
// a fresh paper slip number. Every other value is read back from the seeded
// fixtures (ticket codes, receipts, run ids...). With --wave, the wave's variable
// overrides and clock setting from waves.json are applied too.
// What each variable maps to: docs/hack-os/TEST_FIXTURES.md.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as F from "./fixtures-data.mts";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("issue-test-codes: DATABASE_URL is not a local database; refusing.");
  process.exit(1);
}
process.env.SESSION_SECRET ||= "local-dev-session-secret-0123456789abcdef";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const repo = path.resolve(arg("repo") ?? process.cwd());
const waveId = arg("wave");
const varsPath = path.join(repo, ".testmuai/variables/assurance.json");
const base = (process.env.SITE_URL ?? "http://localhost:3100").replace(/\/$/, "");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`issue-test-codes: SITE_URL ${base} is not local; refusing.`);
  process.exit(1);
}

const { query, pool } = await import("../src/lib/db.ts");
const auth = await import("../src/server/auth.ts");
const activation = await import("../src/server/activation.ts");
const kane = await import("../src/server/kane.ts");
const { jar } = (await import("../tests/support/stubs/next-headers.mjs")) as { jar: Map<string, string> };

const one = async <R,>(sql: string, params: unknown[] = []): Promise<R> => {
  const rows = await query<R & Record<string, unknown>>(sql, params);
  if (!rows[0]) throw new Error(`issue-test-codes: fixture missing (${sql.slice(0, 90)}…). Run scripts/seed-local.mts first.`);
  return rows[0];
};
const system = { type: "system" as const, label: "issue-test-codes (local fixtures)" };
const fresh = (n = 6) => auth.randomCode(n);

// ── Single-use credentials ───────────────────────────────────────────────────
const codes: Record<string, string> = {};
for (const [variable, email] of [...Object.entries(F.STAFF_BY_VAR), ["photographer", F.PHOTOGRAPHER]]) {
  const s = await one<{ id: number }>("select id from staff_accounts where email = $1 and active", [email]);
  codes[variable] = await auth.issueStaffLoginCode(s.id, system);
}

const pat = await one<{ id: number; guest_id: number }>("select id, guest_id from members where email = $1", [F.P.email]);
const valid = await activation.issueActivationCode({ memberId: pat.id, guestId: pat.guest_id }, system);
const expired = await activation.issueActivationCode({ memberId: pat.id, guestId: pat.guest_id }, system, -60);
const replayed = await activation.issueActivationCode({ memberId: pat.id, guestId: pat.guest_id }, system);
jar.clear();
await activation.redeemActivationCode(replayed.code, null); // consumed once: any later use is a replay
jar.clear();

// The Kane result adapter: a paired (bearer) token for Pat on team one, as `kanehack pair` would mint.
await query("update member_tokens set revoked_at = now() where member_id = $1 and label = 'demo-fixture kane adapter' and revoked_at is null", [pat.id]);
const token = auth.newToken("bearer");
await query(
  "insert into member_tokens (member_id, kind, token_hash, label, scopes, expires_at) values ($1, 'bearer', $2, 'demo-fixture kane adapter', $3, now() + interval '14 days')",
  [pat.id, auth.tokenHash(token), ["runs:write", "evidence:write", "help:write"]],
);

// ── Kane event payloads (fresh execution ids, so none was ingested before) ───
const kestrel = await one<{ id: number }>("select id from teams where slug = $1", [F.slugOf("kestrel")]);
const adapterEv = await one<{ sha256: string }>("select sha256 from evidence_artifacts where object_key = 'evidence/demo/kestrel/adapter-evidence.txt'");
const stamp = `${Date.now().toString(36)}-${fresh(4).toLowerCase()}`;
const now = new Date();
const startedAt = new Date(now.getTime() - 3 * 60_000).toISOString();
const finishedAt = new Date(now.getTime() - 60_000).toISOString();
const member = (name: string, status: string, failure?: string) => ({ upstream_member_id: `m-${name.replace(/\W+/g, "-")}`, name, status, duration_ms: 4200, ...(failure ? { failure } : {}) });
const runEnd = {
  source_execution_id: `demo-evt-runend-${stamp}`,
  exit_code: 0,
  command: "run",
  objective: "Kestrel checkout flow completes with a coupon",
  commit_sha: F.SHA.kestrel,
  run_summary: {
    family: "run",
    terminal: { type: "run_end", status: "passed" },
    execution_id: `demo-evt-runend-${stamp}`,
    summary: { status: "passed", one_liner: "Checkout with coupon completes", duration_s: 74 },
    members: [member("checkout with coupon", "passed")],
  },
  evidence_sha256: adapterEv.sha256,
  started_at: startedAt,
  finished_at: finishedAt,
};
const testrunDone = {
  source_execution_id: `demo-evt-testrun-${stamp}`,
  exit_code: 0,
  command: "testrun",
  objective: "Kestrel regression suite",
  commit_sha: F.SHA.kestrel,
  run_summary: {
    family: "testrun",
    terminal: { type: "testrun_done", status: "passed" },
    execution_id: `demo-evt-testrun-${stamp}`,
    summary: { status: "passed", one_liner: "2 of 2 tests passed", totals: { passed: 2, failed: 0 } },
    members: [member("signup", "passed"), member("checkout", "passed")],
  },
  evidence_sha256: adapterEv.sha256,
  started_at: startedAt,
  finished_at: finishedAt,
};
const failed = {
  source_execution_id: `demo-evt-failed-${stamp}`,
  exit_code: 1,
  command: "run",
  objective: "Kestrel signup rejects a duplicate email",
  commit_sha: F.SHA.kestrel,
  run_summary: {
    family: "run",
    terminal: { type: "run_end", status: "failed" },
    execution_id: `demo-evt-failed-${stamp}`,
    summary: { status: "failed", one_liner: "Duplicate email was accepted", reason: "Expected an error banner, saw the dashboard" },
    members: [member("signup duplicate email", "failed", "Expected an error banner, saw the dashboard")],
  },
  started_at: startedAt,
  finished_at: finishedAt,
};
// "Invalid hash": the evidence hash is not a sha256 (the server refuses the report).
const invalidHash = { ...runEnd, source_execution_id: `demo-evt-badhash-${stamp}`, run_summary: { ...runEnd.run_summary, execution_id: `demo-evt-badhash-${stamp}` }, evidence_sha256: `zz${"0".repeat(60)}zz` };
// "Unsigned": no completion event (the CLI's signed terminal record), so it can never be source-verified.
const unsigned = {
  source_execution_id: `demo-evt-unsigned-${stamp}`,
  exit_code: 0,
  command: "run",
  objective: "Kestrel smoke (no completion event)",
  run_summary: { family: "run", terminal: null, execution_id: `demo-evt-unsigned-${stamp}`, summary: { status: "passed" }, members: [] },
};
// Each payload must pass the app's own guard and schema (except the deliberately invalid one).
for (const [name, p] of Object.entries({ runEnd, testrunDone, failed, unsigned })) {
  kane.guardRunInput(p);
  const r = kane.recordRunSchema.safeParse(p);
  if (!r.success) throw new Error(`issue-test-codes: ${name} fixture fails recordRunSchema: ${r.error.message}`);
}
if (kane.recordRunSchema.safeParse(invalidHash).success) throw new Error("issue-test-codes: the invalid-hash fixture unexpectedly validates");
const kaneJson = (p: object) => JSON.stringify({ ...p, project_id: undefined });

// ── Values read back from the seeded fixtures ────────────────────────────────
const ticketBy = async (summary: string) => (await one<{ code: string }>("select code from help_tickets where summary = $1 order by id desc limit 1", [summary])).code;
const runBy = async (upstream: string) => (await one<{ id: number }>("select id from kane_runs where upstream_execution_id = $1", [upstream])).id;
const receiptOf = async (k: F.TeamKey) =>
  (await one<{ receipt_code: string }>("select s.receipt_code from submissions s join teams t on t.id = s.team_id where t.slug = $1 and s.status in ('finalized','locked')", [F.slugOf(k)])).receipt_code;
const olu = await one<{ public_code: string }>("select public_code from members where email = $1", [F.O.email]);
const unlisted = await one<{ id: number }>("select id from evidence_artifacts where object_key = 'evidence/demo/kestrel/unlisted-report.txt'");
const deckRow = await one<{ id: number }>("select d.id from deck_versions d join projects p on p.id = d.project_id where p.slug = $1 order by d.version limit 1", [F.slugOf("kestrel")]);
const photos = await query<{ id: number; caption: string; pathname: string; status: string }>(
  "select e.id, e.caption, e.pathname, e.status from event_photos e join teams t on t.id = e.team_id where t.slug = $1 order by e.id",
  [F.slugOf("pelican")],
);
const published = photos.filter((p) => p.status === "published");
const unpub = photos.find((p) => p.status !== "published")!;
const checkedIn = await query<{ luma_guest_id: string | null; name: string }>("select luma_guest_id, name from roster_guests where checked_in_at is not null and event_id = current_event_id() order by id");
const pop = await query<{ name: string; public_code: string; discoverable: boolean; teamless: boolean }>(
  `select m.name, m.public_code, coalesce(p.discoverable and c.granted, false) as discoverable,
          not exists (select 1 from team_memberships tm where tm.member_id = m.id and tm.left_at is null) as teamless
     from members m
     left join teammate_profiles p on p.member_id = m.id
     left join member_consent_current c on c.member_id = m.id and c.category = 'teammate_discovery'
    where m.deleted_at is null and m.event_id = current_event_id()
    order by m.name`,
);
const optedIn = pop.filter((p) => p.discoverable);
const tv = {
  error: await runBy(F.RUN_IDS.tvError),
  linked: await runBy(F.RUN_IDS.tvLinked),
  unlinked: await runBy(F.RUN_IDS.tvUnlinked),
  osprey: await runBy(F.RUN_IDS.privateOsprey),
  sparrow: await runBy(F.RUN_IDS.sparrowVerified),
};
const consentedRadar = ["plover", "curlew", "avocet", "lark"].map((k) => F.slugOf(k as F.TeamKey));
const fixture = (rel: string) => path.join(repo, "tests/fixtures", rel);

const values: Record<string, string> = {
  mentor_email: "mentor@demo.test",
  mentor_one_time_code: codes.mentor_one_time_code,
  second_mentor_email: "mentor2@demo.test",
  second_mentor_one_time_code: codes.second_mentor_one_time_code,
  participant_email: F.P.email,
  participant_password: F.PERSONAL_PASSWORD,
  sensitive_ticket_code: await ticketBy(F.HELP.sensitiveSummary),
  waiting_ticket_code: await ticketBy(F.HELP.waitingSummary),
  resolved_ticket_code: await ticketBy(F.HELP.resolvedSummary),
  organizer_email: "organizer@demo.test",
  organizer_one_time_code: codes.organizer_one_time_code,
  outage_environment:
    `Local rehearsal at ${base}: Slack, X and the video renderer are not configured and are staged as down in integration_state; no AI gateway key, so agent automation (diagnose, drafts) falls back to rules; the database, staff help desk, check-in and submissions stay up.`,
  paper_slip_number: `H-T${fresh(5)}`,
  offline_checkin_ledger: fixture("offline-checkin-ledger.csv"),
  offline_receipt_time: F.OFFLINE.time,
  offline_reconciliation_reason: F.OFFLINE.reason,
  offline_receipt_id: F.OFFLINE.helpReceiptId,
  not_admitted_guest_id: F.GUEST.hal,
  signed_luma_csv: fixture("luma-roster-signed.csv"),
  luma_source_version: F.LUMA_SOURCE_VERSION,
  approved_luma_guest_id: F.GUEST.pat,
  walkin_name: F.WALKIN.name,
  walkin_email: F.WALKIN.email,
  other_approved_luma_guest_id: F.GUEST.olu,
  expired_pair_token: expired.code,
  replayed_pair_token: replayed.code,
  valid_pair_code: valid.code,
  other_participant_email: F.O.email,
  other_participant_password: F.PERSONAL_PASSWORD,
  team_one_slug: F.slugOf("kestrel"),
  team_two_slug: F.slugOf("heron"),
  locked_team_slug: F.slugOf("ledger"),
  full_team_slug: F.slugOf("quartet"),
  expired_team_invite: "KH7X-EXP9",
  invite_team_slug: F.slugOf("inviter"),
  kane_adapter_credential: `Bearer ${token}`,
  invalid_hash_kane_event: kaneJson(invalidHash),
  unsigned_kane_event: kaneJson(unsigned),
  failed_kane_run_fixture: kaneJson(failed),
  team_one_unlisted_evidence_ref: `EV-${unlisted.id}`,
  valid_run_end_fixture: kaneJson(runEnd),
  valid_testrun_done_fixture: kaneJson(testrunDone),
  submission_team_password: F.STAGING_PASSWORD,
  complete_submission_team_slug: F.slugOf("finch"),
  deadline_submission_team_slug: F.slugOf("dove"),
  outage_team_slug: F.slugOf("outage"),
  outage_commit_sha: F.OFFLINE.commitSha,
  outage_project_name: F.OFFLINE.projectName,
  outage_witness: F.OFFLINE.witness,
  outage_incident_id: F.OFFLINE.incident,
  preflight_missing_repo_team_slug: F.slugOf("gannet"),
  preflight_missing_evidence_team_slug: F.slugOf("egret"),
  retry_submission_team_slug: F.slugOf("robin"),
  judge_one_time_code: codes.judge_one_time_code,
  superadmin_credentials: process.env.ADMIN_PASSWORD ?? "",
  integration_outage_fixture:
    `Local: integration_state slack, x and renderer are down ("not configured on this machine"; no SLACK_WEBHOOK_URL, X credentials or renderer). Fresh unchecked approved guests: ${F.GUEST.pat}, ${F.GUEST.quinn}. Fresh eligible teams (re-seed between runs): ${F.slugOf("tern")}, ${F.slugOf("wren")}.`,
  live_nonzero_count_fixture: `${checkedIn.length} attendees checked in on the seeded roster (${checkedIn.map((g) => g.luma_guest_id ?? g.name).join(", ")}); participants_checked_in is projected through /api/cron/metrics by the seed.`,
  non_opted_in_profile_identifier: `${F.O.display} (${olu.public_code})`,
  private_phone_fixture: F.PRIVATE_PHONE,
  matching_population_fixture:
    `${optedIn.length} participants are opted in (discoverable profile and teammate_discovery consent): ${optedIn.map((p) => `${p.name} ${p.public_code}${p.teamless ? " (looking)" : ""}`).join(", ")}. ` +
    `${optedIn.filter((p) => p.teamless).length} of them have no team. Everyone else (${pop.length - optedIn.length} people, including ${F.O.display} ${olu.public_code}) is not opted in.`,
  match_strength_fixture: F.MATCH.strength,
  match_interest_fixture: F.MATCH.interest,
  match_availability_fixture: F.MATCH.availability,
  match_learning_goal_fixture: F.MATCH.learningGoal,
  idea_team_slug: F.slugOf("kestrel"),
  unsupported_feature_idea: F.UNSUPPORTED_FEATURE,
  private_radar_fixture:
    `${F.slugOf("lark")} (Demo Lark): opted in with the public summary "${F.RADAR.lark.summary}"; its PRIVATE idea text is "${F.RADAR.lark.private}" (marker ${F.PRIVATE_RADAR_MARKER}), nearly identical to Kestrel's public summary. ` +
    `Consented controls: ${consentedRadar.join(", ")} (idea_discovery granted). Non-consented: ${F.slugOf("shrike")}. Kestrel's own private idea marker: ${F.PRIVATE_IDEA_MARKER}.`,
  nonconsented_radar_fixture:
    `${F.slugOf("shrike")} (Demo Shrike): discovery_opt_in = false and idea_discovery consent = false, public summary identical to Kestrel's. Consenting population: ${consentedRadar.join(", ")}, demo-orbit, demo-atlas (discovery_opt_in = true).`,
  possible_overlap_radar_fixture: `${F.slugOf("plover")} (Demo Plover, application): consented summary "${F.RADAR.plover.summary}"; word overlap with Kestrel 0.94, labelled possible overlap.`,
  similar_angle_radar_fixture: `${F.slugOf("curlew")} (Demo Curlew, agent): consented summary "${F.RADAR.curlew.summary}"; word overlap 0.36, same kind of build, labelled similar angle.`,
  complementary_radar_fixture: `${F.slugOf("avocet")} (Demo Avocet, validation harness): consented summary "${F.RADAR.avocet.summary}"; word overlap 0.21, harness vs application, labelled complementary.`,
  milestone_team_name: F.T.sparrow.name,
  milestone_team_password: F.MILESTONE_PASSWORD,
  milestone_team_slug: F.slugOf("sparrow"),
  milestone_project_slug: F.slugOf("sparrow"),
  milestone_verified_run_id: `KR-${tv.sparrow}`,
  deck_api_id: String(deckRow.id),
  submission_receipt_id: await receiptOf("finch"),
  launch_unapproved_team_slug: F.slugOf("draftpost"),
  launch_claims_team_slug: F.slugOf("claims"),
  launch_failed_video_team_slug: F.slugOf("glitch"),
  launch_no_footage_team_slug: F.slugOf("stills"),
  launch_complete_team_slug: F.slugOf("reel"),
  unsupported_kpi_claim: F.UNSUPPORTED_KPI,
  unsupported_testimonial_claim: F.UNSUPPORTED_TESTIMONIAL,
  error_kane_run_fixture: `KR-${tv.error} (${F.RUN_IDS.tvError}) on ${F.slugOf("ibis")}: completed, status errored, exit code 2, source verified.`,
  linked_commit_run_fixture: `KR-${tv.linked} (${F.RUN_IDS.tvLinked}) on ${F.slugOf("ibis")}: passed, source verified, repo demo-org/ibis (repo id demo-repo-ibis), commit ${F.SHA.ibis}.`,
  unlinked_run_fixture: `KR-${tv.unlinked} (${F.RUN_IDS.tvUnlinked}) on ${F.slugOf("ibis")}: completed with exit 0 but reported, not verified, and no commit SHA.`,
  photo_team_slug: F.slugOf("pelican"),
  unpublished_photo_marker: unpub.caption,
  unpublished_photo_url: `${base}/photos/${unpub.pathname}`,
  published_photo_marker: published[0].caption,
  published_gallery_manifest: published.map((p) => `photo #${p.id} ${p.caption} (/photos/${p.pathname})`).join("; "),
  private_idea_marker: F.PRIVATE_IDEA_MARKER,
  private_run_team_slug: F.slugOf("osprey"),
  private_run_marker: `${F.RUN_IDS.privateOsprey} (KR-${tv.osprey})`,
};

// ── Wave: overrides and the server clock ─────────────────────────────────────
let wave: { id: string; overrides?: Record<string, string>; clock?: string; tests: string[] } | undefined;
if (waveId) {
  const plan = JSON.parse(readFileSync(path.join(repo, "tests/fixtures/waves.json"), "utf8")) as { waves: NonNullable<typeof wave>[] };
  wave = plan.waves.find((w) => w.id === waveId);
  if (!wave) throw new Error(`issue-test-codes: no wave ${waveId} in tests/fixtures/waves.json`);
  for (const [k, v] of Object.entries(wave.overrides ?? {})) {
    if (!(k in values)) throw new Error(`issue-test-codes: wave ${waveId} overrides unknown variable ${k}`);
    values[k] = v;
  }
}
const [saved] = await query<{ value: string }>("select value from settings where key = 'fixture:submission_locks_at'");
if (wave?.clock === "submission_locked") {
  // The deadline test needs the authoritative server lock to have passed. Local only;
  // seed-local.mts and the next non-deadline wave put the real lock time back.
  if (!saved) {
    await query("insert into settings (key, value) select 'fixture:submission_locks_at', submission_locks_at::text from hack_events where id = current_event_id()");
  }
  await query("update hack_events set submission_locks_at = now() - interval '2 minutes' where id = current_event_id()");
} else if (saved) {
  await query("update hack_events set submission_locks_at = $1::timestamptz where id = current_event_id()", [saved.value]);
  await query("delete from settings where key = 'fixture:submission_locks_at'");
}

// ── Write assurance.json (keeps every description and secret flag) ───────────
const vars = JSON.parse(readFileSync(varsPath, "utf8")) as Record<string, { value: string; secret: boolean; description: string }>;
const missing: string[] = [];
for (const k of Object.keys(vars)) {
  if (values[k] === undefined || values[k] === "") missing.push(k);
  else vars[k].value = values[k];
}
const unknown = Object.keys(values).filter((k) => !(k in vars));
writeFileSync(varsPath, JSON.stringify(vars, null, 2) + "\n");
await pool.end();

console.log(
  JSON.stringify(
    {
      written: varsPath,
      wave: wave ? { id: wave.id, tests: wave.tests.length, overrides: Object.keys(wave.overrides ?? {}), clock: wave.clock ?? "event schedule" } : null,
      filled: Object.keys(vars).length - missing.length,
      missing,
      unknown_values: unknown,
      photographer_one_time_code: codes.photographer,
    },
    null,
    2,
  ),
);
if (missing.length) process.exit(2);
