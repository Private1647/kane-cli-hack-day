/* eslint-disable @next/next/no-img-element -- participant media and the TestMu mark are plain images; next/image would need remote config per team. */
import type { PublicStory } from "@/components/ship-templates/model";
import { GROUND_STYLE, SLIDE_TYPE_LABEL, type DeckTheme, type Slide } from "./model";

// One 16:9 slide. Sized in container-query units (cqw), so it scales to any
// width with no JS: the presenter, the editor preview, print (one slide per
// page) and thumbnails all use this same component. Grounds use literal
// colours so print and screenshots keep them.
//
// Evidence comes from the pinned story (PublicStory), never from slide text.

const CONF: Record<string, { label: string; glyph: string; fg: string; bg: string; border: string; dashed?: boolean }> = {
  verified: { label: "Verified", glyph: "✓", fg: "#2dd4bf", bg: "#0b2b27", border: "#2dd4bf" },
  participant_reported: { label: "Team-reported", glyph: "○", fg: "#9a9a9a", bg: "transparent", border: "#7e7e7e" },
  unverified: { label: "Unverified", glyph: "○", fg: "#9a9a9a", bg: "transparent", border: "#7e7e7e" },
  suspected: { label: "Suspected", glyph: "?", fg: "#9a9a9a", bg: "transparent", border: "#7e7e7e", dashed: true },
};

export function ConfidenceTag({ confidence, failing, light }: { confidence: string; failing?: boolean; light?: boolean }) {
  // A verified claim bound to a failing run reads as a detection, not a pass.
  const c = failing && confidence === "verified" ? CONF.suspected : (CONF[confidence] ?? CONF.unverified);
  const onLight = light && c !== CONF.verified;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[0.4cqw] rounded-full border px-[0.8cqw] py-[0.15cqw] font-pixel text-[0.85cqw] tracking-[0.15em] whitespace-nowrap uppercase"
      style={{ color: onLight ? "#333" : c.fg, background: c.bg, borderColor: onLight ? "#555" : c.border, borderStyle: c.dashed ? "dashed" : "solid" }}
    >
      <span aria-hidden="true" className="font-plex">
        {c.glyph}
      </span>
      {c.label}
    </span>
  );
}

export default function DeckSlide({
  slide,
  story,
  theme,
  index,
  total,
  qrSvg,
  className = "",
}: {
  slide: Slide;
  story: PublicStory;
  theme: DeckTheme;
  index: number;
  total: number;
  /** Server-rendered QR SVG markup for the Ship Page URL (outcome slide). */
  qrSvg?: string | null;
  className?: string;
}) {
  const g = GROUND_STYLE[slide.ground];
  const light = slide.ground === "card" || slide.ground === "lime";
  const compact = theme.density === "compact";
  const headFont = theme.headline_font === "dots" ? "font-dots font-black" : "font-display font-bold";
  const n = String(index + 1).padStart(2, "0");
  const big = slide.type === "title";

  return (
    <div className={`@container ${className}`}>
      <section
        aria-roledescription="slide"
        aria-label={`Slide ${index + 1} of ${total}: ${slide.headline}`}
        className="relative flex aspect-video w-full flex-col overflow-hidden [print-color-adjust:exact]"
        style={{ background: g.bg, color: g.fg }}
      >
        {/* Top rule: eyebrow + event mark */}
        <div className="flex items-start justify-between gap-[2cqw] px-[5cqw] pt-[3.5cqw]">
          <p className="font-pixel text-[1.1cqw] tracking-[0.25em] uppercase" style={{ color: g.muted }}>
            {slide.eyebrow || `${n} · ${SLIDE_TYPE_LABEL[slide.type]}`}
          </p>
          <p className="font-pixel text-[1cqw] tracking-[0.25em] uppercase" style={{ color: g.muted }}>
            Kane CLI Hack Day
          </p>
        </div>

        <div className={`flex min-h-0 flex-1 flex-col justify-center px-[5cqw] ${compact ? "gap-[1.4cqw]" : "gap-[2.2cqw]"}`}>
          <h2 className={`${headFont} leading-[0.95] tracking-[-0.02em] ${big ? "text-[7.5cqw]" : compact ? "text-[3.6cqw]" : "text-[4.4cqw]"}`}>
            {slide.headline}
            {big && (
              <span aria-hidden="true" className="ml-[0.6cqw] inline-block size-[1.6cqw] align-baseline" style={{ background: light ? g.fg : "#daff52" }} />
            )}
          </h2>
          <Body slide={slide} story={story} light={light} g={g} compact={compact} qrSvg={theme.show_qr ? qrSvg : null} />
        </div>

        {/* Bottom rule: counter + TestMu mark, small, bottom-right */}
        <div className="flex items-end justify-between gap-[2cqw] px-[5cqw] pb-[3cqw]">
          <p className="font-plex text-[1cqw]" style={{ color: g.muted }}>
            {n} / {String(total).padStart(2, "0")} · {story.name}
          </p>
          <img src="/logos/testmu-ai.svg" alt="TestMu AI" width={1388} height={215} className="h-[1.3cqw] w-auto" style={light ? { filter: "brightness(0)" } : undefined} />
        </div>
      </section>
    </div>
  );
}

