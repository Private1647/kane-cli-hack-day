import { redirect } from "next/navigation";
import { toAppError } from "@/server/core";
import { completeGithubLink } from "@/server/pairing";

// GitHub OAuth callback. The access token is used once to read /user and is
// never stored. Any failure lands back on the passport with a reason code.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) redirect("/passport?github=cancelled");
  let result = "linked";
  let next = "/passport";
  try {
    next = (await completeGithubLink(code, state)).next;
  } catch (e) {
    result = toAppError(e).code === "CONFLICT" ? "taken" : "failed";
  }
  redirect(`${next}?github=${result}`);
}
