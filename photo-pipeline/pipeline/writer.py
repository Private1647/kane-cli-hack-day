"""Draft writer: one Claude call per (photo, team) -> LinkedIn A/B, X post, caption, alt text, tag names.

Structured output comes from a strict tool (`submit_post_drafts`). Note: Claude Opus 5.5 (the default
model) rejects forced tool_choice ({"type": "tool"}) with a 400, so we use tool_choice auto + strict
schema + an explicit instruction, and re-ask if no tool call comes back.
"""
from __future__ import annotations

import json
import os
import logging
import threading
import time

from .config import Config
from .db import DB, loads
from .images import claude_image_b64
from .matching import consenting_members, filter_consenting, forbidden_names
from .validate import EVENT_TAG, validate_draft

log = logging.getLogger("writer")

EVENT_NAME = "Kane CLI Hack Day, SF Edition"
EVENT_DATE = "Saturday 24 October 2026"
EVENT_THEME = "Build with OpenAI, test with Kane CLI"
TOOL_NAME = "submit_post_drafts"
MAX_ROUNDS = 3  # first draft + up to 2 revisions when validation finds problems
WORKERS = 3
# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}

SYSTEM_PROMPT = f"""You write social media posts for {EVENT_NAME}, a one-day hackathon on {EVENT_DATE}.
The theme is "{EVENT_THEME}": teams build with OpenAI models and test their apps with Kane CLI.
You get one event photo plus a short brief about the team in it. You write posts the organiser
will review and publish from the event's own accounts.

Voice rules (follow all of them):
- Plain, warm, specific. Write like a person who was in the room, not a press release.
- Never use em dashes. Use commas, full stops or parentheses instead.
- No hype words (for example: amazing, incredible, game-changer, revolutionary, cutting-edge,
  groundbreaking, epic, insane, unleash, supercharge, next-level, seamless, world-class).
- Hashtags go only on the final line, never inside sentences. Every post's final line includes
  {EVENT_TAG}. Two to four hashtags in total.
- Do not invent anything. Only state what is visible in the photo or written in the brief. Do not
  claim results, awards, demos working, user numbers or quotes. If the idea is vague, stay general.
- Name only the people listed as "people in frame". Do not guess who else is in the photo, and do
  not describe anyone's appearance beyond what the alt text needs.
- Tie the post to the theme "{EVENT_THEME}" naturally, in one phrase, not a slogan.

Fields:
- linkedin_a and linkedin_b: two different takes (for example one about the idea, one about the
  moment in the photo). Body of 60 to 110 words, then a blank line, then the hashtag line.
- x_post: under 240 characters in total including the hashtag line.
- caption: one short sentence for the team's photo gallery on the event site. No hashtags.
- alt_text: a literal description of the photo for screen readers, max about 40 words. No hashtags.
- tag_names: the names of the people in frame (from the brief) that the organiser should tag.

Always respond by calling the {TOOL_NAME} tool exactly once."""

DRAFT_TOOL = {
    "name": TOOL_NAME,
    "description": "Submit the drafted posts for this photo and team.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "linkedin_a": {"type": "string", "description": "LinkedIn post, version A. 60-110 word body + hashtag line."},
            "linkedin_b": {"type": "string", "description": "LinkedIn post, version B, a different angle."},
            "x_post": {"type": "string", "description": "X post under 240 characters including hashtags."},
            "caption": {"type": "string", "description": "One-sentence gallery caption, no hashtags."},
            "alt_text": {"type": "string", "description": "Literal description of the photo."},
            "tag_names": {"type": "array", "items": {"type": "string"},
                          "description": "Names of people in frame to tag."},
        },
        "required": ["linkedin_a", "linkedin_b", "x_post", "caption", "alt_text", "tag_names"],
        "additionalProperties": False,
    },
}


class DraftError(RuntimeError):
    def __init__(self, msg: str, retryable: bool):
        super().__init__(msg)
        self.retryable = retryable


