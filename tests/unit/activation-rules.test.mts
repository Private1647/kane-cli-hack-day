// Event-day activation rules that need no database: how the TestMu AI claim
// API's answers map to what a participant sees, and how a Codex credit code
// upload is parsed, deduped and masked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimErrorText, mapClaimResponse } from "../../src/lib/testmu-claim.ts";
import { maskCode, parseCodexCodes, splitCsvLine } from "../../src/lib/codex-codes.ts";

test("any 2xx is a claim", () => {
  for (const s of [200, 201, 204]) assert.equal(mapClaimResponse(s, { ok: true }).outcome, "claimed");
  assert.equal(mapClaimResponse(200, undefined).outcome, "claimed");
});

test("404 and 'user/account not found' 4xx answers mean: register with TestMu AI first", () => {
  assert.equal(mapClaimResponse(404, null).outcome, "not_registered");
  assert.equal(mapClaimResponse(422, { code: "USER_NOT_FOUND" }).outcome, "not_registered");
  assert.equal(mapClaimResponse(400, { code: "NOT_REGISTERED" }).outcome, "not_registered");
  assert.equal(mapClaimResponse(422, { code: "INVALID_REQUEST", errors: { email: ["No account exists for this email."] } }).outcome, "not_registered");
  assert.equal(mapClaimResponse(422, { errors: { email: ["This user does not exist"] } }).outcome, "not_registered");
  assert.equal(mapClaimResponse(400, { message: "Account not found" }).outcome, "not_registered");
});

test("everything else is a plain error with a detail for staff", () => {
  // The documented empty-email answer is a request problem, not an unknown user.
  const empty = mapClaimResponse(422, { code: "INVALID_REQUEST", errors: { email: ["The email field is required."] } });
  assert.equal(empty.outcome, "error");
  assert.match(empty.detail ?? "", /HTTP 422 · INVALID_REQUEST · email: The email field is required\./);
  assert.equal(mapClaimResponse(422, { code: "ALREADY_CLAIMED", errors: { email: ["A trial was already claimed for this account."] } }).outcome, "error");
  assert.equal(mapClaimResponse(500, { code: "BOOM" }).outcome, "error");
  assert.equal(mapClaimResponse(503, undefined).detail, "HTTP 503 · malformed response");
  assert.equal(mapClaimResponse(401, { message: "Unauthorized" }).outcome, "error");
  assert.equal(mapClaimResponse(429, {}).outcome, "error");
  const timeout = mapClaimResponse(null, undefined, "timeout");
  assert.deepEqual(timeout, { outcome: "error", detail: "timeout" });
});

test("claim error text flattens code, message and field errors", () => {
  assert.equal(claimErrorText({ code: "X", errors: { email: ["a", "b"] } }), "X · email: a · email: b");
  assert.equal(claimErrorText("nope"), "");
});

test("a CSV with a code column keeps the other columns as extra", () => {
  const p = parseCodexCodes('﻿Amount,Code,Notes\n250,ABCD-1111,"first, batch"\n250,ABCD-2222,\n');
  assert.deepEqual(p.rows, [
    { code: "ABCD-1111", extra: { Amount: "250", Notes: "first, batch" } },
    { code: "ABCD-2222", extra: { Amount: "250" } },
  ]);
  assert.equal(p.duplicatesInFile, 0);
  assert.deepEqual(p.invalid, []);
});

test("one code per line, with duplicates and invalid lines counted", () => {
  const p = parseCodexCodes("CDX-AAAA-0001\n\nCDX-AAAA-0002\r\nCDX-AAAA-0001\nbad code!\nab\n");
  assert.deepEqual(p.rows.map((r) => r.code), ["CDX-AAAA-0001", "CDX-AAAA-0002"]);
  assert.equal(p.duplicatesInFile, 1);
  assert.deepEqual(p.invalid.map((i) => i.line), [5, 6]);
  assert.deepEqual(parseCodexCodes("   \n").rows, []);
});

test("csv splitting honours quotes and masking shows only the last four", () => {
  assert.deepEqual(splitCsvLine('a,"b,c","d""e"'), ["a", "b,c", 'd"e']);
  assert.equal(maskCode("CDX-1234-9F2A"), "••••-9F2A");
});
