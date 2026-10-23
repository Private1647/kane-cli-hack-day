/* eslint-disable @next/next/no-img-element -- generated PNG cards from our own route. */
import type { Metadata } from "next";
import { CARD_FORMATS } from "@/components/deck/socialCard";
import StatusPill from "@/components/ui/StatusPill";
import { getKit } from "@/server/gtm";
import { getBadges } from "@/server/story";
import { Panel } from "../fields";
import Studio, { type StudioCtx } from "../shell";
import KitEditor from "./KitEditor";

export const metadata: Metadata = { title: "GTM kit · Ship studio", robots: { index: false } };

// /studio/[slug]/gtm: launch copy, claim flags, badges and social cards
// (T-GTM-01..04). Drafts only; posting is always a human act.

export default function GtmPage({ params }: PageProps<"/studio/[slug]/gtm">) {
  return (
    <Studio params={params} tab="gtm">
      {(ctx) => <GtmTab ctx={ctx} />}
    </Studio>
  );
}

const CONF_TONE = { verified: "verified", measured: "unverified", participant_reported: "unverified", unverified: "unverified", qualitative: "unverified" } as const;
const CONF_TEXT = { verified: "Verified", measured: "Measured · sourced", participant_reported: "Team-reported", unverified: "Unverified", qualitative: "Qualitative" } as const;

async function GtmTab({ ctx }: { ctx: StudioCtx }) {
  const [kit, badges] = await Promise.all([getKit(ctx), getBadges(ctx.project.id)]);

  return (
    <div className="container-page pb-24">
      <Panel eyebrow="Badges" title="What you can truthfully say" intro="Badges appear only when the record backs them.">
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="flex flex-wrap items-center gap-3 border border-hairline p-4">
            {badges.shipped ? <StatusPill tone="verified">Shipped · Verified submission</StatusPill> : <StatusPill tone="pending">Not shipped yet</StatusPill>}
            <span className="font-plex text-xs text-lightgray">{badges.shipped ? "Your official submission is finalized." : "Appears once your submission is finalized."}</span>
          </li>
          <li className="flex flex-wrap items-center gap-3 border border-hairline p-4">
            {badges.kaneVerified ? <StatusPill tone="verified">Verified with Kane CLI</StatusPill> : <StatusPill tone="unverified">Kane run not verified</StatusPill>}
            <span className="font-plex text-xs text-lightgray">{badges.kaneVerified ? "At least one source-verified, passing Kane run is on record." : "Appears once a passing Kane run is reported from a paired machine."}</span>
          </li>
        </ul>
      </Panel>

      <Panel eyebrow="Claims" title="What the copy may lean on" intro="Every claim in the kit comes from your reviewed story, with its confidence. Unverified claims must not be written as fact.">
        {kit.claims.length ? (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {kit.claims.map((c, i) => (
              <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="sm:w-44">
                  <StatusPill tone={CONF_TONE[c.confidence]}>{CONF_TEXT[c.confidence]}</StatusPill>
                </span>
                <span className="min-w-0 flex-1 font-plex text-sm text-bright">
                  {c.text}
                  {c.ref && <span className="block text-xs text-lightgray">{c.ref}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-plex text-sm text-lightgray">No proof or outcome claims in your story yet, so the copy can only describe what you built.</p>
        )}
      </Panel>

      <Panel eyebrow="Launch copy" title="X post, thread, README, alt text" intro="Drafted from your story. AI drafts are advisory; when AI is unavailable you get the template draft. Nothing is posted for you.">
        <KitEditor slug={ctx.slug} kit={kit} canWrite={ctx.canWrite} />
      </Panel>

      <Panel eyebrow="Social cards" title="Share images" intro={kit.shipUrl ? "Rendered from your published story." : "Rendered from your draft and stamped as a preview until you publish."}>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(CARD_FORMATS) as (keyof typeof CARD_FORMATS)[]).map((f) => {
            const c = CARD_FORMATS[f];
            const src = `/studio/${ctx.slug}/cards/${f}`;
            return (
              <li key={f} className="space-y-2">
                <a href={src} className="block border border-hairline bg-surface hover:border-lime">
                  <img src={src} alt={`${c.label} card for ${ctx.project.name}`} width={c.width} height={c.height} loading="lazy" className="block h-auto w-full" />
                </a>
                <p className="font-plex text-xs text-lightgray">{c.label}</p>
                <a href={`${src}?download=1`} className="inline-flex min-h-11 items-center font-plex text-sm text-bright underline underline-offset-4 hover:text-lime">
                  Download PNG
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 font-plex text-xs text-lightgray">Before posting: the captain approved the wording, every number cites a source, anyone pictured or tagged opted in, and the links open publicly.</p>
      </Panel>
    </div>
  );
}
