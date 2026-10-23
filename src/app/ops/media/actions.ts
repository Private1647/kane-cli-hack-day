"use server";

import { refresh } from "next/cache";
import { AppError, formObject, runAction } from "@/server/core";
import { requireRole, staffActor } from "@/server/auth";
import { approvePhoto, holdPhoto, publishPhoto, rejectPhoto } from "@/server/photos";
import { approveDraft, markPostedManually, publishDraft, rejectDraft } from "@/server/social";
import type { PhotoState } from "@/app/photo/actions";

// Organizer media queue actions (photographers can reject/hold their own
// work; approval and publication are organizer decisions).

async function run(fn: (o: Record<string, unknown>) => Promise<unknown>, form: FormData, ok: string): Promise<PhotoState> {
  const res = await runAction(async () => fn(formObject(form)));
  if (!res.ok) return { error: res.error.message, problems: (res.error.details as { problems?: string[] } | null)?.problems };
  refresh();
  return { ok: res.receipt ? `${ok} · ${res.receipt.id}` : ok };
}

const organizer = () => requireRole("organizer");

export async function approvePhotoAction(_p: PhotoState, form: FormData) {
  return run(async (o) => approvePhoto(await organizer(), o), form, "Approved");
}
export async function publishPhotoAction(_p: PhotoState, form: FormData) {
  return run(async (o) => publishPhoto(await organizer(), o), form, "Published to the gallery");
}
export async function rejectPhotoAction(_p: PhotoState, form: FormData) {
  return run(async (o) => rejectPhoto(await requireRole("organizer", "photographer"), o), form, "Rejected");
}
export async function holdPhotoAction(_p: PhotoState, form: FormData) {
  return run(
    async (o) => {
      const staff = await requireRole("organizer", "photographer");
      const id = Number(o.photo_id);
      if (!Number.isInteger(id) || id <= 0) throw new AppError("VALIDATION_FAILED");
      await holdPhoto(staffActor(staff), id, String(o.reason || "Held by staff for review.").slice(0, 300));
      return null;
    },
    form,
    "Held for review",
  );
}
export async function approveDraftAction(_p: PhotoState, form: FormData) {
  return run(async (o) => approveDraft(await organizer(), o), form, "Post approved");
}
export async function rejectDraftAction(_p: PhotoState, form: FormData) {
  return run(async (o) => rejectDraft(await organizer(), o), form, "Post rejected");
}
export async function manualPostAction(_p: PhotoState, form: FormData) {
  return run(async (o) => markPostedManually(await organizer(), o), form, "Marked as posted by hand");
}
export async function publishDraftAction(_p: PhotoState, form: FormData) {
  return run(
    async (o) => publishDraft(await organizer(), { ...o, idempotency_key: typeof o.key === "string" && o.key.length >= 8 ? o.key : undefined }),
    form,
    "Posted to X",
  );
}
