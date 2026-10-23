import { confirmPhoneSelfie, confirmSelfie } from "@/server/activation";
import { getPersonalMember } from "@/server/auth";
import { AppError, envelopeResponse } from "@/server/core";

// The selfie upload (multipart: file, trusted, idempotency_key, [handoff]).
// Browser-only: a signed-in browser (cookie) or the phone's one-time handoff
// token. A bearer token (agent) is refused on purpose, so a selfie never
// passes through an agent or its prompt context (SPEC §2).

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    if (req.headers.get("authorization")) throw new AppError("FORBIDDEN", { userMessage: "Selfies are only accepted from the participant’s own browser." });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) throw new AppError("VALIDATION_FAILED", { userMessage: "No photo was attached." });
    const trusted = form.get("trusted") === "1";
    const key = String(form.get("idempotency_key") ?? "").slice(0, 200) || null;
    const handoff = form.get("handoff");

    const data =
      typeof handoff === "string" && handoff
        ? await confirmPhoneSelfie(handoff, file, { trusted, idempotencyKey: key })
        : await (async () => {
            const member = await getPersonalMember();
            if (!member) throw new AppError("UNAUTHENTICATED");
            return confirmSelfie(member, file, { trusted, via: "desktop", idempotencyKey: key });
          })();
    return { message: "Photo saved privately.", data };
  });
}
