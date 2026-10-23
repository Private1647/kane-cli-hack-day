"""Per-member consent rules: enroll, naming in drafts, tag_names, hard tags, review UI, approve guard."""
import io
import json
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

from pipeline import actions, enroll
from pipeline.config import Config
from pipeline.db import DB
from pipeline.faces import Face
from pipeline.matching import filter_consenting, forbidden_names, member_consented, team_consent
from pipeline.review import create_app
from pipeline.tagger import Tagger
from pipeline.validate import validate_draft
from pipeline.writer import Writer, build_brief

from test_flow import ALICE, CARA, PDT, TEAMS, FakeClient, near, unit, make_img
from test_pure import good_draft

rng = np.random.default_rng(3)
DAN, NED, GROUP_A, GROUP_B = (unit(rng.normal(size=512)).astype(np.float32) for _ in range(4))
BIG = [100, 100, 400, 450]
# width of the downloaded registration photo -> faces the fake engine "detects"
PHOTO_FACES = {
    901: [Face(BIG, .9, ALICE)],  # reg/alice.jpg
    902: [Face(BIG, .9, DAN)],  # reg/dan.jpg
    903: [Face(BIG, .9, GROUP_A), Face([500, 100, 800, 450], .9, near(ALICE, .8))],  # reg/group-a.jpg
    904: [Face(BIG, .9, CARA)],  # reg/cara.jpg
    905: [Face(BIG, .9, GROUP_B)],  # reg/group-b.jpg
    906: [Face(BIG, .9, NED)],  # reg/ned.jpg
}
PATHS = {"reg/alice.jpg": 901, "reg/dan.jpg": 902, "reg/group-a.jpg": 903, "reg/cara.jpg": 904,
         "reg/group-b.jpg": 905, "reg/ned.jpg": 906}


class FakeEngine:
    def warm_up(self):
        pass

    def detect(self, im):
        return list(PHOTO_FACES.get(im.width, [])), im.width, im.height


class FakeSite:
    def __init__(self, export):
        self.export = export
        self.downloads = []

    def export_teams(self):
        return self.export

    def download_photo(self, pathname):
        self.downloads.append(pathname)
        buf = io.BytesIO()
        Image.new("RGB", (PATHS[pathname], 900), (1, 2, 3)).save(buf, "JPEG")
        return buf.getvalue()


def export(dan_consent, alice_consent=True, ned_consent=None):
    a_members = [
        {"name": "Alice", "linkedin": None, "x_handle": "alice", "photo_url": "reg/alice.jpg",
         "consent_social": alice_consent},
        {"name": "Dan Doe", "linkedin": None, "x_handle": "dandoe", "photo_url": "reg/dan.jpg",
         "consent_social": dan_consent},
    ]
    return {"generated_at": "t", "teams": [
        {"slug": "team-a", "name": "Alpha", "track": "x", "idea": "y", "is_solo": False, "photo_url": "reg/group-a.jpg",
         "all_consented": all(m["consent_social"] is True for m in a_members),
         "any_consented": any(m["consent_social"] is True for m in a_members), "members": a_members},
        {"slug": "team-b", "name": "Bravo", "track": "x", "idea": "y", "is_solo": True, "photo_url": "reg/group-b.jpg",
         "all_consented": True, "any_consented": True,
         "members": [{"name": "Cara", "linkedin": None, "x_handle": None, "photo_url": "reg/cara.jpg",
                      "consent_social": True}]},
        {"slug": "team-n", "name": "Nobody", "track": "x", "idea": "y", "is_solo": True, "photo_url": None,
         "all_consented": ned_consent is True, "any_consented": ned_consent is True,
         "members": [{"name": "Ned", "linkedin": None, "x_handle": None, "photo_url": "reg/ned.jpg",
                      "consent_social": ned_consent}]},
    ]}


