"use server";

import { staffActor } from "@/server/auth";
import { formObject, parse, z } from "@/server/core";
import { INTEGRATIONS, markIntegration, probeIntegrations, recordIntegration, setIntegrationPaused } from "@/server/ops";
import { drainOutbox, requeueOutbox } from "@/server/outbox";
import { writeAudit } from "@/server/core";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// /ops/integrations (T-OPS-04): probe, pause/resume, staff-reported status,
// and outbox drain/retry. Organizer only. Writes integration_state, which the
// TV and ops banners read.

const system = z.string().refine((s) => s in INTEGRATIONS, "Unknown system");
const reason = z.string().trim().min(3).max(300);

export async function probeAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const res = await probeIntegrations(staffActor(staff));
    const bad = res.filter((r) => r.status !== "ok");
    return { message: bad.length ? `Checked ${res.length}: ${bad.map((b) => `${b.system} ${b.status}`).join(", ")}.` : `Checked ${res.length} systems: all OK.`, data: res };
  });
}

export async function pauseAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(z.object({ system, paused: z.enum(["true", "false"]), reason }), formObject(form));
    const r = await setIntegrationPaused(input.system, input.paused === "true", input.reason, staff);
    return { message: input.paused === "true" ? `${INTEGRATIONS[input.system].label} paused. Callers skip it until resumed.` : `${INTEGRATIONS[input.system].label} resumed.`, receipt: r };
  });
}

export async function markAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(z.object({ system, status: z.enum(["ok", "degraded", "down", "unknown"]), detail: reason }), formObject(form));
    const r = await markIntegration(input.system, input.status, input.detail, staff);
    return { message: `${INTEGRATIONS[input.system].label} marked ${input.status}. The TV banner follows.`, receipt: r };
  });
}

export async function drainAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const r = await drainOutbox(50);
    await recordIntegration("cron", { ok: true, detail: `manual drain: ${r.delivered} delivered, ${r.failed} retrying, ${r.dead} dead` });
    await writeAudit(staffActor(staff), { action: "outbox.drain_manual", resourceType: "outbox", resourceId: "outbox", payload: r });
    return { message: `Claimed ${r.claimed}: ${r.delivered} delivered, ${r.failed} will retry, ${r.dead} gave up.` };
  });
}

export async function requeueAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(z.object({ only_dead: z.enum(["true", "false"]), reason }), formObject(form));
    const n = await requeueOutbox(input.only_dead === "true");
    await writeAudit(staffActor(staff), { action: "outbox.requeue", resourceType: "outbox", resourceId: "outbox", reason: input.reason, payload: { requeued: n, only_dead: input.only_dead === "true" } });
    return { message: `Requeued ${n} event${n === 1 ? "" : "s"}. They go out on the next drain.` };
  });
}
