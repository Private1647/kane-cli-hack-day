/* eslint-disable @next/next/no-img-element -- participant visuals come from arbitrary approved https sources. */
import type { ReactNode } from "react";
import StatusPill from "@/components/ui/StatusPill";
import { CREATION_LABEL, type PublicProof, type PublicStory } from "./model";

// Building blocks shared by the six Ship Page templates. All of them render
// the public DTO only. Status rules (PLAN §3): teal ✓ VERIFIED only for a
// claim bound to source-verified evidence; a failing run reads SUSPECTED;
// team reports and unbacked claims are grey outlines.

export function proofTone(p: PublicProof): { tone: "verified" | "suspected" | "unverified"; label: string } {
  if (p.confidence === "verified" && p.run && p.run.status !== "passed") return { tone: "suspected", label: "Suspected · detection" };
  if (p.confidence === "verified") return { tone: "verified", label: "Verified" };
  if (p.confidence === "participant_reported") return { tone: "unverified", label: "Team-reported" };
  return { tone: "unverified", label: "Unverified" };
}

export function ProofPill({ p }: { p: PublicProof }) {
  const t = proofTone(p);
  return <StatusPill tone={t.tone}>{t.label}</StatusPill>;
}

export function proofRef(p: PublicProof) {
  return [p.run_id && `Kane run ${p.run_id}${p.run ? ` · ${p.run.status}` : ""}`, p.evidence_id && `evidence ${p.evidence_id}`, p.commit_sha && `commit ${p.commit_sha.slice(0, 10)}`, p.source]
    .filter(Boolean)
    .join(" · ");
}

export function ProofList({ story, dense = false }: { story: PublicStory; dense?: boolean }) {
  if (!story.proof.length) {
    return <p className="border-l-2 border-hairline pl-3 font-plex text-sm text-lightgray">No Kane evidence is attached to this story. Nothing here is claimed as verified.</p>;
  }
  return (
    <ul className="divide-y divide-hairline border-y border-hairline">
      {story.proof.map((p, i) => (
        <li key={i} className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 ${dense ? "py-3" : "py-4"}`}>
          <span className="shrink-0 sm:w-48">
            <ProofPill p={p} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-plex text-sm text-bright">{p.claim}</span>
            <span className="mt-1 block font-plex text-xs break-words text-lightgray">{proofRef(p)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ImpactList({ story }: { story: PublicStory }) {
  if (!story.impact.length) return <p className="font-plex text-sm text-lightgray">No outcome claims yet.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {story.impact.map((im, i) => (
        <li key={i} className="brackets border border-hairline p-4">
          {im.measured ? (
            <>
              <p className="font-dots text-4xl font-black text-bright">
                {im.measure}
                {im.unit && <span className="ml-2 font-plex text-base font-normal text-lightgray">{im.unit}</span>}
              </p>
              <p className="mt-2 font-plex text-sm text-bright">{im.claim}</p>
              <p className="mt-1 font-plex text-xs text-lightgray">
                Baseline {im.baseline}
                {im.unit ? ` ${im.unit}` : ""} · source: {im.source}
              </p>
            </>
          ) : (
            <>
              <p className="font-plex text-sm text-bright">{im.claim}</p>
              <p className="mt-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">Qualitative · not measured</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TeamList({ story }: { story: PublicStory }) {
  if (!story.team.length) return <p className="font-plex text-sm text-lightgray">The team chose not to list names.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {story.team.map((t, i) => (
        <li key={i} className="border border-hairline px-3 py-2 font-plex text-sm text-bright">
          {t.name}
          {t.handle && (
            <a href={`https://x.com/${t.handle}`} className="ml-2 inline-flex min-h-6 items-center text-lightgray underline-offset-4 hover:text-lime hover:underline" rel="noopener noreferrer">
              @{t.handle}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function LinksRow({ story }: { story: PublicStory }) {
  const links = [
    story.links.github && { href: story.links.github, label: "Repository" },
    story.links.demo && { href: story.links.demo, label: "Live demo" },
    story.hasDeck && !story.preview && { href: `/ship/${story.slug}/deck`, label: "HTML deck" },
  ].filter(Boolean) as { href: string; label: string }[];
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex min-h-11 items-center gap-2 border border-hairline px-4 font-plex text-sm text-bright transition-colors hover:border-lime hover:text-lime"
        >
          {l.label} <span aria-hidden="true">→</span>
        </a>
      ))}
    </div>
  );
}

export function BadgeRow({ story }: { story: PublicStory }) {
  const { shipped, kaneVerified } = story.badges;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="border border-hairline px-2 py-1 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">{CREATION_LABEL[story.creationType]}</span>
      {shipped && <StatusPill tone="verified">Shipped · Verified submission</StatusPill>}
      {kaneVerified && <StatusPill tone="verified">Verified with Kane CLI</StatusPill>}
    </div>
  );
}