class ConsentBase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.cfg = Config(
            site_url="http://example.invalid", export_token="x", anthropic_api_key="x",
            claude_model="claude-opus-5-5", claude_effort="medium", drive_dir=self.tmp / "drive",
            work_dir=self.tmp / "work", match_threshold=0.40, min_face_frac=0.05,
            gallery_auto_threshold=0.50, ambiguous_margin=0.05, review_port=0, slot_minutes=25,
            first_slot=datetime(2026, 10, 24, 11, 0, tzinfo=PDT))
        self.cfg.ensure_dirs()
        (self.tmp / "drive").mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def enroll(self, exp):
        site = FakeSite(exp)
        with unittest.mock.patch("builtins.print"):
            idx = enroll.run(self.cfg, site=site, engine=FakeEngine())
        return idx, site

    def cache_names(self):
        return sorted(f.name for f in self.cfg.enroll_cache.iterdir())


import unittest.mock  # noqa: E402


class EnrollConsentTests(ConsentBase):
    def test_only_consenting_members_and_full_consent_groups(self):
        idx, site = self.enroll(export(dan_consent=False))
        got = [(e.team, e.member, e.source) for e in idx.entries]
        self.assertIn(("team-a", "Alice", "selfie"), got)
        self.assertNotIn(("team-a", "Dan Doe", "selfie"), got, "Dan did not consent")
        self.assertFalse(any(t == "team-a" and s == "group" for t, _, s in got), "team-a not all consented")
        self.assertIn(("team-b", None, "group"), got, "team-b all consented: group photo enrolled")
        self.assertNotIn("team-n", idx.teams, "null consent = no: team skipped entirely")
        self.assertNotIn("reg/dan.jpg", site.downloads, "non-consenting photos are never even downloaded")
        self.assertNotIn("reg/group-a.jpg", site.downloads)
        self.assertNotIn("reg/ned.jpg", site.downloads)
        meta = json.loads(self.cfg.index_meta.read_text())
        dan = [m for m in meta["teams"]["team-a"]["members"] if m["name"] == "Dan Doe"][0]
        self.assertIs(dan["consent_social"], False)

    def test_withdrawn_consent_removes_cached_data(self):
        self.enroll(export(dan_consent=True))
        before = self.cache_names()
        self.assertTrue(any("dan" in n for n in before))
        self.assertTrue(any("group-a" in n for n in before))
        idx, site = self.enroll(export(dan_consent=None))  # withdrawn / reset to not asked
        after = self.cache_names()
        self.assertFalse(any("dan" in n for n in after), "Dan's photo + embeddings deleted")
        self.assertFalse(any("group-a" in n for n in after), "group photo deleted once not all consented")
        self.assertTrue(any("alice" in n for n in after))
        self.assertEqual(site.downloads, [], "everything else came from cache")
        # Whole team withdraws
        idx, _ = self.enroll(export(dan_consent=False, alice_consent=False))
        self.assertNotIn("team-a", idx.teams)
        self.assertFalse(any("alice" in n for n in self.cache_names()))

    def test_team_consent_helper_is_strict(self):
        t = {"members": [{"consent_social": True}, {"consent_social": None}]}
        self.assertEqual(team_consent(t), (True, False))
        self.assertEqual(team_consent({**t, "any_consented": False}), (False, False), "stricter flag wins")
        self.assertEqual(team_consent({"members": []}), (False, False))
        self.assertFalse(member_consented({"consent_social": "true"}))