def build_brief(team_slug: str, team: dict, people_in_frame: list[str], other_teams: list[str]) -> str:
    """Only consenting members are ever shown to Claude (names and handles); others are not mentioned."""
    people_in_frame = filter_consenting(people_in_frame, team)
    consenting = consenting_members(team)
    withheld = len(team.get("members", [])) - len(consenting)
    members = []
    for m in consenting:
        handles = []
        if m.get("x_handle"):
            handles.append(f"X @{m['x_handle']}")
        if m.get("linkedin"):
            handles.append("on LinkedIn")
        members.append(f"- {m.get('name')}" + (f" ({', '.join(handles)})" if handles else ""))
    lines = [
        f"Team: {team.get('name') or team_slug}" + (" (solo builder)" if team.get("is_solo") else ""),
        f"Track: {team.get('track') or 'not given'}",
        f"Idea (from their registration, may be rough): {team.get('idea') or 'not given'}",
        "Members you may name:",
        *(members or ["- none, do not name anyone"]),
        "People in frame (matched by face recognition, the only people you may name): "
        + (", ".join(people_in_frame) if people_in_frame else "none identified, do not name anyone"),
    ]
    if withheld:
        lines.append(f"{withheld} other team member(s) asked not to be named or tagged. Never name, "
                     "guess or describe them individually; refer to 'the team' instead.")
    if other_teams:
        lines.append("Other teams also in this photo (do not write about them): " + ", ".join(other_teams))
    return "\n".join(lines)


def build_user_content(image_b64: str, brief: str, previous: dict | None, problems: list[str]) -> list[dict]:
    text = f"Brief:\n{brief}\n\nWrite the drafts for this photo."
    if previous is not None:
        text += ("\n\nYour previous draft had problems. Fix every one and resubmit all fields.\n"
                 f"Problems:\n- " + "\n- ".join(problems) +
                 f"\n\nPrevious draft:\n{json.dumps(previous, ensure_ascii=False, indent=1)}")
    text += f"\n\nCall the {TOOL_NAME} tool with your answer."
    return [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
        {"type": "text", "text": text},
    ]


def extract_tool_input(response) -> dict | None:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == TOOL_NAME:
            data = block.input
            return json.loads(data) if isinstance(data, str) else dict(data)
    return None


