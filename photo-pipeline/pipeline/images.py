"""Image loading (EXIF-aware), hashing and JPEG encoding."""
from __future__ import annotations

import base64
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageOps

try:  # optional HEIC/HEIF support for iPhone originals
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIC_SUPPORTED = True
except Exception:  # pragma: no cover - depends on optional wheel
    HEIC_SUPPORTED = False

IMAGE_EXTS = {".jpg", ".jpeg", ".png"} | ({".heic", ".heif"} if HEIC_SUPPORTED else set())

UPLOAD_LONG_SIDE = 2048
UPLOAD_MAX_BYTES = int(3.5 * 1024 * 1024)
CLAUDE_LONG_SIDE = 1568


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def photo_key(content_hash: str) -> str:
    """Stable id for the site import API (^[\\w-]{6,80}$): first 32 hex chars of sha256."""
    return content_hash[:32]


def load_rgb(path: Path | str | bytes) -> Image.Image:
    """Open an image (path or bytes), apply EXIF orientation, return RGB."""
    src = io.BytesIO(path) if isinstance(path, (bytes, bytearray)) else path
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        return im.convert("RGB")


def resized(im: Image.Image, long_side: int) -> Image.Image:
    w, h = im.size
    scale = long_side / max(w, h)
    if scale >= 1:
        return im.copy()
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def to_jpeg_bytes(im: Image.Image, long_side: int = UPLOAD_LONG_SIDE, quality: int = 85,
                  max_bytes: int = UPLOAD_MAX_BYTES) -> tuple[bytes, int, int]:
    """Resize to long_side, encode JPEG, step quality down until under max_bytes."""
    small = resized(im, long_side)
    q = quality
    while True:
        buf = io.BytesIO()
        small.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        data = buf.getvalue()
        if len(data) <= max_bytes or q <= 50:
            return data, small.width, small.height
        q -= 7


def to_bgr_array(im: Image.Image):
    import numpy as np

    return np.asarray(im)[:, :, ::-1].copy()


def claude_image_b64(path: Path) -> str:
    """Downscale to ~1568px long side (Claude's sweet spot) and return base64 JPEG."""
    data, _, _ = to_jpeg_bytes(load_rgb(path), long_side=CLAUDE_LONG_SIDE, quality=85)
    return base64.standard_b64encode(data).decode("ascii")
