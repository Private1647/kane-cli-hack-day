"""End-to-end flow with fakes (no InsightFace model, no site, no Claude API):
drive folder -> tagger -> sqlite -> publisher -> writer -> review actions -> queue.csv -> Flask pages.
"""
import csv
import json
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

from pipeline import actions
from pipeline.config import Config
from pipeline.db import DB
from pipeline.faces import Face, FaceIndex
from pipeline.matching import IndexEntry
from pipeline.publisher import Publisher
from pipeline.review import create_app
from pipeline.tagger import StabilityTracker, Tagger
from pipeline.writer import TOOL_NAME, Writer, build_brief

PDT = timezone(timedelta(hours=-7))
rng = np.random.default_rng(7)


def unit(v):
    return v / np.linalg.norm(v)


def near(v, sim):
    r = rng.normal(size=v.shape)
    r -= r.dot(v) * v
    return unit(sim * v + np.sqrt(1 - sim ** 2) * unit(r))


ALICE, CARA, GROUP_C = (unit(rng.normal(size=512)).astype(np.float32) for _ in range(3))
TEAMS = {
    "team-a": {"name": "Alpha Builders", "track": "Agents", "idea": "A test agent", "is_solo": False,
               "any_consented": True, "all_consented": False,
               "members": [{"name": "Alice", "linkedin": "https://linkedin.com/in/alice", "x_handle": "alice",
                            "consent_social": True},
                           {"name": "Dan Doe", "linkedin": "https://linkedin.com/in/dan", "x_handle": "dandoe",
                            "consent_social": False}]},
    "team-b": {"name": "Bravo", "track": "Tools", "idea": "CLI helper", "is_solo": True,
               "any_consented": True, "all_consented": True,
               "members": [{"name": "Cara", "linkedin": None, "x_handle": None, "consent_social": True}]},
    "team-c": {"name": "Charlie", "track": "Fun", "idea": None, "is_solo": False, "any_consented": True,
               "all_consented": True, "members": [{"name": "Cy", "linkedin": None, "x_handle": None,
                                                   "consent_social": True}]},
}


class FakeEngine:
    """Faces keyed by image width, so each synthetic image gets a scripted detection result."""

    def __init__(self):
        big = [100, 100, 400, 450]  # 300px short side on a 800-ish image: well above 5%
        self.by_width = {
            800: [Face(big, 0.9, near(ALICE, 0.70))],
            810: [Face(big, 0.9, near(CARA, 0.45))],
            820: [],
            830: [],
            840: [Face([10, 10, 30, 30], 0.9, near(ALICE, 0.9))],  # tiny face: ignored
            850: [],
        }

    def warm_up(self):
        pass

    def detect(self, im):
        return list(self.by_width.get(im.width, [])), im.width, im.height


class FakeSite:
    def __init__(self):
        self.calls = []

    def import_photo(self, jpeg, key, teams, width, height, caption=None):
        assert jpeg[:2] == b"\xff\xd8" and len(key) == 32
        self.calls.append((key, tuple(teams), caption))
        return {"ok": True, "results": {t: "added" for t in teams}}


def good_tool_input(em_dash=False):
    body = " ".join(["builders"] * 75)
    return {
        "linkedin_a": body + ("—done" if em_dash else "") + "\n\n#KaneCLIHackDay #OpenAI",
        "linkedin_b": body + "\n\n#KaneCLIHackDay",
        "x_post": "Testing an OpenAI app with Kane CLI.\n#KaneCLIHackDay",
        "caption": "Heads down at Kane CLI Hack Day.",
        "alt_text": "A person typing on a laptop.",
        "tag_names": ["Alice"],
    }


class FakeMessages:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        kind = self.script.pop(0) if self.script else "good"
        if kind == "refusal":
            return SimpleNamespace(stop_reason="refusal", content=[])
        if kind == "text":
            return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="hi")])
        inp = good_tool_input(em_dash=(kind == "dash"))
        if kind == "names_dan":
            inp["linkedin_a"] = "Dan Doe and " + inp["linkedin_a"]
            inp["tag_names"] = ["Alice", "Dan Doe"]
        if kind == "long_x":
            inp["x_post"] = "y" * 300 + "\n#KaneCLIHackDay"
        return SimpleNamespace(stop_reason="tool_use",
                               content=[SimpleNamespace(type="tool_use", name=TOOL_NAME, input=inp)])


class FakeClient:
    def __init__(self, script=()):
        self.beta = SimpleNamespace(messages=FakeMessages(script))
        self.messages = self.beta.messages


def make_img(path: Path, width: int):
    Image.new("RGB", (width, 600), (width % 255, 80, 120)).save(path, "JPEG")


class FlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.drive = self.tmp / "drive"
        (self.drive / "sub").mkdir(parents=True)
        self.cfg = Config(
            site_url="http://example.invalid", export_token="x", anthropic_api_key="x",
            claude_model="claude-opus-5-5", claude_effort="medium", drive_dir=self.drive,
            work_dir=self.tmp / "work", match_threshold=0.40, min_face_frac=0.05,
            gallery_auto_threshold=0.50, ambiguous_margin=0.05, review_port=0, slot_minutes=25,
            first_slot=datetime(2026, 10, 24, 11, 0, tzinfo=PDT))
        self.cfg.ensure_dirs()
        FaceIndex(np.stack([ALICE, CARA, GROUP_C]),
                  [IndexEntry("team-a", "Alice", "selfie"), IndexEntry("team-b", "Cara", "selfie"),
                   IndexEntry("team-c", None, "group")], TEAMS).save(self.cfg.index_npz, self.cfg.index_meta, "now")
        self.db = DB(self.cfg.db_path)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def photo(self, filename):
        return self.db.one("SELECT * FROM photos WHERE filename=?", (filename,))

    def tag(self, filename, team):
        p = self.photo(filename)
        return self.db.one("SELECT * FROM tags WHERE photo_hash=? AND team=?", (p["hash"], team))

    def test_full_flow(self):
        make_img(self.drive / "alice.jpg", 800)
        make_img(self.drive / "sub" / "cara_low.jpg", 810)
        make_img(self.drive / "venue.jpg", 820)
        make_img(self.drive / "team-b__stackchan.jpg", 830)
        make_img(self.drive / "tiny.jpg", 840)
        make_img(self.drive / "ghost__x.jpg", 850)
        (self.drive / ".hidden.jpg").write_bytes(b"x")
        (self.drive / "notes.txt").write_text("ignore me")

        tagger = Tagger(self.cfg, self.db, engine=FakeEngine())
        tagger.tracker = StabilityTracker(stable_seconds=0)
        self.assertEqual(tagger.scan_once(), 0, "first sighting only records size/mtime")
        self.assertEqual(tagger.scan_once(), 6)
        self.assertEqual(tagger.scan_once(), 0, "nothing reprocessed")

        a = self.tag("alice.jpg", "team-a")
        self.assertEqual((a["source"], a["publish"]), ("face", "pending"))
        self.assertEqual(json.loads(a["members"]), ["Alice"])
        b = self.tag("cara_low.jpg", "team-b")
        self.assertEqual(b["publish"], "held", "0.45 < GALLERY_AUTO_THRESHOLD")
        hard = self.tag("team-b__stackchan.jpg", "team-b")
        self.assertEqual((hard["source"], hard["score"], hard["publish"]), ("hard", 1.0, "pending"))
        for f in ("venue.jpg", "tiny.jpg", "ghost__x.jpg"):
            self.assertEqual(self.photo(f)["status"], "unresolved", f)
        self.assertEqual(self.photo("tiny.jpg")["faces_used"], 0)
        self.assertIn("ghost", self.photo("ghost__x.jpg")["note"])
        self.assertTrue(any((self.cfg.by_team_dir / "team-a").glob("*_alice.jpg")))
        self.assertEqual(len(list(self.cfg.unresolved_dir.iterdir())), 3)

        # Duplicate content under a new name: never processed twice (and survives a restart)
        shutil.copy(self.drive / "alice.jpg", self.drive / "sub" / "alice_copy.jpg")
        tagger2 = Tagger(self.cfg, DB(self.cfg.db_path), engine=FakeEngine())
        tagger2.tracker = StabilityTracker(stable_seconds=0)
        tagger2.scan_once()
        tagger2.scan_once()
        self.assertEqual(self.db.one("SELECT COUNT(*) n FROM photos")["n"], 6)

        # Gallery publish: only confident + hard tags go out immediately
        site = FakeSite()
        pub = Publisher(self.cfg, self.db, site=site)
        self.assertEqual(pub.run_once(), 2)
        self.assertEqual(sorted(t for _, (t,), _ in site.calls), ["team-a", "team-b"])
        self.assertEqual(self.tag("cara_low.jpg", "team-b")["publish"], "held")

        # Writer: first call has an em dash (auto-fixed), one has a too-long X post (regenerated)
        client = FakeClient(script=["dash", "long_x", "good"])
        w = Writer(self.cfg, self.db, client=client)
        claimed = w.claim(10)
        self.assertEqual(len(claimed), 3)
        for h, team in claimed:
            w.write_one(h, team)
        rows = self.db.all("SELECT * FROM tags WHERE draft='ready'")
        self.assertEqual(len(rows), 3)
        for r in rows:
            d = json.loads(r["draft_json"])
            self.assertNotIn("—", d["linkedin_a"])
            self.assertLess(len(d["x_post"]), 240)
            self.assertEqual(json.loads(r["draft_problems"]), [])
        call = client.beta.messages.calls[0]
        self.assertEqual(call["model"], "claude-opus-5-5")
        self.assertEqual(call["tool_choice"], {"type": "auto"})
        self.assertTrue(call["tools"][0]["strict"])
        self.assertEqual(call["fallbacks"], "default")
        img = call["messages"][0]["content"][0]
        self.assertEqual((img["type"], img["source"]["media_type"]), ("image", "image/jpeg"))
        self.assertEqual(len(client.beta.messages.calls), 4, "3 drafts + 1 regeneration")

        # Approve the low-confidence one: it now publishes, gets the first slot, lands in queue.csv
        b = self.tag("cara_low.jpg", "team-b")
        d = json.loads(b["draft_json"])
        res = actions.approve(self.cfg, self.db, b["photo_hash"], "team-b", {**d, "use_alt": True},
                              now=datetime(2026, 10, 24, 9, 0, tzinfo=PDT))
        self.assertEqual(res["slot"], "2026-10-24T11:00:00-07:00")
        self.assertEqual(res["publish"], "pending")
        self.assertEqual(pub.run_once(), 1)
        self.assertEqual(site.calls[-1][2], d["caption"], "approved caption goes to the gallery")

        a = self.tag("alice.jpg", "team-a")
        res2 = actions.approve(self.cfg, self.db, a["photo_hash"], "team-a",
                               {**json.loads(a["draft_json"]), "x_post": "Edited — by hand\n#KaneCLIHackDay"},
                               now=datetime(2026, 10, 24, 9, 0, tzinfo=PDT))
        self.assertEqual(res2["slot"], "2026-10-24T11:25:00-07:00")
        with open(self.cfg.queue_csv, newline="") as f:
            q = list(csv.DictReader(f))
        self.assertEqual(len(q), 4)
        self.assertEqual(q[0]["Text"], d["linkedin_b"], "use alternate picked LinkedIn B")
        self.assertEqual(q[3]["Text"], "Edited, by hand\n#KaneCLIHackDay")
        self.assertTrue(q[0]["image_path"].endswith(".jpg"))

        # Reassign the hard-tagged photo to another team; reject keeps CSV consistent
        hard = self.tag("team-b__stackchan.jpg", "team-b")
        r = actions.reassign(self.cfg, self.db, hard["photo_hash"], "team-b", "team-c")
        self.assertTrue(r["already_published"])
        new = self.tag("team-b__stackchan.jpg", "team-c")
        self.assertEqual((new["source"], new["publish"], new["draft"]), ("manual", "pending", "pending"))
        self.assertEqual(self.tag("team-b__stackchan.jpg", "team-b")["state"], "reassigned")
        with self.assertRaises(actions.ActionError):
            actions.reassign(self.cfg, self.db, hard["photo_hash"], "team-c", "no-such-team")

        actions.reject(self.cfg, self.db, a["photo_hash"], "team-a")
        with open(self.cfg.queue_csv, newline="") as f:
            self.assertEqual(len(list(csv.DictReader(f))), 2)

        # Assign an unresolved photo
        venue = self.photo("venue.jpg")
        actions.assign(self.cfg, self.db, venue["hash"], "team-a")
        self.assertEqual(self.photo("venue.jpg")["status"], "tagged")
        self.assertEqual(self.tag("venue.jpg", "team-a")["publish"], "pending")

        # Review app renders and serves state + photos
        app = create_app(self.cfg, self.db).test_client()
        page = app.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"Photo review", page.data)
        st = app.get("/api/state").get_json()
        self.assertEqual({c["team"] for c in st["approved"]}, {"team-b"})
        self.assertEqual(len(st["unresolved"]), 2)
        self.assertEqual({c["team"] for c in st["drafting"]}, {"team-c", "team-a"})
        resp = app.get(f"/photo/{venue['hash']}.jpg")
        self.assertEqual((resp.status_code, resp.mimetype), (200, "image/jpeg"))
        resp.close()
        self.assertEqual(app.get("/photo/../../etc/passwd.jpg").status_code, 404)
        self.assertEqual(app.post("/api/approve", data="hash=x").status_code, 415, "form posts are refused")
        bad = app.post("/api/approve", json={"hash": venue["hash"], "team": "team-a", "linkedin_a": "", "x_post": ""})
        self.assertEqual(bad.status_code, 400)

    def test_writer_refusal_and_no_tool_call(self):
        make_img(self.drive / "alice.jpg", 800)
        tagger = Tagger(self.cfg, self.db, engine=FakeEngine())
        tagger.process_file(self.drive / "alice.jpg")
        w = Writer(self.cfg, self.db, client=FakeClient(script=["refusal"]))
        (h, team), = w.claim(5)
        w.write_one(h, team)
        row = self.db.one("SELECT * FROM tags")
        self.assertEqual(row["draft"], "error", "refusal is not retried automatically")
        self.assertIn("declined", row["draft_error"])

        actions.redraft(self.cfg, self.db, h, team)
        w = Writer(self.cfg, self.db, client=FakeClient(script=["text", "good"]))
        w.write_one(*w.claim(5)[0])
        self.assertEqual(self.db.one("SELECT draft FROM tags")["draft"], "ready")

    def test_brief_only_names_people_in_frame(self):
        brief = build_brief("team-a", TEAMS["team-a"], [], ["Bravo"])
        self.assertIn("none identified, do not name anyone", brief)
        self.assertIn("X @alice", brief)
        self.assertIn("Other teams also in this photo", brief)


if __name__ == "__main__":
    unittest.main()
