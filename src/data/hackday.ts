// All Hack Day copy lives here so it can be edited without touching layout.
// Anything in [square brackets] is a placeholder still to be filled in.

export type Link = { label: string; href: string };

export const event = {
  name: "Kane CLI Hack Day",
  city: "SF",
  supporter: "OpenAI",
  tagline: "Build with OpenAI. Test with Kane CLI. Ship by 6.",
  // ISO date of the event day; schedule times below are local to it.
  date: "2026-11-14",
  timezone: "America/Los_Angeles",
  hashtag: "#KaneCLIHackDay",
};

export const ctas = {
  submitIdea: { label: "Submit idea", href: "/submit#idea" },
  submitProject: { label: "Submit project", href: "/submit#final" },
  helpDesk: { label: "Help desk", href: "/#help" },
} satisfies Record<string, Link>;

// ── Do this first ────────────────────────────────────────────────────────────

export const setupDeadline = "11:00";

export const setup: { id: string; title: string; body: string; value?: string; link?: Link }[] = [
  { id: "wifi", title: "Get online", body: "Join the venue WiFi.", value: "[network] / [password]" },
  {
    id: "sign-in",
    title: "Sign in to TestMu AI",
    body: "Use your registration email at testmuai.com. Your OpenAI credits and KaneAI Pro are matched by email.",
    link: { label: "testmuai.com", href: "https://www.testmuai.com" },
  },
  { id: "coupon", title: "Redeem your OpenAI coupon", body: "[steps]" },
  {
    id: "install",
    title: "Install Kane CLI",
    body: "Install, then run it once to check everything works.",
    value: "[install command]\n[first-run command]",
  },
  {
    id: "team",
    title: "Register your team",
    body: "Closes at 11:00. Solo builders register too.",
    link: { label: "Team form", href: "/submit#team" },
  },
];

// ── Schedule ─────────────────────────────────────────────────────────────────

export type Slot = {
  start: string; // "HH:MM", 24h
  end?: string;
  title: string;
  note?: string;
  /** A hard cut-off attendees must hit. */
  deadline?: boolean;
  href?: string;
};

export const schedule: Slot[] = [
  { start: "09:30", end: "10:15", title: "Check-in, breakfast" },
  { start: "10:15", end: "11:00", title: "Kickoff", note: "Kane CLI x OpenAI loop demo" },
  { start: "11:00", title: "Team registration closes. Hackathon begins", deadline: true, href: "/submit#team" },
  { start: "12:00", title: "Idea submission locks", deadline: true, href: "/submit#idea" },
  { start: "13:00", end: "14:00", title: "Working lunch" },
  { start: "14:00", title: "Mid evaluation", note: "Feedback only", href: "/judging#mid" },
  { start: "16:00", end: "17:00", title: "Final evaluation at your table", note: "Scored", href: "/judging#final" },
  { start: "17:00", end: "18:00", title: "Content hour", note: "Devpost locks at 6:00", href: "/content-hour" },
  { start: "18:00", title: "Devpost locks", deadline: true, href: "/submit#final" },
  { start: "18:00", end: "19:00", title: "Demo round", note: "Top 7 teams", href: "/judging#stage" },
  { start: "19:30", title: "Prizes and closing" },
];

export const onGroundHelp = "[name], [number]";

// ── Challenge ────────────────────────────────────────────────────────────────

export const challenge = {
  statement: "Build a product with OpenAI in the loop. Run Kane CLI against it while you build. Demo it live.",
  barsIntro: "By 6:00 your project clears three bars.",
  bars: [
    {
      title: "It works end to end",
      body: "A user can load it, complete the main flow, and get a result.",
    },
    {
      title: "Kane caught or proved something",
      body: "A failed run that found a bug, or a green run across real flows.",
    },
    {
      title: "The agent and Kane talked",
      body: "At least once, an agent’s output triggered a Kane run, or a Kane result changed what the agent did.",
    },
  ],
  tracks: ["Web App", "Mobile App", "AI Agent and Voice", "Data and Dashboards", "Wildcard"],
  tracksNote: "Same rubric for every track.",
};

// ── Assurance loop ───────────────────────────────────────────────────────────

