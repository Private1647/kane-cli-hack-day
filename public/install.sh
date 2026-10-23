#!/bin/sh
# Kane CLI Hack Day installer: https://kaneclihack.sh/install.sh
# Version: 0.1.1
#
# Read me before you run me. This script:
#   - checks OS/arch, Node, Git, Chrome, Codex (optional), Kane CLI, Kane auth,
#     the official Kane CLI skill, the hack skills and whether the event API answers
#   - asks before it installs anything, and only installs the `kanehack` helper
#     into ~/.kanehack and the hack-* skills into your agents' skill folders
#     (each from a tarball whose sha256 is pinned below)
#   - never uses sudo, never edits your shell profile unless you say yes, never reads your repos,
#     files or chat history, never sends anything except one unauthenticated
#     "is the API up?" request
# Anything missing is reported with the exact command to fix it; you run it.
set -eu

KANEHACK_VERSION="0.1.1"
KANEHACK_SHA256="0e6d9b879c374955d93fa11c09ba8424ce84d665e8ffb91dff4ede1ae933e5fd"
SKILLS_SHA256="15908514717814bae5546024b9718db0cf0b2f07001e0b9c163a0286d3719215"
SITE="${KANEHACK_SITE:-https://kaneclihack.sh}"
PREFIX="${HOME}/.kanehack"

if [ -t 1 ]; then G="$(printf '\033[32m')"; Y="$(printf '\033[33m')"; R="$(printf '\033[31m')"; D="$(printf '\033[2m')"; N="$(printf '\033[0m')"; else G=""; Y=""; R=""; D=""; N=""; fi
pass() { printf '%s✓%s %-12s %s\n' "$G" "$N" "$1" "${2:-}"; }
warn() { printf '%s!%s %-12s %s %s→ %s%s\n' "$Y" "$N" "$1" "${2:-}" "$D" "$3" "$N"; }
fail() { printf '%s✗%s %-12s %s %s→ %s%s\n' "$R" "$N" "$1" "${2:-}" "$D" "$3" "$N"; FAILED=1; }
have() { command -v "$1" >/dev/null 2>&1; }
FAILED=0

ask() {
  # curl | sh has no stdin: read the answer from the terminal if there is one.
  # (CI and agents have no terminal: that's a quiet "no".)
  if { : </dev/tty; } 2>/dev/null; then printf '%s [y/N] ' "$1" >/dev/tty; read -r a </dev/tty || a=""; else a=""; fi
  case "$a" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

echo "Kane CLI Hack Day setup check (installer ${KANEHACK_VERSION})"
echo

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$OS" in
  Darwin|Linux) pass os "${OS}-${ARCH}" ;;
  *) fail os "${OS}-${ARCH}" "Use install.ps1 on Windows" ;;
esac

if have node; then
  NV="$(node -v 2>/dev/null | sed 's/^v//')"; NMAJ="${NV%%.*}"
  if [ "${NMAJ:-0}" -ge 18 ] 2>/dev/null; then pass node "$NV"; else fail node "$NV" "Install Node 18+ from https://nodejs.org"; fi
else fail node "missing" "Install Node 18+ from https://nodejs.org"; fi

if have git; then pass git "$(git --version | sed 's/git version //')"; else fail git "missing" "Install Git: https://git-scm.com"; fi

CHROME=""
if [ "$OS" = Darwin ]; then
  [ -d "/Applications/Google Chrome.app" ] || [ -d "${HOME}/Applications/Google Chrome.app" ] && CHROME=yes
else
  for b in google-chrome google-chrome-stable chromium chromium-browser; do have "$b" && CHROME=yes && break; done
fi
if [ -n "$CHROME" ]; then pass chrome; else fail chrome "missing" "Install Google Chrome: Kane drives a real browser"; fi

if have codex; then pass codex "$(codex --version 2>/dev/null | head -n1)"; else warn codex "not found" "Optional: any agent works; the web app works without one"; fi

if have kane-cli; then
  pass kane_cli "$(kane-cli --version 2>/dev/null | head -n1)"
  if kane-cli whoami >/dev/null 2>&1; then pass kane_auth; else fail kane_auth "signed out" "kane-cli login"; fi
else
  fail kane_cli "missing" "npm i -g @testmuai/kane-cli   (no sudo: set an npm prefix in your home if it asks)"
  warn kane_auth "skipped" "Install Kane CLI first"
fi

SKILL=""
for d in .claude/skills/kane-cli .agents/skills/kane-cli .codex/skills/kane-cli .gemini/skills/kane-cli; do [ -f "${HOME}/${d}/SKILL.md" ] && SKILL=yes; done
if [ -n "$SKILL" ]; then pass kane_skill; else warn kane_skill "not found" "npx @testmuai/kane-cli-skill"; fi

# Where agents look for personal skills: ~/.agents/skills always, plus Claude Code and Codex when present.
SKILL_DIRS="${HOME}/.agents/skills"
[ -d "${HOME}/.claude" ] && SKILL_DIRS="${SKILL_DIRS} ${HOME}/.claude/skills"
[ -d "${HOME}/.codex" ] && SKILL_DIRS="${SKILL_DIRS} ${HOME}/.codex/skills"
NEED_SKILLS=""
for d in $SKILL_DIRS; do [ -f "${d}/hack-onboard/SKILL.md" ] || NEED_SKILLS=yes; done
if [ -z "$NEED_SKILLS" ]; then pass hack_skills; else warn hack_skills "not found" "Offered below"; fi

