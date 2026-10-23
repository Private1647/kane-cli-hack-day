"""Settings, read once from photo-pipeline/.env (and the process environment)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # .../photo-pipeline


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    return float(raw) if raw else default


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    return int(raw) if raw else default


@dataclass(frozen=True)
class Config:
    site_url: str
    export_token: str
    anthropic_api_key: str
    claude_model: str
    claude_effort: str
    drive_dir: Path | None
    work_dir: Path
    match_threshold: float
    min_face_frac: float
    gallery_auto_threshold: float
    ambiguous_margin: float
    review_port: int
    slot_minutes: int
    first_slot: datetime | None

    # Derived paths -------------------------------------------------------
    @property
    def db_path(self) -> Path:
        return self.work_dir / "state.sqlite3"

    @property
    def index_npz(self) -> Path:
        return self.work_dir / "index" / "faces.npz"

    @property
    def index_meta(self) -> Path:
        return self.work_dir / "index" / "meta.json"

    @property
    def enroll_cache(self) -> Path:
        return self.work_dir / "enroll_cache"

    @property
    def photos_dir(self) -> Path:
        """Normalised (EXIF-rotated, <=2048px) JPEG of every processed photo, named <hash>.jpg."""
        return self.work_dir / "photos"

    @property
    def by_team_dir(self) -> Path:
        return self.work_dir / "by_team"

    @property
    def unresolved_dir(self) -> Path:
        return self.work_dir / "_unresolved"

    @property
    def queue_csv(self) -> Path:
        return self.work_dir / "queue.csv"

    def ensure_dirs(self) -> None:
        for d in (self.work_dir, self.index_npz.parent, self.enroll_cache, self.photos_dir,
                  self.by_team_dir, self.unresolved_dir):
            d.mkdir(parents=True, exist_ok=True)


def parse_first_slot(raw: str) -> datetime | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:  # naive: interpret as this Mac's local time
        dt = dt.astimezone()
    return dt


def load(env_file: Path | None = None, **overrides) -> Config:
    """Load .env (without overriding real env vars) and build a Config."""
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file or ROOT / ".env", override=False)
    except ImportError:  # pragma: no cover - python-dotenv is in requirements
        pass

    work = Path(os.environ.get("WORK_DIR", "./work")).expanduser()
    if not work.is_absolute():
        work = ROOT / work
    drive = os.environ.get("DRIVE_DIR", "").strip()

    values = dict(
        site_url=os.environ.get("SITE_URL", "").strip().rstrip("/"),
        export_token=os.environ.get("EXPORT_TOKEN", "").strip(),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", "").strip(),
        claude_model=os.environ.get("CLAUDE_MODEL", "").strip() or "claude-opus-5-5",
        claude_effort=os.environ.get("CLAUDE_EFFORT", "").strip() or "medium",
        drive_dir=Path(drive).expanduser() if drive else None,
        work_dir=work.resolve(),
        match_threshold=_float("MATCH_THRESHOLD", 0.40),
        min_face_frac=_float("MIN_FACE_FRAC", 0.05),
        gallery_auto_threshold=_float("GALLERY_AUTO_THRESHOLD", 0.50),
        ambiguous_margin=_float("AMBIGUOUS_MARGIN", 0.05),
        review_port=_int("REVIEW_PORT", 5050),
        slot_minutes=_int("SLOT_MINUTES", 25),
        first_slot=parse_first_slot(os.environ.get("FIRST_SLOT", "")),
    )
    values.update(overrides)
    return Config(**values)
