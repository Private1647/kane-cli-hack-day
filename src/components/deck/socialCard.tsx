/* eslint-disable @next/next/no-img-element -- rendered by next/og (Satori), not the browser. */
import type { PublicStory } from "@/components/ship-templates/model";

// Social cards for next/og (T-GTM-02, T-SHIP-07 for the deck): 1200×630 OG,
// 1080×1080 square, 1080×1350 portrait and a 1080×1920 vertical end card, in
// the site theme (black ink, off-white, one lime square, teal only for a true
// "Verified with Kane CLI"). Satori supports flexbox + inline styles only.
// The TestMu mark is the real asset from public/logos, small, bottom-right.

export const CARD_FORMATS = {
  og: { width: 1200, height: 630, label: "Open Graph 1200×630" },
  square: { width: 1080, height: 1080, label: "Square 1080×1080" },
  portrait: { width: 1080, height: 1350, label: "Portrait 1080×1350" },
  story: { width: 1080, height: 1920, label: "Vertical end card 1080×1920" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export const isCardFormat = (s: string): s is CardFormat => s in CARD_FORMATS;

export function socialCard({ story, format, testmuDataUri, draft }: { story: PublicStory; format: CardFormat; testmuDataUri: string | null; draft: boolean }) {
  const { width, height } = CARD_FORMATS[format];
  const wide = width > height;
  const unit = Math.min(width, height) / 100;
  const verified = story.proof.filter((p) => p.confidence === "verified" && (!p.run || p.run.status === "passed")).length;
  const nameSize = Math.round(unit * (story.name.length > 18 ? (wide ? 11 : 12) : wide ? 15 : 16));
  const url = story.links.shipPage.replace(/^https:\/\//, "");

  return (
    <div style={{ width, height, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#f2f2f2", padding: unit * 6, fontFamily: "sans-serif", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: unit * 2.4, letterSpacing: unit * 0.4, color: "#8a8a8a", textTransform: "uppercase" }}>
        <span>Kane / Proof</span>
        <span>Kane CLI Hack Day</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: unit * 2.5 }}>
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: nameSize, fontWeight: 700, lineHeight: 0.95, letterSpacing: -unit * 0.4 }}>
          <span>{story.name}</span>
          <span style={{ width: nameSize * 0.16, height: nameSize * 0.16, background: "#daff52", marginLeft: nameSize * 0.06, marginBottom: nameSize * 0.1 }} />
        </div>
        {story.pitch && <div style={{ fontSize: unit * (wide ? 3.6 : 4), lineHeight: 1.3, color: "#d8d8d8", maxWidth: width * 0.85 }}>{story.pitch}</div>}
        <div style={{ display: "flex", gap: unit * 1.5, flexWrap: "wrap", marginTop: unit }}>
          {story.badges.kaneVerified && <Pill unit={unit} teal text="✓ Verified with Kane CLI" />}
          {story.badges.shipped && <Pill unit={unit} teal text="✓ Shipped · verified submission" />}
          {verified > 0 && <Pill unit={unit} text={`${verified} verified claim${verified === 1 ? "" : "s"}`} />}
          {!story.badges.kaneVerified && verified === 0 && <Pill unit={unit} text="Evidence not verified yet" />}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: unit * 2.6, color: "#8a8a8a" }}>
        <span>{format === "story" ? `Build anything. Ship with proof. → ${url}` : url}</span>
        {testmuDataUri ? <img src={testmuDataUri} alt="TestMu AI" height={unit * 2.6} width={unit * 2.6 * (1388 / 215)} /> : <span>TestMu AI</span>}
      </div>

      {draft && (
        <div style={{ position: "absolute", top: unit * 12, right: unit * 6, display: "flex", border: "3px dashed #ffb020", color: "#ffb020", padding: `${unit}px ${unit * 2}px`, fontSize: unit * 2.6, letterSpacing: unit * 0.3, textTransform: "uppercase" }}>
          Draft preview · not published
        </div>
      )}
    </div>
  );
}

function Pill({ unit, text, teal = false }: { unit: number; text: string; teal?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        border: `2px solid ${teal ? "#2dd4bf" : "#7e7e7e"}`,
        background: teal ? "#0b2b27" : "transparent",
        color: teal ? "#2dd4bf" : "#b0b0b0",
        borderRadius: 999,
        padding: `${unit * 0.8}px ${unit * 2}px`,
        fontSize: unit * 2.4,
        letterSpacing: unit * 0.2,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}
