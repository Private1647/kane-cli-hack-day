import type { Metadata } from "next";
import Link from "next/link";
import { auditFacets, listAudit, type AuditFilter } from "@/server/ops";
import { OpsPage, StaffGate, fmtTime } from "../_kit/shell";

export const metadata: Metadata = { title: "Audit", robots: { index: false } };

// Audit viewer (T-OPS-06). Append-only: there is nothing to edit here. Filter
// by actor, action and resource; page with "older". Corrections are new
// events (see Override), never rewrites.

const PAGE = 100;
const inputCls = "min-h-11 w-full border border-hairline bg-surface px-3 font-plex text-sm text-bright outline-none focus:border-lime";

export default function AuditPage({ searchParams }: PageProps<"/ops/audit">) {
  return (
    <OpsPage eyebrow="Audit" dim="Who did what," bright="When, and why." intro="Every change in Hack OS appends one row here, in the same transaction as the change. Rows can't be edited or deleted.">
      <StaffGate roles={["organizer"]} next="/ops/audit">
        {async () => {
          const sp = await searchParams;
          const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 120) : "");
          const f: AuditFilter = {
            actorType: s("actor_type") || null,
            actor: s("actor") || null,
            action: s("action") || null,
            resourceType: s("resource_type") || null,
            resourceId: s("resource_id") || null,
            before: Number(s("before")) || null,
          };
          const [rows, facets] = await Promise.all([listAudit(f, PAGE), auditFacets()]);
          const qs = (extra: Record<string, string | number | null>) => {
            const p = new URLSearchParams();
            for (const [k, v] of Object.entries({ actor_type: f.actorType, actor: f.actor, action: f.action, resource_type: f.resourceType, resource_id: f.resourceId, ...extra })) if (v) p.set(k, String(v));
            return `/ops/audit?${p.toString()}`;
          };
          return (
            <div className="space-y-8">
              <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter audit log">
                <label className="sr-only" htmlFor="a-type">
                  Actor type
                </label>
                <select id="a-type" name="actor_type" defaultValue={f.actorType ?? ""} className={inputCls}>
                  <option value="">Any actor type</option>
                  {facets.actorTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="a-actor">
                  Actor
                </label>
                <input id="a-actor" name="actor" defaultValue={f.actor ?? ""} placeholder="Actor name or id" className={inputCls} />
                <label className="sr-only" htmlFor="a-action">
                  Action
                </label>
                <input id="a-action" name="action" defaultValue={f.action ?? ""} placeholder="Action (e.g. checkin)" className={inputCls} />
                <label className="sr-only" htmlFor="a-rtype">
                  Resource type
                </label>
                <select id="a-rtype" name="resource_type" defaultValue={f.resourceType ?? ""} className={inputCls}>
                  <option value="">Any resource</option>
                  {facets.resourceTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="a-rid">
                  Resource id
                </label>
                <input id="a-rid" name="resource_id" defaultValue={f.resourceId ?? ""} placeholder="Resource id" className={inputCls} />
                <div className="flex gap-2">
                  <button type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center bg-bright px-4 font-plex text-sm text-ink hover:bg-lime">
                    Filter
                  </button>
                  <Link href="/ops/audit" className="inline-flex min-h-11 items-center border border-hairline px-3 font-plex text-xs text-bright hover:border-lime hover:text-lime">
                    Clear
                  </Link>
                </div>
              </form>

              <p className="flex flex-wrap gap-3 font-plex text-xs text-lightgray">
                <span>
                  {rows.length} event{rows.length === 1 ? "" : "s"}
                  {f.before ? ` older than #${f.before}` : ""}
                </span>
                <Link href="/ops/override" className="underline underline-offset-4 hover:text-lime">
                  Apply a signed override →
                </Link>
              </p>

              <ol className="border-t border-dashed border-hairline">
                {rows.map((r) => (
                  <li key={r.id} className="border-b border-dashed border-hairline py-3 font-plex text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="min-w-0">
                        <span className="text-bright">{r.action}</span>{" "}
                        <Link href={qs({ resource_type: r.resource_type, resource_id: r.resource_id, before: null })} className="text-lightgray hover:text-lime">
                          {r.resource_type}:{r.resource_id}
                        </Link>
                      </p>
                      <p className="text-xs text-lightgray">
                        #{r.id} · {fmtTime(r.created_at)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-lightgray">
                      {r.actor_type}
                      {r.actor_label ? ` · ${r.actor_label}` : ""}
                      {r.actor_id != null ? ` (#${r.actor_id})` : ""}
                      {r.reason ? ` · “${r.reason}”` : ""}
                    </p>
                    {(Object.keys(r.payload ?? {}).length > 0 || r.before_hash || r.after_hash) && (
                      <details className="mt-1">
                        <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-lightgray hover:text-lime">Details</summary>
                        <pre className="mt-1 overflow-x-auto bg-surface p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-lightgray">
                          {JSON.stringify({ payload: r.payload, before_hash: r.before_hash, after_hash: r.after_hash, request_id: r.request_id }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
                {rows.length === 0 && <li className="py-6 font-plex text-sm text-lightgray">No audit events match.</li>}
              </ol>
              {rows.length === PAGE && (
                <Link href={qs({ before: rows[rows.length - 1].id })} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
                  Older →
                </Link>
              )}
            </div>
          );
        }}
      </StaffGate>
    </OpsPage>
  );
}
