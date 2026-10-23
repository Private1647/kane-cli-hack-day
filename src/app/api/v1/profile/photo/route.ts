import { getPersonalMember } from "@/server/auth";
import { saveAvatar } from "@/server/avatar";
import { AppError, envelopeResponse } from "@/server/core";

// The /register photo step (multipart: file, trusted, consent, idempotency_key).
// Browser-only and personal: a bearer token (agent) is refused on purpose, so
// a photo never passes through an agent or its prompt context.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    if (req.headers.get("authorization")) throw new AppError("FORBIDDEN", { userMessage: "Photos are only accepted from the participant’s own browser." });
    const member = await getPersonalMember();
    if (!member) throw new AppError("UNAUTHENTICATED");
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new AppError("VALIDATION_FAILED", { userMessage: "No photo was attached." });
    const data = await saveAvatar(member, file, {
      trusted: form.get("trusted") === "1",
      consent: form.get("consent") === "1",
      idempotencyKey: String(form.get("idempotency_key") ?? "").slice(0, 200) || null,
    });
    return { message: "Photo saved privately.", data };
  });
}
