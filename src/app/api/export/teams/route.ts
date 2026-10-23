import { exportTeams, hasExportToken } from "@/lib/photos";

// Feed for the local photo pipeline (photo-pipeline/enroll.py): every team with
// its idea, members, social handles, registration photo paths and consent.
// Photo paths download from /photos/<path> with the same x-export-token header.

export async function GET(request: Request) {
  if (!hasExportToken(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const teams = await exportTeams();
  return Response.json({ generated_at: new Date().toISOString(), teams }, { headers: { "cache-control": "no-store" } });
}
