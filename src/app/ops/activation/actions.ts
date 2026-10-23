"use server";

import { AppError, zx } from "@/server/core";
import { importCodexCodes, previewCodexImport, reassignCodexCode, revealCodexCode, revokeCodexCode } from "@/server/event-activation";
import { act, reasonOf } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Organizer-only Codex credit code admin. Every change is audited in
// src/server/event-activation.ts; codes never appear in the audit payload
// (only their last four characters).

const MAX_TEXT = 2_000_000;
const textOf = (form: FormData) => {
  const t = String(form.get("codes") ?? "");
  if (!t.trim()) throw new AppError("VALIDATION_FAILED", { userMessage: "Paste codes or choose a file first." });
  if (t.length > MAX_TEXT) throw new AppError("VALIDATION_FAILED", { userMessage: "That upload is too large. Split it into smaller files." });
  return t;
};

export async function previewCodesAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async () => {
    const p = await previewCodexImport(textOf(form));
    const { codes: _codes, ...counts } = p;
    void _codes;
    return { message: `${p.fresh} new · ${p.duplicates} duplicates · ${p.invalid.length} invalid`, data: counts };
  });
}

export async function importCodesAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async (staff) => {
    const batch = String(form.get("batch") ?? "").trim().slice(0, 80) || null;
    const out = await importCodexCodes(staff, textOf(form), batch);
    return { message: `Imported ${out.imported} codes${batch ? ` (batch ${batch})` : ""}. Skipped ${out.duplicates} duplicates and ${out.invalid} invalid.` };
  });
}

export async function revealCodeAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async (staff) => {
    const code = await revealCodexCode(staff, zx.id.parse(form.get("code_id")));
    return { message: "Revealed (audited).", data: { code } };
  });
}

export async function revokeCodeAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const receipt = await revokeCodexCode(staff, zx.id.parse(form.get("code_id")), reasonOf(form));
    return { message: "Code revoked. It will never be handed out again.", receipt };
  });
}

export async function reassignCodeAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const receipt = await reassignCodexCode(staff, zx.id.parse(form.get("member_id")), reasonOf(form));
    return { message: "New code assigned. The participant sees it on their checklist.", receipt };
  });
}
