import { getStaff, hasRole, staffActor } from "@/server/auth";
import { writeAudit } from "@/server/core";
import { bufferCsv } from "@/server/social";

// GET /api/v1/social/export: Buffer bulk-upload CSV of approved posts (the
// manual path when X publishing is off). Image URL is the public gallery URL,
// filled only for photos already published.

export async function GET() {
  const staff = await getStaff();
  if (!hasRole(staff, "organizer")) return new Response("Unauthorized", { status: 401 });
  const csv = await bufferCsv();
  await writeAudit(staffActor(staff!), { action: "social.export_buffer", resourceType: "social_draft", resourceId: "buffer" }).catch(() => {});
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="buffer-queue.csv"', "cache-control": "no-store" },
  });
}
