"use server";

import { PHASES, type Phase } from "@/lib/event";
import { FLAGS, getFlags, type Flag } from "@/lib/flags";
import { STAFF_ROLES } from "@/server/auth";
import { formObject, parse, z, zx } from "@/server/core";
import {
  DEADLINE_FIELDS,
  EVENT_VALUE_FIELDS,
  PUBLIC_STATUSES,
  issueCode,
  revokeMemberTokens,
  saveStaff,
  setDeployFreeze,
  setFlagAudited,
  setPhaseOverride,
  setPublicStatus,
  setRegistration,
  setStaffActive,
  updateDeadlines,
  updateEventValues,
  type DeadlineKey,
  type EventValueKey,
} from "@/server/ops";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// /ops/settings (T-OPS-02). Organizer only; every change carries a reason
// that lands in the audit log next to the before/after hashes.

const reason = z.string().trim().min(3, "Give a reason (3+ characters)").max(300);
const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the date-time picker");

const deadlinesSchema = z.object({
  reason,
  ...(Object.fromEntries(Object.keys(DEADLINE_FIELDS).map((k) => [k, wall])) as Record<DeadlineKey, typeof wall>),
});

export async function deadlinesAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(deadlinesSchema, formObject(form));
    const r = await updateDeadlines(input, input.reason, staff);
    return { message: "Deadlines saved. Every clock, lock and countdown now reads the new times.", receipt: r };
  });
}

const phaseSchema = z.object({ reason, phase: z.enum(["schedule", ...PHASES]) });

export async function phaseAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(phaseSchema, formObject(form));
    const phase = input.phase === "schedule" ? null : (input.phase as Phase);
    const r = await setPhaseOverride(phase, input.reason, staff);
    return { message: phase ? `Phase forced to ${phase.toUpperCase()}.` : "Phase follows the schedule again.", receipt: r };
  });
}

const statusSchema = z.object({ reason, public_status: z.enum(PUBLIC_STATUSES), registration: z.enum(["open", "closed"]) });

export async function statusAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(statusSchema, formObject(form));
    await setPublicStatus(input.public_status, input.reason, staff);
    const r = await setRegistration(input.registration === "open", input.reason, staff);
    return { message: `Event status ${input.public_status.replace("_", " ")}; registration ${input.registration}.`, receipt: r };
  });
}

export async function flagsAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const r = parse(reason, String(form.get("reason") ?? ""));
    const current = await getFlags();
    const changed: string[] = [];
    let last = null;
    for (const flag of Object.keys(FLAGS) as Flag[]) {
      const on = form.get(`flag_${flag}`) === "on";
      if (on !== current[flag]) {
        last = await setFlagAudited(flag, on, r, staff);
        changed.push(`${flag} ${on ? "on" : "off"}`);
      }
    }
    if (!changed.length) return { message: "No flags changed." };
    return { message: `Changed: ${changed.join(", ")}. Takes effect within 15 seconds on every server.`, receipt: last };
  });
}

const staffSchema = z.object({ email: zx.email, name: zx.text(120), role: z.enum(STAFF_ROLES as [string, ...string[]]) });

export async function saveStaffAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(staffSchema, formObject(form));
    const r = await saveStaff({ email: input.email, name: input.name, role: input.role as (typeof STAFF_ROLES)[number] }, staff);
    return { message: `Saved ${input.name} as ${input.role}. Issue them a one-time code below.`, receipt: r };
  });
}

const staffActiveSchema = z.object({ id: zx.id, active: z.enum(["true", "false"]), reason });

export async function staffActiveAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(staffActiveSchema, formObject(form));
    const r = await setStaffActive(input.id, input.active === "true", input.reason, staff);
    return { message: input.active === "true" ? "Account reactivated." : "Account deactivated. Their session stops working on its next request.", receipt: r };
  });
}

export async function issueCodeAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async (staff) => {
    const { id } = parse(z.object({ id: zx.id }), formObject(form));
    const code = await issueCode(id, staff);
    return { message: "One-time code issued. It is shown once; read it to them or hand it over on paper. Any earlier code stops working.", data: { code } };
  });
}

const revokeSchema = z.object({ public_code: z.string().trim().regex(/^P-?\d{3,6}$/i, "Use the P-code, e.g. P-1042"), reason });

export async function revokeTokensAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(revokeSchema, formObject(form));
    const code = input.public_code.toUpperCase().replace(/^P-?/, "P-");
    const r = await revokeMemberTokens(code, input.reason, staff);
    return { message: `Revoked ${r.revoked} CLI/MCP token${r.revoked === 1 ? "" : "s"} for ${code}. They'll need to pair again.`, receipt: r };
  });
}

const valuesSchema = z.object({
  reason,
  ...(Object.fromEntries(Object.keys(EVENT_VALUE_FIELDS).map((k) => [k, z.string().max(1000).optional()])) as Record<EventValueKey, z.ZodOptional<z.ZodString>>),
});

export async function eventValuesAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(valuesSchema, formObject(form));
    const { reason: why, ...values } = input;
    const r = await updateEventValues(values, why, staff);
    return { message: "Event values saved. The print kit, posters and runbook use them now.", receipt: r };
  });
}

const freezeSchema = z.object({ reason, freeze: z.enum(["on", "off"]) });

export async function freezeAction(_p: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const input = parse(freezeSchema, formObject(form));
    const r = await setDeployFreeze(input.freeze === "on", input.reason, staff);
    return { message: input.freeze === "on" ? "Deploy freeze is ON. Only fixes to Tier-0 paths until it's lifted." : "Deploy freeze lifted.", receipt: r };
  });
}
