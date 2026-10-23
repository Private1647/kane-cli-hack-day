import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { query } from "@/lib/db";
import { isEnabled } from "@/lib/flags";
import { DECK_TEMPLATE, DEFAULT_THEME, deckSchema, defaultDeck, normalizeDeck, type Deck } from "@/components/deck/model";
import type { PublicStory } from "@/components/ship-templates/model";
import { AppError, idempotent, parse, serverNow, sha256, siteUrl, withAudit, z, type Receipt } from "./core";
import { getLatestPublished, getPublishedStory, previewStory, requireWrite, type ProjectAccess } from "./story";

// HTML deck (T-DECK-01..08): versioned deck.json + theme.json per project,
// generated from the story as kane-ship-5@1.0.0 and edited in /studio/[slug]/deck.
//
//   - A "deck id" in the API is the project id: one deck per project, many versions.
//   - Every save is a new immutable deck_versions row (db/026 trigger);
//     optimistic concurrency on expected_version.
//   - Publish pins one version (and the live submission, if any) in
//     published_assets. /ship/[slug]/deck shows the latest published version.
//   - PDF export is the browser's print dialog on the presenter (?print=1).
//     There is no headless Chromium in this deployment, so a PDF render job is
//     recorded honestly as "browser print" instead of pretending to queue.
//   - Level-3 custom HTML is only ever previewed in a sandboxed iframe.

export type DeckVersion = {
  id: number;
  version: number;
  template: string;
  deck: Deck;
  status: "draft" | "approved" | "published" | "archived";
  sourceStoryId: number | null;
  createdAt: string;
};

type DeckRow = { id: number; version: number; template: string; scenes: unknown; theme_tokens: unknown; status: DeckVersion["status"]; source_story_id: number | null; created_at: Date };

function toDeckVersion(r: DeckRow): DeckVersion {
  const parsed = deckSchema.safeParse({ template: DECK_TEMPLATE, slides: r.scenes, theme: r.theme_tokens });
  return {
    id: r.id,
    version: r.version,
    template: r.template,
    deck: parsed.success ? parsed.data : { template: DECK_TEMPLATE, slides: (r.scenes as Deck["slides"]) ?? [], theme: DEFAULT_THEME },
    status: r.status,
    sourceStoryId: r.source_story_id,
    createdAt: r.created_at.toISOString(),
  };
}

const DECK_COLS = "id, version, template, scenes, theme_tokens, status, source_story_id, created_at";

export async function getDeckVersion(projectId: number, version?: number | null) {
  const rows = await query<DeckRow>(
    version
      ? `select ${DECK_COLS} from deck_versions where project_id = $1 and version = $2`
      : `select ${DECK_COLS} from deck_versions where project_id = $1 order by version desc limit 1`,
    version ? [projectId, version] : [projectId],
  );
  return rows[0] ? toDeckVersion(rows[0]) : null;
}

export async function listDeckVersions(projectId: number) {
  const rows = await query<DeckRow>(`select ${DECK_COLS} from deck_versions where project_id = $1 order by version desc limit 40`, [projectId]);
  return rows.map(toDeckVersion);
}

/** The deck the editor opens: the latest saved version, or the default generated from the latest story. */
export async function getEditableDeck(access: ProjectAccess) {
  const [latest, preview] = await Promise.all([getDeckVersion(access.project.id), previewStory(access)]);
  const storyRow = await query<{ id: number }>("select id from project_stories where project_id = $1 order by version desc limit 1", [access.project.id]);
  return {
    current: latest,
    deck: latest?.deck ?? defaultDeck(preview.story),
    defaultDeck: defaultDeck(preview.story),
    story: preview.story,
    storyId: storyRow[0]?.id ?? null,
    storyVersion: preview.version,
  };
}

const saveInput = z.object({
  deck: z.unknown(),
  expected_version: z.coerce.number().int().min(0),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
  /** Why: "edit" | "reset" | "import" | "restore v3" (audit only). */
  reason: z.string().trim().max(60).optional(),
});

