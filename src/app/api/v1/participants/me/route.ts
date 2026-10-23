import { AppError, envelopeResponse, idempotent, parse, siteUrl, z } from "@/server/core";
import { resolveCaller } from "@/server/pairing";
import { getPassport, profileSchema, updateProfile, type PrivatePassport } from "@/server/passport";

// GET   : your own Hacker Passport (private DTO) + the one next mission.
// PATCH : profile fields and consent changes. Consents are appended, never
//         overwritten. From an agent (bearer), consent changes need
//         explicit_confirmation: true, i.e. the person said yes in the chat.

function serialise(p: PrivatePassport) {
  return {
    ...p,
    member: { ...p.member, checked_in_at: p.member.checked_in_at?.toISOString() ?? null, activated_at: p.member.activated_at?.toISOString() ?? null },
    server_time: p.server_time.toISOString(),
  };
}

export async function GET(req: Request) {
  return envelopeResponse(async () => {
    const { member } = await resolveCaller(req);
    const p = await getPassport(member.id);
    return {
      message: `${p.member.short_name}: ${p.mission.title}`,
      data: serialise(p),
      uiType: "BuilderPassport",
      actions: [{ id: p.mission.action.id, label: p.mission.action.label, requires_human_confirmation: false, href: siteUrl(p.mission.action.href) }],
      links: [{ label: "Passport", url: "/passport" }],
      fallbackText: `${p.member.short_name} (${p.member.public_code}). State: ${p.state}. Next: ${p.mission.action.label} → ${siteUrl(p.mission.action.href)}`,
    };
  });
}

const patchBody = profileSchema.extend({
  explicit_confirmation: z.boolean().optional(),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});

export async function PATCH(req: Request) {
  return envelopeResponse(async () => {
    const caller = await resolveCaller(req);
    const raw = await req.json().catch(() => ({}));
    const { explicit_confirmation, idempotency_key, ...patch } = parse(patchBody, raw);
    if (caller.via === "bearer" && patch.consents && explicit_confirmation !== true) {
      throw new AppError("CONSENT_REQUIRED", { userMessage: "Consent changes from an agent need explicit_confirmation: true after the person agrees." });
    }
    const key = idempotency_key ?? req.headers.get("idempotency-key");
    const { result, replayed } = await idempotent(key, `participant.update:member:${caller.member.id}`, () =>
      updateProfile(caller.member, caller.actor, patch, caller.via === "bearer" ? "mcp" : "web"),
    );
    return {
      message: replayed ? "Already saved." : "Saved.",
      data: result,
      warnings: replayed ? ["IDEMPOTENT_REPLAY"] : [],
      links: [{ label: "Passport", url: "/passport" }],
    };
  });
}
