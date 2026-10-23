"use server";

import { AppError, formObject, parse, z, zx } from "@/server/core";
import { staffActor } from "@/server/auth";
import { issueMemberLoginCode } from "@/server/pairing";
import { admitRegisteredMember, admitWalkIn, checkInGuest } from "@/server/roster";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Check-in desk actions. Mentors and organizers staff the desk; admitting a
// guest who isn't approved is organizer-only (enforced in the service).

const DESK = ["organizer", "mentor"] as const;

const checkInSchema = z.object({
  guest_id: zx.id,
  override: zx.checkbox.optional(),
  reason: z.string().trim().max(300).optional(),
  idempotency_key: zx.idempotencyKey,
});

export async function checkInAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act([...DESK], form, async (staff) => {
    const input = parse(checkInSchema, formObject(form));
    if (input.override && (!input.reason || input.reason.length < 3)) {
      throw new AppError("VALIDATION_FAILED", { userMessage: "Say why this guest is being admitted (it goes in the audit log)." });
    }
    const r = await checkInGuest({ guestId: input.guest_id, override: input.override ? { reason: input.reason! } : null, idempotencyKey: input.idempotency_key }, staff);
    return {
      message: r.alreadyCheckedIn ? `${r.name} was already checked in.` : `${r.name} is checked in${r.publicCode ? ` · ${r.publicCode}` : ""}.`,
      receipt: { id: r.id, server_time: r.checkedInAt },
      data: r,
    };
  });
}

const walkInSchema = z.object({
  name: zx.text(120),
  email: zx.email,
  display_name: zx.optText(60),
  note: zx.optText(200),
  idempotency_key: zx.idempotencyKey,
});

export async function walkInAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act([...DESK], form, async (staff) => {
    const input = parse(walkInSchema, formObject(form));
    const r = await admitWalkIn({ name: input.name, email: input.email, displayName: input.display_name, note: input.note, idempotencyKey: input.idempotency_key }, staff);
    const what = r.createdMember ? "New walk-in admitted" : r.createdGuest ? "Registered member admitted as walk-in" : "Existing roster row admitted";
    return { message: `${what}: ${r.name}${r.publicCode ? ` · ${r.publicCode}` : ""}.`, receipt: { id: r.id, server_time: r.checkedInAt }, data: r };
  });
}

const admitMemberSchema = z.object({ member_id: zx.id, note: zx.optText(200), idempotency_key: zx.idempotencyKey });

export async function admitMemberAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act([...DESK], form, async (staff) => {
    const input = parse(admitMemberSchema, formObject(form));
    const r = await admitRegisteredMember({ memberId: input.member_id, note: input.note, idempotencyKey: input.idempotency_key }, staff);
    return { message: `${r.name} admitted at the desk and checked in${r.publicCode ? ` · ${r.publicCode}` : ""}.`, receipt: { id: r.id, server_time: r.checkedInAt }, data: r };
  });
}

const signInCodeSchema = z.object({ member_id: zx.id, idempotency_key: zx.idempotencyKey });

/**
 * A one-time personal sign-in code for someone standing at the desk (after the
 * venue's ID check). It proves the person, unlike the shared team password, so
 * it unlocks pairing, consents and the selfie. Audited; replaces any earlier code.
 */
export async function signInCodeAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act([...DESK], form, async (staff) => {
    const input = parse(signInCodeSchema, formObject(form));
    const code = await issueMemberLoginCode(input.member_id, staffActor(staff));
    return { message: "One-time sign-in code. Show it only to this person; it works once, at /passport/login.", data: { code } };
  });
}
