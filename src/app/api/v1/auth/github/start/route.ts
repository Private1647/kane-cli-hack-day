import { redirect } from "next/navigation";
import { getMember } from "@/server/auth";
import { githubAuthorizeUrl, githubEnabled } from "@/server/pairing";

// Link a GitHub account to the signed-in passport (optional; public profile
// only, no repo scopes). Off unless GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set.

export async function GET(req: Request) {
  const next = new URL(req.url).searchParams.get("next") === "/activate" ? "/activate" : "/passport";
  const member = await getMember();
  if (!member) redirect("/passport/login?next=/passport");
  if (!githubEnabled()) redirect("/passport?github=disabled");
  redirect(await githubAuthorizeUrl(member, next));
}
