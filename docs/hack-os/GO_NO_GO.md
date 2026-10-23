# Go / no-go (T-QA-10)

Run at 18:00 PT the day before, on the production deployment, with an organizer and one other person.
Any **No** on a Tier-0 line means: switch that flow to its manual path now and announce it.

| # | Check | How | Go if | Fallback if not |
|---|---|---|---|---|
| 1 | Migrations applied | `select max(...)` / `npm run db:migrate` on prod was run by the organizer | 001–028 applied, no errors | Do not deploy Hack OS; stay on main |
| 2 | Env vars set (Production) | Vercel → Settings → Environment Variables | DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD, BLOB_READ_WRITE_TOKEN, CRON_SECRET, RECEIPT_SIGNING_KEY set | Receipts unsigned (still valid, say so); crons off |
| 3 | Domain | `https://kaneclihack.sh` loads, TLS valid | 200 + HSTS | Use the vercel.app URL on printed QR codes |
| 4 | **Check-in** (Tier 0) | Import Luma CSV in /ops/roster, check in 1 approved guest, 1 walk-in | Both get a receipt; walk-in row source=walk_in | Paper roster + /ops/recovery later |
| 5 | **Help** (Tier 0) | Open a ticket as a participant, claim as a mentor, resolve | Code shown, claim 409 for a 2nd mentor | Paper slips H-P… typed in at /ops/recovery |
| 6 | **Submission** (Tier 0) | Captain signs in personally, saves draft, preflight, finalizes | Receipt S-XXXX; /ship/{team} public; deck opens | Manual receipt at /ops/recovery with a witness |
| 7 | Lock | Check `submission_locks_at` in /ops/settings | Correct PT time | Fix before go |
| 8 | /live | Open /live on the TV | Tiles update; stale banner if metrics cron is off | Hide /live, use the schedule slide |
| 9 | Crons | Vercel → Cron Jobs | outbox + metrics run (Pro) | Hobby: trigger /api/cron/metrics manually; Slack pings may lag |
| 10 | Slack | Create a test ticket | Slack ping arrives | Mentors watch /ops/help |
| 11 | AI gateway | /help diagnose | Suggestions come back | Deterministic fallback suggestions (no action needed) |
| 12 | Kill switches | /ops/settings flags | ship_pages, activation reachable | — |
| 13 | Tests | `npm test`; `QA_DATABASE_URL=<branch> npm run test:db` | All pass | Investigate before go |
