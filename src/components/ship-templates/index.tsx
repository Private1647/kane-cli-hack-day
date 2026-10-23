import type { ReactNode } from "react";
import StatusPill from "@/components/ui/StatusPill";
import CreationProofTabs from "./CreationProofTabs";
import { CREATION_LABEL, DEFAULT_TEMPLATE, isShipTemplate, type PublicStory, type ShipTemplateId } from "./model";
import {
  BadgeRow,
  Block,
  HarnessFlow,
  HeroName,
  ImpactList,
  Limitations,
  LinksRow,
  MediaStage,
  PreviewBanner,
  ProofList,
  ProofPill,
  PublishedStamp,
  TeamList,
  TestMuMark,
  ValidatedLine,
  isVideo,
  proofRef,
  proofTone,
} from "./parts";

// Six Ship Page layouts over the same public story (SHIP_TEMPLATES.md,
// T-SHIP-03/09). Switching template changes layout only: claims, their
// confidence and the consented credits are identical in every one.
//
//   <ShipTemplate name={template} story={story} />
//
// /ship/[slug] (submission-showcase) renders this with getPublishedStory();
// the studio renders it with a draft preview DTO.

export { SHIP_TEMPLATES, DEFAULT_TEMPLATE, isShipTemplate, type PublicStory, type ShipTemplateId } from "./model";

export function ShipTemplate({ name, story }: { name?: string | null; story: PublicStory }) {
  const t: ShipTemplateId = isShipTemplate(name) ? name : DEFAULT_TEMPLATE;
  const Body = { "product-proof": ProductProof, "proof-atlas": ProofAtlas, "launch-film": LaunchFilm, "terminal-zine": TerminalZine, "shipping-ledger": ShippingLedger, "confidence-specimen": ConfidenceSpecimen }[t];
  return (
    <article className="container-page pt-8 pb-16" data-template={t}>
      <PreviewBanner story={story} template={t} />
      <Body story={story} />
      <TestMuMark />
    </article>
  );
}

// ── 1. Product × Proof (default) ─────────────────────────────────────────────

