import { requireRole } from "@/server/auth";
import { envelopeResponse, parse, z, zx } from "@/server/core";
import { SUBSYSTEMS, closeIncident, listIncidents, openIncident } from "@/server/recovery";
import { readMutation } from "@/server/story";

// /api/v1/ops/recovery   organizer (staff cookie)
//   GET  → recent incidents
//   POST { action: "open", subsystem, severity: sev1|sev2|sev3, description }
//   POST { action: "close", id, recovery_basis }
// Paper help tickets and manual submission receipts are typed in at
// /ops/recovery (they need a witness and the participant at the desk).

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), subsystem: z.enum(SUBSYSTEMS), severity: z.enum(["sev1", "sev2", "sev3"]), description: zx.text(500) }),
  z.object({ action: z.literal("close"), id: zx.id, recovery_basis: zx.text(500) }),
]);

export async function GET() {
  return envelopeResponse(async () => {
    await requireRole("organizer");
    const rows = await listIncidents();
    return { message: `${rows.length} incident${rows.length === 1 ? "" : "s"}.`, data: rows };
  });
}

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const staff = await requireRole("organizer");
    const input = parse(schema, await readMutation(req));
    if (input.action === "open") {
      const r = await openIncident({ subsystem: input.subsystem, severity: input.severity, description: input.description }, staff);
      return {
        message: `${r.id} opened.${input.severity === "sev1" ? " Switch to paper forms and assign a two-person receipt team." : ""}`,
        data: { receipt: r },
        links: [{ label: "Recovery", url: "/ops/recovery" }],
      };
    }
    const r = await closeIncident(input.id, input.recovery_basis, staff);
    return { message: `${r.id} closed. Reconcile anything taken on paper at /ops/recovery.`, data: { receipt: r } };
  });
}
