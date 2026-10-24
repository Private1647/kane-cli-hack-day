// Tabs of a team's hub at /t/[slug]/<tab>. The dashboard is the bare slug.
// "studio" is the one tab that lives outside the hub: it links to /studio/[slug].

// `nav: false` pages still work (old links, help-desk answers) but aren't in the tab row:
// the static event info lives on the home page.
export const HUB_TABS = [
  { id: "", label: "Dashboard" },
  { id: "setup", label: "Setup" },
  { id: "brief", label: "Brief", nav: false },
  { id: "idea", label: "Idea" },
  { id: "proof", label: "Proof" },
  { id: "resources", label: "Resources", nav: false },
  { id: "studio", label: "GTM" },
  { id: "submit", label: "Final submission" },
  { id: "photos", label: "Photos" },
  { id: "content-hour", label: "Content hour", nav: false },
  { id: "judging", label: "Judging", nav: false },
  { id: "help", label: "Help" },
] as const;

export const NAV_TABS = HUB_TABS.filter((t) => !("nav" in t && t.nav === false));

export type HubTab = (typeof HUB_TABS)[number]["id"];

const IDS = new Set<string>(HUB_TABS.map((t) => t.id));

export const isHubTab = (s: string): s is HubTab => IDS.has(s);

export const hubPath = (slug: string, tab: HubTab = "") =>
  tab === "studio" ? `/studio/${slug}` : tab ? `/t/${slug}/${tab}` : `/t/${slug}`;
