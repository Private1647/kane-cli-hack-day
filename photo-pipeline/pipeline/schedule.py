"""Post slot scheduling and the Buffer bulk-upload CSV (pure functions + one file writer)."""
from __future__ import annotations

import csv
import io
import math
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Sequence

BUFFER_COLUMNS = ["Text", "Image URL", "Tags", "Posting Time"]
EXTRA_COLUMNS = ["channel", "image_path", "team", "photo_key"]
POSTING_TIME_FMT = "%Y-%m-%d %H:%M"


def next_free_slot(
    now: datetime,
    first_slot: datetime | None,
    slot_minutes: int,
    taken: Iterable[datetime],
) -> datetime:
    """Earliest slot on the grid FIRST_SLOT + k*SLOT_MINUTES (k >= 0) that is >= now and not taken.

    With no FIRST_SLOT the grid is anchored at `now` rounded up to the next 5 minutes.
    All datetimes must be timezone-aware.
    """
    step = timedelta(minutes=slot_minutes)
    if first_slot is None:
        base = now.replace(second=0, microsecond=0)
        if base < now:
            base += timedelta(minutes=1)
        first_slot = base + timedelta(minutes=(-base.minute) % 5)
    taken_set = {t.astimezone(first_slot.tzinfo).replace(second=0, microsecond=0) for t in taken}
    k = 0 if now <= first_slot else math.ceil((now - first_slot) / step)
    while True:
        slot = first_slot + k * step
        if slot.replace(second=0, microsecond=0) not in taken_set:
            return slot
        k += 1


def csv_rows(approved: Sequence[dict]) -> list[dict]:
    """One row per channel post (LinkedIn and X separately), sorted by posting time.

    Each item needs: slot (aware datetime), linkedin_text, x_text, image_path, team, key.
    Buffer requires a *public* image URL; we only have a local file, so Image URL carries the
    local path (Buffer will reject it on import rather than silently post text-only). See README.
    """
    rows: list[dict] = []
    for item in sorted(approved, key=lambda a: (a["slot"], a["team"])):
        when = item["slot"].strftime(POSTING_TIME_FMT)
        for channel, text in (("linkedin", item["linkedin_text"]), ("x", item["x_text"])):
            if not (text or "").strip():
                continue
            rows.append({
                "Text": text.strip(),
                "Image URL": item["image_path"],
                "Tags": f"{channel},{item['team']}",
                "Posting Time": when,
                "channel": channel,
                "image_path": item["image_path"],
                "team": item["team"],
                "photo_key": item["key"],
            })
    return rows


def render_csv(rows: Sequence[dict], columns: Sequence[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(columns), extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def write_queue(path: Path, approved: Sequence[dict]) -> int:
    """Rewrite queue.csv (all columns) plus queue_linkedin.csv / queue_x.csv (Buffer columns only).

    Rewritten from the database on every approval, so edits and re-approvals never duplicate rows.
    Returns the number of rows in queue.csv.
    """
    rows = csv_rows(approved)
    _atomic_write(path, render_csv(rows, BUFFER_COLUMNS + EXTRA_COLUMNS))
    for channel in ("linkedin", "x"):
        ch_rows = [r for r in rows if r["channel"] == channel]
        _atomic_write(path.with_name(f"{path.stem}_{channel}{path.suffix}"), render_csv(ch_rows, BUFFER_COLUMNS))
    return len(rows)
