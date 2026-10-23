## What changed

## Review checklist (PLAN §3, T-DS-08)

- [ ] Lime (`--lime`, `tone="accent"`) only marks the next action or "you are here". It never means passed, done or admitted (use `tone="neutral"`).
- [ ] Teal VERIFIED (`tone="verified"`, ✓) only appears for evidence-backed success: a passing, source-verified Kane run or verified evidence.
- [ ] A failing Kane run reads as SUSPECTED / detected, never as a confirmed bug.
- [ ] Every status is in text, not colour alone. Tap targets are at least 44px and focus is visible.
- [ ] No demo or fabricated numbers shown as real; no secrets or PII on public pages or in logs.
- [ ] Every mutation: zod-validated, role and team scope checked on the server, audited, returns a receipt; idempotency key where retriable.
- [ ] Personal actions (consent, pairing, selfie, finalize) use `requirePersonalMember()`, not the team-level `getMember()`.
- [ ] Check-in, help and submission still work with AI, Slack, X and the renderer down.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass.
