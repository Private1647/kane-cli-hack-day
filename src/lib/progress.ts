import { submissions } from "@/data/hackday";

// The checklist a team works through on its dashboard. Ids match the
// Afterburner's slugs so the two stay in step with the copy in hackday.ts.

export type ProgressItem = {
  id: string;
  label: string;
  kind: "idea" | "essential" | "content";
  deadline: string;
  placeholder: string;
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const PLACEHOLDERS: Record<string, string> = {
  repo: "https://github.com/…",
  "live-url-or-run-command": "https://… or npx …",
  "kane-cli-run-report": "Link to the run report",
};

export const PROGRESS_ITEMS: ProgressItem[] = [
  {
    id: "devpost-idea",
    label: "Devpost idea",
    kind: "idea",
    deadline: submissions.idea.deadline,
    placeholder: "https://devpost.com/software/…",
  },
  ...submissions.final.minimum.map((label) => ({
    id: slug(label),
    label,
    kind: "essential" as const,
    deadline: submissions.final.deadline,
    placeholder: PLACEHOLDERS[slug(label)] ?? "Link",
  })),
  ...submissions.final.pickTwo.map((label) => ({
    id: slug(label),
    label,
    kind: "content" as const,
    deadline: submissions.final.deadline,
    placeholder: "Link to the post",
  })),
];

export const PROGRESS_IDS = new Set(PROGRESS_ITEMS.map((i) => i.id));

/** Shipped prize minimum: every essential plus any two content pieces. */
export function shippedMinimum(done: Set<string>) {
  const essentials = PROGRESS_ITEMS.filter((i) => i.kind === "essential").every((i) => done.has(i.id));
  const content = PROGRESS_ITEMS.filter((i) => i.kind === "content" && done.has(i.id)).length;
  return essentials && content >= 2;
}
