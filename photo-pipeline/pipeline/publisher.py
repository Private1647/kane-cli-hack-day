"""Gallery publisher: POSTs photos to /api/import/photo for tags whose publish state is 'pending'.

'held' tags (low-confidence or ambiguous face matches) are never sent until the organiser
approves or reassigns them in the review page, which flips them to 'pending'.
Failures retry with exponential backoff (10s .. 5min); 'unknown team' is not retried.
"""
from __future__ import annotations

import json
import logging
import threading
import time

from .config import Config
from .db import DB, loads
from .images import photo_key
from .site import SiteClient, SiteError

log = logging.getLogger("publisher")
POLL_SECONDS = 1.0


def backoff(attempts: int) -> float:
    return min(300.0, 10.0 * (2 ** max(0, attempts - 1)))


class Publisher:
    def __init__(self, cfg: Config, db: DB, site: SiteClient | None = None):
        self.cfg = cfg
        self.db = db
        self.site = site
        self.wake = threading.Event()

    def _caption(self, row) -> str | None:
        final = loads(row["final_json"], None)
        if final and final.get("caption"):
            return final["caption"]
        return None

    def publish_one(self, row) -> str:
        h, team = row["photo_hash"], row["team"]
        jpeg = (self.cfg.photos_dir / f"{h}.jpg").read_bytes()
        res = self.site.import_photo(jpeg, photo_key(h), [team], row["width"], row["height"], self._caption(row))
        outcome = (res.get("results") or {}).get(team)
        # "held for review": the site stored it privately because someone in it has no photo consent on record.
        if outcome in ("added", "already there", "held for review"):
            self.db.run("UPDATE tags SET publish='published', publish_result=?, publish_error=NULL "
                        "WHERE photo_hash=? AND team=?", (outcome, h, team))
            log.info("gallery: %s -> %s (%s)", h[:8], team, outcome)
            return outcome
        # 'unknown team' or something unexpected: do not hammer the site, surface it in review
        self.db.run("UPDATE tags SET publish='failed', publish_result=?, publish_error=? WHERE photo_hash=? AND team=?",
                    (str(outcome), f"site said: {json.dumps(res)[:300]}", h, team))
        log.warning("gallery: %s -> %s rejected: %s", h[:8], team, outcome)
        return str(outcome)

    def run_once(self) -> int:
        now = time.time()
        rows = self.db.all(
            """SELECT t.*, p.width, p.height FROM tags t JOIN photos p ON p.hash=t.photo_hash
               WHERE t.publish='pending' AND t.next_publish_at<=? AND t.state NOT IN ('rejected','reassigned')
               ORDER BY t.created_at LIMIT 10""", (now,))
        n = 0
        for row in rows:
            claimed = self.db.run("UPDATE tags SET publish='publishing' WHERE photo_hash=? AND team=? AND publish='pending'",
                                  (row["photo_hash"], row["team"]))
            if not claimed:
                continue
            try:
                self.publish_one(row)
                n += 1
            except Exception as e:
                attempts = row["publish_attempts"] + 1
                retryable = not isinstance(e, SiteError) or e.retryable
                self.db.run(
                    "UPDATE tags SET publish=?, publish_attempts=?, publish_error=?, next_publish_at=? "
                    "WHERE photo_hash=? AND team=?",
                    ("pending" if retryable else "failed", attempts, str(e)[:500], time.time() + backoff(attempts),
                     row["photo_hash"], row["team"]))
                log.warning("gallery publish failed (%s, attempt %d, %s): %s", row["team"], attempts,
                            "will retry" if retryable else "giving up", e)
        return n

    def run(self, stop: threading.Event) -> None:
        if self.site is None:
            try:
                self.site = SiteClient(self.cfg)
            except SiteError as e:
                log.error("gallery publishing disabled: %s", e)
                return
        while not stop.is_set():
            try:
                self.run_once()
            except Exception:
                log.exception("publisher loop error")
            self.wake.wait(POLL_SECONDS)
            self.wake.clear()
