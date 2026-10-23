# kanehack

The Kane CLI Hack Day helper. No dependencies; Node 18.17+.

```sh
curl -fsSL https://kaneclihack.sh/install.sh | sh     # macOS / Linux
irm https://kaneclihack.sh/install.ps1 | iex          # Windows PowerShell
kanehack pair
kanehack doctor
kanehack report -- kane-cli run "Sign up and reach the dashboard" --agent
```

| Command | What it does |
|---|---|
| `pair [--token khk_…]` | Device-code pairing with your account (or paste a token from your passport). Saves `~/.kanehack/config.json`, mode 600. |
| `doctor [--json] [--report]` | Checks OS, Node, Git, Chrome, Kane CLI, `kane-cli whoami`, the official Kane skill, the hack skills and the API. `--report` sends statuses and versions only. |
| `report [--evidence FILE] [--objective TEXT] [--commit SHA] [--no-upload] -- <kane-cli …>` | Runs the Kane command as given, streams its stdout through untouched, keeps the **exit code**, then sends a redacted copy of the NDJSON to `POST /api/v1/kane/runs`. Exits with Kane's exit code. |
| `status` | Your team's latest runs, with VERIFIED / unverified. |
| `help "<what's wrong>"` / `help --status H-0042` | Mentor ticket through the event MCP server. |
| `submit --preflight` | What's missing before you can submit. Finalizing needs your confirmation, so it happens on the Submit tab or through your agent. |
| `consent yes\|no` | Allow or stop sending run summaries. Asked once on first `report` in a terminal; non-interactive runs send nothing until you say yes. |

## What `report` sends, and what it never sends

Sent: the execution / session id, the process exit code, the Kane NDJSON stream after redaction, the objective or test file name, `git rev-parse HEAD`, and the sha256 of `--evidence` (the file itself is uploaded separately, ≤ 4 MB; larger packs go through the Proof tab).

Redacted before sending: GitHub/OpenAI/AWS/Slack-style tokens, JWTs, private keys, `LT_ACCESS_KEY=…`, `Bearer …`, any `"…token…": "…"`-style field, and home-directory paths. The server refuses reports that still look like they contain credentials.

Never sent: prompts, chat transcripts, source files, diffs, environment variables.

## How the server reads it

- Exit code decides: `0` passed, `1` failed, `2` nothing ran (auth/setup), `3` timed out/cancelled.
- No completion event (`run_end`, `test_md_done`, `testrun_done`) → not a pass, whatever the exit code.
- A run is **source-verified** only when it comes from a paired token, for your own team's project, with a completion event and an exit code that agree.
- A failing run opens a **suspected** defect. A teammate confirms it; a later passing run on a different commit re-verifies the fix.

## Release

`npm pack --pack-destination ../../public` produces `public/kanehack-<version>.tgz`; update `KANEHACK_VERSION` and `KANEHACK_SHA256` in `public/install.sh` and `public/install.ps1` to match (`shasum -a 256 public/kanehack-<version>.tgz`). Never replace a published tarball in place: bump the version.