export function ProductProof({ story }: { story: PublicStory }) {
  return (
    <>
      <header className="grid gap-10 pt-8 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div className="min-w-0">
          <BadgeRow story={story} />
          <HeroName name={story.name} className="mt-6 text-[clamp(3rem,11vw,8.5rem)] leading-[0.88]" />
          {story.pitch && <p className="mt-6 max-w-xl font-display text-xl leading-snug text-bright sm:text-2xl">{story.pitch}</p>}
          <div className="mt-6 space-y-3">
            <ValidatedLine story={story} />
            <PublishedStamp story={story} />
          </div>
        </div>
        <MediaStage story={story} />
      </header>

      <section className="mt-12">
        <CreationProofTabs
          creation={
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">The problem</p>
                <p className="mt-3 font-plex text-sm leading-relaxed text-bright">{story.problem || "—"}</p>
              </div>
              <div>
                <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">What we built</p>
                <p className="mt-3 font-plex text-sm leading-relaxed whitespace-pre-line text-bright">{story.whatWeBuilt || "—"}</p>
              </div>
              {story.howItWorks.length > 0 && (
                <ol className="space-y-3 md:col-span-2">
                  {story.howItWorks.map((s, i) => (
                    <li key={i} className="flex gap-4 border-t border-hairline pt-3 font-plex text-sm text-bright">
                      <span className="font-dots text-2xl leading-none font-black text-lime">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          }
          proof={<ProofList story={story} />}
        />
      </section>

      <section className="mt-16 grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4" aria-label="At a glance">
        {[
          { k: "Product", v: CREATION_LABEL[story.creationType], d: story.pitch || "—" },
          { k: "Harness", v: `${story.harness.stages.length || "—"} stages`, d: story.harness.components.join(", ") || "—" },
          { k: "Evidence", v: `${story.proof.filter((p) => proofTone(p).tone === "verified").length} verified`, d: `${story.proof.length} claims in total` },
          { k: "Repo", v: story.links.github ? "Public" : "—", d: story.links.repoCommit ? `at ${story.links.repoCommit.slice(0, 12)}` : story.links.github ? "Linked" : "Not linked" },
        ].map((c) => (
          <div key={c.k} className="bg-ink p-5">
            <p className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">{c.k}</p>
            <p className="mt-2 font-display text-2xl text-bright">{c.v}</p>
            <p className="mt-1 font-plex text-xs break-words text-lightgray">{c.d}</p>
          </div>
        ))}
      </section>

      <Block eyebrow="The harness" title="How Kane checks the work">
        <HarnessFlow story={story} />
      </Block>
      <Block eyebrow="Evidence" title="What was actually verified">
        <ProofList story={story} />
        {story.limitations.length > 0 && (
          <div className="mt-8">
            <p className="mb-3 font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">Not verified yet</p>
            <Limitations story={story} />
          </div>
        )}
      </Block>
      <Block eyebrow="Outcome" title="What improved">
        <ImpactList story={story} />
      </Block>
      <Block eyebrow="Team and links">
        <div className="space-y-6">
          <TeamList story={story} />
          <LinksRow story={story} />
        </div>
      </Block>
    </>
  );
}

// ── 2. Proof Atlas ───────────────────────────────────────────────────────────

export function ProofAtlas({ story }: { story: PublicStory }) {
  const runs = [...new Set(story.proof.map((p) => p.run_id).filter(Boolean) as string[])];
  const evidence = [...new Set(story.proof.map((p) => p.evidence_id).filter(Boolean) as string[])];
  const gaps = story.proof.filter((p) => proofTone(p).tone !== "verified");
  return (
    <>
      <header className="pt-8">
        <BadgeRow story={story} />
        <HeroName name={story.name} className="mt-6 text-[clamp(2.5rem,8vw,6rem)] leading-[0.9]" />
        {story.pitch && <p className="mt-4 max-w-2xl font-plex text-base text-lightgray">{story.pitch}</p>}
        <div className="mt-4">
          <ValidatedLine story={story} />
        </div>
      </header>

      <Block eyebrow="Provenance map" title="Claims → Kane runs → evidence">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="mb-3 font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Claims ({story.proof.length})</p>
            <ol className="space-y-3">
              {story.proof.map((p, i) => (
                <li key={i} className="brackets border border-hairline p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-dots text-xl font-black text-bright">C{i + 1}</span>
                    <ProofPill p={p} />
                  </div>
                  <p className="mt-2 font-plex text-sm text-bright">{p.claim}</p>
                  <p className="mt-1 font-plex text-xs text-lightgray">
                    → {[p.run_id && `R${p.run_id}`, p.evidence_id && `E${p.evidence_id}`].filter(Boolean).join(" + ") || "no source bound"}
                  </p>
                </li>
              ))}
              {!story.proof.length && <li className="font-plex text-sm text-lightgray">No claims yet.</li>}
            </ol>
          </div>
          <Nodes title={`Kane runs (${runs.length})`} items={runs.map((r) => {
            const p = story.proof.find((x) => x.run_id === r)!;
            return { id: `R${r}`, line: p.run ? `${p.run.status}${p.run.objective ? ` · ${p.run.objective}` : ""}` : "status unknown", tone: proofTone(p).tone };
          })} />
          <Nodes title={`Evidence (${evidence.length})`} items={evidence.map((e) => {
            const p = story.proof.find((x) => x.evidence_id === e)!;
            return { id: `E${e}`, line: p.source || "artifact", tone: proofTone(p).tone };
          })} />
        </div>
      </Block>

      <Block eyebrow="Gaps" title="What the map doesn't cover">
        {gaps.length ? (
          <ul className="space-y-2">
            {gaps.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 font-plex text-sm text-lightgray">
                <ProofPill p={p} /> {p.claim}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-plex text-sm text-lightgray">Every listed claim is bound to verified evidence.</p>
        )}
        <div className="mt-6">
          <Limitations story={story} />
        </div>
      </Block>

      <Block eyebrow="The creation">
        <div className="grid gap-8 md:grid-cols-2">
          <p className="font-plex text-sm leading-relaxed whitespace-pre-line text-bright">{story.whatWeBuilt || story.problem || "—"}</p>
          <HarnessFlow story={story} />
        </div>
      </Block>
      <Block eyebrow="Outcome and team">
        <div className="space-y-8">
          <ImpactList story={story} />
          <TeamList story={story} />
          <LinksRow story={story} />
        </div>
      </Block>
    </>
  );
}

function Nodes({ title, items }: { title: string; items: { id: string; line: string; tone: string }[] }) {
  return (
    <div>
      <p className="mb-3 font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">{title}</p>
      <ul className="space-y-3 border-l border-hairline pl-4">
        {items.map((n) => (
          <li key={n.id} className="relative">
            <span aria-hidden="true" className={`absolute top-2 -left-[21px] size-2.5 border ${n.tone === "verified" ? "border-verified bg-verified" : "border-lightgray bg-ink"}`} />
            <p className="font-plex text-sm text-bright">{n.id}</p>
            <p className="font-plex text-xs text-lightgray">{n.line}</p>
          </li>
        ))}
        {!items.length && <li className="font-plex text-xs text-lightgray">None bound.</li>}
      </ul>
    </div>
  );
}

// ── 3. Launch Film ───────────────────────────────────────────────────────────

export function LaunchFilm({ story }: { story: PublicStory }) {
  const film = story.visuals.find((v) => isVideo(v.src));
  return (
    <>
      <header className="pt-8 text-center">
        <p className="font-pixel text-xs tracking-[0.3em] text-lightgray uppercase">{CREATION_LABEL[story.creationType]}</p>
        <HeroName name={story.name} className="mt-4 text-[clamp(2.75rem,9vw,7rem)] leading-[0.9]" />
        {story.pitch && <p className="mx-auto mt-4 max-w-xl font-plex text-base text-lightgray">{story.pitch}</p>}
      </header>
      <div className="mt-10">
        {film ? (
          <figure className="border border-hairline bg-ink">
            <video src={film.src} controls preload="metadata" className="block aspect-video w-full" aria-label={film.alt} />
            <figcaption className="border-t border-hairline px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">Team-approved footage</figcaption>
          </figure>
        ) : (
          <MediaStage story={story} tall />
        )}
      </div>
      <nav aria-label="Chapters" className="mt-6 flex flex-wrap justify-center gap-2">
        {[
          ["#film-build", "The build"],
          ["#film-proof", "Jump to Kane proof"],
          ["#film-outcome", "Outcome"],
        ].map(([href, l]) => (
          <a key={href} href={href} className="inline-flex min-h-11 items-center border border-hairline px-4 font-plex text-sm text-bright hover:border-lime hover:text-lime">
            {l}
          </a>
        ))}
      </nav>
      <div className="mx-auto mt-10 flex max-w-3xl justify-center">
        <BadgeRow story={story} />
      </div>
      <div id="film-build" className="scroll-mt-24">
        <Block eyebrow="Act one · the build">
          <p className="max-w-2xl font-display text-2xl leading-snug text-bright">{story.whatWeBuilt || story.problem || "—"}</p>
        </Block>
      </div>
      <div id="film-proof" className="scroll-mt-24">
        <Block eyebrow="Act two · the proof" title="Kane, on the record">
          <HarnessFlow story={story} />
          <div className="mt-8">
            <ProofList story={story} dense />
          </div>
        </Block>
      </div>
      <div id="film-outcome" className="scroll-mt-24">
        <Block eyebrow="Act three · outcome">
          <div className="space-y-8">
            <ImpactList story={story} />
            <Limitations story={story} />
            <TeamList story={story} />
            <LinksRow story={story} />
          </div>
        </Block>
      </div>
    </>
  );
}

// ── 4. Terminal Zine ─────────────────────────────────────────────────────────

export function TerminalZine({ story }: { story: PublicStory }) {
  return (
    <div className="font-plex">
      <header className="grid gap-6 pt-8 md:grid-cols-[8rem_1fr]">
        <p className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase md:pt-4">Issue · {CREATION_LABEL[story.creationType]}</p>
        <div>
          <h1 className="font-plex text-[clamp(2.25rem,7vw,5rem)] leading-[0.95] font-medium tracking-[-0.02em] break-words text-bright">
            <span className="text-lime" aria-hidden="true">
              ${" "}
            </span>
            {story.name}
            <span aria-hidden="true" className="animate-blink text-lime">
              _
            </span>
          </h1>
          {story.pitch && <p className="mt-4 max-w-2xl text-sm text-lightgray"># {story.pitch}</p>}
          <div className="mt-4">
            <BadgeRow story={story} />
          </div>
        </div>
      </header>

      <ZineSection n="01" title="the problem">
        <p className="text-sm leading-relaxed text-bright">{story.problem || "—"}</p>
      </ZineSection>
      <ZineSection n="02" title="what we built">
        <p className="text-sm leading-relaxed whitespace-pre-line text-bright">{story.whatWeBuilt || "—"}</p>
        {story.howItWorks.length > 0 && (
          <pre className="mt-4 overflow-x-auto border border-dashed border-hairline bg-surface p-4 text-xs leading-relaxed text-bright">
            {story.howItWorks.map((s, i) => `${String(i + 1).padStart(2, "0")}  ${s}`).join("\n")}
          </pre>
        )}
      </ZineSection>
      <ZineSection n="03" title="the harness">
        <pre className="overflow-x-auto border border-dashed border-hairline bg-surface p-4 text-xs leading-relaxed text-bright">
          {(story.harness.stages.length ? story.harness.stages : ["(no stages described)"]).join("  →  ")}
        </pre>
        {story.harness.summary && <p className="mt-3 text-sm text-lightgray"># {story.harness.summary}</p>}
      </ZineSection>
      <ZineSection n="04" title="run log">
        {story.proof.length ? (
          <ul className="space-y-3 border border-dashed border-hairline bg-surface p-4 text-xs">
            {story.proof.map((p, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <ProofPill p={p} />
                <span className="min-w-0">
                  <span className="text-bright">{p.claim}</span>
                  <span className="block text-lightgray">{"// "}{proofRef(p)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-lightgray">{"// no Kane evidence attached"}</p>
        )}
      </ZineSection>
      <ZineSection n="05" title="known gaps">
        <Limitations story={story} />
      </ZineSection>
      <ZineSection n="06" title="outcome · credits">
        <div className="space-y-6">
          <ImpactList story={story} />
          <TeamList story={story} />
          <LinksRow story={story} />
        </div>
      </ZineSection>
    </div>
  );
}

function ZineSection({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-12 grid gap-4 border-t border-dashed border-hairline pt-6 md:grid-cols-[8rem_1fr]">
      <p className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">
        {n} · {title}
      </p>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

// ── 5. Shipping Ledger ───────────────────────────────────────────────────────

export function ShippingLedger({ story }: { story: PublicStory }) {
  const dated = story.proof
    .map((p, i) => ({ p, i, at: p.run?.finished_at ?? null }))
    .sort((a, b) => (a.at && b.at ? a.at.localeCompare(b.at) : a.at ? -1 : b.at ? 1 : a.i - b.i));
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) + " PT" : "time not recorded");
  return (
    <>
      <header className="pt-8">
        <BadgeRow story={story} />
        <HeroName name={story.name} className="mt-6 text-[clamp(2.5rem,8vw,6rem)] leading-[0.9]" />
        {story.pitch && <p className="mt-4 max-w-2xl font-plex text-base text-lightgray">{story.pitch}</p>}
      </header>
      <Block eyebrow="The ledger" title="Build → detect → fix → reverify">
        <ol className="relative space-y-6 border-l border-hairline pl-6">
          <LedgerEntry when="Start" title="Problem" tone={null}>
            {story.problem || "—"}
          </LedgerEntry>
          <LedgerEntry when="Build" title="What we built" tone={null}>
            {story.whatWeBuilt || "—"}
          </LedgerEntry>
          {dated.map(({ p, i }) => (
            <LedgerEntry key={i} when={fmt(p.run?.finished_at ?? null)} title={p.claim} tone={proofTone(p).tone}>
              <ProofPill p={p} /> <span className="ml-2 text-lightgray">{proofRef(p)}</span>
            </LedgerEntry>
          ))}
          {story.limitations.map((l, i) => (
            <LedgerEntry key={`l${i}`} when="Open" title={l} tone="pending">
              <StatusPill tone="pending">Still open</StatusPill>
            </LedgerEntry>
          ))}
        </ol>
        <p className="mt-6 font-plex text-xs text-lightgray">Failing Kane runs appear as SUSPECTED detections, not confirmed bugs. Times come from the run records.</p>
      </Block>
      <Block eyebrow="Outcome and team">
        <div className="space-y-8">
          <ImpactList story={story} />
          <TeamList story={story} />
          <LinksRow story={story} />
        </div>
      </Block>
    </>
  );
}

function LedgerEntry({ when, title, tone, children }: { when: string; title: string; tone: string | null; children: ReactNode }) {
  const dot = tone === "verified" ? "border-verified bg-verified" : tone === "pending" ? "border-warning bg-warning-deep" : tone === "suspected" ? "border-lightgray border-dashed bg-ink" : "border-hairline bg-ink";
  return (
    <li className="relative">
      <span aria-hidden="true" className={`absolute top-1.5 -left-[31px] size-3 border ${dot}`} />
      <p className="font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">{when}</p>
      <p className="mt-1 font-plex text-sm text-bright">{title}</p>
      <div className="mt-2 font-plex text-xs">{children}</div>
    </li>
  );
}

// ── 6. Confidence Specimen ───────────────────────────────────────────────────

export function ConfidenceSpecimen({ story }: { story: PublicStory }) {
  const verified = story.proof.filter((p) => proofTone(p).tone === "verified");
  const counts = {
    verified: verified.length,
    suspected: story.proof.filter((p) => proofTone(p).tone === "suspected").length,
    reported: story.proof.filter((p) => p.confidence === "participant_reported").length,
    unverified: story.proof.filter((p) => p.confidence === "unverified").length,
  };
  const lead = verified[0];
  return (
    <div className="pt-8">
      <div className="bg-card p-6 text-bright sm:p-10 [--bright:#0a0a0a] [--hairline:#c4c4c4] [--ink:#f2f2f2] [--lightgray:#555] [--surface:#e8e8e8]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline pb-4">
          <p className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Specimen · {CREATION_LABEL[story.creationType]}</p>
          <PublishedStamp story={story} />
        </div>
        <HeroName name={story.name} className="mt-6 text-[clamp(2.25rem,7vw,5rem)] leading-[0.9]" />
        {story.pitch && <p className="mt-3 max-w-2xl font-plex text-sm text-lightgray">{story.pitch}</p>}

        <dl className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <dt className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Observation</dt>
            <dd className="mt-2 font-display text-2xl leading-snug text-bright">{lead ? lead.claim : "No verified observation recorded."}</dd>
            {lead && <dd className="mt-2 font-plex text-xs text-lightgray">{proofRef(lead)}</dd>}
          </div>
          <div>
            <dt className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Confidence</dt>
            <dd className="mt-2 grid grid-cols-2 gap-2 font-plex text-xs">
              {(
                [
                  ["Verified", counts.verified],
                  ["Suspected", counts.suspected],
                  ["Team-reported", counts.reported],
                  ["Unverified", counts.unverified],
                ] as const
              ).map(([k, v]) => (
                <span key={k} className="border border-hairline p-2">
                  <span className="block font-dots text-2xl font-black text-bright">{v}</span>
                  {k}
                </span>
              ))}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Method</dt>
            <dd className="mt-2 font-plex text-sm text-bright">{story.harness.summary || "—"}</dd>
            {story.harness.stages.length > 0 && <dd className="mt-2 font-plex text-xs text-lightgray">{story.harness.stages.join(" → ")}</dd>}
          </div>
          <div>
            <dt className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Limits of this specimen</dt>
            <dd className="mt-2">
              <Limitations story={story} />
              {!story.limitations.length && <span className="font-plex text-xs text-lightgray">None stated.</span>}
            </dd>
          </div>
        </dl>
      </div>
      <Block eyebrow="All observations">
        <ProofList story={story} />
      </Block>
      <Block eyebrow="Outcome, team and links">
        <div className="space-y-8">
          <ImpactList story={story} />
          <TeamList story={story} />
          <LinksRow story={story} />
        </div>
      </Block>
    </div>
  );
}
