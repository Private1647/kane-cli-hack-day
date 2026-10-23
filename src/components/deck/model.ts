import { z } from "zod";
import type { PublicStory } from "@/components/ship-templates/model";

// Deck scene model (deck.json) and theme (theme.json) for the HTML deck,
// template kane-ship-5@1.0.0 (GTM_KIT_SPEC): Creation, See it work, Harness,
// Proof, Outcome. Pure module, shared by the editor (client), the presenter,
// the services and the offline export.
//
// Evidence is never part of a slide's editable content: an "evidence" slide
// renders the proof claims of the story version the deck is pinned to, so a
// deck edit can't forge or restyle a verification result.

export const DECK_TEMPLATE = "kane-ship-5@1.0.0";

export const GROUNDS = ["ink", "surface", "card", "lime"] as const;
export type Ground = (typeof GROUNDS)[number];

export const SLIDE_TYPES = ["title", "steps", "diagram", "evidence", "outcome", "text"] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export const SCENES = ["creation", "see_it_work", "harness", "proof", "outcome", "custom"] as const;
export type Scene = (typeof SCENES)[number];

export const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  title: "Title",
  steps: "Steps",
  diagram: "Harness diagram",
  evidence: "Evidence (from story)",
  outcome: "Outcome + QR",
  text: "Text",
};

export const GROUND_LABEL: Record<Ground, string> = { ink: "Ink", surface: "Surface", card: "Card (light)", lime: "Lime" };

/** Ground colours as literal hex, so print and the offline file keep them (globals' print rules flip tokens). */
export const GROUND_STYLE: Record<Ground, { bg: string; fg: string; muted: string; rule: string; accent: string }> = {
  ink: { bg: "#000000", fg: "#f2f2f2", muted: "#8a8a8a", rule: "#37383a", accent: "#daff52" },
  surface: { bg: "#0b0b0b", fg: "#f2f2f2", muted: "#8a8a8a", rule: "#37383a", accent: "#daff52" },
  card: { bg: "#f2f2f2", fg: "#0a0a0a", muted: "#555555", rule: "#c4c4c4", accent: "#0a0a0a" },
  lime: { bg: "#daff52", fg: "#0a0a0a", muted: "#3d4a10", rule: "#0a0a0a", accent: "#0a0a0a" },
};

const text = (max: number) => z.string().max(max).default("");
const safeMediaSrc = z
  .string()
  .trim()
  .max(500)
  .refine((s) => /^https:\/\/[^\s"'<>]+$/.test(s) || /^\/[\w./-]+$/.test(s), "Media must be an https:// link or a site path");

export const slideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    scene: z.enum(SCENES),
    type: z.enum(SLIDE_TYPES),
    ground: z.enum(GROUNDS),
    eyebrow: text(60),
    headline: text(140),
    body: text(600),
    items: z.array(z.string().max(200)).max(6).default([]),
    media: z.object({ src: safeMediaSrc, alt: z.string().max(200), label: z.string().max(80).default("") }).nullable().default(null),
    notes: text(1000),
  })
  .strict();

export const themeSchema = z
  .object({
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
    headline_font: z.enum(["display", "dots"]).default("display"),
    show_qr: z.boolean().default(true),
  })
  .strict();

export const deckSchema = z
  .object({
    template: z.literal(DECK_TEMPLATE).default(DECK_TEMPLATE),
    slides: z.array(slideSchema).min(1).max(20),
    theme: themeSchema.default({ density: "comfortable", headline_font: "display", show_qr: true }),
  })
  .strict();

export type Slide = z.infer<typeof slideSchema>;
export type DeckTheme = z.infer<typeof themeSchema>;
export type Deck = z.infer<typeof deckSchema>;

export const DEFAULT_THEME: DeckTheme = { density: "comfortable", headline_font: "display", show_qr: true };

let seq = 0;
/** A slide id that is unique within a deck (not a secret). */
export const newSlideId = () => `s-${Date.now().toString(36)}-${(seq++).toString(36)}`.slice(0, 40);

export function blankSlide(over: Partial<Slide> = {}): Slide {
  return { id: newSlideId(), scene: "custom", type: "text", ground: "surface", eyebrow: "", headline: "A new slide", body: "One idea, using real project facts.", items: [], media: null, notes: "", ...over };
}

/** The default five scenes, generated from the (public view of the) approved story. */
export function defaultDeck(story: Pick<PublicStory, "name" | "pitch" | "problem" | "howItWorks" | "harness" | "visuals" | "limitations">): Deck {
  const media = story.visuals[0] ? { src: story.visuals[0].src, alt: story.visuals[0].alt, label: story.visuals[0].kind } : null;
  const steps = story.howItWorks.slice(0, 3);
  return {
    template: DECK_TEMPLATE,
    theme: { ...DEFAULT_THEME },
    slides: [
      {
        id: "creation",
        scene: "creation",
        type: "title",
        ground: "ink",
        eyebrow: "01 · Creation",
        headline: story.name,
        body: story.pitch || "Add a one-line outcome in the studio story.",
        items: story.problem ? [story.problem.slice(0, 200)] : [],
        media,
        notes: "Say the outcome in one breath. Who is it for, what changes for them?",
      },
      {
        id: "see-it-work",
        scene: "see_it_work",
        type: "steps",
        ground: "surface",
        eyebrow: "02 · See it work",
        headline: "See it work",
        body: "",
        items: steps.length ? steps : ["Step one of the real journey", "Step two", "Step three"],
        media: story.visuals[1] ? { src: story.visuals[1].src, alt: story.visuals[1].alt, label: story.visuals[1].kind } : media,
        notes: "Show the real thing running. Three steps, minimal words.",
      },
      {
        id: "harness",
        scene: "harness",
        type: "diagram",
        ground: "card",
        eyebrow: "03 · The harness",
        headline: "The intelligence behind shipping",
        body: story.harness.summary || "How Kane CLI checks the work, in one sentence.",
        items: story.harness.stages.length ? story.harness.stages.slice(0, 6) : ["Change", "Kane run", "Evidence", "Decision"],
        media: null,
        notes: "Name only components you actually used.",
      },
      {
        id: "proof",
        scene: "proof",
        type: "evidence",
        ground: "ink",
        eyebrow: "04 · Proof",
        headline: "What Kane actually verified",
        body: "",
        items: story.limitations.slice(0, 3),
        media: null,
        notes: "One real run and its evidence id. Say what is still uncertain.",
      },
      {
        id: "outcome",
        scene: "outcome",
        type: "outcome",
        ground: "lime",
        eyebrow: "05 · Outcome",
        headline: "What improved",
        body: story.pitch || "",
        items: [],
        media: null,
        notes: "Numbers only if measured. End on the repo and the Ship Page QR.",
      },
    ],
  };
}

/** Parse an imported deck.json (or throw zod issues). Ids are re-minted if they collide. */
export function normalizeDeck(input: unknown): Deck {
  const deck = deckSchema.parse(input);
  const seen = new Set<string>();
  deck.slides = deck.slides.map((s) => {
    if (seen.has(s.id)) s = { ...s, id: newSlideId() };
    seen.add(s.id);
    return s;
  });
  return deck;
}
