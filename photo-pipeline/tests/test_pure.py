"""Unit tests for the pure parts: matching, hard tags, slots, CSV, draft validation.

Run: .venv/bin/python -m unittest discover -s tests -v
"""
import csv
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

from pipeline.matching import (IndexEntry, face_is_big_enough, match_faces, parse_hard_tag,
                               should_auto_publish)
from pipeline.schedule import BUFFER_COLUMNS, csv_rows, next_free_slot, write_queue
from pipeline.validate import EVENT_TAG, strip_dashes, validate_draft, word_count

PDT = timezone(timedelta(hours=-7))
rng = np.random.default_rng(42)


def unit(v):
    return v / np.linalg.norm(v)


def near(v, sim):
    """A unit vector with cosine similarity `sim` to unit vector v."""
    r = rng.normal(size=v.shape)
    r -= r.dot(v) * v
    r = unit(r)
    return unit(sim * v + np.sqrt(1 - sim ** 2) * r)


class MatchingTests(unittest.TestCase):
    def setUp(self):
        self.alice, self.bob, self.cara, self.group_face = (unit(rng.normal(size=512)) for _ in range(4))
        self.index = np.stack([self.alice, self.bob, self.cara, self.group_face])
        self.entries = [
            IndexEntry("team-a", "Alice", "selfie"),
            IndexEntry("team-a", "Bob", "selfie"),
            IndexEntry("team-b", "Cara", "selfie"),
            IndexEntry("team-c", None, "group"),
        ]

    def test_matches_each_face_to_its_team_and_names_people(self):
        faces = np.stack([near(self.alice, 0.62), near(self.cara, 0.55)])
        m = match_faces(faces, self.index, self.entries, threshold=0.40)
        self.assertEqual(set(m), {"team-a", "team-b"})
        self.assertEqual(m["team-a"].members, ["Alice"])
        self.assertEqual(m["team-b"].members, ["Cara"])
        self.assertAlmostEqual(m["team-a"].score, 0.62, places=2)
        self.assertFalse(m["team-a"].ambiguous)

    def test_below_threshold_is_not_tagged(self):
        faces = np.stack([near(self.alice, 0.35)])
        self.assertEqual(match_faces(faces, self.index, self.entries, threshold=0.40), {})

    def test_best_score_and_face_count_per_team(self):
        faces = np.stack([near(self.alice, 0.45), near(self.bob, 0.71)])
        m = match_faces(faces, self.index, self.entries, threshold=0.40)
        self.assertEqual(list(m), ["team-a"])
        self.assertEqual(m["team-a"].faces, 2)
        self.assertAlmostEqual(m["team-a"].score, 0.71, places=2)
        self.assertEqual(sorted(m["team-a"].members), ["Alice", "Bob"])

    def test_group_photo_match_has_no_name(self):
        m = match_faces(np.stack([near(self.group_face, 0.6)]), self.index, self.entries, threshold=0.40)
        self.assertEqual(m["team-c"].members, [])

    def test_face_votes_for_one_team_only_and_flags_ambiguity(self):
        # A face that looks like both Alice (team-a) and Cara (team-b), nearly equally.
        mix = unit(self.alice + self.cara)
        m = match_faces(np.stack([mix]), self.index, self.entries, threshold=0.40, ambiguous_margin=0.05)
        self.assertEqual(len(m), 1, "one face must never tag two teams")
        tm = next(iter(m.values()))
        self.assertTrue(tm.ambiguous)
        self.assertIn(tm.runner_up, {"team-a", "team-b"})

    def test_empty_inputs(self):
        self.assertEqual(match_faces(np.zeros((0, 512)), self.index, self.entries, 0.4), {})
        self.assertEqual(match_faces(np.stack([self.alice]), np.zeros((0, 512)), [], 0.4), {})

    def test_min_face_fraction(self):
        # 4000x3000 image: shorter side 3000, 5% = 150px
        self.assertTrue(face_is_big_enough([100, 100, 260, 300], 4000, 3000, 0.05))
        self.assertFalse(face_is_big_enough([100, 100, 240, 400], 4000, 3000, 0.05))  # 140px wide

    def test_auto_publish_rules(self):
        self.assertTrue(should_auto_publish("hard", 1.0, False, 0.5))
        self.assertTrue(should_auto_publish("manual", 1.0, False, 0.5))
        self.assertTrue(should_auto_publish("face", 0.55, False, 0.5))
        self.assertFalse(should_auto_publish("face", 0.45, False, 0.5))
        self.assertFalse(should_auto_publish("face", 0.9, True, 0.5), "ambiguous never auto-publishes")


class HardTagTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_hard_tag("team-rocket__stackchan.jpg"), "team-rocket")
        self.assertEqual(parse_hard_tag("Team-Rocket__IMG_1.HEIC"), "team-rocket")
        self.assertEqual(parse_hard_tag("/x/y/abc123__a__b.png"), "abc123")
        self.assertIsNone(parse_hard_tag("IMG_1234.jpg"))
        self.assertIsNone(parse_hard_tag("team_rocket_stackchan.jpg"))
        self.assertIsNone(parse_hard_tag("__stackchan.jpg"))
        self.assertIsNone(parse_hard_tag("-bad__x.jpg"))


class SlotTests(unittest.TestCase):
    first = datetime(2026, 10, 24, 11, 0, tzinfo=PDT)

    def test_before_first_slot_uses_first_slot(self):
        now = datetime(2026, 10, 24, 9, 0, tzinfo=PDT)
        self.assertEqual(next_free_slot(now, self.first, 25, []), self.first)

    def test_after_first_slot_rounds_up_to_grid(self):
        now = datetime(2026, 10, 24, 11, 30, tzinfo=PDT)
        self.assertEqual(next_free_slot(now, self.first, 25, []), datetime(2026, 10, 24, 11, 50, tzinfo=PDT))

    def test_on_grid_exactly(self):
        now = datetime(2026, 10, 24, 11, 25, tzinfo=PDT)
        self.assertEqual(next_free_slot(now, self.first, 25, []), now)

    def test_skips_taken_slots_even_in_other_timezone(self):
        now = datetime(2026, 10, 24, 9, 0, tzinfo=PDT)
        taken = [self.first.astimezone(timezone.utc), self.first + timedelta(minutes=25)]
        self.assertEqual(next_free_slot(now, self.first, 25, taken), self.first + timedelta(minutes=50))

    def test_no_first_slot_anchors_on_now(self):
        now = datetime(2026, 10, 24, 12, 7, 30, tzinfo=PDT)
        self.assertEqual(next_free_slot(now, None, 25, []), datetime(2026, 10, 24, 12, 10, tzinfo=PDT))
        now = datetime(2026, 10, 24, 12, 10, 0, tzinfo=PDT)
        self.assertEqual(next_free_slot(now, None, 25, []), now)


class CsvTests(unittest.TestCase):
    def test_rows_and_files(self):
        items = [
            {"slot": datetime(2026, 10, 24, 11, 25, tzinfo=PDT), "linkedin_text": "LI two", "x_text": "X two",
             "image_path": "/w/photos/b.jpg", "team": "beta", "key": "b" * 32},
            {"slot": datetime(2026, 10, 24, 11, 0, tzinfo=PDT), "linkedin_text": "LI, \"one\"\nline2",
             "x_text": "X one", "image_path": "/w/photos/a.jpg", "team": "alpha", "key": "a" * 32},
        ]
        rows = csv_rows(items)
        self.assertEqual([(r["team"], r["channel"]) for r in rows],
                         [("alpha", "linkedin"), ("alpha", "x"), ("beta", "linkedin"), ("beta", "x")])
        self.assertEqual(rows[0]["Posting Time"], "2026-10-24 11:00")
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "queue.csv"
            self.assertEqual(write_queue(path, items), 4)
            with open(path, newline="") as f:
                data = list(csv.DictReader(f))
            self.assertEqual(list(data[0])[:4], BUFFER_COLUMNS)
            self.assertIn("image_path", data[0])
            self.assertEqual(data[0]["Text"], "LI, \"one\"\nline2")  # quoting round-trips
            with open(Path(d) / "queue_x.csv", newline="") as f:
                xs = list(csv.DictReader(f))
            self.assertEqual(list(xs[0]), BUFFER_COLUMNS)
            self.assertEqual([r["Text"] for r in xs], ["X one", "X two"])
            # rewriting is idempotent (no duplicate rows)
            write_queue(path, items)
            with open(path, newline="") as f:
                self.assertEqual(len(list(csv.DictReader(f))), 4)


