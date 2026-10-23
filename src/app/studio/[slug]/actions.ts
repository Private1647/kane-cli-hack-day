"use server";

import { refresh } from "next/cache";
import { runAction, type ActionResult } from "@/server/core";
import { publishDeck, requestRender, saveDeckVersion, setCustomHtml } from "@/server/deck";
import { approveKit, generateKit, saveKit, saveVideoPlan } from "@/server/gtm";
import { authorizeStudio, publishShowcase, saveStory, setShipTemplate } from "@/server/story";

// Thin wrappers: every check (team scope, validation, concurrency, consent,
// audit) lives in the service functions in src/server/{story,deck,gtm}.ts.

const write = (slug: string) => authorizeStudio(slug, { write: true });

/** Re-render the page's server data after a successful change. */
async function done<T>(r: Promise<ActionResult<T>>) {
  const out = await r;
  if (out.ok) refresh();
  return out;
}

// ── Story ────────────────────────────────────────────────────────────────────

export async function saveStoryAction(slug: string, content: unknown, expectedVersion: number, idempotencyKey: string) {
  return done(runAction(async () => saveStory(await write(slug), { content, expected_version: expectedVersion, idempotency_key: idempotencyKey })));
}

export type PublishState = ActionResult<{ version: number }> | null;

export async function publishShowcaseAction(_prev: PublishState, form: FormData): Promise<PublishState> {
  const slug = String(form.get("slug") ?? "");
  return done(
    runAction(async () => {
      const r = await publishShowcase(await write(slug), {
        story_version: form.get("story_version"),
        confirm_phrase: form.get("confirm_phrase") ?? "",
        idempotency_key: form.get("idempotency_key") || undefined,
      });
      return { data: { version: r.data.version }, receipt: r.receipt };
    }),
  );
}

export async function setTemplateAction(slug: string, template: string) {
  return done(runAction(async () => setShipTemplate(await write(slug), { template })));
}

// ── Deck ─────────────────────────────────────────────────────────────────────

export async function saveDeckAction(slug: string, deck: unknown, expectedVersion: number, reason: string, idempotencyKey: string) {
  return done(runAction(async () => saveDeckVersion(await write(slug), { deck, expected_version: expectedVersion, reason, idempotency_key: idempotencyKey })));
}

export async function publishDeckAction(slug: string, version: number, confirmPhrase: string, idempotencyKey: string) {
  return done(runAction(async () => publishDeck(await write(slug), { version, confirm_phrase: confirmPhrase, idempotency_key: idempotencyKey })));
}

export async function requestRenderAction(slug: string, format: "pdf" | "pptx" | "mp4", version?: number) {
  return done(runAction(async () => requestRender(await write(slug), { format, version })));
}

export async function setCustomHtmlAction(slug: string, html: string) {
  return done(runAction(async () => setCustomHtml(await write(slug), { html })));
}

// ── Video ────────────────────────────────────────────────────────────────────

export async function saveVideoAction(slug: string, plan: unknown, expectedVersion: number) {
  return done(runAction(async () => saveVideoPlan(await write(slug), { plan, expected_version: expectedVersion })));
}

// ── GTM kit ──────────────────────────────────────────────────────────────────

export async function generateKitAction(slug: string, idempotencyKey: string) {
  return done(runAction(async () => generateKit(await write(slug), { idempotency_key: idempotencyKey })));
}

export async function saveKitAction(slug: string, draft: unknown) {
  return done(runAction(async () => saveKit(await write(slug), draft)));
}

export async function approveKitAction(slug: string) {
  return done(runAction(async () => approveKit(await write(slug))));
}
