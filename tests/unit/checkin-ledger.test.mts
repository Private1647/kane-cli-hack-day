// The signed paper check-in ledger row parser (checkin-ledger-template.csv).
// No database: matching the attendee and resolving the time happen on import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEDGERS, parseCheckinLedgerRow } from "../../src/server/recovery.ts";

const slip = (o: Record<string, string> = {}) => ({
  receipt_id: "chk-off042",
  attendee_id: "gst-quinn",
  checked_in_at: "2026-10-23 00:15",
  timezone: "America/Los_Angeles",
  delay_reason: "Venue Wi-Fi outage at the check-in desk",
  staff_id: "Sam Ortiz",
  staff_signature: "S.O.",
  witness_id: "Morgan Reyes",
  ...o,
});

test("a signed slip parses with its own id, attendee, paper time and reason", () => {
  const r = parseCheckinLedgerRow(slip());
  assert.equal(r.receiptId, "CHK-OFF042");
  assert.equal(r.attendeeRef, "gst-quinn");
  assert.equal(r.rawTime, "2026-10-23 00:15");
  assert.equal(r.timezone, "America/Los_Angeles");
  assert.equal(r.reason, "Venue Wi-Fi outage at the check-in desk");
  assert.equal(r.witness, "Morgan Reyes");
});

test("the template's columns are what the parser reads", () => {
  assert.deepEqual([...LEDGERS.checkin_ledger.headers], Object.keys(slip()));
});

test("a slip without an id, attendee, time, reason or signature is refused", () => {
  for (const missing of ["receipt_id", "attendee_id", "checked_in_at", "delay_reason", "staff_id", "staff_signature"]) {
    assert.throws(() => parseCheckinLedgerRow(slip({ [missing]: "  " })), { code: "VALIDATION_FAILED" }, missing);
  }
  assert.throws(() => parseCheckinLedgerRow(slip({ receipt_id: "not a slip id" })), { code: "VALIDATION_FAILED" });
});

test("optional columns may be blank, but the witness can't be the signer", () => {
  const r = parseCheckinLedgerRow(slip({ timezone: "", witness_id: "" }));
  assert.equal(r.timezone, null);
  assert.equal(r.witness, null);
  assert.throws(() => parseCheckinLedgerRow(slip({ witness_id: "sam ortiz" })), { code: "VALIDATION_FAILED" });
});
