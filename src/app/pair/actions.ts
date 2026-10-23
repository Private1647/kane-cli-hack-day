"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/server/auth";
import { runAction, z } from "@/server/core";
import { decidePairing, formatCode } from "@/server/pairing";

// Approve or deny a kanehack/MCP pairing code. Only a signed-in person can
// bind a code to themselves; the CLI then picks up its token by polling.

export async function decide(form: FormData) {
  const code = z.string().trim().min(8).max(20).safeParse(form.get("code"));
  if (!code.success) redirect("/pair?result=invalid");
  const approve = form.get("decision") === "approve";
  const r = await runAction(async () => decidePairing(code.data, await requireMember(), approve));
  redirect(`/pair?code=${formatCode(code.data)}&result=${r.ok ? (approve ? "approved" : "denied") : "expired"}`);
}

export async function lookup(form: FormData) {
  const code = String(form.get("code") ?? "").trim().slice(0, 20);
  redirect(code ? `/pair?code=${encodeURIComponent(formatCode(code))}` : "/pair");
}
