// The /activate checklist: copy and links in one place.
//
// PLACEHOLDERS still to fill in before the event (search for "[" in this file):
//   CODEX_REDEEM_INSTRUCTIONS    generic until the organizer sends the real steps
//   [CODEX_REDEEM_URL]           where to redeem it
// The TestMu AI plan is claimed server-side (src/server/event-activation.ts),
// so step 2 has no link of its own.

export type ActivationStepId = "testmu_signup" | "testmu_plan" | "codex_credits";

export const TESTMU_SIGNUP_URL = "https://www.testmuai.com";

/** Shown under the Codex credit code once it is assigned. */
export const CODEX_REDEEM_INSTRUCTIONS = "Copy your code, open the redemption page, sign in to OpenAI, and paste the code.";
export const CODEX_REDEEM_URL = "[CODEX_REDEEM_URL]";

/** True while a value above is still a placeholder (the UI then hides a dead link). */
export const isPlaceholder = (s: string) => /^\[[A-Z_]+\]/.test(s);

export const ACTIVATION_STEPS: { id: ActivationStepId; n: string; title: string; body: string }[] = [
  {
    id: "testmu_signup",
    n: "01",
    title: "Register / log in with TestMu AI",
    body: "Create your TestMu AI account (or log in) with the same email you registered here. Then come back and tick Done.",
  },
  {
    id: "testmu_plan",
    n: "02",
    title: "Activate your TestMu AI plan",
    body: "Press Activate and we switch on the hack-day plan for your TestMu AI account. No form to fill in: we use the email on your profile.",
  },
  {
    id: "codex_credits",
    n: "03",
    title: "Enable your OpenAI Codex credits ($250)",
    body: "Get your personal OpenAI Codex credit code, redeem it, then tick Done. One code per person; keep it to yourself.",
  },
];

export const PLAN_MESSAGES = {
  claimed: "Plan activated.",
  notRegistered: (email: string) => `You’re not signed up on TestMu AI yet. Sign up with ${email}: your hack-day plan is saved and switches on as soon as you do. Then press Check again.`,
  error: "Something went wrong activating your plan. Please reach out to the support staff at the help desk (or /help).",
  outOfCodes: "We’re out of codes right now. Please reach out to the support staff at the help desk.",
} as const;
