// Shared constants for the local kane-cli fixtures: who, which team, which
// marker. scripts/seed-fixtures.mts creates the world from these and
// scripts/issue-test-codes.mts maps them onto .testmuai/variables/assurance.json.
// Everything here is synthetic (@demo.test, demo-* teams) and local only.

export const PERSONAL_PASSWORD = "demo-pass-1234";
/** Team password shared by every staging submission team (submission_team_password). */
export const STAGING_PASSWORD = "staging-team-pass";
export const MILESTONE_PASSWORD = "sparrow-team-pass";
/** Team password of the Ship Page studio team (ship_team_password). */
export const SHIP_PASSWORD = "swift-team-pass";

/** The participant every local test signs in as (participant_email). */
export const P = { name: "Pat Quill", email: "pat@demo.test", display: "Pat Q." };
/** The second participant (other_participant_email): on team_two, not discoverable. */
export const O = { name: "Olu Bankole", email: "olu@demo.test", display: "Olu Bankole" };

export type TeamSpec = {
  name: string;
  password: string;
  track: string;
  idea: string;
  people: { name: string; email: string }[];
  solo?: boolean;
};

const bird = (b: string, n = 2, password = STAGING_PASSWORD, idea = `Staging team ${b} for submission tests.`): TeamSpec => ({
  name: `Demo ${b[0].toUpperCase()}${b.slice(1)}`,
  password,
  track: "Web App",
  idea,
  people: [
    { name: `${b[0].toUpperCase()}${b.slice(1)} Captain`, email: `${b}.captain@demo.test` },
    ...(n > 1 ? [{ name: `${b[0].toUpperCase()}${b.slice(1)} Mate`, email: `${b}.mate@demo.test` }] : []),
  ],
  solo: n === 1,
});

export const T = {
  // team_one_slug = idea_team_slug: Pat's own team.
  kestrel: { name: "Demo Kestrel", password: "kestrel-team-pass", track: "Web App", idea: "Kestrel: a task tracker verified by Kane.", people: [P, { name: "Kit Lowe", email: "kit@demo.test" }] },
  // team_two_slug: Olu's team, with a finalized submission for the judge tests.
  heron: { name: "Demo Heron", password: "heron-team-pass", track: "AI Agent and Voice", idea: "Heron: an agent that triages flaky tests.", people: [{ name: "Hugo Hart", email: "hugo@demo.test" }, O] },
  ledger: { name: "Demo Ledger", password: "ledger-team-pass", track: "Web App", idea: "Ledger: an expense app with Kane-gated releases.", people: [{ name: "Lena Marsh", email: "lena@demo.test" }, { name: "Leo Brandt", email: "leo@demo.test" }] },
  quartet: {
    name: "Demo Quartet", password: "quartet-team-pass", track: "Wildcard", idea: "Quartet: four people, one CI harness.",
    people: [{ name: "Rae Tanaka", email: "rae@demo.test" }, { name: "Sol Ortiz", email: "sol@demo.test" }, { name: "Tia Novak", email: "tia@demo.test" }, { name: "Uma Reyes", email: "uma@demo.test" }],
  },
  inviter: { name: "Demo Inviter", password: "inviter-team-pass", track: "Wildcard", idea: "Inviter: a team with an expired invite.", people: [{ name: "Ivo Petrov", email: "ivo@demo.test" }, { name: "Jae Kim", email: "jae@demo.test" }] },
  wren: bird("wren"),
  tern: bird("tern"),
  robin: bird("robin"),
  gannet: bird("gannet"),
  egret: bird("egret"),
  dove: bird("dove"),
  finch: bird("finch"),
  outage: bird("outage", 2, "outage-team-pass", "Outage Relay: submitted on paper during the API outage."),
  sparrow: bird("sparrow", 1, MILESTONE_PASSWORD, "Sparrow: a solo build with verified Kane runs."),
  pelican: bird("pelican", 2, "pelican-team-pass", "Pelican: the photo gallery team."),
  osprey: bird("osprey", 1, "osprey-team-pass", "Osprey: a team with a private Kane run."),
  ibis: bird("ibis", 1, "ibis-team-pass", "Ibis: run fixtures for the live TV."),
  plover: bird("plover", 1, "plover-team-pass"),
  curlew: bird("curlew", 1, "curlew-team-pass"),
  avocet: bird("avocet", 1, "avocet-team-pass"),
  shrike: bird("shrike", 1, "shrike-team-pass"),
  lark: bird("lark", 1, "lark-team-pass"),
  reel: bird("reel", 1, "launch-team-pass", "Launch Reel: reviewed story with real footage."),
  glitch: bird("glitch", 1, "launch-team-pass", "Launch Glitch: everything ready except a failed video render."),
  stills: bird("stills", 1, "launch-team-pass", "Launch Stills: screenshots, no recording."),
  draftpost: bird("draftpost", 1, "launch-team-pass", "Launch Draftpost: an unapproved X post."),
  claims: bird("claims", 1, "launch-team-pass", "Launch Claims: a reviewed story for claim checks."),
  // Ship Page (t-96..t-100): the studio team, a draft page and a moderation-hidden page.
  swift: bird("swift", 2, SHIP_PASSWORD, "Swift: the Ship Page studio team."),
  martin: bird("martin", 1, "martin-team-pass", "Martin: a Ship Page that is still a draft."),
  puffin: bird("puffin", 1, "puffin-team-pass", "Puffin: a Ship Page an organizer hid."),
} satisfies Record<string, TeamSpec>;
export type TeamKey = keyof typeof T;

