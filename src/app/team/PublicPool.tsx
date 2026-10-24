"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { InviteToTeam } from "../match/parts";

// Step 2 on /team: people in the matchmaking pool, with Refresh (fetch the
// latest pool) and Shuffle (a fresh order, so the same faces aren't always on top).

export type PoolCard = { member_id: number; name: string; skills: string[]; interests: string[]; photo: string | null; intro: string | null };

export default function PublicPool({ people, wanted, openSeats }: { people: PoolCard[]; wanted: string[]; openSeats: number }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [order, setOrder] = useState<number[] | null>(null);
  const need = new Set(wanted);
  const byId = new Map(people.map((p) => [p.member_id, p]));
  // A shuffled order survives a refresh for the people still in the pool; newcomers go to the end.
  const list = order ? [...order.filter((id) => byId.has(id)).map((id) => byId.get(id)!), ...people.filter((p) => !order.includes(p.member_id))] : people;

  // Always lands on a different order than the one on screen (with 3 people a
  // plain shuffle repeats the current order 1 time in 6, which looks broken).
  const shuffle = () => {
    const now = list.map((p) => p.member_id).join();
    let ids = list.map((p) => p.member_id);
    do {
      ids = [...ids];
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
    } while (ids.length > 1 && ids.join() === now);
    setOrder(ids);
  };

  const btn = "inline-flex min-h-9 items-center gap-1.5 border border-hairline px-3 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime disabled:opacity-50";
  return (
    <section id="people" aria-labelledby="pool-title" className="space-y-4">
      <div>
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lime">Step 2 · optional</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h2 id="pool-title" className="font-display text-2xl text-bright">
            Public pool
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => startRefresh(() => router.refresh())} disabled={refreshing} className={btn}>
              <span aria-hidden="true" className={refreshing ? "animate-spin" : ""}>
                ↻
              </span>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={shuffle} disabled={people.length < 2} className={btn}>
              <span aria-hidden="true">⤨</span> Shuffle
            </button>
          </div>
        </div>
        <p className="mt-2 font-plex text-sm text-lightgray">
          {people.length} looking · {openSeats} open {openSeats === 1 ? "seat" : "seats"}
        </p>
      </div>
      <p className="font-plex text-sm leading-relaxed text-lightgray">
        Everyone here is looking for a team. Invite someone and they can accept from their matchmaking page; they join straight away.
        {need.size > 0 ? " Skills your team needs are highlighted in lime." : ""}
      </p>
      {list.length === 0 ? (
        <p className="border border-dashed border-hairline p-4 font-plex text-sm text-lightgray">Nobody is in the pool right now. Refresh in a bit, or send an invite code.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.member_id} className="flex flex-col gap-3 border border-hairline p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} src={p.photo} size={40} />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg text-bright">{p.name}</p>
                  {p.interests.length > 0 && <p className="truncate font-plex text-xs text-lightgray">Into {p.interests.join(", ")}</p>}
                </div>
              </div>
              {p.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => (
                    <span key={s} className={`border px-2 py-0.5 font-plex text-xs ${need.has(s.toLowerCase()) ? "border-lime text-lime" : "border-hairline text-lightgray"}`}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {p.intro === "proposed" ? (
                <p className="font-plex text-sm text-lightgray">Invited · waiting for an answer</p>
              ) : p.intro === "declined" ? (
                <p className="font-plex text-sm text-lightgray">Declined</p>
              ) : (
                <InviteToTeam memberId={p.member_id} teamName="team" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
