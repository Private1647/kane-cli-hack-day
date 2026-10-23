import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireRole, type Staff } from "@/server/auth";
import { toAppError, type StaffRole } from "@/server/core";
import { logger } from "@/server/log";
import type { OpsState } from "./state";

// Server-action wrapper for /ops forms: role check first (every action, not
// just the page), then the service call; errors become user-safe OpsState.
// Successful actions refresh the page so lists update without a reload.

type Out = { message: string; receipt?: { id: string; server_time: string } | null; data?: unknown };

export async function act(roles: StaffRole[], form: FormData | null, fn: (staff: Staff) => Promise<Out>): Promise<OpsState> {
  const values: Record<string, string> = {};
  if (form) for (const [k, v] of form.entries()) if (typeof v === "string" && k.length < 64 && !k.startsWith("$") && v.length < 2000) values[k] = v;
  try {
    const staff = await requireRole(...roles);
    const out = await fn(staff);
    refresh();
    return { ok: true, message: out.message, receipt: out.receipt ?? null, data: out.data };
  } catch (e) {
    unstable_rethrow(e);
    const err = toAppError(e);
    if (err.code === "INTERNAL") logger(null, { area: "ops" }).error("ops.action_failed", e);
    const issues = err.details?.issues as { path: string; message: string }[] | undefined;
    return { ok: false, message: err.userMessage, issues, values };
  }
}

/** A required "why" for audited changes. */
export const reasonOf = (form: FormData) => String(form.get("reason") ?? "").trim();
