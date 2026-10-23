"""Organiser actions from the review page (approve / reject / reassign / assign / discard / redraft).

Kept separate from the Flask layer so they are easy to test.
"""
from __future__ import annotations

import json
import shutil
import time
from datetime import datetime

from .config import Config
from .db import DB, loads
from .schedule import next_free_slot, write_queue
from .matching import forbidden_names
from .validate import mentioned_names, strip_dashes

EDIT_FIELDS = ("linkedin_a", "linkedin_b", "x_post", "caption", "alt_text")


class ActionError(ValueError):
    pass


def known_teams(cfg: Config) -> dict[str, dict]:
    if not cfg.index_meta.exists():
        return {}
    return json.loads(cfg.index_meta.read_text()).get("teams", {})


def _tag(db: DB, h: str, team: str):
    row = db.one("SELECT * FROM tags WHERE photo_hash=? AND team=?", (h, team))
    if row is None:
        raise ActionError(f"no tag {h[:8]}/{team}")
    return row


def _copy_to_team(cfg: Config, db: DB, h: str, team: str) -> None:
    p = db.one("SELECT src_path, filename FROM photos WHERE hash=?", (h,))
    dest_dir = cfg.by_team_dir / team
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{h[:8]}_{p['filename']}"
    if dest.exists():
        return
    src = cfg.photos_dir / f"{h}.jpg"
    try:
        shutil.copy2(p["src_path"], dest)  # original if Drive still has it
    except OSError:
        shutil.copy2(src, dest.with_suffix(".jpg"))


def approved_items(cfg: Config, db: DB) -> list[dict]:
    items = []
    for r in db.all("SELECT * FROM tags WHERE state='approved' AND slot IS NOT NULL"):
        final = loads(r["final_json"], {})
        items.append({
            "slot": datetime.fromisoformat(r["slot"]),
            "linkedin_text": final.get("linkedin_b") if final.get("use_alt") else final.get("linkedin_a"),
            "x_text": final.get("x_post", ""),
            "image_path": str(cfg.photos_dir / f"{r['photo_hash']}.jpg"),
            "team": r["team"],
            "key": r["photo_hash"][:32],
        })
    return items


def rewrite_queue(cfg: Config, db: DB) -> int:
    return write_queue(cfg.queue_csv, approved_items(cfg, db))


def approve(cfg: Config, db: DB, h: str, team: str, edits: dict, now: datetime | None = None) -> dict:
    now = now or datetime.now().astimezone()
    final = {f: strip_dashes(str(edits.get(f, "") or "")).strip() for f in EDIT_FIELDS}
    final["use_alt"] = bool(edits.get("use_alt"))
    chosen = final["linkedin_b"] if final["use_alt"] else final["linkedin_a"]
    if not chosen or not final["x_post"]:
        raise ActionError("LinkedIn and X text are required to approve")
    # Hard stop: never schedule a post that names a teammate who did not consent.
    named = mentioned_names(" ".join([chosen, final["x_post"], final["caption"], final["alt_text"]]),
                            forbidden_names(known_teams(cfg).get(team, {})))
    if named:
        raise ActionError(f"Remove {', '.join(named)}: they did not consent to be named")
    with db.tx() as c:
        row = c.execute("SELECT * FROM tags WHERE photo_hash=? AND team=?", (h, team)).fetchone()
        if row is None:
            raise ActionError(f"no tag {h[:8]}/{team}")
        if row["state"] not in ("review", "approved"):
            raise ActionError(f"tag is {row['state']}, cannot approve")
        slot = row["slot"]
        if not slot:
            taken = [datetime.fromisoformat(r["slot"]) for r in
                     c.execute("SELECT slot FROM tags WHERE state='approved' AND slot IS NOT NULL").fetchall()]
            slot = next_free_slot(now, cfg.first_slot, cfg.slot_minutes, taken).isoformat()
        publish = row["publish"]
        if publish in ("held", "failed"):
            publish = "pending"
        c.execute(
            """UPDATE tags SET state='approved', final_json=?, slot=?, approved_at=?, publish=?,
                      publish_attempts=CASE WHEN publish IN ('held','failed') THEN 0 ELSE publish_attempts END,
                      next_publish_at=CASE WHEN publish IN ('held','failed') THEN 0 ELSE next_publish_at END
               WHERE photo_hash=? AND team=?""",
            (json.dumps(final, ensure_ascii=False), slot, time.time(), publish, h, team))
    rows = rewrite_queue(cfg, db)
    return {"slot": slot, "publish": publish, "queue_rows": rows}


def reject(cfg: Config, db: DB, h: str, team: str) -> dict:
    row = _tag(db, h, team)
    db.run("UPDATE tags SET state='rejected', slot=NULL, "
           "publish=CASE WHEN publish IN ('pending','failed') THEN 'held' ELSE publish END "
           "WHERE photo_hash=? AND team=?", (h, team))
    rewrite_queue(cfg, db)
    return {"already_published": row["publish"] in ("published", "publishing")}


def reassign(cfg: Config, db: DB, h: str, from_team: str, to_team: str) -> dict:
    if to_team not in known_teams(cfg):
        raise ActionError(f"unknown team {to_team}")
    if to_team == from_team:
        raise ActionError("same team")
    row = _tag(db, h, from_team)
    with db.tx() as c:
        c.execute("UPDATE tags SET state='reassigned', slot=NULL, "
                  "publish=CASE WHEN publish IN ('pending','failed') THEN 'held' ELSE publish END "
                  "WHERE photo_hash=? AND team=?", (h, from_team))
        # People-in-frame names belonged to the wrong team, so the new tag starts with none.
        db.add_tag(c, h, to_team, 1.0, "manual", [], publish="pending")
        c.execute("UPDATE photos SET status='tagged' WHERE hash=?", (h,))
    _copy_to_team(cfg, db, h, to_team)
    rewrite_queue(cfg, db)
    return {"already_published": row["publish"] in ("published", "publishing")}


def assign(cfg: Config, db: DB, h: str, team: str) -> dict:
    if team not in known_teams(cfg):
        raise ActionError(f"unknown team {team}")
    if db.one("SELECT 1 FROM photos WHERE hash=?", (h,)) is None:
        raise ActionError("unknown photo")
    with db.tx() as c:
        db.add_tag(c, h, team, 1.0, "manual", [], publish="pending")
        c.execute("UPDATE photos SET status='tagged' WHERE hash=?", (h,))
    _copy_to_team(cfg, db, h, team)
    return {"ok": True}


def discard(cfg: Config, db: DB, h: str) -> dict:
    db.run("UPDATE photos SET status='discarded' WHERE hash=?", (h,))
    return {"ok": True}


def redraft(cfg: Config, db: DB, h: str, team: str) -> dict:
    _tag(db, h, team)
    db.run("UPDATE tags SET draft='pending', draft_attempts=0, next_draft_at=0, draft_error=NULL "
           "WHERE photo_hash=? AND team=? AND draft<>'writing'", (h, team))
    return {"ok": True}
