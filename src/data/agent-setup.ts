// The participant path through Hack OS with an AI agent: install the helper,
// pair this machine, connect Codex to the event MCP server, then work
// through the day with the hack-* skills. /setup, the team hub's Setup tab,
// /readiness and the passport all read from here, so a command changes in one
// place. Commands must match public/install.*, packages/kanehack and
// plugin/README.md.

export const SITE = "https://kaneclihack.sh";
/** The MCP endpoint uses the www host directly, so Codex never has to follow the apex redirect. */
export const MCP_URL = "https://www.kaneclihack.sh/mcp";

export type Cmd = { label: string; value: string; note?: string };

export const INSTALL: Cmd[] = [
  { label: "macOS / Linux", value: `curl -fsSL ${SITE}/install.sh | sh` },
  {
    label: "Windows (PowerShell)",
    value: "irm https://www.kaneclihack.sh/install.ps1 | iex",
    note: "Use the www address: Windows PowerShell 5.1 doesn't follow the redirect.",
  },
  {
    label: "From an AI agent (no terminal)",
    value: `curl -fsSL ${SITE}/install.sh | sh -s -- --yes`,
    note: "When Codex runs the installer it can't answer prompts; --yes answers them.",
  },
];

export const PAIR: Cmd[] = [
  { label: "In your terminal", value: "kanehack pair", note: "Approve the code it shows at /pair, signed in as yourself." },
  {
    label: "From an AI agent",
    value: "kanehack pair --start\n# approve the code in your browser, then:\nkanehack pair --wait",
    note: "--wait exits 4 while the code is still pending: run it again after approving.",
  },
];

export const CONNECT: Cmd[] = [
  {
    label: "Codex",
    value: `export KANEHACK_TOKEN="$(kanehack token)"\ncodex mcp add kane-hack-event --url ${MCP_URL} --bearer-token-env-var KANEHACK_TOKEN`,
    note: "Skills load from ~/.agents/skills (the installer puts them there). Start a new Codex session, then type $hack-onboard.",
  },
];

export const PROVE: Cmd[] = [
  { label: "Your first reported run", value: `kanehack report -- kane-cli run "Open ${SITE} and find the schedule" --agent`, note: "It lands on your team's Proof tab." },
  { label: "Check your setup", value: "kanehack doctor" },
];

export type SkillInfo = { name: string; does: string; ask: string };

/** The twelve skills (plugin/skills/hack-*), by when in the day you'd reach for them. */
export const SKILL_GROUPS: { phase: string; skills: SkillInfo[] }[] = [
  {
    phase: "Get set up",
    skills: [
      { name: "hack-onboard", does: "Links your registration, profile and consents, and runs browser activation. You take the selfie yourself.", ask: "Get me set up for Kane CLI Hack Day." },
      { name: "hack-doctor", does: "Checks Node, Git, Chrome, Kane CLI, sign-in, skills and the event API, with the exact fix for each.", ask: "Is my machine ready for the hack day?" },
    ],
  },
  {
    phase: "Team and idea",
    skills: [
      { name: "hack-team", does: "Finds a team, creates one, or joins one with an invite code.", ask: "Find me a team that needs a frontend builder." },
      { name: "hack-idea", does: "Checks your idea against the eight criteria and similar opted-in ideas. Advisory, never a score.", ask: "Check our idea against the challenge criteria." },
      { name: "hack-harness", does: "Plans which flows Kane should test, which commands, and what evidence to keep.", ask: "Design a Kane test harness for our app." },
    ],
  },
  {
    phase: "Build and prove",
    skills: [
      { name: "hack-verify", does: "Runs Kane CLI on a change and records the result, with evidence, on your Proof tab.", ask: "Verify the checkout flow with Kane and record it." },
      { name: "hack-progress", does: "Turns what you've actually proven into honest milestones.", ask: "What have we proven so far?" },
      { name: "hack-help", does: "Tries first-line fixes, then opens a mentor ticket and tracks it.", ask: "Kane CLI won't sign in. Help." },
    ],
  },
  {
    phase: "Ship",
    skills: [
      { name: "hack-submit", does: "Runs the preflight, fixes gaps, and finalizes before the server lock.", ask: "Are we ready to submit? Run the preflight." },
      { name: "hack-demo", does: "Builds the demo kit from your story: HTML deck, PDF, video, cards.", ask: "Build our demo deck." },
      { name: "hack-showcase", does: "Reviews your public Ship Page. A teammate publishes it in the browser.", ask: "Preview our Ship Page." },
      { name: "hack-gtm", does: "Drafts launch copy backed by your verified evidence.", ask: "Draft our launch announcement." },
    ],
  },
];
