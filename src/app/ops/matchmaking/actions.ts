"use server";

import { formObject } from "@/server/core";
import { formTeamFromPool } from "@/server/teams";
import { act } from "../_kit/act";
import type { OpsState } from "../_kit/state";

// Organizer: form a team from people still in the matchmaking pool. Audited
// (team.form_from_pool) with the member ids, captain and reason.
export async function formTeamAction(_prev: OpsState, form: FormData): Promise<OpsState> {
  return act(["organizer"], form, async (staff) => {
    const out = await formTeamFromPool(staff, { ...formObject(form), member_ids: form.getAll("member_ids").map(String) });
    return { message: `${out.name} formed: ${out.members.join(", ")}. They now see the activation checklist.`, receipt: out.receipt, data: { slug: out.slug } };
  });
}
