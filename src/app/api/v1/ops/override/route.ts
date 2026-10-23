import { requireRole } from "@/server/auth";
import { AppError, envelopeResponse, parse, z, zx } from "@/server/core";
import { OVERRIDE_KINDS, applyOverride, type OverrideKind } from "@/server/ops";
import { readMutation } from "@/server/story";

// POST /api/v1/ops/override   organizer (staff cookie)
//   { kind, target, reason, witness, incident_ref?, resource_type?, confirm_phrase: "override" }
// The same signed, witnessed, append-only override as /ops/override.

const schema = z.object({
  kind: z.enum(Object.keys(OVERRIDE_KINDS) as [OverrideKind, ...OverrideKind[]]),
  target: zx.text(120),
  resource_type: zx.optText(40),
  reason: zx.text(500),
  witness: zx.text(80),
  incident_ref: zx.optText(20),
  confirm_phrase: z.string().trim(),
});

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const staff = await requireRole("organizer");
    const input = parse(schema, await readMutation(req));
    if (input.confirm_phrase.toLowerCase() !== "override") throw new AppError("VALIDATION_FAILED", { userMessage: 'Send confirm_phrase "override" to confirm.' });
    const r = await applyOverride({ kind: input.kind, target: input.target, reason: input.reason, witness: input.witness, incidentRef: input.incident_ref, resourceType: input.resource_type }, staff);
    return { message: `Override recorded and ${r.signature ? "signed" : "hashed (no signing key set)"}.`, data: r };
  });
}