export const loop = {
  summary:
    "Kane sits between your agent and your app. The agent writes code, Kane runs the flows in a real browser or device, the result goes back to the agent, the agent fixes and reruns. Nothing ships on the agent’s word alone.",
  steps: [
    { title: "Agent writes", body: "Your OpenAI agent changes the code." },
    { title: "Kane runs", body: "Kane CLI drives the real flows in a browser or device." },
    { title: "Report returns", body: "Pass, fail and evidence go back to the agent." },
    { title: "Agent fixes", body: "It reads the report, fixes, and Kane reruns." },
  ],
  links: [
    { label: "How it works", href: "[doc link]" },
    { label: "Wiring it with OpenAI", href: "[sample repo or guide]" },
    { label: "Three-minute walkthrough", href: "[link]" },
  ] satisfies Link[],
};

// ── Prizes ───────────────────────────────────────────────────────────────────

export const prizes = {
  podium: [
    { place: "1st", prize: "Apple Vision Pro", credits: "$3,000 OpenAI credits" },
    { place: "2nd", prize: "Mac mini", credits: "$2,000 OpenAI credits" },
    { place: "3rd", prize: "iPad Air", credits: "$1,000 OpenAI credits" },
  ],
  podiumNote: "Top 3 from the stage round.",
  shipped: { title: "Shipped prize", rule: "First 25 complete bundles by 6:00", prize: "[prize]" },
  everyone: { title: "Every builder", prize: "3 months KaneAI Pro + $250 OpenAI credits" },
};

// ── Rules ────────────────────────────────────────────────────────────────────

export const rules: { title: string; body: string; link?: Link }[] = [
  { title: "Team size", body: "Solo, or teams of up to 4." },
  {
    title: "Fresh code",
    body: "Code written today. Templates, boilerplates and libraries are fine. Pre-built projects are not.",
  },
  { title: "Both tools", body: "OpenAI and Kane CLI are both required. Use only one and you cannot place." },
  { title: "One entry", body: "One Devpost entry per team. The Kane CLI run report is mandatory." },
  { title: "Any stack", body: "Any stack, any framework, any deployment." },
  { title: "Code of conduct", body: "Be kind, be safe.", link: { label: "Read it", href: "[link]" } },
];

// ── Submissions ──────────────────────────────────────────────────────────────

export const submissions = {
  team: {
    deadline: "11:00",
    form: { label: "Team registration form", href: "[link]" },
    needs: ["Team name", "Members and emails", "Track", "One-line idea"],
    solo: "Solo? Come to speed matching at the front of the room, 10:45.",
  },
  idea: {
    deadline: "12:00",
    devpost: { label: "Create your Devpost project", href: "[link]" },
    needs: ["Title", "Track", "Two sentences on what it does", "What Kane will verify"],
    note: "You can edit everything later. Mentors use this to find you, so be specific.",
  },
  final: {
    deadline: "18:00",
    devpost: { label: "Submit on Devpost", href: "[link]" },
    minimum: ["Repo", "Live URL or run command", "Kane CLI run report"],
    pickTwo: ["Video", "Blog", "X post", "HN post"],
    minimumNote: "Minimum for the shipped prize: the three essentials, plus any two content pieces, all live by 6:00.",
    fullBundle: "Full bundle: all four content pieces.",
    closing: "Devpost closes at 6:00. No exceptions.",
  },
};

// ── Evaluations & judging ────────────────────────────────────────────────────

export const evaluations = {
  mid: {
    time: "2:00",
    title: "Mid evaluation",
    scored: false,
    body: "Mentors visit every table. Nothing is scored. Fix what they flag.",
    checks: ["A clear idea", "OpenAI in the loop", "Kane CLI run at least once"],
  },
  final: {
    time: "4:00 – 5:00",
    title: "Final evaluation",
    scored: true,
    body: "Judges visit every table and score on the rubric. Keep building, and have one person ready for a 2-minute walkthrough.",
    checks: ["Decides the top 7 for the stage", "No team is eliminated", "Everyone continues to content hour"],
  },
};

export const judging = {
  shortlist: "Top 7 from the 4:00 scores, confirmed against Devpost at 6:00.",
  stage: { demo: "3-minute demo", qa: "2 minutes of questions" },
  rubric: [
    { label: "Kane CLI usage", points: 30 },
    { label: "Built with OpenAI", points: 25 },
    { label: "Works live", points: 20 },
    { label: "Idea", points: 15 },
    { label: "Craft", points: 10 },
  ],
  shippedNote: "Shipped prize: complete bundle, no scoring.",
  judges: ["[name]", "[name]", "[name]", "[name]"],
};

// ── Content hour ─────────────────────────────────────────────────────────────

