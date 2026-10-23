"""Pure matching logic: no I/O, no InsightFace. Unit-tested with synthetic embeddings.

Rules (chosen to avoid wrong-team tags):
  * faces smaller than MIN_FACE_FRAC of the image's shorter side are ignored;
  * each face votes for exactly ONE team: the team of its single best-matching enrolled face;
  * the vote counts only if that similarity >= MATCH_THRESHOLD;
  * if the runner-up team is within AMBIGUOUS_MARGIN, the tag is kept but flagged ambiguous
    (ambiguous tags are never auto-published; the organiser confirms them in review);
  * a member name is recorded as "in frame" only when the best match is that member's own
    labelled selfie (group-photo faces carry no name).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np

HARD_TAG_RE = re.compile(r"^([a-z0-9][a-z0-9-]*)__", re.IGNORECASE)


def parse_hard_tag(filename: str) -> str | None:
    """`my-team__stackchan.jpg` -> 'my-team'. Returns the slug lower-cased, or None."""
    name = filename.rsplit("/", 1)[-1]
    m = HARD_TAG_RE.match(name)
    return m.group(1).lower() if m else None


def face_is_big_enough(bbox: Sequence[float], img_w: int, img_h: int, min_face_frac: float) -> bool:
    x1, y1, x2, y2 = bbox[:4]
    short_side = min(x2 - x1, y2 - y1)
    return short_side >= min_face_frac * min(img_w, img_h)


def normalize_rows(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float32)
    if m.ndim == 1:
        m = m[None, :]
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


@dataclass
class IndexEntry:
    team: str
    member: str | None  # None for faces taken from a team group photo
    source: str  # "selfie" | "group"


@dataclass
class TeamMatch:
    team: str
    score: float  # best cosine similarity of any face voting for this team
    members: list[str] = field(default_factory=list)  # people in frame, by name
    faces: int = 0  # number of faces voting for this team
    ambiguous: bool = False  # some voting face had a close runner-up team
    runner_up: str | None = None
    margin: float | None = None  # smallest best-vs-runner-up margin among voting faces


def match_faces(
    face_embeddings: np.ndarray,
    index_embeddings: np.ndarray,
    index_entries: Sequence[IndexEntry],
    threshold: float,
    ambiguous_margin: float = 0.05,
) -> dict[str, TeamMatch]:
    """Match already size-filtered faces against the enrolled index.

    face_embeddings: (F, D); index_embeddings: (N, D). Both are L2-normalised here,
    so the dot product is cosine similarity.
    """
    result: dict[str, TeamMatch] = {}
    if len(index_entries) == 0 or face_embeddings is None or len(face_embeddings) == 0:
        return result
    faces = normalize_rows(face_embeddings)
    index = normalize_rows(index_embeddings)
    sims = faces @ index.T  # (F, N)
    teams = sorted({e.team for e in index_entries})
    team_cols = {t: [i for i, e in enumerate(index_entries) if e.team == t] for t in teams}

    for f in range(sims.shape[0]):
        row = sims[f]
        # best similarity per team for this face
        per_team = sorted(((float(row[cols].max()), t) for t, cols in team_cols.items()), reverse=True)
        best_score, best_team = per_team[0]
        if best_score < threshold:
            continue
        runner_score, runner_team = per_team[1] if len(per_team) > 1 else (-1.0, None)
        margin = best_score - runner_score

        tm = result.setdefault(best_team, TeamMatch(team=best_team, score=best_score))
        tm.faces += 1
        tm.score = max(tm.score, best_score)
        if runner_team is not None and margin < ambiguous_margin:
            tm.ambiguous = True
        if tm.margin is None or margin < tm.margin:
            tm.margin = margin
            tm.runner_up = runner_team

        # Name the person only if their own selfie is the best match within the winning team.
        cols = team_cols[best_team]
        best_i = cols[int(np.argmax(row[cols]))]
        entry = index_entries[best_i]
        if entry.member and entry.member not in tm.members:
            tm.members.append(entry.member)
    for tm in result.values():
        tm.score = round(tm.score, 4)
        if tm.margin is not None:
            tm.margin = round(tm.margin, 4)
    return result


def should_auto_publish(source: str, score: float, ambiguous: bool, gallery_auto_threshold: float) -> bool:
    """Gallery publish without review: filename hard tags, manual assignments, or confident face tags."""
    if source in ("hard", "manual"):
        return True
    return (not ambiguous) and score >= gallery_auto_threshold


def entries_from_meta(rows: Iterable[dict]) -> list[IndexEntry]:
    return [IndexEntry(team=r["team"], member=r.get("member"), source=r.get("source", "group")) for r in rows]


# --- Per-member consent (pure) -------------------------------------------------------------
# A member may be enrolled, named or tagged only if their own consent_social is exactly True
# (False and None/"not asked yet" both mean no). Group photos need every member's consent.

def member_consented(member: dict) -> bool:
    return member.get("consent_social") is True


def team_consent(team: dict) -> tuple[bool, bool]:
    """(any_consented, all_consented), computed from members and ANDed with the export's flags
    when present, so the stricter answer always wins."""
    members = team.get("members") or []
    any_c = any(member_consented(m) for m in members)
    all_c = bool(members) and all(member_consented(m) for m in members)
    if "any_consented" in team:
        any_c = any_c and bool(team["any_consented"])
    if "all_consented" in team:
        all_c = all_c and bool(team["all_consented"])
    return any_c, all_c


def consenting_members(team_meta: dict) -> list[dict]:
    return [m for m in team_meta.get("members", []) if member_consented(m)]


def forbidden_names(team_meta: dict) -> list[str]:
    """Names (full names, plus first names not shared with a consenting member) that must not
    appear in posts for this team."""
    ok = consenting_members(team_meta)
    ok_full = {(m.get("name") or "").strip().lower() for m in ok}
    ok_first = {n.split()[0] for n in ok_full if n}
    out: list[str] = []
    for m in team_meta.get("members", []):
        if member_consented(m):
            continue
        full = (m.get("name") or "").strip()
        if not full or full.lower() in ok_full:
            continue
        out.append(full)
        first = full.split()[0]
        if len(first) >= 3 and first.lower() not in ok_first and first != full:
            out.append(first)
    return out


def filter_consenting(names: Iterable[str], team_meta: dict) -> list[str]:
    allowed = {(m.get("name") or "").strip().lower() for m in consenting_members(team_meta)}
    return [n for n in names if (n or "").strip().lower() in allowed]
