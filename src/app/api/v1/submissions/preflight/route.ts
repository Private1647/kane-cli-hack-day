import { envelopeResponse } from "@/server/core";
import { readMutation } from "@/server/story";
import { runPreflight } from "@/server/submission";
import { submissionCaller } from "../_caller";

// POST /api/v1/submissions/preflight   { check_github?: boolean }
// Runs the same preflight as the Submit tab on the caller's team draft and
// stores the report. Read-mostly: it never finalizes.

export async function POST(req: Request) {
  return envelopeResponse(async () => {
    const { slug, as } = await submissionCaller(req);
    const body = await readMutation(req);
    const report = await runPreflight(slug, { checkGithub: body.check_github === true }, as);
    return {
      status: report.ok ? "ok" : "needs_action",
      message: report.ok ? "Preflight passed. The team captain can finalize in the browser." : `Still missing: ${report.missing.join(", ")}.`,
      data: report,
      links: [{ label: "Submit tab", url: `/t/${slug}/submit` }],
      fallbackText: report.items.map((i) => `${i.state === "ok" ? "[x]" : i.state === "uncertain" ? "[?]" : "[ ]"} ${i.label}`).join("\n"),
    };
  });
}
