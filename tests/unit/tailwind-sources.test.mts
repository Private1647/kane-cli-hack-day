// Tailwind's automatic source scan must skip kane-cli's working folder: evidence
// packs there are written and replaced while `next dev` runs, and a scan that
// hits one mid-seal fails the whole CSS build (every page 500s).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

test("globals.css excludes .testmuai from Tailwind's source scan", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const m = css.match(/@source\s+not\s+"([^"]+)"/);
  assert.ok(m, "an @source not rule is present");
  const target = path.resolve(process.cwd(), "src/app", m[1]);
  assert.equal(target, path.resolve(process.cwd(), ".testmuai"));
  assert.ok(css.indexOf("@source not") > css.indexOf('@import "tailwindcss"'), "after the tailwind import");
  assert.ok(existsSync(path.join(process.cwd(), "src/app")));
});