export const slugOf = (k: TeamKey) =>
  T[k].name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const captainOf = (k: TeamKey) => T[k].people[0];

/** Teamless people. */
export const LONERS = [
  { name: "Dana Cole", email: "dana@demo.test", display: "Dana C." }, // discoverable: introduction target
  { name: "Rowan Price", email: "rowan@demo.test", display: "Rowan P." }, // registered, but only on the signed Luma CSV
];

// ── Roster ────────────────────────────────────────────────────────────────────
export const GUEST = {
  pat: "gst-pat", // approved_luma_guest_id
  olu: "gst-olu", // other_approved_luma_guest_id
  quinn: "gst-quinn", // approved attendee on the offline check-in ledger
  hal: "gst-hal", // not admitted (declined), from seed-local
  rowan: "gst-rowan", // new in the signed Luma CSV: not on the seeded roster
  ivy: "gst-ivy", // waitlist in the seeded roster, approved in the signed Luma CSV
};
export const QUINN = { name: "Quinn Archer", email: "quinn@demo.test" };
export const WALKIN = { name: "Wendy Walker", email: "wendy.walkin@demo.test" };
export const LUMA_SOURCE_VERSION = "demo-luma-export-2026-10-22.v3";

// ── Offline / recovery ───────────────────────────────────────────────────────
export const OFFLINE = {
  helpReceiptId: "H-OFF042",
  submissionReceiptId: "S-OFF042",
  checkinReceiptId: "CHK-OFF042",
  /** A wall time on the event day's eve (already past), America/Los_Angeles, as the date-time picker takes it. */
  time: "2026-10-23T00:15",
  timeIso: "2026-10-23T00:15:00-07:00",
  reason: "Venue Wi-Fi outage at the check-in desk; paper slip entered after the backend recovered",
  witness: "Morgan Reyes (volunteer lead)",
  /** Who took the paper check-in at the desk, and their initials on the slip. */
  checkinStaff: "Sam Ortiz (check-in desk)",
  checkinSignature: "S.O.",
  incident: "INC-901",
  commitSha: "9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
  projectName: "Outage Relay",
};

// ── Help ─────────────────────────────────────────────────────────────────────
export const HELP = {
  waitingSummary: "kane-cli testrun hangs after the plan step [fixture:waiting]",
  resolvedSummary: "Test Manager link 404s for my saved test [fixture:resolved]",
  sensitiveSummary: "Diagnostics for my failing Kane run [fixture:sensitive]",
  secretMarker: "KHSECRET-MARKER-41A7",
  privateRepoMarker: "PRIVATE-REPO-MARKER-9C2",
  biometricMarker: "BIOMETRIC-MARKER-5F8",
};

