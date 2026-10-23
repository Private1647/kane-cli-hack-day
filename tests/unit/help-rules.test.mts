// Help-desk rules that need no database: what a mentor may read on a ticket,
// and how a paper slip's time is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePaperTime, redactRestricted, scrubSecrets, wallClockWords } from "../../src/server/help-rules.ts";

const mentor = { privateRepos: ["demo-org/kestrel-core"], repoAccess: false };

test("secrets are scrubbed, ordinary settings are not", () => {
  const r = scrubSecrets("token=abc123 OPENAI_API_KEY=sk-x1 \"api_key\": \"zz9\" postgres://app:hunter2@db/x Authorization: Bearer abcdefghijklmnop1234 max_tokens=1024");
  assert.ok(r.redacted);
  for (const leak of ["abc123", "sk-x1", "zz9", "hunter2", "abcdefghijklmnop1234"]) assert.ok(!r.text.includes(leak), leak);
  assert.match(r.text, /max_tokens=1024/);
  assert.match(r.text, /token=\[redacted: secret\]/);
  assert.equal(scrubSecrets("tokenizer: fast, Secret Manager: on").redacted, false);
  // Scrubbing again (mentor reads re-scrub stored text) changes nothing.
  assert.deepEqual(scrubSecrets(r.text), { text: r.text, redacted: false });
});

test("the seeded sensitive ticket loses all three markers for a mentor", () => {
  const details = [
    "My env has token=KHSECRET-MARKER-41A7-sk-live-0000 and the run still fails.",
    'From our private repo demo-org/kestrel-core (private): PRIVATE-REPO-MARKER-9C2 const PAYMENT_KEY_PATH = "/srv/keys";',
    "Selfie face template for my badge: BIOMETRIC-MARKER-5F8 vector=[0.12,0.88,0.41]",
  ].join("\n");
  const r = redactRestricted(details, mentor);
  for (const marker of ["KHSECRET", "PRIVATE-REPO-MARKER", "BIOMETRIC-MARKER", "0.88", "PAYMENT_KEY_PATH"]) assert.ok(!r.text.includes(marker), marker);
  assert.match(r.text, /From our private repo demo-org\/kestrel-core \(private\): \[redacted: private repository excerpt \(demo-org\/kestrel-core\)\]/);
  assert.match(r.text, /\[redacted: biometric data\]/);
  assert.deepEqual(r.kinds.sort(), ["biometric", "private_repo", "secret"]);
});

test("a teammate with repo access keeps the excerpt but never the face data", () => {
  const r = redactRestricted("From demo-org/kestrel-core: const x = 1;\nface embedding: [0.1, 0.2, 0.3, 0.4]", { ...mentor, repoAccess: true });
  assert.match(r.text, /const x = 1;/);
  assert.ok(!r.text.includes("0.3"));
});

test("a code block pasted after a private-repo line is redacted", () => {
  const r = redactRestricted("Here's the handler from our internal repo:\n```ts\nexport const secretSauce = 42;\n```\nIt throws on line 3.", { privateRepos: [], repoAccess: false });
  assert.ok(!r.text.includes("secretSauce"));
  assert.match(r.text, /It throws on line 3\./);
  const indented = redactRestricted("pasted from demo-org/kestrel-core:\n    def charge(card):\n        return card.token\nthat's it", mentor);
  assert.ok(!indented.text.includes("def charge"));
  assert.match(indented.text, /that's it/);
});

test("stack traces, error messages and public code stay readable", () => {
  const text = [
    "can't push to demo-org/kestrel-core: remote: Permission denied",
    "TypeError: Cannot read properties of undefined (reading 'map')",
    "    at charge (kestrel-core/src/pay.ts:42:7)",
    "From the public repo acme/demo: const ok = true;",
    "```js",
    "const result = await kane.run({ headless: true });",
    "```",
    "My selfie upload fails with a 500",
    "weights = [0.1, 0.2, 0.3]",
  ].join("\n");
  const r = redactRestricted(text, mentor);
  assert.equal(r.text, text);
  assert.deepEqual(r.kinds, []);
});

test("selfie files, image data and bare embeddings are removed", () => {
  const vec = `[${Array.from({ length: 40 }, (_, i) => (i / 100).toFixed(2)).join(", ")}]`;
  const r = redactRestricted(`see selfies/demo/kit-1.jpg, https://blob.example/selfies/abc and my_selfie.HEIC\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUg==\n${vec}`, mentor);
  assert.ok(!/kit-1|\/selfies\/abc|my_selfie|iVBOR|0\.39/.test(r.text), r.text);
  assert.deepEqual(r.kinds.sort(), ["biometric", "selfie"]);
});

test("paper times: 24-hour and AM/PM read the same wall time", () => {
  const ok = (s: string) => {
    const r = parsePaperTime(s, "2026-10-24");
    assert.ok(r.ok, s);
    return r.value;
  };
  assert.equal(ok("2026-10-23T00:15"), "2026-10-23 00:15:00"); // the date-time picker's form
  assert.equal(ok("2026-10-23 12:15 AM"), "2026-10-23 00:15:00");
  assert.equal(ok("00:15"), "2026-10-24 00:15:00");
  assert.equal(ok("12:30 pm"), "2026-10-24 12:30:00");
  assert.equal(ok("1:05 P.M."), "2026-10-24 13:05:00");
  assert.equal(ok("13:05"), "2026-10-24 13:05:00");
  const iso = parsePaperTime("2026-10-23T00:15:00-07:00", "2026-10-24");
  assert.ok(iso.ok && !iso.local && iso.value === "2026-10-23T07:15:00.000Z");
});

test("paper times: ambiguous or impossible times are refused with a hint", () => {
  const bad = (s: string, re: RegExp) => {
    const r = parsePaperTime(s, "2026-10-24");
    assert.ok(!r.ok, s);
    assert.match(r.message, re);
  };
  bad("1:05", /AM or PM.*01:05 or 13:05/);
  bad("13:05 PM", /1–12/);
  bad("0:30 am", /1–12/);
  bad("24:00", /real time/);
  bad("2026-02-30 10:00", /real date/);
  bad("quarter past one", /24-hour/);
  bad("", /Copy the time/);
});

test("wall clock words spell out AM/PM", () => {
  assert.equal(wallClockWords("00:15"), "12:15 AM (just after midnight)");
  assert.equal(wallClockWords("13:05"), "1:05 PM");
  assert.equal(wallClockWords("12:00"), "12:00 PM (noon)");
  assert.equal(wallClockWords("7:5"), null);
});
