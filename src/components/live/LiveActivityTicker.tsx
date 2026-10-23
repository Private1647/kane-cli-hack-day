import StatusPill from "@/components/ui/StatusPill";
import { event } from "@/data/hackday";
import type { FeedItem } from "@/server/metrics";

// Public, source-labelled activity (T-LIVE-09). Items arrive already capped
// to one per team per window by the server (readFeed). PROOF is teal and
// evidence-backed; DETECTED is a grey suspected detection, never "a bug";
// LINKED / updates are hairline.

const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone });

export function FeedStatus({ status }: { status: FeedItem["status"] }) {
  if (status === "proof") return <StatusPill tone="verified">Proof · Verified</StatusPill>;
  if (status === "detected") return <StatusPill tone="suspected">Detected</StatusPill>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 font-pixel text-[10px] uppercase tracking-[0.18em] text-bright">
      <span aria-hidden="true">↗</span>
      {status === "linked" ? "Linked" : "Update"}
    </span>
  );
}

export default function LiveActivityTicker({ items, limit = 6, empty, highlight }: { items: FeedItem[]; limit?: number; empty?: string; highlight?: number | null }) {
  const list = items.slice(0, limit);
  if (list.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-5 font-plex text-sm text-lightgray">
        {empty ?? "Nothing public yet. Verified runs on published ship pages show up here, one per team at a time."}
      </p>
    );
  }
  return (
    <ol className="divide-y divide-hairline border-y border-hairline">
      {list.map((f) => (
        <li key={f.id} className={`grid grid-cols-[4.5rem_1fr_auto] items-start gap-4 py-3 ${highlight === f.id ? "bg-surface-2" : ""}`}>
          <time dateTime={f.at} className="pt-0.5 font-plex text-xs text-lightgray">
            {fmt.format(new Date(f.at))}
          </time>
          <div className="min-w-0">
            <p className="truncate font-display text-[clamp(1rem,1.25vw,1.5rem)] font-medium text-bright">{f.title}</p>
            {f.detail && <p className="truncate font-plex text-xs text-lightgray">{f.detail}</p>}
            {f.href && (
              <a href={f.href} className="font-plex text-xs text-lightgray underline decoration-hairline underline-offset-4 hover:text-bright">
                See evidence on the ship page
              </a>
            )}
          </div>
          <FeedStatus status={f.status} />
        </li>
      ))}
    </ol>
  );
}
