"use server";

import { formObject, runAction, type ActionResult } from "@/server/core";
import { setPhaseOverride } from "@/server/metrics";

// Organizer-only: set or clear the /live phase override. The service checks
// the role, validates, writes hack_events.phase_override and audits it.
export async function overridePhase(_prev: ActionResult<{ phase: string | null }> | null, form: FormData) {
  return runAction(() => setPhaseOverride(formObject(form)));
}
