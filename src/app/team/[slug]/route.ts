// /team/{slug} is the SPEC's address for a team; the hub lives at /t/{slug}.
export async function GET(request: Request, { params }: RouteContext<"/team/[slug]">) {
  const { slug } = await params;
  return Response.redirect(new URL(`/t/${encodeURIComponent(slug)}`, request.url), 308);
}
