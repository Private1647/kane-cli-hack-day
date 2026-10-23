"use server";

import { AppError, formObject, parse, z, zx } from "@/server/core";
import { OVERRIDE_KINDS, applyOverride, type OverrideKind } from "@/server/ops";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Signed manual override with a witness (T-OPS-08). Organizer only.

const schema = z.object({
  kind: z.enum(Object.keys(OVERRIDE_KINDS) as [OverrideKind, ...OverrideKind[]]),
  target: zx.text(120),
  resource_type: zx.optText(40),
  reason: zx.text(500),
  witness: zx.text(80),
  incident_ref: zx.optText(20),
  confirm_phrase: z.string().trim(),
});

export async function overrideAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(schema, formObject(form));
    // ConfirmByTyping only enables the button; the server checks the phrase too.
    if (input.confirm_phrase.toLowerCase() !== "override") {
      throw new AppError("VALIDATION_FAILED", { userMessage: 'Type "override" to confirm.' });
    }
    const r = await applyOverride(
      { kind: input.kind, target: input.target, reason: input.reason, witness: input.witness, incidentRef: input.incident_ref, resourceType: input.resource_type },
      staff,
    );
    return { message: `Override recorded and ${r.signature ? "signed" : "hashed (no signing key set)"}.`, receipt: { id: r.id, server_time: r.server_time }, data: r };
  });
}
