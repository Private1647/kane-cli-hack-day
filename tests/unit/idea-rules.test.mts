// The rule-based Idea Validator (the fallback when AI is unavailable): plain
// wording of each criterion is recognised, and a thin idea still needs work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleAssessment } from "../../src/server/ideas.ts";

const FULL =
  "Build a functional browser task tracker for real users. An AI coding agent develops its features and repairs failures. " +
  "Kane CLI runs browser checks of task creation and completion. Use the same seeded tasks to repeat the checks. " +
  "Failed checks provide feedback that guides the coding agent's next change. Actual Kane run results and evidence show which " +
  "task flows work; the team uses those results to choose regressions to fix and decide whether to ship. Demonstrate task " +
  "creation, a failed check, its repair and a passing evidence-backed run at the event.";

test("an idea that states all eight criteria in plain words qualifies", () => {
  const r = ruleAssessment({ title: "Browser task tracker with Kane validation", description: FULL, project_type: "application" });
  assert.equal(r.verdict, "qualifies");
  assert.deepEqual(r.criteria.filter((c) => c.status !== "met").map((c) => c.id), []);
});

test("evidence quotes start on a word boundary", () => {
  const r = ruleAssessment({ title: "Tracker", description: FULL, project_type: "application" });
  for (const c of r.criteria) assert.match(c.evidence, /^(“[A-Z0-9a-z]|Not mentioned|Project type|No MVP|Too little)/, `${c.id}: ${c.evidence}`);
  for (const c of r.criteria) if (c.evidence.startsWith("“")) assert.ok(!/^“[a-z]{1,3} /.test(c.evidence) || /^“(an|a|the|use|to) /i.test(c.evidence), `${c.id} cut mid-word: ${c.evidence}`);
});

test("a one-line idea still needs work, with the count in good grammar", () => {
  const r = ruleAssessment({ title: "Testing tool", description: "Build a browser testing tool with unsupported Safari and Firefox support.", project_type: "tool" });
  assert.equal(r.verdict, "needs_work");
  assert.doesNotMatch(r.summary, /\b1 are\b/);
});