/** deck_update: save a new deck version (optimistic concurrency). */
export async function saveDeckVersion(access: ProjectAccess, input: unknown): Promise<{ data: DeckVersion; receipt: Receipt }> {
  requireWrite(access);
  if (!(await isEnabled("deck"))) throw new AppError("FEATURE_DISABLED", { userMessage: "The deck studio is switched off right now. Use the offline deck starter." });
  const { deck: rawDeck, expected_version, idempotency_key, reason } = parse(saveInput, input);
  let deck: Deck;
  try {
    deck = normalizeDeck(typeof rawDeck === "string" ? JSON.parse(rawDeck) : rawDeck);
  } catch (e) {
    if (e instanceof SyntaxError) throw new AppError("VALIDATION_FAILED", { userMessage: "That deck isn't valid JSON." });
    throw e;
  }
  const { project, member, actor } = access;
  const { result } = await idempotent(idempotency_key, `deck.save:project:${project.id}`, () =>
    withAudit(actor, "deck.save", "deck_version", async (tx) => {
      const { rows: cur } = await tx.query<{ v: number }>("select coalesce(max(version), 0) as v from deck_versions where project_id = $1", [project.id]);
      if (cur[0].v !== expected_version) {
        throw new AppError("CONFLICT", { userMessage: `Someone saved deck version ${cur[0].v} while you were editing version ${expected_version}. Reload to merge.` });
      }
      const { rows: st } = await tx.query<{ id: number }>("select id from project_stories where project_id = $1 order by version desc limit 1", [project.id]);
      const { rows } = await tx.query<DeckRow>(
        `insert into deck_versions (project_id, source_story_id, version, template, scenes, theme_tokens, status)
         values ($1, $2, $3, $4, $5, $6, 'draft') returning ${DECK_COLS}`,
        [project.id, st[0]?.id ?? null, expected_version + 1, DECK_TEMPLATE, JSON.stringify(deck.slides), JSON.stringify(deck.theme)],
      );
      const v = toDeckVersion(rows[0]);
      return { result: v, resourceId: v.id, after: deck, payload: { project_id: project.id, version: v.version, slides: deck.slides.length, reason: reason ?? "edit", by: member.id } };
    }),
  );
  return { data: result, receipt: { id: `DECK-${project.id}-v${result.version}`, server_time: (await serverNow()).toISOString() } };
}

const publishInput = z.object({
  version: z.coerce.number().int().positive(),
  confirm_phrase: z.string().trim(),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});

/** Publish one deck version as immutable, pinned to the live submission when there is one. Needs a published Ship Page. */
export async function publishDeck(access: ProjectAccess, input: unknown): Promise<{ data: { id: number; version: number; deckVersion: number; publishedAt: string }; receipt: Receipt }> {
  requireWrite(access);
  if (!(await isEnabled("deck"))) throw new AppError("FEATURE_DISABLED");
  const { version, confirm_phrase, idempotency_key } = parse(publishInput, input);
  const { project, member, actor } = access;
  if (confirm_phrase.toLowerCase() !== "publish deck") throw new AppError("VALIDATION_FAILED", { userMessage: "Type “publish deck” to confirm." });
  const page = await getLatestPublished(project.id, "ship_page");
  if (!page) throw new AppError("VALIDATION_FAILED", { userMessage: "Publish the Ship Page story first: the deck shows its approved claims and credits." });
  const dv = await getDeckVersion(project.id, version);
  if (!dv) throw new AppError("NOT_FOUND", { userMessage: `Deck version ${version} doesn't exist.` });

  const { result } = await idempotent(idempotency_key, `deck.publish:project:${project.id}`, () =>
    withAudit(actor, "deck.publish", "published_asset", async (tx) => {
      const { rows: sub } = await tx.query<{ id: number }>(
        "select id from submissions where project_id = $1 and status not in ('withdrawn','organizer_exception') order by id desc limit 1",
        [project.id],
      );
      const { rows: next } = await tx.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from published_assets where project_id = $1 and kind = 'deck'", [project.id]);
      const receipt = { deck_version: dv.version, ship_page_version: page.version, credited: page.consent.credited, approved_by: { member_id: member.id, name: member.name } };
      const { rows } = await tx.query<{ id: number; version: number; published_at: Date }>(
        `insert into published_assets (project_id, kind, version, source_story_id, source_deck_id, state, consent_receipt, published_by, submission_id)
         values ($1, 'deck', $2, $3, $4, 'public', $5, $6, $7) returning id, version, published_at`,
        // The deck renders with the published page's story, so pin that one.
        [project.id, next[0].v, page.storyId, dv.id, JSON.stringify(receipt), member.id, sub[0]?.id ?? null],
      );
      await tx.query("update deck_versions set status = 'archived' where project_id = $1 and status = 'published' and id <> $2", [project.id, dv.id]);
      await tx.query("update deck_versions set status = 'published', approved_by = $2, approved_at = now() where id = $1", [dv.id, member.id]);
      // The offline HTML is generated on request from this immutable version, so the "render" is done.
      await tx.query(
        `insert into render_jobs (project_id, source_version, kind, status, object_key, attempt_count, idempotency_key, started_at, finished_at)
         values ($1, $2, 'html_deck', 'succeeded', $3, 1, $4, now(), now()) on conflict (idempotency_key) do nothing`,
        [project.id, `deck:v${dv.version}`, `/ship/${project.slug}/deck/offline`, `html_deck:${project.id}:v${dv.version}`],
      );
      const r = rows[0];
      return {
        result: { id: r.id, version: r.version, deckVersion: dv.version, publishedAt: r.published_at.toISOString() },
        resourceId: r.id,
        after: { deck_version: dv.version },
        payload: { project_id: project.id, deck_version: dv.version, submission_id: sub[0]?.id ?? null },
      };
    }),
  );
  return { data: result, receipt: { id: `DECKPUB-${project.slug}-v${result.version}`, server_time: result.publishedAt } };
}

