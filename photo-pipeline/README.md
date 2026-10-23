# Hack Day photo pipeline

Local tool for **Kane CLI Hack Day, SF Edition** (Saturday 24 Oct 2026, theme "Build with OpenAI, test with Kane CLI").

Photographers drop shots into a Google Drive folder synced to the organiser's Mac. For each photo, the pipeline:

1. **tags** it to registered teams by face recognition (InsightFace `buffalo_l`), or by filename (`<team-slug>__anything.jpg`),
2. **publishes** confident matches straight to the team's gallery on the site (`POST /api/import/photo`),
3. **drafts** LinkedIn (A/B), X, caption and alt text with Claude,
4. puts each draft in a local **review queue**. Approving a draft schedules it in a Buffer bulk-upload CSV.

From the moment a photo lands in Drive, its draft is usually ready to review in under 2 minutes. That covers Drive sync, about 3 s for the file to settle, about 1 s of face matching, and one Claude call. Nothing is posted to social media automatically. You still import the CSV into Buffer yourself.

```
DRIVE_DIR ──► tagger ──► sqlite (work/state.sqlite3) ──► publisher ──► site gallery
                              │                                 ▲
                              ├──► writer (Claude) ──► review page (localhost:5050)
                              │                         approve / reject / reassign / assign
                              └──────────────────────────► work/queue.csv (Buffer)
```

## Setup (Apple Silicon Mac)

```bash
cd photo-pipeline
xcode-select --install            # once; insightface may compile a small C++ extension
python3.12 -m venv .venv          # 3.11 works too
.venv/bin/pip install --upgrade pip wheel setuptools cython
.venv/bin/pip install -r requirements.txt
cp .env.example .env              # then fill in EXPORT_TOKEN, ANTHROPIC_API_KEY, DRIVE_DIR, FIRST_SLOT
```

Notes:
- `insightface` is sometimes built from source. If the build fails with a `clang` or `Python.h` error, run `xcode-select --install` and make sure you are using a python.org or Homebrew Python 3.11 or 3.12 (not the system Python 3.9).
- The first `enroll` or `run` downloads the `buffalo_l` model (about 280 MB) to `~/.insightface/models/`. Do this the day before, not at the venue.
- `pillow-heif` is optional. It adds `.heic` support for iPhone originals. If it fails to install, delete that line from `requirements.txt`.
- `DRIVE_DIR` is the local path of the synced folder, usually `~/Library/CloudStorage/GoogleDrive-<you>/My Drive/<folder>`. In Google Drive for desktop, set that folder to **"Mirror files"** or **"Available offline"**. Otherwise files are only placeholders and can't be read.

## Commands

```bash
.venv/bin/python -m pipeline enroll    # fetch teams + registration photos, build face index (re-run any time)
.venv/bin/python -m pipeline run       # tagger + writer + gallery publisher + review page; Ctrl-C to stop
.venv/bin/python -m pipeline review    # review page only (no tagging/drafting/publishing)
.venv/bin/python -m pipeline status    # counts from the state DB
.venv/bin/python -m unittest discover -s tests -v   # tests (no network, no model needed)
```

The review page is at http://127.0.0.1:5050 (`REVIEW_PORT`). It only listens on localhost.

## Day-of runbook

**The day before**
1. `cp .env.example .env` and fill it in. `SITE_URL` is the production site. Set `FIRST_SLOT`, for example `2026-10-24T11:00:00-07:00`.
2. `python -m pipeline enroll` and read the summary:
   - *Teams with NO usable face*: those teams can only be tagged by filename or by you in review. Ask them to upload a clearer selfie on the site, then re-run `enroll`.
   - *Consent is per member* (`members[].consent_social` must be exactly `true`; `false` or `null`, "not asked yet", both mean no):
     - A member's selfie is enrolled only if that member consented.
     - The team group photo is enrolled only if every member consented (`all_consented`).
     - A team with no consenting member is skipped entirely. It can't be hard-tagged or picked in review.
     - Withdrawn consent takes effect on the next `enroll`, which deletes that person's cached photo and embeddings, and the group photo's.
3. Drop two or three test photos into `DRIVE_DIR`, then `python -m pipeline run`. Check that they show up in the review page. Then reject them, and remove them from the site gallery if they were published.