export const contentHour = {
  intro:
    "The top 7 are being decided from the 4:00 round. This hour is for shipping and telling people. Templates and prompts for each step are in Resources.",
  steps: [
    { minutes: 10, title: "Record the video", href: "/resources#recording" },
    { minutes: 15, title: "Generate the blog from your run report", href: "/resources#content-skills" },
    { minutes: 5, title: "Thread from the blog", href: "/resources#content-skills" },
    { minutes: 5, title: "Post to Hacker News", href: "/resources#content-skills" },
    { minutes: 15, title: "Complete Devpost", href: "/submit#final" },
  ],
};

// ── Resources ────────────────────────────────────────────────────────────────

export type ResourceGroup = { id: string; title: string; blurb: string; items: { label: string; body?: string; href?: string }[] };

export const resources: ResourceGroup[] = [
  {
    id: "kane-cli",
    title: "Kane CLI",
    blurb: "Install it, write tests in plain English, read the run report.",
    items: [
      { label: "Quickstart", href: "[link]" },
      { label: "Writing tests in plain English", href: "[link]" },
      { label: "Run reports", href: "[link]" },
      { label: "Agent and CI integration", href: "[link]" },
      { label: "Starter repo", href: "[link]" },
    ],
  },
  {
    id: "assurance-loop",
    title: "The Assurance loop",
    blurb: "How Kane closes the loop between your agent and your app.",
    items: [
      { label: "How it works", href: "[doc link]" },
      { label: "Wiring it with OpenAI", href: "[sample repo or guide]" },
      { label: "Three-minute walkthrough video", href: "[link]" },
    ],
  },
  {
    id: "openai",
    title: "OpenAI",
    blurb: "APIs, models on your credits, and the Agents SDK.",
    items: [
      { label: "API quickstart", href: "[link]" },
      { label: "Models covered by your credits", body: "[list]" },
      { label: "Agents SDK", href: "[link]" },
    ],
  },
  {
    id: "build-ideas",
    title: "Build ideas",
    blurb: "Stuck? Each prompt is “build X, Kane verifies Y”.",
    items: [
      { label: "Web App", body: "Build [X], Kane verifies [Y]" },
      { label: "Mobile App", body: "Build [X], Kane verifies [Y]" },
      { label: "AI Agent and Voice", body: "Build [X], Kane verifies [Y]" },
      { label: "Data and Dashboards", body: "Build [X], Kane verifies [Y]" },
      { label: "Wildcard", body: "Build [X], Kane verifies [Y]" },
      { label: "Wildcard", body: "Build [X], Kane verifies [Y]" },
    ],
  },
  {
    id: "content-skills",
    title: "Content skills",
    blurb: "A prompt pack to drop into your agent.",
    items: [
      { label: "Video", body: "Script and shot list from your Devpost description." },
      { label: "Blog", body: "First draft from your run report and commit log." },
      { label: "X thread", body: "Launch tweet plus a 3-tweet thread from the blog." },
      {
        label: "Hacker News",
        body: "Show HN title formula and guidance. Post from your own account, in your own words; HN flags generated text.",
      },
      { label: "Marketing assets", body: "Logo and hero image prompt, screenshot-to-social-card prompt, one-line pitch prompt." },
      { label: "Demo deck", body: "10-slide template plus the prompt that fills it from Devpost." },
      { label: "Download the pack", href: "[link]" },
    ],
  },
  {
    id: "recording",
    title: "Recording and demo",
    blurb: "Get the video and the stage demo right.",
    items: [
      { label: "Screen recording", body: "Loom or QuickTime, 2 to 4 minutes, no editing needed." },
      { label: "Video structure", body: "Problem, build, Kane in the loop with the run report on screen, demo." },
      { label: "Title format", body: "[Project] | Kane CLI Hack Day SF" },
      { label: "Stage demo tips", body: "Lead with the run report, show one real flow, end on what Kane caught." },
    ],
  },
];

// ── Share & help ─────────────────────────────────────────────────────────────

export const share = {
  card: { label: "“I’m building at Kane CLI Hack Day SF” card", href: "[download]" },
  caption: "[text]",
  tags: ["@testmuai", "[OpenAI handle pending]", "#KaneCLIHackDay"],
  shippedCard: "“We shipped it” card unlocks after 7:30.",
};

export const help = [
  { title: "Help desk", body: "[location]" },
  { title: "Kane CLI questions", body: "[engineer names]" },
  { title: "Credits and WiFi", body: "[name]" },
];
