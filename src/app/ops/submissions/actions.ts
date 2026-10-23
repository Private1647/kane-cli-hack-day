"use server";

import { refresh } from "next/cache";
import { getEvent } from "@/lib/event";
import { requireRole } from "@/server/auth";
import { formObject, runAction, type ActionResult } from "@/server/core";
import { moderateShowcase, renameShipSlug } from "@/server/showcase";
import { lockFinalized, recordManualReceipt, withdrawSubmission } from "@/server/submission";

// Organizer-only wrappers. Role, validation and audit are re-checked in the
// service functions; nothing here trusts the form.

type R<T> = ActionResult<T> | null;

async function done<T>(res: ActionResult<T>) {
  if (res.ok) refresh();
  return res;
}

export async function moderateAction(_prev: R<string>, form: FormData) {
  return done(await runAction(async () => moderateShowcase(await requireRole("organizer"), formObject(form))));
}

export async function renameAction(_prev: R<string>, form: FormData) {
  return done(await runAction(async () => renameShipSlug(await requireRole("organizer"), formObject(form))));
}

export async function withdrawAction(_prev: R<number>, form: FormData) {
  return done(await runAction(async () => withdrawSubmission(await requireRole("organizer"), formObject(form))));
}

export async function lockAction(_prev: R<number>) {
  return done(await runAction(async () => lockFinalized(await requireRole("organizer"))));
}

export async function manualReceiptAction(_prev: R<{ receipt_code: string; received_after_lock: boolean; recorded_at: string }>, form: FormData) {
  return done(
    await runAction(async () => {
      const staff = await requireRole("organizer");
      const e = await getEvent();
      return recordManualReceipt(staff, formObject(form), e.timezone);
    }),
  );
}
