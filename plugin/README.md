# Kane Hack OS plugin

Twelve participant skills plus the event MCP server for Kane CLI Hack Day.

> **Status: not announced as installable.** The skills and the `/mcp` server are implemented in this repo, but the plugin must pass a clean, fresh-session install test (Codex on macOS, and Windows if we claim it) before anyone tells participants to install it (TASKS T-PLG-05, acceptance A09). Until then the supported path is the web app plus `kanehack`.

## What's here

| Path | What |
|---|---|
| `plugin.json` | Manifest (name `kane-hack-os`, version 0.1.0). Bump the version on every release. |
| `mcp.json` | The remote MCP server `kane-hack-event` → `https://www.kaneclihack.sh/mcp`, Streamable HTTP, bearer token from `KANEHACK_TOKEN`. |
| `skills/hack-*/SKILL.md` | The 12 skills. The same files are mirrored at `.agents/skills/hack-*` for hosts that read repository skills. |
| `hooks/README.md` | The optional, opt-in lifecycle hook (off by default). |
| `GENERATIVE_UI_CONTRACT.md` | How tool envelopes map to UI cards and to plain text. |

| Skill | MCP tools it uses |
|---|---|
| hack-onboard | participant_get_status, participant_update_profile, activation_begin, activation_get_checkpoint |
| hack-doctor | readiness_report, event_get_brief, help_diagnose |
| hack-team | participant_get_status, team_find, team_create, team_join |
| hack-idea | idea_validate, idea_check_overlap, harness_get_capabilities |
| hack-harness | harness_get_capabilities, event_get_brief |
| hack-verify | kane_record_run, milestone_propose |
| hack-progress | kane_record_run, milestone_propose, submission_preflight |
| hack-help | help_diagnose, help_create, help_get_status |
| hack-demo | deck_get, deck_update, demo_generate, showcase_preview |
| hack-showcase | showcase_preview, showcase_publish, submission_preflight |
| hack-gtm | showcase_preview, milestone_propose |
| hack-submit | submission_preflight, submission_finalize, event_get_brief |

`social_publish` is an organizer action on the web and is deliberately **not** an MCP tool.

## Kane CLI syntax comes from the official skill

These skills never copy or change the official Kane CLI skill. Install it separately:

```sh
npx @testmuai/kane-cli-skill
```

## Connecting

1. Install the helper: `curl -fsSL https://kaneclihack.sh/install.sh | sh` (Windows: `irm https://www.kaneclihack.sh/install.ps1 | iex`). Read it first if you like: it's plain text, checks prerequisites and installs `kanehack` into `~/.kanehack` from a checksummed tarball, without sudo. Don't run `npx kanehack`: that npm name isn't ours. Then `kanehack pair`. Pairing stores a token in `~/.kanehack/config.json` (mode 600) and prints it once so you can `export KANEHACK_TOKEN=…`.
2. Point your agent at `mcp.json` (Codex: add the server with `bearer_token_env_var = "KANEHACK_TOKEN"`; Claude Code: `claude mcp add --transport http kane-hack-event https://www.kaneclihack.sh/mcp --header "Authorization: Bearer $KANEHACK_TOKEN"`).
3. In a **new** session, ask "show my Kane Hack OS status". The agent should call `participant_get_status`.

## Running under an AI agent (Claude Code /remote-control, Codex)

The agent runs commands through a tool with no terminal, no stdin and a ~2 minute timeout per command (Claude Code: 10 minutes at most). Everything below works there:

```sh
# Install (only after the person agrees). Without --yes nothing is installed when there's no terminal,
# and the summary prints this exact command.
curl -fsSL https://kaneclihack.sh/install.sh | sh -s -- --yes                 # add --no-path / --no-skills to skip those
& ([scriptblock]::Create((irm https://www.kaneclihack.sh/install.ps1))) -Yes  # Windows; or $env:KANEHACK_YES=1 before irm | iex

# Pair in two calls. The person approves in their own browser; never paste tokens into the chat.
kanehack pair --start --json     # prints verification_url + user_code, exits
kanehack pair --wait --json      # 0 paired · 4 not approved yet (run again) · 1 expired/denied · 3 unreachable

kanehack doctor --json           # exit 1 if a check fails
kanehack consent yes             # only after the person says yes in the chat
kanehack report --json -- kane-cli run "…" --agent   # Kane's NDJSON, then one kanehack_report line; exits with Kane's code
kanehack status --json
kanehack submit --preflight --json

# MCP server with the saved token, without printing it:
claude mcp add --transport http kane-hack-event https://www.kaneclihack.sh/mcp --header "Authorization: Bearer $(kanehack token)"
```

A long Kane run can outlast the default 2 minutes: ask for a longer tool timeout (up to 10 minutes) or run it in the background and read its output when it finishes. On Windows, Claude Code's Bash tool is Git Bash: the installer writes an extensionless `kanehack` shim next to `kanehack.cmd` for it. All exit codes and JSON fields: `packages/kanehack/README.md`.

## Before announcing (T-PLG-05)

On a clean macOS user (and Windows, if claimed): install Node, run the installer, pair, add the MCP server, open a fresh agent session, confirm the 12 skills are discovered, call `event_get_brief` and `participant_get_status`, and run one `kanehack report` end to end. Record the date, host version and result here. Not done yet.