// ── Ideas / Radar ────────────────────────────────────────────────────────────
export const PRIVATE_IDEA_MARKER = "KESTREL-PRIVATE-IDEA-7Q4Z";
export const PRIVATE_RADAR_MARKER = "ZEPHYR-QUILLWORK-PRIVATE-3K9";
export const RADAR = {
  kestrel: { type: "application", summary: "Browser task tracker for small teams where Kane CLI regression suites verify every checkout and signup flow before release" },
  plover: { type: "application", summary: "Browser task tracker for small teams where Kane CLI regression suites verify each signup and checkout flow before every release" },
  curlew: { type: "agent", summary: "Coding agent for small teams that writes Kane CLI regression suites for signup flows from support tickets" },
  avocet: { type: "validation_harness", summary: "Standalone harness that replays Kane CLI checkout suites against preview deploys and reports regressions" },
  shrike: { type: "application", summary: "Browser task tracker for small teams where Kane CLI regression suites verify every checkout and signup flow before release" },
  lark: {
    type: "plugin",
    summary: "Figma plugin that exports annotated design tokens for handoff",
    private: `${PRIVATE_RADAR_MARKER}: browser task tracker for small teams where Kane CLI regression suites verify every checkout and signup flow before release`,
  },
} as const;
export const UNSUPPORTED_FEATURE = "running the Kane CLI browser suite in desktop Safari and Firefox (Kane CLI drives Chrome on desktop)";

// ── Matching ─────────────────────────────────────────────────────────────────
export const MATCH = {
  strength: "Playwright-to-Kane test migration",
  interest: "accessibility audits",
  availability: "all-day",
  learningGoal: "Kane CLI testrun suites in CI",
};
/** No phone field exists in the app: this number lives only in private free text (see TEST_FIXTURES.md). */
export const PRIVATE_PHONE = "+1 415 555 0142";

// ── Kane ─────────────────────────────────────────────────────────────────────
export const SHA = {
  kestrel: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d",
  sparrowOld: "2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e",
  sparrow: "3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f",
  staging: "4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70",
  ibis: "5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081",
};
export const RUN_IDS = {
  sparrowVerified: "demo-run-sparrow-verified",
  sparrowEarlier: "demo-run-sparrow-earlier",
  privateOsprey: "demo-run-private-osprey-5X2",
  tvPassed: "demo-run-tv-passed",
  tvFailed: "demo-run-tv-failed",
  tvError: "demo-run-tv-error",
  tvLinked: "demo-run-tv-linked",
  tvUnlinked: "demo-run-tv-unlinked",
};

// ── Launch kit ───────────────────────────────────────────────────────────────
export const UNSUPPORTED_KPI = "Cut checkout regressions by 87% across 40 paying customers";
export const UNSUPPORTED_TESTIMONIAL = "\"Kane saved our launch\" - VP Engineering, Acme Corp";

// ── Ship Page ────────────────────────────────────────────────────────────────
/** Claim texts and markers for the Ship Page tests. No digits, so none reads as a metric. */
export const SHIP = {
  approvedClaim: "Swift checkout and signup pass end to end on the submitted commit (SWIFT-APPROVED-CLAIM-KQZ)",
  unapprovedClaim: "Swift is the only tracker any judge has ever loved (SWIFT-UNAPPROVED-CLAIM-RVM)",
  noEvidenceClaim: "Swift caught every checkout regression before release (SWIFT-NOEVIDENCE-CLAIM-WXH)",
  hiddenMarker: "PUFFIN-HIDDEN-PRIVATE-MARKER-TJB",
  storyChange: "Edited after finalizing: this pitch must not change the submitted snapshot (kane-cli check).",
};

// ── Photos ───────────────────────────────────────────────────────────────────
export const PHOTO_DIR = "event/fixtures";
export const PHOTOS = [
  { file: "pelican-pub-1.png", marker: "PELICAN-PUB-1", status: "published" as const, rgb: [46, 160, 130] as const },
  { file: "pelican-pub-2.png", marker: "PELICAN-PUB-2", status: "published" as const, rgb: [70, 110, 200] as const },
  { file: "pelican-unpub-1.png", marker: "PELICAN-UNPUB-1", status: "approved" as const, rgb: [200, 80, 60] as const },
];

/** Staff, beyond the four seed-local creates. */
export const STAFF2 = [{ email: "mentor2@demo.test", name: "Mina Mentor", role: "mentor" as const }];
export const STAFF_BY_VAR = {
  organizer_one_time_code: "organizer@demo.test",
  mentor_one_time_code: "mentor@demo.test",
  second_mentor_one_time_code: "mentor2@demo.test",
  judge_one_time_code: "judge@demo.test",
} as const;
export const PHOTOGRAPHER = "photo@demo.test";
/** Enrolled for biometric matching (selfie stored, face_matching consent): biometric_enrolled_subject_id. */
export const BIOMETRIC_ENROLLED = "pelican.mate@demo.test";
