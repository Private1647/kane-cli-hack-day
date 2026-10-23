"use client";

import { useState, useTransition } from "react";
import StatusPill from "@/components/ui/StatusPill";
import type { VerifyResult } from "@/server/submission";
import { verifyAction } from "./actions";

const btn = "inline-flex min-h-11 items-center justify-center border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-50";

/** Recompute the hash and check the HMAC on the server, and say plainly what came back. */
export function VerifyButton({ code }: { code: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() =>
          start(async () => {
            const res = await verifyAction(code);
            if (res.ok) {
              setResult(res.data);
              setError("");
            } else setError(res.error.message);
          })
        }
      >
        {pending ? "Checking…" : "Verify receipt"}
      </button>
      {result && (
        <div role="status" className="flex flex-wrap items-center gap-2 font-plex text-xs text-lightgray">
          {result.hash === "match" ? <StatusPill tone="verified">Verified · hash matches</StatusPill> : <StatusPill tone="danger">Hash mismatch</StatusPill>}
          {result.signature === "valid" && <StatusPill tone="verified">Verified · signature valid</StatusPill>}
          {result.signature === "invalid" && <StatusPill tone="danger">Signature invalid</StatusPill>}
          {result.signature === "unsigned" && <StatusPill tone="unverified">Unsigned (no key at finalize)</StatusPill>}
          {result.signature === "no_key" && <StatusPill tone="unverified">Signature not checkable here</StatusPill>}
          <span>checked {new Date(result.checked_at).toLocaleString()} (server time)</span>
        </div>
      )}
      {error && (
        <p role="alert" className="font-plex text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={btn}>
      Print
    </button>
  );
}
