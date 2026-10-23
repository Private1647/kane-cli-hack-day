import { getStaff, hasRole } from "@/server/auth";
import { csvHeaders } from "@/server/csv";
import { logger } from "@/server/log";
import { exportRoster } from "@/server/roster";

// "Last signed roster" CSV for offline check-in (T-FB-03). Organizers only.
// No full emails. The sha256 and HMAC signature travel in headers and in
// the file name so a printed or copied file can be checked later.

export async function GET(req: Request) {
  const staff = await getStaff();
  if (!staff || !hasRole(staff, "organizer")) return new Response("Unauthorized", { status: 401 });
  const l = logger(req, { route: "ops.roster.export" });
  const { csv, rows, digest, signature, exportedAt } = await exportRoster(staff);
  l.info("roster.export", { rows: rows.length, sha256: digest });
  const stamp = new Date(exportedAt).toISOString().replace(/[:.]/g, "").slice(0, 15);
  return new Response(csv, {
    headers: csvHeaders(`roster-${stamp}-${digest.slice(0, 8)}.csv`, {
      "x-roster-sha256": digest,
      ...(signature ? { "x-roster-signature": signature } : {}),
      "x-roster-exported-at": new Date(exportedAt).toISOString(),
    }),
  });
}