# One unauthenticated request: 401 means the API is up and wants a token.
if have curl; then
  CODE="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 10 "${SITE}/api/v1/kane/runs" || echo 000)"
  case "$CODE" in 401|200|403) pass api "${SITE} (HTTP ${CODE})" ;; *) fail api "HTTP ${CODE}" "Check your network; the web app is ${SITE}" ;; esac
else warn api "curl missing" "Install curl"; fi

echo
if [ -x "${PREFIX}/bin/kanehack" ] && "${PREFIX}/bin/kanehack" version 2>/dev/null | grep -qx "$KANEHACK_VERSION"; then
  pass kanehack "${KANEHACK_VERSION} already installed in ${PREFIX}"
elif ! have node || ! have npm; then
  warn kanehack "not installed" "Install Node first, then re-run this script"
elif ask "Install the kanehack helper ${KANEHACK_VERSION} into ${PREFIX} (no sudo)?"; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  TGZ="${TMP}/kanehack-${KANEHACK_VERSION}.tgz"
  curl -fsSL --max-time 60 -o "$TGZ" "${SITE}/kanehack-${KANEHACK_VERSION}.tgz"
  if have shasum; then GOT="$(shasum -a 256 "$TGZ" | cut -d' ' -f1)"; else GOT="$(sha256sum "$TGZ" | cut -d' ' -f1)"; fi
  if [ "$GOT" != "$KANEHACK_SHA256" ]; then
    fail kanehack "checksum mismatch" "Don't use this download; tell the help desk (got ${GOT})"
    exit 1
  fi
  mkdir -p "${PREFIX}/cli" "${PREFIX}/bin"
  npm install --silent --no-audit --no-fund --prefix "${PREFIX}/cli" "$TGZ" >/dev/null
  ln -sf "${PREFIX}/cli/node_modules/kanehack/bin/kanehack.mjs" "${PREFIX}/bin/kanehack"
  pass kanehack "${KANEHACK_VERSION} → ${PREFIX}/bin/kanehack (sha256 verified)"
else
  warn kanehack "skipped" "Re-run this script when you're ready"
fi

if [ -n "$NEED_SKILLS" ] && have curl && ask "Install the 12 hack-* skills into ${SKILL_DIRS}?"; then
  STMP="$(mktemp -d)"
  STGZ="${STMP}/hack-skills-${KANEHACK_VERSION}.tgz"
  curl -fsSL --max-time 60 -o "$STGZ" "${SITE}/hack-skills-${KANEHACK_VERSION}.tgz"
  if have shasum; then GOT="$(shasum -a 256 "$STGZ" | cut -d' ' -f1)"; else GOT="$(sha256sum "$STGZ" | cut -d' ' -f1)"; fi
  if [ "$GOT" != "$SKILLS_SHA256" ]; then
    fail hack_skills "checksum mismatch" "Don't use this download; tell the help desk (got ${GOT})"
  else
    # Only the hack-* folders are written; your other skills are left alone.
    for d in $SKILL_DIRS; do mkdir -p "$d" && tar -xzf "$STGZ" -C "$d"; done
    pass hack_skills "12 skills → ${SKILL_DIRS} (sha256 verified). Start a new agent session to load them."
  fi
  rm -rf "$STMP"
elif [ -n "$NEED_SKILLS" ]; then
  warn hack_skills "skipped" "Re-run this script when you're ready"
fi

echo
# kanehack lives in ~/.kanehack/bin. If that isn't on PATH, offer to add it (asked, never silent),
# and print the next steps with the full path so they work in this terminal right now.
KH="kanehack"
if [ -x "${PREFIX}/bin/kanehack" ]; then
  case ":${PATH}:" in
    *":${PREFIX}/bin:"*) ;;
    *)
      KH="${PREFIX}/bin/kanehack"
      case "${SHELL##*/}" in
        zsh) RC="${HOME}/.zshrc" ;;
        bash) if [ "$OS" = Darwin ]; then RC="${HOME}/.bash_profile"; else RC="${HOME}/.bashrc"; fi ;;
        *) RC="" ;;
      esac
      LINE='export PATH="$HOME/.kanehack/bin:$PATH"  # kanehack'
      if [ -n "$RC" ] && grep -qF '.kanehack/bin' "$RC" 2>/dev/null; then
        echo "${D}${RC} already adds kanehack to PATH: open a new terminal to pick it up.${N}"
      elif [ -n "$RC" ] && ask "Add ~/.kanehack/bin to your PATH in ${RC}?"; then
        printf '\n%s\n' "$LINE" >> "$RC"
        pass path "added to ${RC}. Open a new terminal, or run: export PATH=\"\$HOME/.kanehack/bin:\$PATH\""
      else
        echo "${Y}kanehack isn't on your PATH.${N} Use the full path below, or run: export PATH=\"\$HOME/.kanehack/bin:\$PATH\""
      fi
      ;;
  esac
fi

echo
echo "Next:"
echo "  1. ${KH} pair        link this machine to your passport"
echo "  2. ${KH} doctor      re-check your setup"
echo "  3. ${KH} report -- kane-cli run \"Open ${SITE} and find the schedule\" --agent"
echo "     (your first Kane run, sent to your team's Proof tab)"
echo "Web: ${SITE}/passport"
[ "$FAILED" -eq 0 ] || echo "${Y}Some checks failed. Fix them with the commands above, or ask at the help desk.${N}"
exit 0