function Body({
  slide,
  story,
  light,
  g,
  compact,
  qrSvg,
}: {
  slide: Slide;
  story: PublicStory;
  light: boolean;
  g: (typeof GROUND_STYLE)[keyof typeof GROUND_STYLE];
  compact: boolean;
  qrSvg?: string | null;
}) {
  const bodyCls = `font-plex leading-[1.45] ${compact ? "text-[1.35cqw]" : "text-[1.6cqw]"} max-w-[70cqw]`;
  const media = slide.media ? <Media media={slide.media} g={g} /> : null;

  switch (slide.type) {
    case "title":
      return (
        <div className="flex items-end gap-[3cqw]">
          <div className="min-w-0 flex-1 space-y-[1.2cqw]">
            {slide.body && <p className={`${bodyCls} text-[2cqw]`}>{slide.body}</p>}
            {slide.items.map((it, i) => (
              <p key={i} className={bodyCls} style={{ color: g.muted }}>
                {it}
              </p>
            ))}
          </div>
          {media && <div className="w-[34cqw] shrink-0">{media}</div>}
        </div>
      );
    case "steps":
      return (
        <div className="flex gap-[3cqw]">
          <ol className="grid min-w-0 flex-1 gap-[1.4cqw]">
            {slide.items.map((it, i) => (
              <li key={i} className="flex items-baseline gap-[1.6cqw] border-t pt-[1.2cqw]" style={{ borderColor: g.rule }}>
                <span className="font-dots text-[2.6cqw] leading-none font-black" style={{ color: g.accent }}>
                  {i + 1}
                </span>
                <span className={bodyCls}>{it}</span>
              </li>
            ))}
          </ol>
          {media && <div className="w-[36cqw] shrink-0 self-center">{media}</div>}
        </div>
      );
    case "diagram":
      return (
        <div className="space-y-[2cqw]">
          {slide.body && <p className={bodyCls}>{slide.body}</p>}
          <ol className="flex flex-wrap items-stretch gap-[1cqw]" aria-label="Harness stages">
            {slide.items.map((it, i) => (
              <li key={i} className="flex items-center gap-[1cqw]">
                <span className="border px-[1.4cqw] py-[1cqw] font-plex text-[1.4cqw]" style={{ borderColor: g.fg }}>
                  <span className="mr-[0.8cqw] font-pixel text-[0.9cqw]" style={{ color: g.muted }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {it}
                </span>
                {i < slide.items.length - 1 && (
                  <span aria-hidden="true" className="font-plex text-[1.6cqw]">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          {story.harness.components.length > 0 && (
            <p className="font-plex text-[1.2cqw]" style={{ color: g.muted }}>
              Components: {story.harness.components.join(" · ")}
            </p>
          )}
        </div>
      );
    case "evidence": {
      const proof = story.proof.slice(0, compact ? 5 : 4);
      return (
        <div className="space-y-[1.6cqw]">
          {slide.body && <p className={bodyCls}>{slide.body}</p>}
          {proof.length === 0 ? (
            <p className={`${bodyCls} border-l-2 pl-[1.4cqw]`} style={{ borderColor: g.muted, color: g.muted }}>
              No verified Kane evidence is attached to this story yet. Nothing here is claimed as verified.
            </p>
          ) : (
            <ul className="grid gap-[1cqw]">
              {proof.map((p, i) => (
                <li key={i} className="flex items-start gap-[1.4cqw] border-t pt-[1cqw]" style={{ borderColor: g.rule }}>
                  <ConfidenceTag confidence={p.confidence} failing={!!p.run && p.run.status !== "passed"} light={light} />
                  <span className="min-w-0 flex-1 font-plex text-[1.4cqw] leading-[1.4]">
                    {p.claim}
                    <span className="block text-[1cqw]" style={{ color: g.muted }}>
                      {[p.run_id && `run ${p.run_id}${p.run ? ` · ${p.run.status}` : ""}`, p.evidence_id && `evidence ${p.evidence_id}`, p.commit_sha && `commit ${p.commit_sha.slice(0, 10)}`, p.source]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {slide.items.length > 0 && (
            <p className="font-plex text-[1.2cqw]" style={{ color: g.muted }}>
              Not yet verified: {slide.items.join(" · ")}
            </p>
          )}
        </div>
      );
    }
    case "outcome": {
      const impact = story.impact.slice(0, 3);
      return (
        <div className="flex items-end gap-[3cqw]">
          <div className="min-w-0 flex-1 space-y-[1.4cqw]">
            {slide.body && <p className={`${bodyCls} text-[1.9cqw]`}>{slide.body}</p>}
            {impact.length > 0 && (
              <ul className="grid gap-[0.8cqw]">
                {impact.map((im, i) => (
                  <li key={i} className="font-plex text-[1.4cqw]">
                    {im.measured ? (
                      <>
                        <span className="font-dots text-[2.4cqw] font-black">
                          {im.measure}
                          {im.unit ? ` ${im.unit}` : ""}
                        </span>{" "}
                        {im.claim}{" "}
                        <span style={{ color: g.muted }}>
                          (baseline {im.baseline}
                          {im.unit ? ` ${im.unit}` : ""}; source: {im.source})
                        </span>
                      </>
                    ) : (
                      <>
                        {im.claim} <span style={{ color: g.muted }}>(qualitative)</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {slide.items.map((it, i) => (
              <p key={i} className={bodyCls}>
                {it}
              </p>
            ))}
            <p className="font-plex text-[1.2cqw]" style={{ color: g.muted }}>
              {[story.links.github, story.links.demo].filter(Boolean).join(" · ")}
              {story.team.length > 0 && ` · ${story.team.map((t) => t.name).join(", ")}`}
            </p>
          </div>
          {qrSvg && (
            <figure className="w-[14cqw] shrink-0 text-center">
              <div role="img" aria-label={`QR code: ${story.links.shipPage}`} className="bg-[#f2f2f2] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <figcaption className="mt-[0.6cqw] font-plex text-[0.9cqw] break-all">{story.links.shipPage.replace(/^https:\/\//, "")}</figcaption>
            </figure>
          )}
        </div>
      );
    }
    default:
      return (
        <div className="flex gap-[3cqw]">
          <div className="min-w-0 flex-1 space-y-[1.2cqw]">
            {slide.body && <p className={bodyCls}>{slide.body}</p>}
            {slide.items.length > 0 && (
              <ul className="grid gap-[0.8cqw]">
                {slide.items.map((it, i) => (
                  <li key={i} className={`${bodyCls} flex gap-[1cqw]`}>
                    <span aria-hidden="true" style={{ color: g.accent }}>
                      →
                    </span>
                    {it}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {media && <div className="w-[36cqw] shrink-0">{media}</div>}
        </div>
      );
  }
}

function Media({ media, g }: { media: NonNullable<Slide["media"]>; g: (typeof GROUND_STYLE)[keyof typeof GROUND_STYLE] }) {
  return (
    <figure className="border" style={{ borderColor: g.rule }}>
      <img src={media.src} alt={media.alt} className="block aspect-video w-full object-cover" loading="lazy" />
      {media.label && (
        <figcaption className="px-[0.8cqw] py-[0.4cqw] font-pixel text-[0.8cqw] tracking-[0.2em] uppercase" style={{ color: g.muted }}>
          {media.label}
        </figcaption>
      )}
    </figure>
  );
}