class NamingConsentTests(ConsentBase):
    def setUp(self):
        super().setUp()
        self.enroll(export(dan_consent=False))
        self.db = DB(self.cfg.db_path)
        self.team_a = json.loads(self.cfg.index_meta.read_text())["teams"]["team-a"]

    def test_brief_never_mentions_non_consenting_member(self):
        brief = build_brief("team-a", self.team_a, ["Alice", "Dan Doe"], [])
        self.assertIn("Alice", brief)
        self.assertNotIn("Dan", brief)
        self.assertNotIn("dandoe", brief)
        self.assertIn("1 other team member(s) asked not to be named", brief)

    def test_helpers(self):
        self.assertEqual(filter_consenting(["Alice", "Dan Doe", "Stranger"], self.team_a), ["Alice"])
        self.assertEqual(forbidden_names(self.team_a), ["Dan Doe", "Dan"])
        team = {"members": [{"name": "Priya Shah", "consent_social": False},
                            {"name": "Priya Rao", "consent_social": True}, {"name": "Omar Ali", "consent_social": None}]}
        self.assertEqual(forbidden_names(team), ["Priya Shah", "Omar Ali", "Omar"], "shared first name not banned")

    def test_validator_flags_names_and_filters_tag_names(self):
        d = good_draft(caption="Dan Doe at work.", tag_names=["Alice", "Dan Doe", "Mallory"])
        fixed, problems = validate_draft(d, forbidden_names=["Dan Doe"], allowed_tag_names=["Alice"])
        self.assertEqual(fixed["tag_names"], ["Alice"])
        self.assertTrue(any("caption: do not name Dan Doe" in p for p in problems))
        _, problems = validate_draft(good_draft(x_post="Thanks @dandoe_fan\n#KaneCLIHackDay"), ["Dan Doe", "Dan"])
        self.assertEqual(problems, [])
        _, problems = validate_draft(good_draft(caption="We mark the demo."), ["Mark Lee", "Mark"])
        self.assertEqual(problems, [], "lower-case word is not the first name")
        _, problems = validate_draft(good_draft(caption="Mark at the demo."), ["Mark Lee", "Mark"])
        self.assertTrue(problems)

    def test_hard_tag_draft_regenerates_without_non_consenting_name(self):
        make_img(self.tmp / "drive" / "team-a__stackchan.jpg", 830)
        t = Tagger(self.cfg, self.db, engine=FakeEngine())
        self.assertEqual(t.process_file(self.tmp / "drive" / "team-a__stackchan.jpg"), "tagged")
        client = FakeClient(script=["names_dan", "good"])
        w = Writer(self.cfg, self.db, client=client)
        w.write_one(*w.claim(5)[0])
        row = self.db.one("SELECT * FROM tags")
        d = json.loads(row["draft_json"])
        self.assertEqual(json.loads(row["draft_problems"]), [])
        self.assertNotIn("Dan", json.dumps(d))
        self.assertEqual(len(client.beta.messages.calls), 2, "named Dan -> regenerated")
        retry_text = client.beta.messages.calls[1]["messages"][0]["content"][1]["text"]
        self.assertIn("do not name Dan, Dan Doe", retry_text)

        # Approve is refused if the organiser types the name back in
        with self.assertRaises(actions.ActionError):
            actions.approve(self.cfg, self.db, row["photo_hash"], "team-a",
                            {**d, "x_post": "Great work Dan Doe\n#KaneCLIHackDay"})
        res = actions.approve(self.cfg, self.db, row["photo_hash"], "team-a", d)
        self.assertTrue(res["slot"])

        # Review state + page expose per-member consent; picker lists only any_consented teams
        app = create_app(self.cfg, self.db).test_client()
        st = app.get("/api/state").get_json()
        card = st["approved"][0]
        self.assertEqual({m["name"]: m["consent"] for m in card["team_members"]}, {"Alice": True, "Dan Doe": False})
        self.assertEqual({t["slug"] for t in st["teams"]}, {"team-a", "team-b"})
        self.assertIn(b"no consent, don't name/tag", app.get("/").data)

    def test_hard_tag_for_team_without_consenting_member_is_refused(self):
        make_img(self.tmp / "drive" / "team-n__stackchan.jpg", 830)
        t = Tagger(self.cfg, self.db, engine=FakeEngine())
        self.assertEqual(t.process_file(self.tmp / "drive" / "team-n__stackchan.jpg"), "unresolved")
        self.assertIn("no member consented", self.db.one("SELECT note FROM photos")["note"])
        with self.assertRaises(actions.ActionError):
            actions.assign(self.cfg, self.db, self.db.one("SELECT hash FROM photos")["hash"], "team-n")


if __name__ == "__main__":
    unittest.main()
