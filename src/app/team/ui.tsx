"use client";

import type { ReactNode } from "react";
import { FormError } from "@/components/forms/fields";
import type { ActionResult } from "@/server/core";

// Small shared client bits for the team, match and idea screens.

/** The outcome of a server action: the error in words, or the receipt id + server time. */
export function ActionNote({ state, ok }: { state: ActionResult<unknown> | null; ok?: ReactNode }) {
  if (!state) return null;
  if (!state.ok) {
    const issues = (state.error.details?.issues as { path: string; message: string }[] | undefined) ?? [];
    return (
      <div className="space-y-1">
        <FormError message={state.error.message} />
        {issues.length > 0 && (
          <ul className="pl-3 font-plex text-xs text-red-300">
            {issues.map((i) => (
              <li key={`${i.path}:${i.message}`}>
                {i.path ? `${i.path.replace(/_/g, " ")}: ` : ""}
                {i.message}
              </li>
            ))}
          </ul>
        )}
        {state.error.next_action && <p className="pl-3 font-plex text-xs text-lightgray">{state.error.next_action}</p>}
      </div>
    );
  }
  return (
    <p role="status" className="font-plex text-xs text-lightgray">
      {ok ?? "Saved."}
      {state.receipt && (
        <>
          {" "}
          Receipt <span className="text-bright">{state.receipt.id}</span> · {new Date(state.receipt.server_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </>
      )}
    </p>
  );
}

export const smallBtn =
  "inline-flex min-h-11 items-center justify-center border border-hairline px-3 py-2 font-plex text-xs text-bright transition-colors hover:border-lime hover:text-lime disabled:cursor-wait disabled:opacity-50";

export const dangerBtn =
  "inline-flex min-h-11 items-center justify-center border border-danger px-3 py-2 font-plex text-xs text-danger transition-colors hover:bg-danger-deep disabled:cursor-wait disabled:opacity-50";
