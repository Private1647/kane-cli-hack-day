"""InsightFace wrapper (buffalo_l: SCRFD detector + ArcFace 512-d embeddings) and the saved index."""
from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .images import resized, to_bgr_array
from .matching import IndexEntry, entries_from_meta

DETECT_LONG_SIDE = 2048  # detector input is 640x640 anyway; this just bounds memory/CPU


@dataclass
class Face:
    bbox: list[float]  # x1, y1, x2, y2 in the coordinates of the analysed image
    det_score: float
    embedding: np.ndarray  # (512,) L2-normalised

    @property
    def short_side(self) -> float:
        return min(self.bbox[2] - self.bbox[0], self.bbox[3] - self.bbox[1])

    @property
    def area(self) -> float:
        return (self.bbox[2] - self.bbox[0]) * (self.bbox[3] - self.bbox[1])


class FaceEngine:
    """Lazy, thread-safe singleton around insightface.app.FaceAnalysis."""

    _lock = threading.Lock()

    def __init__(self):
        self._app = None

    def _load(self):
        if self._app is None:
            from insightface.app import FaceAnalysis  # heavy import; keep it lazy

            app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"],
                               providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=-1, det_size=(640, 640))
            self._app = app
        return self._app

    def warm_up(self) -> None:
        with self._lock:
            self._load()

    def detect(self, im: Image.Image) -> tuple[list[Face], int, int]:
        """Returns (faces, width, height) of the image the boxes refer to."""
        small = resized(im, DETECT_LONG_SIDE)
        with self._lock:  # onnxruntime sessions are not guaranteed re-entrant across our threads
            raw = self._load().get(to_bgr_array(small))
        faces = [Face(bbox=[float(v) for v in f.bbox], det_score=float(f.det_score),
                      embedding=np.asarray(f.normed_embedding, dtype=np.float32)) for f in raw]
        return faces, small.width, small.height


class FaceIndex:
    def __init__(self, embeddings: np.ndarray, entries: list[IndexEntry], teams: dict[str, dict]):
        self.embeddings = embeddings
        self.entries = entries
        self.teams = teams  # slug -> {name, track, idea, is_solo, members:[{name, linkedin, x_handle}]}

    @classmethod
    def load(cls, npz: Path, meta: Path) -> "FaceIndex":
        if not npz.exists() or not meta.exists():
            raise FileNotFoundError("No face index yet. Run: python -m pipeline enroll")
        m = json.loads(meta.read_text())
        emb = np.load(npz)["embeddings"].astype(np.float32)
        return cls(emb, entries_from_meta(m["entries"]), m["teams"])

    def save(self, npz: Path, meta: Path, generated_at: str | None) -> None:
        npz.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(npz, embeddings=self.embeddings.astype(np.float32))
        meta.write_text(json.dumps({
            "generated_at": generated_at,
            "entries": [e.__dict__ for e in self.entries],
            "teams": self.teams,
        }, indent=1))
