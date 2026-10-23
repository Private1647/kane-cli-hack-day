"use server";

import { formObject, parse, z, zx } from "@/server/core";
import { ANNOUNCEMENT_VISIBILITY, publishAnnouncement, retractAnnouncement, type AnnouncementVisibility } from "@/server/ops";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Announcements (T-OPS-03): compose → TV and/or hub feed. Organizer only.

/** A same-site path or an https URL; never javascript:/data:/protocol-relative. */
const link = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((s) => s || null)
  .refine((s) => !s || (s.startsWith("/") && !s.startsWith("//") && !/[\s\\]/.test(s)) || /^https:\/\/[^\s]+$/.test(s), "Link must be a /path or an https:// URL");

const publishSchema = z.object({
  title: zx.text(100),
  body: z.string().trim().max(600).default(""),
  href: link,
  visibility: z.enum(Object.keys(ANNOUNCEMENT_VISIBILITY) as [AnnouncementVisibility, ...AnnouncementVisibility[]]),
  delay: z.coerce.number().int().min(0).max(24 * 60).default(0),
  template: zx.optText(40),
});

export async function publishAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(publishSchema, formObject(form));
    const r = await publishAnnouncement(
      { title: input.title, body: input.body, href: input.href, visibility: input.visibility, sendInMinutes: input.delay || null, templateId: input.template },
      staff,
    );
    return { message: input.delay ? `Scheduled for ${input.delay} min from now (${ANNOUNCEMENT_VISIBILITY[input.visibility]}).` : `Published to ${ANNOUNCEMENT_VISIBILITY[input.visibility]}.`, receipt: r };
  });
}

const retractSchema = z.object({ id: zx.id, reason: z.string().trim().min(3).max(300) });

export async function retractAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(retractSchema, formObject(form));
    const r = await retractAnnouncement(input.id, input.reason, staff);
    return { message: "Taken down. The audit log keeps what it said.", receipt: r };
  });
}