/** "Validated with Kane CLI · TestMu AI", only where true. */
export function ValidatedLine({ story }: { story: PublicStory }) {
  if (!story.badges.kaneVerified) return null;
  return <p className="font-pixel text-[10px] tracking-[0.25em] text-verified uppercase">✓ Validated with Kane CLI · TestMu AI</p>;
}

/** The authentic TestMu mark, small, bottom-right of the page (never the hero). */
export function TestMuMark() {
  return (
    <div className="mt-16 flex justify-end">
      <img src="/logos/testmu-ai.svg" alt="TestMu AI" width={1388} height={215} className="h-4 w-auto opacity-80" />
    </div>
  );
}

export function PreviewBanner({ story, template }: { story: PublicStory; template: string }) {
  if (!story.preview) return null;
  return (
    <div role="status" className="border-l-2 border-warning bg-warning-deep px-4 py-3 font-plex text-sm text-bright">
      <span className="font-pixel text-[10px] tracking-[0.2em] text-warning uppercase">! Draft preview · {template}</span>
      <span className="ml-3 text-lightgray">Only your team sees this. Credits show only people who have consented; unapproved visuals are hidden.</span>
    </div>
  );
}

/** Real approved visuals, or a clearly labelled placeholder. */
export function MediaStage({ story, className = "", tall = false }: { story: PublicStory; className?: string; tall?: boolean }) {
  const v = story.visuals[0];
  return (
    <figure className={`brackets border border-hairline bg-surface ${className}`}>
      {v ? (
        isVideo(v.src) ? (
          <video src={v.src} controls preload="metadata" className={`block w-full bg-ink ${tall ? "aspect-video" : "aspect-[16/10]"}`} aria-label={v.alt} />
        ) : (
          <img src={v.src} alt={v.alt} className={`block w-full object-cover ${tall ? "aspect-video" : "aspect-[16/10]"}`} loading="lazy" />
        )
      ) : (
        <div className={`flex w-full flex-col items-center justify-center gap-2 p-6 text-center ${tall ? "aspect-video" : "aspect-[16/10]"}`}>
          <span className="font-pixel text-[10px] tracking-[0.25em] text-lightgray uppercase">Placeholder · no approved media yet</span>
          <span className="font-display text-3xl text-bright">{story.name}</span>
        </div>
      )}
      <figcaption className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2 font-pixel text-[10px] tracking-[0.2em] text-lightgray uppercase">
        <span>{v ? v.kind : "Placeholder"}</span>
        <span>{v ? "Team-approved capture" : "Conceptual"}</span>
      </figcaption>
    </figure>
  );
}

export const isVideo = (src: string) => /\.(mp4|webm|mov)(\?|$)/i.test(src);

export function HarnessFlow({ story }: { story: PublicStory }) {
  const stages = story.harness.stages.length ? story.harness.stages : [];
  if (!stages.length && !story.harness.summary) return <p className="font-plex text-sm text-lightgray">The team hasn't described the harness yet.</p>;
  return (
    <div className="space-y-5">
      {story.harness.summary && <p className="max-w-2xl font-plex text-sm leading-relaxed text-lightgray md:text-base">{story.harness.summary}</p>}
      {stages.length > 0 && (
        <ol className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4" aria-label="Harness stages">
          {stages.map((s, i) => (
            <li key={i} className="bg-ink p-4">
              <p className="font-dots text-3xl font-black text-lime">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-2 font-plex text-sm text-bright">{s}</p>
            </li>
          ))}
        </ol>
      )}
      {story.harness.components.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Components">
          {story.harness.components.map((c, i) => (
            <li key={i} className="border border-dashed border-hairline px-2 py-1 font-plex text-xs text-lightgray">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Limitations({ story }: { story: PublicStory }) {
  if (!story.limitations.length) return null;
  return (
    <ul className="space-y-2">
      {story.limitations.map((l, i) => (
        <li key={i} className="flex gap-3 font-plex text-sm text-lightgray">
          <span aria-hidden="true">○</span>
          {l}
        </li>
      ))}
    </ul>
  );
}

export function Block({ eyebrow, title, children, className = "" }: { eyebrow: string; title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-dashed border-hairline py-12 sm:py-16 ${className}`}>
      <p className="font-pixel text-xs tracking-[0.25em] text-lightgray uppercase">{eyebrow}</p>
      {title && <h2 className="mt-3 font-display text-3xl text-bright sm:text-4xl">{title}</h2>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function PublishedStamp({ story }: { story: PublicStory }) {
  if (story.preview || !story.publishedAt) return null;
  return (
    <p className="font-plex text-xs text-lightgray">
      Published version {story.version} · {new Date(story.publishedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT
    </p>
  );
}

/** Hero name with the lime square full stop (decorative). */
export function HeroName({ name, className = "" }: { name: string; className?: string }) {
  return (
    <h1 className={`font-display font-bold tracking-[-0.03em] break-words text-bright ${className}`}>
      {name}
      <span aria-hidden="true" className="ml-[0.06em] inline-block size-[0.16em] bg-lime align-baseline" />
    </h1>
  );
}
