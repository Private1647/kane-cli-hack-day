"""SQLite state. One connection per thread, WAL mode, so tagger/writer/publisher/review can share it.

Tables
  photos      one row per unique photo (keyed by sha256 of the original file bytes)
  tags        one row per (photo, team): match info, gallery publish state, draft, approval
  seen_files  path -> (size, mtime, hash) so restarts don't re-hash the whole Drive folder
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS photos (
    hash        TEXT PRIMARY KEY,
    key         TEXT NOT NULL,
    src_path    TEXT NOT NULL,
    filename    TEXT NOT NULL,
    width       INTEGER,
    height      INTEGER,
    status      TEXT NOT NULL,            -- tagged | unresolved | discarded
    faces_total INTEGER DEFAULT 0,
    faces_used  INTEGER DEFAULT 0,        -- faces above MIN_FACE_FRAC
    hard_slug   TEXT,
    note        TEXT,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
    photo_hash   TEXT NOT NULL REFERENCES photos(hash),
    team         TEXT NOT NULL,
    score        REAL NOT NULL,
    source       TEXT NOT NULL,           -- hard | face | manual
    members      TEXT NOT NULL DEFAULT '[]',
    faces        INTEGER DEFAULT 0,
    ambiguous    INTEGER DEFAULT 0,
    runner_up    TEXT,
    margin       REAL,
    state        TEXT NOT NULL DEFAULT 'review',   -- review | approved | rejected | reassigned
    publish      TEXT NOT NULL DEFAULT 'held',     -- held | pending | publishing | published | failed
    publish_attempts INTEGER DEFAULT 0,
    publish_error    TEXT,
    publish_result   TEXT,
    next_publish_at  REAL DEFAULT 0,
    draft        TEXT NOT NULL DEFAULT 'pending',  -- pending | writing | ready | error
    draft_json   TEXT,
    draft_problems TEXT DEFAULT '[]',
    draft_attempts INTEGER DEFAULT 0,
    draft_error  TEXT,
    next_draft_at REAL DEFAULT 0,
    final_json   TEXT,
    slot         TEXT,
    approved_at  REAL,
    created_at   REAL NOT NULL,
    PRIMARY KEY (photo_hash, team)
);
CREATE TABLE IF NOT EXISTS seen_files (
    path   TEXT PRIMARY KEY,
    size   INTEGER NOT NULL,
    mtime  REAL NOT NULL,
    hash   TEXT,
    error  TEXT
);
CREATE INDEX IF NOT EXISTS tags_draft ON tags(draft, next_draft_at);
CREATE INDEX IF NOT EXISTS tags_publish ON tags(publish, next_publish_at);
"""


class DB:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self.conn().executescript(SCHEMA)  # executescript manages its own transaction

    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "c", None)
        if c is None:
            c = sqlite3.connect(self.path, timeout=30, isolation_level=None)
            c.row_factory = sqlite3.Row
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA busy_timeout=30000")
            c.execute("PRAGMA foreign_keys=ON")
            self._local.c = c
        return c

    @contextmanager
    def tx(self):
        c = self.conn()
        c.execute("BEGIN IMMEDIATE")
        try:
            yield c
            c.execute("COMMIT")
        except BaseException:
            c.execute("ROLLBACK")
            raise

    def all(self, sql: str, args=()) -> list[sqlite3.Row]:
        return self.conn().execute(sql, args).fetchall()

    def one(self, sql: str, args=()) -> sqlite3.Row | None:
        return self.conn().execute(sql, args).fetchone()

    def run(self, sql: str, args=()) -> int:
        return self.conn().execute(sql, args).rowcount

    def recover_inflight(self) -> None:
        """After a crash, anything mid-flight goes back to the queue."""
        self.run("UPDATE tags SET draft='pending' WHERE draft='writing'")
        self.run("UPDATE tags SET publish='pending' WHERE publish='publishing'")

    # --- tags ------------------------------------------------------------------------------
    def add_tag(self, c: sqlite3.Connection, photo_hash: str, team: str, score: float, source: str,
                members: list[str], faces: int = 0, ambiguous: bool = False, runner_up: str | None = None,
                margin: float | None = None, publish: str = "held") -> None:
        c.execute(
            """INSERT INTO tags(photo_hash, team, score, source, members, faces, ambiguous, runner_up, margin,
                                publish, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(photo_hash, team) DO UPDATE SET
                 score=excluded.score, source=excluded.source, members=excluded.members,
                 state=CASE WHEN tags.state IN ('rejected','reassigned') THEN 'review' ELSE tags.state END,
                 publish=CASE WHEN tags.publish='published' THEN 'published' ELSE excluded.publish END,
                 draft=CASE WHEN tags.draft IN ('ready','writing') THEN tags.draft ELSE 'pending' END""",
            (photo_hash, team, score, source, json.dumps(members), faces, int(ambiguous), runner_up, margin,
             publish, time.time()),
        )


def loads(s: str | None, default):
    if not s:
        return default
    try:
        return json.loads(s)
    except (TypeError, ValueError):
        return default
