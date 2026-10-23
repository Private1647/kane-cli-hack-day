import { redirect } from "next/navigation";

// GET /api/v1/auth/callback: the generic OAuth callback in openapi.yaml. The
// only provider is GitHub, so this forwards (query intact) to its handler.

export async function GET(req: Request) {
  const u = new URL(req.url);
  redirect(`/api/v1/auth/github/callback${u.search}`);
}