// ── Public reads ─────────────────────────────────────────────────────────────

export type PublishedDeck = { story: PublicStory; deck: Deck; deckVersion: number; publishedVersion: number; publishedAt: string; projectId: number };

/** The latest published deck for /ship/[slug]/deck, rendered with the published Ship Page story. */
export async function getPublishedDeck(slug: string): Promise<PublishedDeck | null> {
  const page = await getPublishedStory(slug);
  if (!page || !page.story.hasDeck) return null;
  const [pub] = await query<{ version: number; published_at: Date; source_deck_id: number | null; state: string }>(
    "select version, published_at, source_deck_id, state from published_assets where project_id = $1 and kind = 'deck' order by version desc limit 1",
    [page.projectId],
  );
  if (!pub?.source_deck_id || pub.state === "hidden_by_moderation" || pub.state === "draft") return null;
  const [row] = await query<DeckRow>(`select ${DECK_COLS} from deck_versions where id = $1`, [pub.source_deck_id]);
  if (!row) return null;
  const dv = toDeckVersion(row);
  return { story: page.story, deck: dv.deck, deckVersion: dv.version, publishedVersion: pub.version, publishedAt: pub.published_at.toISOString(), projectId: page.projectId };
}

/** QR for the Ship Page URL as SVG markup (dark on light). */
export async function shipQrSvg(slug: string) {
  return QRCode.toString(siteUrl(`/ship/${slug}`), { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#f2f2f2" } });
}

// ── Render jobs (T-DECK-05 / T-DECK-08 / T-VID-02) ───────────────────────────

export type RenderJob = {
  id: number;
  kind: string;
  status: string;
  sourceVersion: string;
  errorCode: string | null;
  url: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** Plain-words status for people and agents. */
  note: string;
};

type JobRow = { id: number; project_id: number; kind: string; status: string; source_version: string; error_code: string | null; object_key: string | null; created_at: Date; finished_at: Date | null };

function toJob(r: JobRow, slug: string): RenderJob {
  const notes: Record<string, string> = {
    browser_print: `No server PDF renderer is deployed. Open the presenter with ?print=1 and use your browser's Print → Save as PDF (one slide per page).`,
    pptx_unavailable: "PPTX export is unavailable: no converter has been verified to produce editable slides. Use PDF (browser print) or the HTML deck.",
    mp4_unavailable: "MP4 rendering is unavailable. Upload your own edited recording, or present the storyboard / HTML deck. No penalty.",
  };
  const note =
    (r.error_code && notes[r.error_code]) ??
    (r.status === "succeeded" ? "Ready." : r.status === "failed" ? "The render failed. The HTML deck still works." : r.status === "queued" || r.status === "running" ? "Rendering." : "Cancelled.");
  const url = r.error_code === "browser_print" ? `/ship/${slug}/deck?print=1` : r.object_key;
  return { id: r.id, kind: r.kind, status: r.status, sourceVersion: r.source_version, errorCode: r.error_code, url, createdAt: r.created_at.toISOString(), finishedAt: r.finished_at?.toISOString() ?? null, note };
}

const renderInput = z.object({
  format: z.enum(["pdf", "pptx", "mp4"]).default("pdf"),
  version: z.coerce.number().int().positive().optional(),
});

/**
 * demo_generate / POST /decks/{id}/render. Records the request with an honest
 * status: PDF → browser print (job 'cancelled', error_code 'browser_print'),
 * PPTX/MP4 → unavailable. Idempotent per (project, format, version), so a
 * retry returns the same job. Never blocks submission.
 */
export async function requestRender(access: ProjectAccess, input: unknown): Promise<{ data: RenderJob; receipt: Receipt }> {
  requireWrite(access);
  const { format, version } = parse(renderInput, input);
  const { project, actor } = access;
  const dv = format === "mp4" ? null : await getDeckVersion(project.id, version);
  if (format !== "mp4" && !dv) throw new AppError("NOT_FOUND", { userMessage: "Save a deck version first." });
  const sourceVersion = format === "mp4" ? "video:latest" : `deck:v${dv!.version}:${sha256(JSON.stringify(dv!.deck)).slice(0, 12)}`;
  const kind = format === "pdf" ? "pdf_deck" : format === "mp4" ? "mp4_video" : "html_deck";
  const errorCode = format === "pdf" ? "browser_print" : format === "pptx" ? "pptx_unavailable" : "mp4_unavailable";
  const key = `${kind}:${format}:${project.id}:${sourceVersion}`;

  const job = await withAudit(actor, "render.request", "render_job", async (tx) => {
    const { rows } = await tx.query<JobRow>(
      `insert into render_jobs (project_id, source_version, kind, status, error_code, attempt_count, idempotency_key, finished_at)
       values ($1, $2, $3, 'cancelled', $4, 0, $5, now())
       on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
       returning id, project_id, kind, status, source_version, error_code, object_key, created_at, finished_at`,
      [project.id, sourceVersion, kind, errorCode, key],
    );
    return { result: rows[0], resourceId: rows[0].id, payload: { project_id: project.id, format, source_version: sourceVersion } };
  });
  return { data: toJob(job, project.slug), receipt: { id: `R-${job.id}`, server_time: (await serverNow()).toISOString() } };
}

/** GET /renders/{id}: team members (or organizer staff) of the job's project. */
export async function getRenderJob(jobId: number, authorize: (projectId: number) => Promise<ProjectAccess>) {
  const [r] = await query<JobRow>("select id, project_id, kind, status, source_version, error_code, object_key, created_at, finished_at from render_jobs where id = $1", [jobId]);
  if (!r) throw new AppError("NOT_FOUND");
  const access = await authorize(r.project_id);
  return toJob(r, access.project.slug);
}

export async function listRenderJobs(projectId: number, slug: string) {
  const rows = await query<JobRow>(
    "select id, project_id, kind, status, source_version, error_code, object_key, created_at, finished_at from render_jobs where project_id = $1 order by id desc limit 20",
    [projectId],
  );
  return rows.map((r) => toJob(r, slug));
}

// ── Level-3 custom HTML (T-DECK-07) ───────────────────────────────────────────

export const CUSTOM_HTML_MAX = 200_000;

export async function getCustomHtml(projectId: number) {
  const [r] = await query<{ custom_html: string | null; custom_html_sha256: string | null; custom_html_updated_at: Date | null }>(
    "select custom_html, custom_html_sha256, custom_html_updated_at from studio_settings where project_id = $1",
    [projectId],
  ).catch(() => []);
  return r?.custom_html ? { html: r.custom_html, sha: r.custom_html_sha256, updatedAt: r.custom_html_updated_at?.toISOString() ?? null } : null;
}

/**
 * Store (or clear, with html = "") the team's custom deck HTML. It is only
 * ever shown in the studio's sandboxed iframe (opaque origin, no cookies,
 * strict CSP); public pages keep the default deck. TODO(preview origin): serve
 * it from https://preview.kaneclihack.sh once that origin exists.
 */
export async function setCustomHtml(access: ProjectAccess, input: unknown) {
  requireWrite(access);
  const { html } = parse(z.object({ html: z.string().max(CUSTOM_HTML_MAX, "Custom HTML is limited to 200 KB") }), input);
  const clean = html.trim();
  const sha = clean ? sha256(clean) : null;
  await withAudit(access.actor, clean ? "deck.custom_html.set" : "deck.custom_html.restore_default", "project", async (tx) => {
    await tx.query(
      `insert into studio_settings (project_id, custom_html, custom_html_sha256, custom_html_updated_at, updated_by) values ($1, $2, $3, now(), $4)
       on conflict (project_id) do update set custom_html = excluded.custom_html, custom_html_sha256 = excluded.custom_html_sha256,
         custom_html_updated_at = now(), updated_by = excluded.updated_by, updated_at = now()`,
      [access.project.id, clean || null, sha, access.member.id],
    );
    return { result: null, resourceId: access.project.id, after: { sha }, payload: { bytes: clean.length } };
  });
  return { data: { sha, cleared: !clean }, receipt: { id: `HTML-${access.project.id}-${sha?.slice(0, 8) ?? "default"}`, server_time: (await serverNow()).toISOString() } };
}

/** Wraps participant HTML for srcdoc with a CSP that blocks network, forms and navigation. */
export function sandboxDoc(html: string) {
  const csp = "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-src 'none'; base-uri 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
}

// ── deck_get (API / MCP) ──────────────────────────────────────────────────────

export async function deckGet(access: ProjectAccess, version?: number | null) {
  const [dv, published, jobs] = await Promise.all([getDeckVersion(access.project.id, version), getLatestPublished(access.project.id, "deck"), listRenderJobs(access.project.id, access.project.slug)]);
  return {
    deck_id: access.project.id,
    version: dv?.version ?? 0,
    template: DECK_TEMPLATE,
    status: dv?.status ?? "none",
    deck: dv?.deck ?? null,
    published: published ? { version: published.version, published_at: published.publishedAt, url: siteUrl(`/ship/${access.project.slug}/deck`) } : null,
    exports: {
      html: published ? siteUrl(`/ship/${access.project.slug}/deck/offline`) : null,
      pdf: "browser print: open the presenter with ?print=1 and Save as PDF",
      pptx: "unavailable",
    },
    renders: jobs,
  };
}

// ── Offline single-file HTML (T-DECK-06) ─────────────────────────────────────

let testmuCache: string | null | undefined;

/** The authentic TestMu mark from public/logos, inlined for the offline file (null if unreadable). */
export async function testmuSvgMarkup() {
  if (testmuCache !== undefined) return testmuCache;
  try {
    const svg = await readFile(path.join(process.cwd(), "public", "logos", "testmu-ai.svg"), "utf8");
    testmuCache = svg.replace(/<\?xml[^>]*>/, "").replace(/(<svg[^>]*?)\swidth="\d+"/, "$1").replace(/(<svg[^>]*?)\sheight="\d+"/, "$1");
  } catch {
    testmuCache = null;
  }
  return testmuCache;
}

/** The TestMu mark as a data URI for next/og cards. */
export async function testmuDataUri() {
  const svg = await testmuSvgMarkup();
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg.replace("<svg ", '<svg width="1388" height="215" ')).toString("base64")}` : null;
}

/** A downloadable offline HTML response. */
export async function offlineDeckResponse(opts: { story: PublicStory; deck: Deck; slug: string; label: string; filename: string }) {
  const html = offlineDeckHtml({ story: opts.story, deck: opts.deck, qrSvg: await shipQrSvg(opts.slug), testmuSvg: await testmuSvgMarkup(), label: opts.label });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${opts.filename.replace(/[^\w.-]/g, "_")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const GROUND_CSS = {
  ink: "background:#000;color:#f2f2f2;--muted:#8a8a8a;--rule:#37383a;--accent:#daff52",
  surface: "background:#0b0b0b;color:#f2f2f2;--muted:#8a8a8a;--rule:#37383a;--accent:#daff52",
  card: "background:#f2f2f2;color:#0a0a0a;--muted:#555;--rule:#c4c4c4;--accent:#0a0a0a",
  lime: "background:#daff52;color:#0a0a0a;--muted:#3d4a10;--rule:#0a0a0a;--accent:#0a0a0a",
} as const;

/**
 * A self-contained HTML file of the deck: no network, no external fonts or
 * scripts. Arrow keys / swipe to navigate, Print → PDF (one slide per page),
 * "Edit text" toggles contenteditable, "Export JSON" downloads deck.json.
 * Remote images are left as links-with-alt, since offline they can't load.
 */
export function offlineDeckHtml(opts: { story: PublicStory; deck: Deck; qrSvg: string | null; testmuSvg: string | null; label: string }) {
  const { story, deck } = opts;
  const total = deck.slides.length;
  const conf = (c: string, failing: boolean) =>
    failing && c === "verified" ? `<span class="tag sus">? Suspected</span>` : c === "verified" ? `<span class="tag ok">✓ Verified</span>` : c === "participant_reported" ? `<span class="tag">○ Team-reported</span>` : `<span class="tag">○ Unverified</span>`;
  const items = (xs: string[], ordered = false) => (xs.length ? `<${ordered ? "ol" : "ul"} class="items">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>` : "");
  const media = (m: Deck["slides"][number]["media"]) =>
    m ? `<figure class="media"><div class="ph">${esc(m.label || "Media")}: ${esc(m.alt)}<br><small>${esc(m.src)}</small></div></figure>` : "";

  const slides = deck.slides
    .map((s, i) => {
      let body = "";
      if (s.type === "evidence") {
        body =
          (s.body ? `<p class="body">${esc(s.body)}</p>` : "") +
          (story.proof.length
            ? `<ul class="proof">${story.proof
                .slice(0, 5)
                .map(
                  (p) =>
                    `<li>${conf(p.confidence, !!p.run && p.run.status !== "passed")}<span>${esc(p.claim)}<small>${esc(
                      [p.run_id && `run ${p.run_id}`, p.evidence_id && `evidence ${p.evidence_id}`, p.commit_sha && `commit ${p.commit_sha.slice(0, 10)}`, p.source].filter(Boolean).join(" · "),
                    )}</small></span></li>`,
                )
                .join("")}</ul>`
            : `<p class="body muted">No verified Kane evidence is attached to this story yet.</p>`) +
          (s.items.length ? `<p class="muted small">Not yet verified: ${esc(s.items.join(" · "))}</p>` : "");
      } else if (s.type === "outcome") {
        body =
          `<div class="row"><div class="grow">` +
          (s.body ? `<p class="body lg">${esc(s.body)}</p>` : "") +
          story.impact
            .slice(0, 3)
            .map((im) =>
              im.measured
                ? `<p class="body"><b class="num">${esc(im.measure)}${im.unit ? " " + esc(im.unit) : ""}</b> ${esc(im.claim)} <span class="muted">(baseline ${esc(im.baseline)}; source: ${esc(im.source)})</span></p>`
                : `<p class="body">${esc(im.claim)} <span class="muted">(qualitative)</span></p>`,
            )
            .join("") +
          s.items.map((x) => `<p class="body">${esc(x)}</p>`).join("") +
          `<p class="muted small">${esc([story.links.github, story.links.demo].filter(Boolean).join(" · "))}${story.team.length ? " · " + esc(story.team.map((t) => t.name).join(", ")) : ""}</p></div>` +
          (deck.theme.show_qr && opts.qrSvg ? `<figure class="qr"><div class="qrbox">${opts.qrSvg}</div><figcaption>${esc(story.links.shipPage.replace(/^https:\/\//, ""))}</figcaption></figure>` : "") +
          `</div>`;
      } else if (s.type === "diagram") {
        body =
          (s.body ? `<p class="body">${esc(s.body)}</p>` : "") +
          `<ol class="flow">${s.items.map((x, j) => `<li><span class="n">${String(j + 1).padStart(2, "0")}</span>${esc(x)}</li>`).join('<li class="arrow" aria-hidden="true">→</li>')}</ol>` +
          (story.harness.components.length ? `<p class="muted small">Components: ${esc(story.harness.components.join(" · "))}</p>` : "");
      } else {
        body = `<div class="row"><div class="grow">${s.body ? `<p class="body${s.type === "title" ? " lg" : ""}">${esc(s.body)}</p>` : ""}${items(s.items, s.type === "steps")}</div>${media(s.media)}</div>`;
      }
      const n = String(i + 1).padStart(2, "0");
      return `<section class="slide${s.type === "title" ? " title" : ""}" style="${GROUND_CSS[s.ground]}" data-i="${i}" aria-roledescription="slide" aria-label="Slide ${i + 1} of ${total}">
<div class="top"><p class="eyebrow">${esc(s.eyebrow || n)}</p><p class="eyebrow">Kane CLI Hack Day</p></div>
<div class="mid"><h2 data-edit>${esc(s.headline)}${s.type === "title" ? '<i class="stop"></i>' : ""}</h2>${body}</div>
<div class="bot"><p>${n} / ${String(total).padStart(2, "0")} · ${esc(story.name)}</p>${opts.testmuSvg ? `<span class="testmu" aria-label="TestMu AI">${opts.testmuSvg}</span>` : `<span>TestMu AI</span>`}</div>
${s.notes ? `<aside class="notes" hidden>${esc(s.notes)}</aside>` : ""}</section>`;
    })
    .join("\n");

  const json = JSON.stringify(deck).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(story.name)} · deck (offline)</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#000;color:#f2f2f2;font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;border-bottom:1px solid #37383a;background:#000;font-size:13px}
