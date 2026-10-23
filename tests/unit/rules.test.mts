// Server rules that need no database: run confidence, the finalize story,
// roster re-import admission. Imports server modules through the test hooks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStory, runConfidence } from "../../src/server/showcase.ts";
import { EMPTY_DRAFT } from "../../src/server/submission.ts";
import { expectedAdmission } from "../../src/server/roster.ts";

test("a failing Kane run is a detection, never verified", () => {
  assert.equal(runConfidence({ status: "failed", source_verified: true }), "detected");
  assert.equal(runConfidence({ status: "passed", source_verified: false }), "reported");
  assert.equal(runConfidence({ status: "passed", source_verified: true }), "verified");
});

test("finalize story only names consenting people and keeps linked runs", () => {
  const run = { id: 7, source: "cli", upstream_execution_id: "x", status: "failed", exit_code: 1, commit_sha: null, objective: "login", source_verified: true, verification_state: "verified", evidence_artifact_id: null, report_url: null, at: null };
  const story = buildStory({
    projectId: 1,
    slug: "demo",
    draft: { ...EMPTY_DRAFT, project_name: "Demo", kane_run_ids: [7], run_command: "npx demo", social_links: ["https://x.com/a/status/1"] },
    runs: [run],
    credited: [{ member_id: 1, display_name: "Ada", handle: null, consent_recorded_at: null }],
    status: "published",
  });
  assert.equal(story.team.length, 1);
  assert.equal(story.proof[0].confidence, "participant_reported");
  assert.match(story.proof[0].claim, /detected a failure/);
});

const guest = (o: Partial<Parameters<typeof expectedAdmission>[0]>) => ({
  id: 1, luma_guest_id: "g", name: "G", approval_status: "approved", admission_status: "admitted", email_hash: null, email_hint: null, checked_in_at: null, staff_reference: null, ...o,
}) as Parameters<typeof expectedAdmission>[0];

test("re-import restores a guest that an earlier import dropped", () => {
  assert.equal(expectedAdmission(guest({ admission_status: "not_admitted" }), "approved"), "admitted");
});
test("re-import never undoes a revoke or a desk override", () => {
  assert.equal(expectedAdmission(guest({ admission_status: "revoked" }), "approved"), "revoked");
  assert.equal(expectedAdmission(guest({ admission_status: "admitted", staff_reference: "admitted at desk: vip" }), "declined"), "admitted");
});
test("a checked-in guest who falls off the list needs reconciliation, not removal", () => {
  assert.equal(expectedAdmission(guest({ checked_in_at: new Date() }), "declined"), "needs_reconciliation");
});
