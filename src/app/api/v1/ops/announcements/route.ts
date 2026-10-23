import { requireRole } from "@/server/auth";
import { envelopeResponse, parse, z, zx } from "@/server/core";
import { ANNOUNCEMENT_VISIBILITY, publishAnnouncement, type AnnouncementVisibility } from "@/server/ops";
import { readMutation } from "@/server/story";

// POST /api/v1/ops/announcements   organizer (staff cookie)
//   { title, body?, href?, visibility: both|tv|hub|staff, delay_minutes? }
// Same rules as /ops/announcements: unfilled [placeholders] are refused, the
// send is audited, and the receipt carries the server send time.

const link = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((s) => s || null)
  .refine((s) => !s || (s.startsWith("/") && !s.startsWith("//") && !/[\s\\]/.test(s)) || /^https:\/\/[^\s]+$/.test(s), "Link must be a /path or an https:// URL");

const schema = z.object({
  title: zx.text(100),
  body: z.string().trim().max(600).default(""),
  href: link,
  visibility: z.enum(Object.keys(ANNOUNCEMENT_VISIBILITY) as [AnnouncementVisibility, ...AnnouncementVisibility[]]),
  delay_minutes: z.coerce.number().int().min(0).max(24 * 60).default(0),
});

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const staff = await requireRole("organizer");
    const input = parse(schema, await readMutation(req));
    const receipt = await publishAnnouncement({ title: input.title, body: input.body, href: input.href, visibility: input.visibility, sendInMinutes: input.delay_minutes || null }, staff);
    return { message: `Announcement ${receipt.id} ${input.delay_minutes ? "scheduled" : "published"} (${ANNOUNCEMENT_VISIBILITY[input.visibility]}).`, data: { receipt } };
  });
}