**On the day**
1. Re-run `python -m pipeline enroll` after registration closes, and again after any late sign-ups. While `run` is going, the tagger reloads the new index automatically.
2. Start `python -m pipeline run` and keep the review page open.
3. Work through **Ready for review** from top to bottom. Each card shows:
   - the score badge: green means at or above `GALLERY_AUTO_THRESHOLD`, amber means below it, red means *ambiguous* (two teams scored within `AMBIGUOUS_MARGIN`),
   - the close second team, if there is one,
   - the people in frame, each with their LinkedIn and X links so you can tag them.

   Edit the text, then **Approve**. Use **Reassign** if the team is wrong.
   Keyboard: `j`/`k` move between cards, `a` approves, `x` rejects, `t` switches LinkedIn A/B ("use alternate"), `r` jumps to the reassign picker, `e` edits, `Esc` leaves a text field.
4. **Unresolved photos**: pick the team (this publishes to their gallery and starts a draft), or **Discard**.
5. Every approval rewrites `work/queue.csv` (along with `queue_linkedin.csv` and `queue_x.csv`). Import those into Buffer in batches (see the limitation below).
6. `Ctrl-C` stops everything cleanly. Restarting is safe: photos are keyed by content hash and never processed twice. Interrupted drafts and uploads resume.

### Stack-chan convention

A file named `<team-slug>__stackchan.jpg` (in general, any `<team-slug>__*.jpg|png|heic`) dropped into `DRIVE_DIR` is **always** tagged to that team with score 1.0, whether or not it contains faces. It is published to that team's gallery right away. Any faces in the photo are still matched, so other teams can be added on top. The slug must be an enrolled team, meaning one with at least one consenting member (`any_consented`). Drafts for hard-tagged photos still name only consenting members. Otherwise the photo goes to *Unresolved* with a note.

## Site consent gate (Kane Hack OS)

The site no longer trusts a face match as permission to publish. `POST /api/import/photo` stores every photo privately and decides per team:

