"use server";

import { staffActor } from "@/server/auth";
import { formObject, parse, z, zx } from "@/server/core";
import { commitRosterImport, previewRosterImport, reconcileRoster } from "@/server/roster";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Roster import (T-ROS-01) and reconciliation (T-ROS-02). Organizer only.

const csvField = z.string().min(1, "Choose a CSV file first").max(950_000, "File is too large; split it");

const previewSchema = z.object({ csv: csvField, source_version: zx.optText(120), file_name: zx.optText(200) });

export async function previewImportAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async () => {
    const input = parse(previewSchema, formObject(form));
    const diff = await previewRosterImport({ csv: input.csv, sourceVersion: input.source_version });
    const changes = diff.added.length + diff.changed.length;
    return {
      message: `${diff.rowCount} rows read: ${diff.added.length} new, ${diff.changed.length} changed, ${diff.unchanged} unchanged, ${diff.removed.length} not in this file, ${diff.rejected.length} rejected.${changes ? "" : " Nothing new to import."}`,
      data: diff,
    };
  });
}

const commitSchema = z.object({
  csv: csvField,
  expected_hash: z.string().regex(/^[0-9a-f]{64}$/),
  source_version: zx.optText(120),
  file_name: zx.optText(200),
  mark_missing: zx.checkbox.optional(),
});

export async function commitImportAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], null, async (staff) => {
    const input = parse(commitSchema, formObject(form));
    const r = await commitRosterImport(
      { csv: input.csv, expectedHash: input.expected_hash, sourceVersion: input.source_version, fileName: input.file_name, markMissing: !!input.mark_missing },
      staff,
    );
    return {
      message: `Imported: ${r.added} new, ${r.changed} changed, ${r.removed} marked not admitted. Reconciled ${r.reconciled.linked} registrations; ${r.reconciled.needsReconciliation} still need reconciliation.`,
      receipt: { id: r.id, server_time: r.server_time },
      data: r,
    };
  });
}

export async function reconcileAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const r = await reconcileRoster(staffActor(staff));
    return {
      message: `Linked ${r.linked} registrations. Admitted ${r.admitted}, not admitted ${r.notAdmitted}, needs reconciliation ${r.needsReconciliation}.`,
      receipt: { id: r.id, server_time: r.server_time },
    };
  });
}
