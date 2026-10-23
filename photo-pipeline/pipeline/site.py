"""Client for the Next.js site's export/import API. Every call sends x-export-token."""
from __future__ import annotations

from urllib.parse import quote

import requests

from .config import Config

TIMEOUT = (10, 60)  # connect, read


class SiteError(RuntimeError):
    def __init__(self, msg: str, status: int | None = None, retryable: bool = True):
        super().__init__(msg)
        self.status = status
        self.retryable = retryable


class SiteClient:
    def __init__(self, cfg: Config, session: requests.Session | None = None):
        if not cfg.site_url or not cfg.export_token:
            raise SiteError("SITE_URL and EXPORT_TOKEN must be set in photo-pipeline/.env", retryable=False)
        self.base = cfg.site_url
        self.s = session or requests.Session()
        self.s.headers["x-export-token"] = cfg.export_token

    def _check(self, r: requests.Response, what: str) -> requests.Response:
        if r.status_code >= 400:
            retryable = r.status_code in (408, 425, 429) or r.status_code >= 500
            raise SiteError(f"{what}: HTTP {r.status_code} {r.text[:300]}", r.status_code, retryable)
        return r

    def export_teams(self) -> dict:
        r = self.s.get(f"{self.base}/api/export/teams", timeout=TIMEOUT)
        return self._check(r, "export teams").json()

    def download_photo(self, pathname: str) -> bytes:
        safe = "/".join(quote(part) for part in pathname.lstrip("/").split("/"))
        r = self.s.get(f"{self.base}/photos/{safe}", timeout=TIMEOUT)
        return self._check(r, f"download {pathname}").content

    def import_photo(self, jpeg: bytes, key: str, teams: list[str], width: int, height: int,
                     caption: str | None = None) -> dict:
        data: list[tuple[str, str]] = [("key", key), ("width", str(width)), ("height", str(height))]
        data += [("teams", t) for t in teams]
        if caption:
            data.append(("caption", caption))
        files = {"file": (f"{key}.jpg", jpeg, "image/jpeg")}
        r = self.s.post(f"{self.base}/api/import/photo", data=data, files=files, timeout=TIMEOUT)
        body = self._check(r, "import photo").json()
        if not body.get("ok"):
            raise SiteError(f"import photo: ok=false {str(body)[:300]}", r.status_code, retryable=True)
        return body