- **Published** (`"added"`) only when every current member of the team, and every person sent in the optional `people` field, has **photo_publication** consent on record right now (the per-member answer in the hub's Photos tab, or the passport).
- **Held** (`"held for review"`) otherwise: unknown, missing or withdrawn consent means hold, never publish. Held photos wait in **/ops/media** for a person to identify who is in frame (badge scan or lookup), run the consent check and have an organizer approve and publish. The publisher treats `"held for review"` as delivered, so it doesn't retry.
- `people` (optional, repeatable) takes the P-codes from the export (`members[].public_code`) of the people the pipeline matched. They are stored only as **suggestions** (`opted_in_candidate`, unconfirmed), and only for members who allow matching. A staff member confirms each one per photo.

What the export sends has changed too. `members[].consent_social`, `all_consented` and `any_consented` now mean "may be face-matched": `face_matching` granted, or, for people who answered before that category existed, no `face_matching` answer and `photo_publication` granted. Any "no" removes the person on the next `enroll`, and their cached embeddings with them. On the site, galleries re-check consent on every read, so a photo of someone who withdraws disappears immediately, even before the next enroll. Photos already published before this change are re-checked the same way. A team photo with a member who never answered is hidden until it is reviewed in /ops/media.

The site now has an unpublish path: **Hold** or **Reject** in /ops/media. Approved social posts can be exported as a Buffer CSV from /ops/media (`/api/v1/social/export`). That export fills `Image URL` with the public gallery URL of published photos, which removes the local-path limitation described below for those rows.

## Consent in posts

Only consenting members are ever shown to Claude (names and handles), listed as people in frame, or kept in `tag_names`. Non-consenting teammates are not named in the brief. Claude is only told how many other members asked not to be named.

Every draft is checked for the names of non-consenting members. Full names match case-insensitively. First names match only when capitalised, and only if no consenting teammate shares them. A draft that names someone is regenerated, and **Approve is refused** if the text still names them, including after your own edits.

On the review page, every member is shown with a "consented" or "no consent, don't name/tag" badge. LinkedIn and X links are shown only for consenting members.

## How matching works (and how wrong tags are avoided)

- Faces whose bounding box is shorter than `MIN_FACE_FRAC` (default 5%) of the image's shorter side are ignored. This drops background crowds.
- Each face votes for **exactly one** team: the team of its single best-matching enrolled face (cosine similarity on 512-d ArcFace embeddings). The vote counts only if the score is at least `MATCH_THRESHOLD` (0.40).
- If the runner-up team is within `AMBIGUOUS_MARGIN` (0.05), the tag is flagged **ambiguous** and is never auto-published.
- A person is listed as "in frame" only when their own selfie was the best match. Faces from group photos give a team but no name. Claude is told to name only these people.
- Gallery auto-publish happens only for filename tags, manual assignments, and non-ambiguous scores at or above `GALLERY_AUTO_THRESHOLD` (0.50). Everything else is held until you approve or reassign it.
- For reference, a quick check with real `buffalo_l` embeddings gave about 0.93 for the same person across two different photos, and about 0.07 to 0.13 for different people.

**The site has no unpublish API.** If you reject or reassign a photo that is already in a team's gallery, the page tells you, and you need to remove it on the site. To make that rarer, raise `GALLERY_AUTO_THRESHOLD`. At 1.01, only filename tags and your own approvals publish.

## Claude drafts

- Model `CLAUDE_MODEL` (default `claude-opus-5-5`), effort `CLAUDE_EFFORT` (default `medium`). The photo is downscaled to 1568 px on the long side and sent as a base64 image.
- Structured output comes from a strict tool schema (`submit_post_drafts`). **Claude Opus 5.5 rejects a forced `tool_choice` (`{"type":"tool"}`) with a 400.** So the call uses `tool_choice: auto` plus a strict schema plus an explicit instruction, and asks again if no tool call comes back.
- Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is on for models that support it. If Claude still declines, the card shows "draft failed" with a Retry button, and you write that one by hand.
- Each draft is checked after it comes back:
  - em dashes are replaced with commas automatically,
  - `#KaneCLIHackDay` is added to the last line if missing,
  - LinkedIn bodies must be 60 to 110 words (not counting the hashtag line),
  - X posts must be under 240 characters,
  - hashtags may only appear on the last line,
  - hype words are rejected.

  A draft that breaks a rule is regenerated (up to 2 revisions). Anything still wrong after that is shown as a "Check:" warning on the card. Live counters show words and characters while you edit.
- 429 and 5xx responses are retried by the SDK (4 retries with backoff, honouring `retry-after`). If those fail too, the draft goes back to the queue with backoff (15 s up to 5 min, at most 6 attempts). Three drafts run in parallel.

## Buffer CSV

`work/queue.csv` has the columns `Text, Image URL, Tags, Posting Time, channel, image_path, team, photo_key`. There is one row per channel post, so LinkedIn and X each get their own row, and rows are sorted by time. `Tags` is `<channel>,<team-slug>` so you can filter in Buffer. `queue_linkedin.csv` and `queue_x.csv` hold the same rows with only the 4 Buffer columns, ready to import per channel.

Posting times are `YYYY-MM-DD HH:MM` in `FIRST_SLOT`'s timezone. Slots are spaced `SLOT_MINUTES` apart, starting from the later of now and `FIRST_SLOT`, and each approval takes the next free one. Check this against your Buffer account's timezone and the current Buffer bulk-upload template before the first import.

**Limitation: Buffer needs a public image URL.** This pipeline only has local files, so `Image URL` holds the local path (`work/photos/<hash>.jpg`, the same file is in `image_path`). As a result, Buffer will reject those rows on import rather than post them without an image. Before importing, either:
- replace `Image URL` with the photo's public URL from the site gallery, or
- upload `work/photos/` somewhere public and find/replace the path prefix, or
- import the text only and attach images in Buffer by hand.

## Files

| Path | What |
|---|---|
| `pipeline/config.py` | `.env` settings |
| `pipeline/site.py` | site API client (`x-export-token` on every call) |
| `pipeline/enroll.py` | builds `work/index/faces.npz` and `meta.json` from the export, with a cache in `work/enroll_cache/` |
| `pipeline/faces.py` | InsightFace wrapper and the index file format |
| `pipeline/matching.py` | pure matching rules, hard-tag parsing, auto-publish rule |
| `pipeline/tagger.py` | Drive watcher (recursive poll, 3 s size-stable check, EXIF orientation, content-hash idempotency) |
| `pipeline/publisher.py` | gallery uploads with retry |
| `pipeline/writer.py` | Claude drafting |
| `pipeline/validate.py` | draft checks and auto-fixes |
| `pipeline/schedule.py` | slot picking and CSV writing |
| `pipeline/actions.py` | approve / reject / reassign / assign / discard / redraft |
| `pipeline/review.py` | Flask review page |
| `work/` | all state (git-ignored): `state.sqlite3`, `photos/<hash>.jpg` (normalised ≤2048 px JPEGs, used for uploads and the review page), `by_team/<slug>/`, `_unresolved/`, `queue*.csv` |

To start over completely, stop `run` and delete `work/` (the face index is rebuilt by `enroll`). Photos already published to the site stay there.
