import { envelopeResponse, siteUrl } from "@/server/core";
import { readMutation } from "@/server/story";
import { finalizeSubmission, getSubmissionContext } from "@/server/submission";
import { submissionCaller } from "../_caller";

// POST /api/v1/submissions/finalize
//   { confirm_phrase: "<team name>", confirm: true, publish_showcase?: boolean, idempotency_key? }
//   (or the Idempotency-Key header)
// Browser session only, and only the team captain signed in as themselves:
// finalizing is irreversible. A bearer token (CLI / agent) gets needs_action
// with the link where the captain finishes it.

export async function POST(req: Request) {
  return envelopeResponse<unknown>(async () => {
    const { caller, slug } = await submissionCaller(req);
    if (caller.via === "bearer") {
      const ctx = await getSubmissionContext(caller.member.team_id!);
      const url = `/t/${slug}/submit#finalize`;
      return {
        status: "needs_action",
        message: `Agents can't finalize. The team captain finalizes in the browser at ${siteUrl(url)}.${ctx.preflight.ok ? "" : ` Still missing: ${ctx.preflight.missing.join(", ")}.`}`,
        data: { url, preflight_ok: ctx.preflight.ok, missing: ctx.preflight.missing },
        actions: [{ id: "finalize_in_browser", label: "Captain: finalize in the browser", requires_human_confirmation: true, href: siteUrl(url) }],
        fallbackText: `Captain: finalize at ${siteUrl(url)}`,
      };
    }
    const body = await readMutation(req);
    const { data, receipt } = await finalizeSubmission(slug, { confirm: true, ...body });
    return {
      message: `${data.already ? "Already finalized" : "Finalized"}. Receipt ${data.receipt_code} at ${data.finalized_at} (server time).`,
      data: { ...data, receipt },
      evidence: [{ kind: "submission_receipt", id: data.receipt_code, confidence: data.signed ? "verified" : "unverified" }],
      links: [{ label: `Receipt ${data.receipt_code}`, url: `/submit/receipt/${data.receipt_code}` }],
      fallbackText: `RECEIPT ${data.receipt_code} · ${data.finalized_at}`,
    };
  });
}
