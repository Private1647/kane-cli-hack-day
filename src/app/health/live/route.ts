import { connection } from "next/server";

// Liveness: the function runs. No database, no secrets, no PII.
export async function GET() {
  await connection();
  return Response.json({ status: "ok", time: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