def words(n):
    return " ".join(["builders"] * n)


def good_draft(**over):
    d = {
        "linkedin_a": words(80) + "\n\n#KaneCLIHackDay #OpenAI",
        "linkedin_b": words(70) + "\n\n#KaneCLIHackDay",
        "x_post": "Team Rocket testing their OpenAI app with Kane CLI.\n#KaneCLIHackDay",
        "caption": "Team Rocket at work.",
        "alt_text": "Three people around a laptop.",
        "tag_names": ["Alice"],
    }
    d.update(over)
    return d


class ValidateTests(unittest.TestCase):
    def test_good_draft_passes(self):
        fixed, problems = validate_draft(good_draft())
        self.assertEqual(problems, [])
        self.assertEqual(fixed["tag_names"], ["Alice"])

    def test_em_dash_replaced(self):
        self.assertEqual(strip_dashes("We built it — and tested it"), "We built it, and tested it")
        self.assertEqual(strip_dashes("a—b"), "a, b")
        self.assertEqual(strip_dashes("2pm – 4pm"), "2pm, 4pm")
        self.assertEqual(strip_dashes("pages 3–4"), "pages 3–4")  # unspaced en dash is a range
        fixed, problems = validate_draft(good_draft(caption="Team Rocket — at work."))
        self.assertNotIn("—", fixed["caption"])
        self.assertEqual(problems, [])

    def test_word_count_limits(self):
        _, problems = validate_draft(good_draft(linkedin_a=words(40) + "\n\n#KaneCLIHackDay"))
        self.assertTrue(any("linkedin_a" in p and "40 words" in p for p in problems))
        _, problems = validate_draft(good_draft(linkedin_b=words(130) + "\n\n#KaneCLIHackDay"))
        self.assertTrue(any("linkedin_b" in p for p in problems))
        self.assertEqual(word_count("a b  c\nd"), 4)

    def test_x_length(self):
        _, problems = validate_draft(good_draft(x_post="x" * 230 + "\n#KaneCLIHackDay"))
        self.assertTrue(any(p.startswith("x_post is") for p in problems))

    def test_event_hashtag_added_and_inline_hashtags_flagged(self):
        fixed, problems = validate_draft(good_draft(x_post="Shipping with Kane CLI.\n#OpenAI"))
        self.assertTrue(fixed["x_post"].splitlines()[-1].endswith(EVENT_TAG))
        self.assertEqual(problems, [])
        fixed, problems = validate_draft(good_draft(x_post="No tags line at all"))
        self.assertEqual(fixed["x_post"], "No tags line at all\n\n#KaneCLIHackDay")
        _, problems = validate_draft(good_draft(linkedin_a="We love #OpenAI here. " + words(70) + "\n\n#KaneCLIHackDay"))
        self.assertTrue(any("last line" in p for p in problems))

    def test_hype_words(self):
        _, problems = validate_draft(good_draft(x_post="An amazing, game-changer demo.\n#KaneCLIHackDay"))
        self.assertTrue(any("amazing" in p and "game-changer" in p for p in problems))

    def test_empty_field(self):
        _, problems = validate_draft(good_draft(alt_text=""))
        self.assertIn("alt_text is empty", problems)


if __name__ == "__main__":
    unittest.main()
