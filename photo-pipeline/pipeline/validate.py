"""Post-validation of Claude drafts (pure). Auto-fixes what is safe to fix; reports the rest.

`validate_draft` returns (fixed_draft, problems). Problems are fed back to Claude on a retry,
and any that survive the retries are shown to the organiser as warnings in the review page.
"""
from __future__ import annotations

import re

EVENT_TAG = "#KaneCLIHackDay"
LINKEDIN_MIN_WORDS, LINKEDIN_MAX_WORDS = 60, 110
X_MAX_CHARS = 240  # strictly less than

HYPE_WORDS = [
    "revolutionary", "revolutionize", "game-changer", "game changer", "game-changing", "groundbreaking",
    "cutting-edge", "cutting edge", "mind-blowing", "mind blowing", "insane", "incredible", "amazing",
    "epic", "unleash", "supercharge", "disrupt", "disruptive", "world-class", "next-level", "next level",
    "skyrocket", "crushing it", "killer", "rockstar", "ninja", "10x", "seamless", "unparalleled",
    "jaw-dropping", "blown away", "huge shoutout", "legendary",
]
_HYPE_RE = re.compile(r"(?<![\w-])(" + "|".join(re.escape(w) for w in HYPE_WORDS) + r")(?![\w-])", re.IGNORECASE)

TEXT_FIELDS = ("linkedin_a", "linkedin_b", "x_post", "caption", "alt_text")
POST_FIELDS = ("linkedin_a", "linkedin_b", "x_post")  # fields that carry hashtags


def strip_dashes(text: str) -> str:
    """Replace em dashes (and spaced en dashes used as em dashes) with commas."""
    text = re.sub(r"[ \t]*—[ \t]*", ", ", text)  # em dash
    text = re.sub(r"[ \t]+–[ \t]+", ", ", text)  # spaced en dash used as a dash
    text = re.sub(r"[ \t]+--[ \t]+", ", ", text)  # ascii double hyphen
    text = re.sub(r",[ \t]*,", ",", text)
    text = re.sub(r"^[ \t]*,[ \t]*", "", text, flags=re.MULTILINE)
    return text


def split_hashtag_line(text: str) -> tuple[str, str]:
    """(body, last_line_if_it_has_hashtags_else_'')."""
    lines = text.rstrip().split("\n")
    if lines and "#" in lines[-1]:
        return "\n".join(lines[:-1]).rstrip(), lines[-1].strip()
    return text.rstrip(), ""


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def ensure_event_tag(text: str) -> str:
    body, tags = split_hashtag_line(text)
    if EVENT_TAG.lower() in tags.lower():
        return text.rstrip()
    tags = (tags + " " + EVENT_TAG).strip()
    return f"{body}\n\n{tags}" if body else tags


def hype_words(text: str) -> list[str]:
    return sorted({m.group(1).lower() for m in _HYPE_RE.finditer(text)})


def mentioned_names(text: str, names) -> list[str]:
    """Names found as whole words. Full names match case-insensitively; single first names only
    when capitalised as written, so ordinary words ("mark", "will") don't trip the check."""
    found = set()
    for n in names:
        if not n:
            continue
        flags = re.IGNORECASE if " " in n.strip() else 0
        if re.search(r"(?<![\w@])" + re.escape(n) + r"(?!\w)", text, flags):
            found.add(n)
    return sorted(found)


def validate_draft(draft: dict, forbidden_names=(), allowed_tag_names=None) -> tuple[dict, list[str]]:
    """forbidden_names: people who did not consent; they must not appear anywhere in the draft.
    allowed_tag_names: if given, tag_names is filtered to these (consenting members) silently."""
    fixed = dict(draft)
    problems: list[str] = []

    for f in TEXT_FIELDS:
        fixed[f] = strip_dashes(str(fixed.get(f) or "")).strip()
        if not fixed[f]:
            problems.append(f"{f} is empty")
    fixed["tag_names"] = [str(n).strip() for n in (fixed.get("tag_names") or []) if str(n).strip()]
    if allowed_tag_names is not None:
        allowed = {n.strip().lower() for n in allowed_tag_names}
        fixed["tag_names"] = [n for n in fixed["tag_names"] if n.lower() in allowed]
    for f in TEXT_FIELDS:
        named = mentioned_names(fixed[f], forbidden_names)
        if named:
            problems.append(f"{f}: do not name {', '.join(named)} (no consent to be named)")

    for f in POST_FIELDS:
        if not fixed[f]:
            continue
        fixed[f] = ensure_event_tag(fixed[f])
        body, _tags = split_hashtag_line(fixed[f])
        if "#" in body:
            problems.append(f"{f}: hashtags must only appear on the last line")
        found = hype_words(body)
        if found:
            problems.append(f"{f}: remove hype words ({', '.join(found)})")

    for f in ("linkedin_a", "linkedin_b"):
        if fixed[f]:
            body, _ = split_hashtag_line(fixed[f])
            n = word_count(body)
            if not (LINKEDIN_MIN_WORDS <= n <= LINKEDIN_MAX_WORDS):
                problems.append(f"{f}: body is {n} words, must be {LINKEDIN_MIN_WORDS}-{LINKEDIN_MAX_WORDS}")

    if len(fixed["x_post"]) >= X_MAX_CHARS:
        problems.append(f"x_post is {len(fixed['x_post'])} characters, must be under {X_MAX_CHARS} including hashtags")

    for f in ("caption", "alt_text"):
        if "#" in fixed[f]:
            problems.append(f"{f}: no hashtags")
        found = hype_words(fixed[f])
        if found:
            problems.append(f"{f}: remove hype words ({', '.join(found)})")
    return fixed, problems