class Writer:
    def __init__(self, cfg: Config, db: DB, client=None):
        self.cfg = cfg
        self.db = db
        self._client = client
        self.wake = threading.Event()

    @property
    def client(self):
        if self._client is None:
            import anthropic

            # The SDK retries 408/409/429/5xx and connection errors with exponential backoff
            # (honouring retry-after); 4 retries keeps a single draft well inside the 2 minute target.
            # An organization-level key must name its workspace on every request.
            ws = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
            self._client = anthropic.Anthropic(api_key=self.cfg.anthropic_api_key or None, max_retries=4,
                                               timeout=90.0,
                                               default_headers={"anthropic-workspace-id": ws} if ws else None)
        return self._client

    def _call(self, content: list[dict]):
        import anthropic

        kwargs = dict(
            model=self.cfg.claude_model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            tools=[DRAFT_TOOL],
            tool_choice={"type": "auto"},
            output_config={"effort": self.cfg.claude_effort},
            messages=[{"role": "user", "content": content}],
        )
        try:
            if self.cfg.claude_model in FALLBACK_MODELS:
                return self.client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
            return self.client.messages.create(**kwargs)
        except anthropic.RateLimitError as e:
            raise DraftError(f"rate limited after retries: {e}", retryable=True) from e
        except anthropic.APIStatusError as e:
            raise DraftError(f"API {e.status_code}: {e.message}", retryable=e.status_code >= 500) from e
        except anthropic.APIConnectionError as e:
            raise DraftError(f"connection error: {e}", retryable=True) from e

    def draft(self, image_b64: str, brief: str, team: dict | None = None) -> tuple[dict, list[str]]:
        team = team or {}
        forbidden = forbidden_names(team)
        allowed_tags = [m.get("name") or "" for m in consenting_members(team)]
        previous, problems = None, []
        for round_no in range(MAX_ROUNDS):
            resp = self._call(build_user_content(image_b64, brief, previous, problems))
            if resp.stop_reason == "refusal":
                raise DraftError("Claude declined to write this one (refusal); write it by hand", retryable=False)
            data = extract_tool_input(resp)
            if data is None:
                problems = [f"you did not call the {TOOL_NAME} tool"]
                continue
            fixed, problems = validate_draft(data, forbidden_names=forbidden, allowed_tag_names=allowed_tags)
            if not problems:
                return fixed, []
            log.info("draft round %d problems: %s", round_no + 1, problems)
            previous = fixed
        if previous is None:
            raise DraftError("no tool call after retries", retryable=True)
        return previous, problems  # best effort; problems are shown as warnings in review

    # --- worker ---------------------------------------------------------------------------
    def write_one(self, photo_hash: str, team: str) -> None:
        index_teams = loads(self.cfg.index_meta.read_text(), {}).get("teams", {}) if self.cfg.index_meta.exists() else {}
        row = self.db.one("SELECT * FROM tags WHERE photo_hash=? AND team=?", (photo_hash, team))
        others = [r["team"] for r in self.db.all(
            "SELECT team FROM tags WHERE photo_hash=? AND team<>? AND state NOT IN ('rejected','reassigned')",
            (photo_hash, team))]
        team_info = index_teams.get(team, {"name": team})
        other_names = [index_teams.get(o, {}).get("name", o) for o in others]
        brief = build_brief(team, team_info, loads(row["members"], []), other_names)
        t0 = time.time()
        try:
            draft, problems = self.draft(claude_image_b64(self.cfg.photos_dir / f"{photo_hash}.jpg"), brief, team_info)
        except Exception as e:
            retryable = not isinstance(e, DraftError) or e.retryable
            attempts = row["draft_attempts"] + 1
            give_up = not retryable or attempts >= 6
            self.db.run(
                "UPDATE tags SET draft=?, draft_attempts=?, draft_error=?, next_draft_at=? WHERE photo_hash=? AND team=?",
                ("error" if give_up else "pending", attempts, str(e)[:500],
                 time.time() + min(300, 15 * 2 ** (attempts - 1)), photo_hash, team))
            log.warning("draft failed for %s/%s (attempt %d): %s", photo_hash[:8], team, attempts, e)
            return
        self.db.run(
            "UPDATE tags SET draft='ready', draft_json=?, draft_problems=?, draft_error=NULL, "
            "draft_attempts=draft_attempts+1 WHERE photo_hash=? AND team=? AND draft='writing'",
            (json.dumps(draft, ensure_ascii=False), json.dumps(problems), photo_hash, team))
        log.info("draft ready for %s/%s in %.1fs%s", photo_hash[:8], team, time.time() - t0,
                 f" ({len(problems)} warnings)" if problems else "")

    def claim(self, limit: int) -> list[tuple[str, str]]:
        rows = self.db.all(
            """SELECT photo_hash, team FROM tags WHERE draft='pending' AND next_draft_at<=?
               AND state='review' ORDER BY created_at LIMIT ?""", (time.time(), limit))
        claimed = []
        for r in rows:
            if self.db.run("UPDATE tags SET draft='writing' WHERE photo_hash=? AND team=? AND draft='pending'",
                           (r["photo_hash"], r["team"])):
                claimed.append((r["photo_hash"], r["team"]))
        return claimed

    def run(self, stop: threading.Event) -> None:
        if not self.cfg.anthropic_api_key:
            log.warning("ANTHROPIC_API_KEY is not set; relying on other SDK credentials (ant auth login)")
        # Daemon worker threads (not a ThreadPoolExecutor) so Ctrl-C never waits on a slow API call;
        # anything interrupted mid-draft goes back to 'pending' on next start (DB.recover_inflight).
        slots = threading.Semaphore(WORKERS)

        def work(h: str, team: str) -> None:
            try:
                self.write_one(h, team)
            except Exception:
                log.exception("writer crashed on %s/%s", h[:8], team)
                self.db.run("UPDATE tags SET draft='pending', next_draft_at=? WHERE photo_hash=? AND team=? "
                            "AND draft='writing'", (time.time() + 60, h, team))
            finally:
                slots.release()

        while not stop.is_set():
            free = 0
            while slots.acquire(blocking=False):
                free += 1
            claimed: list[tuple[str, str]] = []
            try:
                claimed = self.claim(free) if free else []
            except Exception:
                log.exception("writer claim failed")
            for h, team in claimed:
                threading.Thread(target=work, args=(h, team), daemon=True, name=f"draft-{h[:6]}").start()
            for _ in range(free - len(claimed)):
                slots.release()
            self.wake.wait(1.0)
            self.wake.clear()
