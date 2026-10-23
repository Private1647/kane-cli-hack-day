// Tabs of a team's hub at /t/[slug]/<tab>. The dashboard is the bare slug.
// "studio" is the one tab that lives outside the hub: it links to /studio/[slug].

export const HUB_TABS = [
  { id: "", label: "Dashboard" },
  { id: "setup", label: "Setup" },
  { id: "brief", label: "Brief" },
  { id: "idea", label: "Idea" },
  { id: "proof", label: "Proof" },
  { id: "resources", label: "Resources" },
  { id: "submit", label: "Submit" },
  { id: "studio", label: "Studio" },
  { id: "photos", label: "Photos" },
  { id: "content-hour", label: "Content hour" },
  { id: "judging", label: "Judging" },
  { id: "help", label: "Help" },
] as const;

export type HubTab = (typeof HUB_TABS)[number]["id"];

const IDS = new Set<string>(HUB_TABS.map((t) => t.id));

export const isHubTab = (s: string): s is HubTab => IDS.has(s);

export const hubPath = (slug: string, tab: HubTab = "") =>
  tab === "studio" ? `/studio/${slug}` : tab ? `/t/${slug}/${tab}` : `/t/${slug}`;
