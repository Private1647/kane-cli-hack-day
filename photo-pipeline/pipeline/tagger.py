"""Watch DRIVE_DIR, match faces to teams, record tags. Idempotent by content hash (sqlite)."""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from pathlib import Path

import numpy as np

from .config import Config
from .db import DB
from .faces import FaceEngine, FaceIndex
from .images import IMAGE_EXTS, load_rgb, photo_key, sha256_file, to_jpeg_bytes
from .matching import face_is_big_enough, match_faces, parse_hard_tag, should_auto_publish

log = logging.getLogger("tagger")

STABLE_SECONDS = 3.0
POLL_SECONDS = 1.5
IGNORED_PREFIXES = (".", "~$", "._")


def iter_images(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for name in filenames:
            if name.startswith(IGNORED_PREFIXES):
                continue
            if Path(name).suffix.lower() in IMAGE_EXTS:
                yield Path(dirpath) / name


class StabilityTracker:
    """A file is ready once (size, mtime) has not changed for STABLE_SECONDS."""

    def __init__(self, stable_seconds: float = STABLE_SECONDS):
        self.stable_seconds = stable_seconds
        self._seen: dict[str, tuple[int, float, float]] = {}

    def ready(self, path: Path, size: int, mtime: float, now: float) -> bool:
        key = str(path)
        prev = self._seen.get(key)
        if prev is None or prev[0] != size or prev[1] != mtime:
            self._seen[key] = (size, mtime, now)
            return False
        return size > 0 and now - prev[2] >= self.stable_seconds

    def forget(self, path: Path) -> None:
        self._seen.pop(str(path), None)


def _copy_into(src: Path, dest_dir: Path, content_hash: str) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{content_hash[:8]}_{src.name}"
    if not dest.exists():
        shutil.copy2(src, dest)


class Tagger:
    def __init__(self, cfg: Config, db: DB, engine: FaceEngine | None = None):
        self.cfg = cfg
        self.db = db
        self.engine = engine or FaceEngine()
        self.index: FaceIndex | None = None
        self._index_mtime = 0.0
        self.tracker = StabilityTracker()
        self.wake = threading.Event()  # set by others to request an immediate scan

    # --- index ----------------------------------------------------------------------------
    def reload_index_if_changed(self) -> None:
        try:
            mtime = self.cfg.index_meta.stat().st_mtime
        except FileNotFoundError:
            return
        if mtime != self._index_mtime:
            self.index = FaceIndex.load(self.cfg.index_npz, self.cfg.index_meta)
            self._index_mtime = mtime
            log.info("loaded face index: %d faces, %d teams", len(self.index.entries), len(self.index.teams))

    # --- one file -------------------------------------------------------------------------
    def process_file(self, path: Path) -> str:
        """Returns 'duplicate', 'tagged' or 'unresolved'. Raises on unreadable images."""
        cfg, db = self.cfg, self.db
        if self.index is None:
            self.reload_index_if_changed()
        st = path.stat()
        h = sha256_file(path)
        if db.one("SELECT 1 FROM photos WHERE hash=?", (h,)):
            db.run("INSERT OR REPLACE INTO seen_files(path,size,mtime,hash,error) VALUES (?,?,?,?,NULL)",
                   (str(path), st.st_size, st.st_mtime, h))
            return "duplicate"

        im = load_rgb(path)  # EXIF orientation applied here
        jpeg, w, hgt = to_jpeg_bytes(im)
        cfg.photos_dir.mkdir(parents=True, exist_ok=True)
        (cfg.photos_dir / f"{h}.jpg").write_bytes(jpeg)

        teams = self.index.teams if self.index else {}
        notes: list[str] = []

        # Faces
        faces, fw, fh = self.engine.detect(im)
        used = [f for f in faces if face_is_big_enough(f.bbox, fw, fh, cfg.min_face_frac)]
        matches = {}
        if used and self.index is not None and len(self.index.entries):
            matches = match_faces(np.stack([f.embedding for f in used]), self.index.embeddings,
                                  self.index.entries, cfg.match_threshold, cfg.ambiguous_margin)
        elif self.index is None:
            notes.append("no face index loaded (run enroll)")

        # Filename hard tag
        hard = parse_hard_tag(path.name)
        if hard and hard not in teams:
            notes.append(f"filename tag '{hard}' is not an enrolled team (unknown slug, or no member consented)")
            hard = None

        tag_rows = []
        for slug, m in matches.items():
            tag_rows.append(dict(team=slug, score=m.score, source="face", members=m.members, faces=m.faces,
                                 ambiguous=m.ambiguous, runner_up=m.runner_up, margin=m.margin))
        if hard:
            existing = next((r for r in tag_rows if r["team"] == hard), None)
            if existing:
                existing.update(score=1.0, source="hard", ambiguous=False)
            else:
                tag_rows.append(dict(team=hard, score=1.0, source="hard", members=[], faces=0,
                                     ambiguous=False, runner_up=None, margin=None))

        status = "tagged" if tag_rows else "unresolved"
        with db.tx() as c:
            c.execute(
                """INSERT INTO photos(hash,key,src_path,filename,width,height,status,faces_total,faces_used,
                                      hard_slug,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (h, photo_key(h), str(path), path.name, w, hgt, status, len(faces), len(used), hard,
                 "; ".join(notes) or None, time.time()),
            )
            for r in tag_rows:
                auto = should_auto_publish(r["source"], r["score"], r["ambiguous"], cfg.gallery_auto_threshold)
                db.add_tag(c, h, r["team"], r["score"], r["source"], r["members"], r["faces"], r["ambiguous"],
                           r["runner_up"], r["margin"], publish="pending" if auto else "held")
            c.execute("INSERT OR REPLACE INTO seen_files(path,size,mtime,hash,error) VALUES (?,?,?,?,NULL)",
                      (str(path), st.st_size, st.st_mtime, h))

        if tag_rows:
            for r in tag_rows:
                _copy_into(path, cfg.by_team_dir / r["team"], h)
        else:
            _copy_into(path, cfg.unresolved_dir, h)
        log.info("%s -> %s", path.name,
                 ", ".join(f"{r['team']}({r['score']:.2f}{'?' if r['ambiguous'] else ''})" for r in tag_rows)
                 or "UNRESOLVED")
        return status

    # --- loop -----------------------------------------------------------------------------
    def scan_once(self) -> int:
        drive = self.cfg.drive_dir
        if drive is None or not drive.exists():
            return 0
        self.reload_index_if_changed()
        done = 0
        now = time.time()
        for path in iter_images(drive):
            try:
                st = path.stat()
            except FileNotFoundError:
                continue
            seen = self.db.one("SELECT size, mtime, hash, error FROM seen_files WHERE path=?", (str(path),))
            if seen and seen["size"] == st.st_size and seen["mtime"] == st.st_mtime:
                continue  # already handled this exact file version (or it failed and hasn't changed)
            if not self.tracker.ready(path, st.st_size, st.st_mtime, now):
                continue
            try:
                self.process_file(path)
                done += 1
            except Exception as e:  # unreadable/partial file: remember, retry only if the file changes
                log.warning("could not process %s: %s", path, e)
                self.db.run("INSERT OR REPLACE INTO seen_files(path,size,mtime,hash,error) VALUES (?,?,?,NULL,?)",
                            (str(path), st.st_size, st.st_mtime, str(e)[:500]))
            self.tracker.forget(path)
        return done

    def run(self, stop: threading.Event) -> None:
        if self.cfg.drive_dir is None or not self.cfg.drive_dir.exists():
            log.error("DRIVE_DIR %s does not exist; tagger is idle", self.cfg.drive_dir)
        try:
            self.reload_index_if_changed()
            if self.index is None:
                log.warning("no face index found; only filename hard tags and manual assignment will work. "
                            "Run: python -m pipeline enroll")
            log.info("loading InsightFace model (first run downloads buffalo_l, ~300 MB)...")
            self.engine.warm_up()
            log.info("watching %s", self.cfg.drive_dir)
        except Exception:
            log.exception("tagger failed to start")
            return
        while not stop.is_set():
            try:
                self.scan_once()
            except Exception:
                log.exception("scan failed")
            self.wake.wait(POLL_SECONDS)
            self.wake.clear()
