// Pure rules behind the public showcase (no database): run confidence, the
// story built at finalize, and the public DTO. `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blankStory, toPublicStory } from "../../src/components/ship-templates/model.ts";

test("public DTO drops unsafe visual sources and uncredited people", () => {
  const s = blankStory({ id: 1, slug: "demo", name: "Demo" });
  s.visuals = [
    { kind: "screenshot", approved: true, source: "javascript:alert(1)" },
    { kind: "screenshot", approved: true, source: "//evil.example/x.png" },
    { kind: "screenshot", approved: true, source: "https://cdn.example/x.png" },
    { kind: "screenshot", approved: false, source: "https://cdn.example/y.png" },
  ];
  s.team = [
    { display_name: "Ada", handle: "@ada", publicly_credited: true },
    { display_name: "Bob", handle: null, publicly_credited: true },
  ];
  const pub = toPublicStory(s, { shipPage: "https://x/ship/demo", credited: [{ name: "Ada", handle: null }], badges: { shipped: true, kaneVerified: false }, version: 1, publishedAt: null, hasDeck: true, preview: false });
  assert.deepEqual(pub.visuals.map((v) => v.src), ["https://cdn.example/x.png"]);
  assert.deepEqual(pub.team, [{ name: "Ada", handle: null }]);
});

test("an impact number without source and baseline reads as qualitative", () => {
  const s = blankStory({ id: 1, slug: "demo", name: "Demo" });
  s.impact = [
    { claim: "3x faster", measure: 3, unit: "x", baseline: null, source: "bench" },
    { claim: "fewer bugs", measure: 10, unit: "bugs", baseline: 20, source: "run 4" },
  ];
  const pub = toPublicStory(s, { shipPage: "", credited: [], badges: { shipped: false, kaneVerified: false }, version: null, publishedAt: null, hasDeck: false, preview: true });
  assert.equal(pub.impact[0].measured, false);
  assert.equal(pub.impact[0].measure, null);
  assert.equal(pub.impact[1].measured, true);
});