.bar button{min-height:44px;padding:0 14px;background:transparent;color:#f2f2f2;border:1px solid #37383a;font:inherit;cursor:pointer}
.bar button:hover,.bar button:focus-visible{border-color:#daff52;color:#daff52;outline:none}
.bar .label{margin-left:auto;color:#7e7e7e;font-size:12px}
.stage{max-width:1280px;margin:16px auto;padding:0 16px}
.slide{container-type:inline-size;position:relative;display:none;flex-direction:column;aspect-ratio:16/9;width:100%;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide.on{display:flex}
.top,.bot{display:flex;justify-content:space-between;gap:2cqw;padding:3.5cqw 5cqw 0}
.bot{padding:0 5cqw 3cqw;align-items:flex-end;font-size:1cqw;color:var(--muted)}
.eyebrow{font-size:1.1cqw;letter-spacing:.25em;text-transform:uppercase;color:var(--muted)}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;gap:2cqw;padding:0 5cqw;min-height:0}
h2{font-family:"Inter Tight",system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:700;font-size:4.4cqw;line-height:.95;letter-spacing:-.02em}
.title h2{font-size:7.5cqw}
.stop{display:inline-block;width:1.6cqw;height:1.6cqw;margin-left:.6cqw;background:var(--accent)}
.body{font-size:1.6cqw;line-height:1.45;max-width:70cqw}.body.lg{font-size:2cqw}
.muted{color:var(--muted)}.small{font-size:1.2cqw}
.items{display:grid;gap:1.2cqw;font-size:1.6cqw;line-height:1.4;padding-left:2.4cqw}
ol.items li::marker{color:var(--accent);font-weight:700}
.row{display:flex;gap:3cqw;align-items:flex-end}.grow{flex:1;min-width:0;display:grid;gap:1.2cqw}
.media{width:34cqw;flex-shrink:0;border:1px solid var(--rule)}.ph{aspect-ratio:16/9;display:flex;flex-direction:column;justify-content:center;padding:1.4cqw;font-size:1.1cqw;color:var(--muted);word-break:break-all}
.flow{display:flex;flex-wrap:wrap;gap:1cqw;list-style:none;align-items:center}
.flow li{border:1px solid currentColor;padding:1cqw 1.4cqw;font-size:1.4cqw}.flow li.arrow{border:0;padding:0;font-size:1.6cqw}.flow .n{margin-right:.8cqw;font-size:.9cqw;color:var(--muted)}
.proof{list-style:none;display:grid;gap:1cqw}.proof li{display:flex;gap:1.4cqw;align-items:flex-start;border-top:1px solid var(--rule);padding-top:1cqw;font-size:1.4cqw;line-height:1.4}
.proof small{display:block;font-size:1cqw;color:var(--muted)}
.tag{flex-shrink:0;border:1px solid #7e7e7e;border-radius:999px;padding:.15cqw .8cqw;font-size:.85cqw;letter-spacing:.15em;text-transform:uppercase;color:#9a9a9a;white-space:nowrap}
.tag.ok{border-color:#2dd4bf;background:#0b2b27;color:#2dd4bf}.tag.sus{border-style:dashed}
.num{font-size:2.4cqw}
.qr{width:14cqw;flex-shrink:0;text-align:center}.qrbox{background:#f2f2f2}.qrbox svg{display:block;width:100%;height:auto}.qr figcaption{font-size:.9cqw;margin-top:.6cqw;word-break:break-all}
.testmu svg{height:1.3cqw;width:auto;display:block}
.slide[style*="#daff52"] .testmu svg path,.slide[style*="#f2f2f2;color:#0a0a0a"] .testmu svg path{fill:#0a0a0a}
.notes{margin:12px 0;color:#7e7e7e;font-size:13px}
body.editing [data-edit]{outline:1px dashed #daff52;outline-offset:4px}
.foot{max-width:1280px;margin:0 auto 24px;padding:0 16px;color:#7e7e7e;font-size:12px;line-height:1.6}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{@page{size:13.333in 7.5in;margin:0}.bar,.foot{display:none}.stage{max-width:none;margin:0;padding:0}
.slide{display:flex!important;width:13.333in;height:7.5in;break-after:page}}
</style></head>
<body>
<div class="bar" role="toolbar" aria-label="Deck controls">
<button type="button" id="prev" aria-label="Previous slide">← Prev</button>
<button type="button" id="next" aria-label="Next slide">Next →</button>
<span id="count" aria-live="polite"></span>
<button type="button" id="present">Present</button>
<button type="button" id="edit" aria-pressed="false">Edit text</button>
<button type="button" id="notes" aria-pressed="false">Notes</button>
<button type="button" id="export">Export JSON</button>
<button type="button" id="print">Print / PDF</button>
<span class="label">${esc(opts.label)}</span>
</div>
<main class="stage">
${slides}
</main>
<p class="foot">Offline copy of the published ${esc(story.name)} deck (${DECK_TEMPLATE}). Works with no network. Live page: ${esc(story.links.shipPage)}. Evidence labels were set by the server at publish time; editing text here does not change them.</p>
<script type="application/json" id="deck-json">${json}</script>
<script>
(function(){var s=[].slice.call(document.querySelectorAll('.slide')),i=0,c=document.getElementById('count');
var h=parseInt((location.hash||'').slice(1),10);if(h>0&&h<=s.length)i=h-1;
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,j){x.classList.toggle('on',j===i)});c.textContent=(i+1)+' / '+s.length;history.replaceState(null,'','#'+(i+1))}
document.getElementById('prev').onclick=function(){go(i-1)};document.getElementById('next').onclick=function(){go(i+1)};
document.getElementById('print').onclick=function(){window.print()};
document.getElementById('present').onclick=function(){var el=document.querySelector('.stage');if(el.requestFullscreen)el.requestFullscreen()};
document.getElementById('notes').onclick=function(){var on=this.getAttribute('aria-pressed')!=='true';this.setAttribute('aria-pressed',on);document.querySelectorAll('.notes').forEach(function(n){n.hidden=!on})};
document.getElementById('edit').onclick=function(){var on=!document.body.classList.contains('editing');document.body.classList.toggle('editing',on);this.setAttribute('aria-pressed',on);document.querySelectorAll('h2[data-edit],.body').forEach(function(n){n.contentEditable=on})};
document.getElementById('export').onclick=function(){var d=JSON.parse(document.getElementById('deck-json').textContent);s.forEach(function(x,j){var h2=x.querySelector('h2');if(h2&&d.slides[j])d.slides[j].headline=h2.textContent.trim()});var b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='deck.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)};
document.addEventListener('keydown',function(e){if(e.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
if(['ArrowRight','PageDown',' '].indexOf(e.key)>=0){e.preventDefault();go(i+1)}else if(['ArrowLeft','PageUp'].indexOf(e.key)>=0){e.preventDefault();go(i-1)}else if(e.key==='Home')go(0);else if(e.key==='End')go(s.length-1)});
var x0=null;document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>50)go(i+(dx<0?1:-1));x0=null});
go(i)})();
</script>
</body></html>`;
}

// Names the MCP server (kane-mcp) registers: deck_get / deck_update / demo_generate.
export const deckUpdate = saveDeckVersion;
export const demoGenerate = requestRender;
