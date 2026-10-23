import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { event } from "@/data/hackday";
import { isEnabled } from "@/lib/flags";
import { PROJECT_TYPE_LABEL, getPublishedStory, type ProjectType } from "@/server/showcase";

// 1200×630 share card in the site's style: black ink, off-white type, hairline
// rules, one lime square. Only public/unlisted pages get their name on it;
// anything else gets a neutral card, so a draft never leaks through a crawler.
// Fonts come from Google Fonts when reachable; otherwise the built-in face.

export const alt = "Kane CLI Hack Day showcase";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#000";
const BRIGHT = "#f2f2f2";
const GRAY = "#7e7e7e";
const HAIRLINE = "#37383a";
const LIME = "#daff52";
const VERIFIED = "#2dd4bf";

async function googleFont(family: string, weight: number, text: string) {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`, {
      signal: AbortSignal.timeout(2500),
    }).then((r) => (r.ok ? r.text() : ""));
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  // Kill switch (ship_pages off): a neutral card, like a draft.
  const pub = (await isEnabled("ship_pages").catch(() => true)) ? await getPublishedStory(slug).catch(() => null) : null;
  const s = pub?.story;
  const name = s?.project_name ?? "Showcase";
  const pitch = s?.one_line_pitch ?? "Built with AI agents. Verified with Kane CLI.";
  const type = s ? (PROJECT_TYPE_LABEL[s.creation_type as ProjectType] ?? s.creation_type) : "Kane CLI Hack Day";
  const verified = !!s?.proof.some((p) => p.confidence === "verified");
  const path = pub ? `kaneclihack.sh/ship/${pub.project.slug}` : "kaneclihack.sh/ship";
  const credit = s?.team.length ? `${s.team.length} ${s.team.length === 1 ? "builder" : "builders"}` : "";

  const display = `${name}${pitch}`;
  const mono = `${type}${path}${credit}${event.name}VERIFIED KANE EVIDENCE MADE AT ·✓`;
  const [d, m] = await Promise.all([googleFont("Inter Tight", 700, display), googleFont("IBM Plex Mono", 400, mono.toUpperCase() + mono)]);
  // Both or neither: a subset font missing glyphs for the other text would render blanks.
  const [displayFont, monoFont] = d && m ? [d, m] : [null, null];
  const fonts =
    displayFont && monoFont
      ? [
          { name: "Display", data: displayFont, weight: 700 as const, style: "normal" as const },
          { name: "Mono", data: monoFont, weight: 400 as const, style: "normal" as const },
        ]
      : [];
  const nameSize = name.length > 22 ? 84 : name.length > 14 ? 112 : 140;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: BRIGHT, padding: "56px 64px", fontFamily: monoFont ? "Mono" : undefined }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: 20, fontSize: 20, color: GRAY, letterSpacing: 2 }}>
          <span style={{ textTransform: "uppercase" }}>{type}</span>
          <span>Made at {event.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "flex-end", fontFamily: displayFont ? "Display" : undefined, fontSize: nameSize, fontWeight: 700, letterSpacing: -nameSize * 0.05, lineHeight: 0.9 }}>
            <span>{name}</span>
            <span style={{ width: nameSize * 0.16, height: nameSize * 0.16, background: LIME, marginLeft: 8, marginBottom: nameSize * 0.08 }} />
          </div>
          <div style={{ display: "flex", marginTop: 32, fontFamily: displayFont ? "Display" : undefined, fontSize: 38, lineHeight: 1.2, color: BRIGHT, maxWidth: 980 }}>{pitch.slice(0, 140)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${HAIRLINE}`, paddingTop: 20, fontSize: 22 }}>
          <span style={{ color: BRIGHT }}>{path}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 20, color: GRAY }}>
            {credit && <span>{credit}</span>}
            {verified && (
              <span style={{ display: "flex", color: VERIFIED, border: `1px solid ${VERIFIED}`, borderRadius: 999, padding: "4px 14px", fontSize: 18, letterSpacing: 2 }}>✓ VERIFIED KANE EVIDENCE</span>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
