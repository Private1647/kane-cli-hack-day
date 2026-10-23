// React resets a form after its action finishes, and an uncontrolled <select> resets to the
// defaultValue it was MOUNTED with: React never applies a later defaultValue change to a select.
// So a select showing a saved value must be keyed by that value, or after "Save" it shows the
// old choice (and the next save writes the old choice back). Found by the kane-cli suite (t-144:
// the idea's project type reverted to "App / product" after saving "Tool / CLI").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SAVED_SELECTS: [file: string, name: string, value: string][] = [
  ["src/app/t/[slug]/idea/parts.tsx", "project_type", "defaults.project_type"],
  ["src/app/match/parts.tsx", "preferred_work", "defaults.preferred_work"],
  ["src/app/match/parts.tsx", "availability", "defaults.availability"],
  ["src/app/t/[slug]/submit/SubmissionForm.tsx", "project_type", "draft.project_type"],
];

test("selects that show a saved value remount when the saved value changes", () => {
  for (const [file, name, value] of SAVED_SELECTS) {
    const src = readFileSync(file, "utf8");
    const tag = src.match(new RegExp(`<select[^>]*name="${name}"[^>]*>`))?.[0];
    assert.ok(tag, `${file}: no <select name="${name}">`);
    assert.ok(tag.includes(`defaultValue={${value}}`), `${file}: ${name} no longer defaults to ${value}`);
    assert.ok(tag.includes(`key={${value}}`), `${file}: <select name="${name}"> must have key={${value}} so a post-save form reset shows the saved value`);
  }
});
