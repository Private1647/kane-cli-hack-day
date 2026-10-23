import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { KANE_CAPABILITIES } from "@/server/kane";
import CapabilityPicker from "./CapabilityPicker";

export const metadata: Metadata = {
  title: "Docs",
  description: "Kane CLI documentation and the event's own guides, in one place.",
};

// T-DOC-02: the Kane CLI capability catalog, linking only to the
// official pages listed in the blueprint's DOCUMENTATION_INDEX (checked Oct 22
// 2026), plus this site's own pages. Nothing here describes a command the
// official reference doesn't publish. Version and plan entitlements vary:
// check `kane-cli --version` and your plan before relying on remote, device
// or assurance features.

type Doc = { label: string; href: string; use: string };

const KANE: Doc[] = [
  { label: "Kane CLI", href: "https://www.testmuai.com/kane-cli/", use: "What it is" },
  { label: "Source and readme", href: "https://github.com/LambdaTest/kane-cli", use: "Install, official agent usage, the official skill" },
  { label: "Agent guide", href: "https://www.testmuai.com/kane-cli/agents.md", use: "NDJSON output and safe objectives for agents" },
  { label: "CLI reference", href: "https://www.testmuai.com/docs/kane-cli-cli-reference", use: "Exact commands and exit codes" },
  { label: "Modes", href: "https://www.testmuai.com/docs/kane-cli-modes", use: "Interactive, agent and headless" },
  { label: "Authentication", href: "https://www.testmuai.com/docs/kane-cli-authentication", use: "OAuth vs CI credentials" },
  { label: "Generate", href: "https://www.testmuai.com/docs/kane-cli-generate", use: "Tests from plain English" },
  { label: "Test runs", href: "https://www.testmuai.com/docs/kane-cli-testrun", use: "Batch suites, statuses, NDJSON" },
  { label: "Assurance", href: "https://www.testmuai.com/docs/kane-cli-assurance", use: "Requirements to verification" },
  { label: "Assurance design", href: "https://www.testmuai.com/docs/kane-cli-assurance-design", use: "Acceptance criteria and test linking" },
  { label: "Coverage", href: "https://www.testmuai.com/docs/kane-cli-assurance-coverage", use: "Designed vs proven, and gaps" },
  { label: "Evidence", href: "https://www.testmuai.com/docs/kane-cli-evidence", use: "Sealed evidence packs" },
  { label: "Remote execution", href: "https://www.testmuai.com/docs/kane-cli-remote-execution", use: "Grid runs (plan dependent)" },
  { label: "Real devices", href: "https://www.testmuai.com/docs/kane-cli-mobile-real-device", use: "Device testing (plan dependent)" },
  { label: "Test Manager integration", href: "https://www.testmuai.com/docs/kane-cli-tms-integration", use: "Publish cases and evidence" },
];

const EVENT: Doc[] = [
  { label: "Resources", href: "/resources", use: "Starter material, content skills, recording tips" },
  { label: "Readiness check", href: "/readiness", use: "Is your machine ready for the day" },
  { label: "Help", href: "/help", use: "Ask a mentor; works without the AI" },
  { label: "Showcase", href: "/ship", use: "What teams shipped, with their Kane evidence" },
  { label: "Privacy and consent", href: "/privacy", use: "What we store and how to change your mind" },
];

const row = "grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6";

export default function DocsPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Docs"
        dim="Read the manual,"
        bright="then ship."
        intro="The official Kane CLI docs and this event's own guides. Features like remote grids, real devices and assurance depend on your CLI version and plan."
        jumps={[
          { href: "#kane", label: "Kane CLI" },
          { href: "#versions", label: "By version and plan" },
          { href: "#event", label: "This event" },
        ]}
      />
      <section id="kane" className="scroll-mt-24 py-12">
        <div className="container-page">
          <h2 className="font-display text-2xl tracking-[-0.02em] text-bright sm:text-3xl">Kane CLI</h2>
          <ul className="mt-6 max-w-3xl divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
            {KANE.map((d) => (
              <li key={d.href} className={row}>
                <a href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  {d.label} ↗
                </a>
                <span className="self-center font-plex text-sm text-lightgray">{d.use}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section id="versions" className="scroll-mt-24 border-t border-dashed border-hairline py-12">
        <div className="container-page space-y-6">
          <h2 className="font-display text-2xl tracking-[-0.02em] text-bright sm:text-3xl">What your version and plan unlock</h2>
          <p className="max-w-3xl font-plex text-sm text-lightgray">The same catalog your agent gets from the event MCP server (harness_get_capabilities). Pick one to see what it needs and a workflow to start from.</p>
          <CapabilityPicker capabilities={KANE_CAPABILITIES} />
        </div>
      </section>
      <section id="event" className="scroll-mt-24 border-t border-dashed border-hairline py-12">
        <div className="container-page">
          <h2 className="font-display text-2xl tracking-[-0.02em] text-bright sm:text-3xl">This event</h2>
          <ul className="mt-6 max-w-3xl divide-y divide-dashed divide-hairline border-y border-dashed border-hairline">
            {EVENT.map((d) => (
              <li key={d.href} className={row}>
                <Link href={d.href} className="inline-flex min-h-11 items-center font-plex text-sm text-bright underline decoration-hairline underline-offset-4 hover:text-lime">
                  {d.label} →
                </Link>
                <span className="self-center font-plex text-sm text-lightgray">{d.use}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
