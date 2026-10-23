// Personal sign-in's ?next=: participant pages are allowed, anything off-site is not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { personalNext } from "../../src/lib/next-path.ts";

test("pages that link to personal sign-in get their reader back", () => {
  for (const p of ["/t/demo-finch/submit", "/help", "/help/H-0001", "/studio/demo-swift/deck", "/pair?code=AB12-CD34", "/passport/badge", "/match"]) assert.equal(personalNext(p), p);
});

test("off-site and odd targets fall back to the passport", () => {
  for (const p of [undefined, "", "https://evil.example", "//evil.example", "/ops/settings", "/t/../ops", "/help\\evil", "/passportx"]) assert.equal(personalNext(p), "/passport");
});
