"""`python -m pipeline enroll`: build the face index from the site's registration export.

  * member selfies  -> one labelled face (team + member name), the largest face in the photo
  * group photos    -> team-only faces, every face above MIN_FACE_FRAC
  * consent is PER MEMBER (member.consent_social must be exactly true; false/null = no):
      - a member's selfie is enrolled only if that member consented
      - the group photo is enrolled only if every member consented (all_consented)
      - a team with no consenting member is skipped entirely
  * cached downloads/embeddings of anything no longer enrolled are deleted on every run
Downloads and embeddings are cached per Blob pathname, so re-running is cheap.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import numpy as np

from .config import Config
from .faces import Face, FaceEngine, FaceIndex
from .images import load_rgb
from .matching import IndexEntry, face_is_big_enough, member_consented, team_consent
from .site import SiteClient


def _cache_stem(pathname: str) -> str:
    safe = re.sub(r"[^\w-]+", "_", pathname)[-80:]  # no dots: the stem must survive with_suffix()
    return f"{hashlib.sha1(pathname.encode()).hexdigest()[:10]}_{safe}"


def _faces_for(pathname: str, cfg: Config, site: SiteClient, engine: FaceEngine) -> tuple[list[Face], int, int]:
    """Download (cached) + detect (cached). Returns faces with boxes in analysed-image coordinates."""
    stem = cfg.enroll_cache / _cache_stem(pathname)
    img_path, emb_path = stem.with_suffix(".img"), stem.with_suffix(".faces.npz")
    if emb_path.exists():
        z = np.load(emb_path)
        faces = [Face(bbox=list(map(float, b)), det_score=float(s), embedding=e)
                 for b, s, e in zip(z["bboxes"], z["scores"], z["embeddings"])]
        return faces, int(z["size"][0]), int(z["size"][1])
    if not img_path.exists():
        img_path.write_bytes(site.download_photo(pathname))
    faces, w, h = engine.detect(load_rgb(img_path))
    np.savez_compressed(
        emb_path,
        bboxes=np.array([f.bbox for f in faces], dtype=np.float32).reshape(-1, 4),
        scores=np.array([f.det_score for f in faces], dtype=np.float32),
        embeddings=np.array([f.embedding for f in faces], dtype=np.float32).reshape(-1, 512),
        size=np.array([w, h]),
    )
    return faces, w, h


def run(cfg: Config, site=None, engine=None) -> FaceIndex:
    cfg.ensure_dirs()
    site = site or SiteClient(cfg)
    engine = engine or FaceEngine()
    export = site.export_teams()
    all_teams = export.get("teams", [])

    teams_meta: dict[str, dict] = {}
    embeddings: list[np.ndarray] = []
    entries: list[IndexEntry] = []
    keep_stems: set[str] = set()
    skipped_consent: list[str] = []
    group_skipped: list[str] = []
    members_skipped = 0
    no_face: list[str] = []
    warnings: list[str] = []

    for t in all_teams:
        slug = t["slug"]
        any_c, all_c = team_consent(t)
        if not any_c:
            skipped_consent.append(slug)
            continue
        teams_meta[slug] = {
            "name": t.get("name") or slug,
            "track": t.get("track"),
            "idea": t.get("idea"),
            "is_solo": bool(t.get("is_solo")),
            "any_consented": any_c,
            "all_consented": all_c,
            # All members are kept (the review page shows who did not consent), but only
            # consent_social=True members are ever enrolled, named or tagged.
            "members": [{"name": m.get("name"), "linkedin": m.get("linkedin"), "x_handle": m.get("x_handle"),
                         "consent_social": member_consented(m)}
                        for m in t.get("members", [])],
        }
        before = len(entries)

        for m in t.get("members", []):
            p = m.get("photo_url")
            if not p:
                continue
            if not member_consented(m):
                members_skipped += 1
                continue
            keep_stems.add(_cache_stem(p))
            try:
                faces, w, h = _faces_for(p, cfg, site, engine)
            except Exception as e:  # one bad photo must not stop enrolment
                warnings.append(f"{slug}/{m.get('name')}: {e}")
                continue
            if not faces:
                warnings.append(f"{slug}/{m.get('name')}: no face found in selfie")
                continue
            largest = max(faces, key=lambda f: f.area)
            if len(faces) > 1:
                warnings.append(f"{slug}/{m.get('name')}: {len(faces)} faces in selfie, used the largest")
            embeddings.append(largest.embedding)
            entries.append(IndexEntry(team=slug, member=m.get("name"), source="selfie"))

        p = t.get("photo_url")
        if p and not all_c:
            group_skipped.append(slug)
        elif p:
            keep_stems.add(_cache_stem(p))
            try:
                faces, w, h = _faces_for(p, cfg, site, engine)
                used = [f for f in faces if face_is_big_enough(f.bbox, w, h, cfg.min_face_frac)]
                for f in used:
                    embeddings.append(f.embedding)
                    entries.append(IndexEntry(team=slug, member=None, source="group"))
                if faces and not used:
                    warnings.append(f"{slug}: group photo faces all below MIN_FACE_FRAC")
            except Exception as e:
                warnings.append(f"{slug}/group photo: {e}")

        if len(entries) == before:
            no_face.append(slug)

    # Delete cached photos/embeddings that are no longer enrolled (consent withdrawn, team removed).
    removed = 0
    for f in cfg.enroll_cache.iterdir():
        stem = f.name.split(".", 1)[0]
        if stem not in keep_stems:
            f.unlink(missing_ok=True)
            removed += 1

    emb = np.stack(embeddings).astype(np.float32) if embeddings else np.zeros((0, 512), np.float32)
    index = FaceIndex(emb, entries, teams_meta)
    index.save(cfg.index_npz, cfg.index_meta, export.get("generated_at"))

    print(f"Export generated_at: {export.get('generated_at')}")
    print(f"Teams in export:     {len(all_teams)}")
    print(f"Teams enrolled:      {len(teams_meta)}  (skipped, no consenting member: {len(skipped_consent)})")
    print(f"Members not enrolled (no consent): {members_skipped}; "
          f"group photos skipped (not everyone consented): {len(group_skipped)}")
    print(f"Faces in index:      {len(entries)}  "
          f"({sum(e.source == 'selfie' for e in entries)} labelled selfies, "
          f"{sum(e.source == 'group' for e in entries)} group-photo faces)")
    print(f"Cache files removed: {removed}")
    if skipped_consent:
        print("No consenting member (never tagged): " + ", ".join(skipped_consent))
    if no_face:
        print(f"Teams with NO usable face ({len(no_face)}), only filename hard tags or manual assignment will work:")
        for s in no_face:
            print(f"  - {s}  ({teams_meta[s]['name']})")
    for w in warnings:
        print(f"  warning: {w}")
    print(json.dumps({"teams": len(teams_meta), "faces": len(entries), "no_face": no_face}))
    return index
