#!/usr/bin/env node
// kanehack: the Kane CLI Hack Day helper. No dependencies, Node >= 18.17.
//
//   kanehack pair [--token khk_…]          pair this machine with your account (token in ~/.kanehack/config.json, mode 600)
//   kanehack doctor [--json] [--report]    check Node, Git, Chrome, Kane CLI, auth, skills, API; optionally send the result
//   kanehack report [opts] -- <kane-cli …> run a Kane command, keep its exit code + NDJSON, send a redacted summary
//   kanehack status                        your team's latest runs
//   kanehack help "<what's wrong>"         open a mentor ticket   (kanehack help --status H-0042)
//   kanehack submit --preflight            what's missing before you can submit
//   kanehack consent yes|no                allow / stop sending run summaries
//   kanehack hook status|enable|disable    the optional lifecycle hook (off; see plugin/hooks/README.md)
//
// The server decides what a run proves. This tool never marks anything as
// passed: it forwards the real exit code and the real stream.

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, platform, arch, hostname } from "node:os";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { redactText, typedOnly } from "../lib/redact.mjs";
import { scan } from "../lib/stream.mjs";

const VERSION = "0.1.1";
const DIR = join(homedir(), ".kanehack");
const CONFIG = join(DIR, "config.json");
const MAX_NDJSON = 1_900_000;
const MAX_DIRECT_EVIDENCE = 4 * 1024 * 1024;

// ── config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  let c = {};
  try {
    c = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch {}
  return {
    api: (process.env.KANEHACK_API || c.api || "https://kaneclihack.sh").replace(/\/$/, ""),
    token: process.env.KANEHACK_TOKEN || c.token || null,
    consent: c.consent ?? null,
    raw: c,
  };
}

function saveConfig(patch) {
  const cur = loadConfig().raw;
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG, JSON.stringify({ ...cur, ...patch }, null, 2), { mode: 0o600 });
  try {
    chmodSync(CONFIG, 0o600);
  } catch {}
}

// ── output ───────────────────────────────────────────────────────────────────

const tty = process.stderr.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (s) => c("32", s);
const warn = (s) => c("33", s);
const bad = (s) => c("31", s);
const dim = (s) => c("2", s);
// Human output goes to stderr so stdout can stay the Kane NDJSON stream.
const say = (...a) => console.error(...a);

function fail(msg, code = 1) {
  say(bad(`kanehack: ${msg}`));
  process.exit(code);
}

function args(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      out.rest = argv.slice(i + 1);
      break;
    }
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) out.flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) out.flags[k] = argv[++i];
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function api(cfg, path, init = {}) {
  const headers = { "user-agent": `kanehack/${VERSION} (${platform()} ${arch()})`, ...(init.headers || {}) };
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  let res;
  try {
    // Follow redirects ourselves: fetch drops Authorization when one changes host, and
    // kaneclihack.sh ⇄ www.kaneclihack.sh is a host change. Only within the same site.
    let url = `${cfg.api}${path}`;
    for (let hops = 0; ; hops++) {
      res = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(init.timeout ?? 30_000) });
      const next = res.status >= 300 && res.status < 400 && res.headers.get("location");
      if (!next || hops >= 3) break;
      const to = new URL(next, url);
      if (to.protocol !== "https:" && to.hostname !== "localhost") break;
      if (to.hostname.replace(/^www\./, "") !== new URL(url).hostname.replace(/^www\./, "")) break;
      url = to.toString();
    }
  } catch (e) {
    return { ok: false, status: 0, env: null, error: `Can't reach ${cfg.api} (${e.name}).` };
  }
  const env = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, env };
}

const json = (body, key) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
  body: JSON.stringify(body),
});

/** Call one MCP tool over Streamable HTTP and return its envelope. */
async function tool(cfg, name, argsObj) {
  const r = await api(cfg, "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: argsObj } }),
  });
  if (r.status === 401) fail("Not paired (or the token was revoked). Run: kanehack pair", 2);
  const text = r.env?.result?.content?.[0]?.text;
  if (!text) fail(r.error || r.env?.error?.message || `MCP call failed (HTTP ${r.status}).`);
  return JSON.parse(text);
}

function printEnvelope(env) {
  const line = env.status === "error" ? bad : env.status === "ok" ? (s) => s : warn;
  say(line(env.fallback?.text || env.message));
  for (const w of env.warnings || []) say(warn(`! ${w}`));
  for (const l of env.links || []) say(dim(`→ ${l.label}: ${l.url}`));
}

function needToken(cfg) {
  if (!cfg.token) fail("This machine isn't paired yet. Run: kanehack pair", 2);
}

// ── commands ─────────────────────────────────────────────────────────────────

async function pair(a) {
  const cfg = loadConfig();
  if (a.flags.api) cfg.api = String(a.flags.api).replace(/\/$/, "");
  if (a.flags.token) {
    const token = String(a.flags.token).trim();
    if (!/^khk_[A-Za-z0-9_-]{20,}$/.test(token)) fail("That doesn't look like a kanehack token (khk_…).");
    const r = await api({ ...cfg, token }, "/api/v1/kane/runs?limit=1");
    if (r.status === 401) fail("The server rejected that token. Create a new one from your passport.");
    if (r.status === 0) fail(r.error);
    saveConfig({ token, api: cfg.api });
    say(ok("Paired."), dim(`Token saved in ${CONFIG} (mode 600).`));
    if (r.status === 403) say(warn("You're not on a team yet: join or create one before reporting runs."));
    return;
  }
  // Device flow: the browser (signed in) approves a short code; we poll for the token.
  const label = `kanehack on ${hostname().slice(0, 40)} (${platform()})`;
  const start = await api(cfg, "/api/v1/pair/start", json({ label, client: "kanehack", client_version: VERSION }, randomUUID()));
  if (start.status === 404 || start.status === 0) {
    say(warn("Device pairing isn't available right now."));
    say(`Create a token in your passport: ${cfg.api}/passport  then run: kanehack pair --token khk_…`);
    process.exit(2);
  }
  const d = start.env?.data;
  if (!start.ok || !d?.pair_code || !d?.poll_token) fail(start.env?.message || `Pairing failed (HTTP ${start.status}).`);
  say(`Open ${c("1", d.approve_url || `${cfg.api}/pair`)} and enter code ${c("1", d.pair_code)}`);
  say(dim(`Waiting for approval (expires ${d.expires_at ?? "in 10 minutes"})…`));
  const interval = Math.max(2, Number(d.interval) || 3) * 1000;
  const until = d.expires_at ? Date.parse(d.expires_at) : Date.now() + 10 * 60_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, interval));
    const r = await api(cfg, "/api/v1/pair/confirm", json({ poll_token: d.poll_token }));
    const token = r.env?.data?.token;
    if (r.ok && token) {
      saveConfig({ token, api: cfg.api });
      say(ok("Paired."), dim(`Token saved in ${CONFIG} (mode 600).`));
      say(dim(`For your agent: export KANEHACK_TOKEN=${token}`));
      return;
    }
    if (r.status === 410 || r.env?.error?.code === "PAIR_EXPIRED") fail("The code expired. Run kanehack pair again.");
    if (r.status >= 400 && r.status !== 425 && r.status !== 428 && r.env?.status === "error" && r.env?.error?.code !== "NOT_APPROVED") fail(r.env.message);
  }
  fail("Timed out waiting for approval. Run kanehack pair again.");
}

function probe(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", timeout: opts.timeout ?? 15_000, shell: platform() === "win32" });
  if (r.error) return { found: false, code: null, out: "" };
  return { found: true, code: r.status, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

function chromePresent() {
  const p = platform();
  const paths =
    p === "darwin"
      ? ["/Applications/Google Chrome.app", join(homedir(), "Applications/Google Chrome.app")]
      : p === "win32"
        ? [join(process.env["PROGRAMFILES"] || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"), join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"), join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")]
        : [];
  if (paths.some((x) => x && existsSync(x))) return true;
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].some((b) => probe(b, ["--version"]).code === 0);
}

async function doctor(a) {
  const cfg = loadConfig();
  const checks = [];
  const add = (id, status, version, detail, fix) => checks.push({ id, status, ...(version ? { version } : {}), ...(detail ? { detail } : {}), fix });

  add("os", "pass", `${platform()}-${arch()}`);
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 18 ? "pass" : "fail", process.versions.node, null, "Install Node 18 or newer from https://nodejs.org");
  const git = probe("git", ["--version"]);
  add("git", git.code === 0 ? "pass" : "fail", git.out.replace("git version ", "").slice(0, 30) || null, null, "Install Git from https://git-scm.com");
  add("chrome", chromePresent() ? "pass" : "fail", null, null, "Install Google Chrome; Kane drives a real browser");
  const kane = probe("kane-cli", ["--version"]);
  add("kane_cli", kane.code === 0 ? "pass" : "fail", kane.out.split("\n")[0]?.slice(0, 40) || null, null, "npm i -g @testmuai/kane-cli");
  if (kane.code === 0) {
    const who = probe("kane-cli", ["whoami"], { timeout: 20_000 });
    add("kane_auth", who.code === 0 ? "pass" : "fail", null, null, "kane-cli login");
  } else add("kane_auth", "skipped", null, "kane-cli not installed", "Install Kane CLI first");
  const skillDirs = [".claude/skills/kane-cli", ".agents/skills/kane-cli", ".codex/skills/kane-cli", ".gemini/skills/kane-cli"].map((d) => join(homedir(), d));
  add("kane_skill", skillDirs.some((d) => existsSync(join(d, "SKILL.md"))) ? "pass" : "warn", null, null, "npx @testmuai/kane-cli-skill");
  const pluginDirs = [join(process.cwd(), ".agents/skills/hack-onboard"), join(homedir(), ".agents/skills/hack-onboard"), join(homedir(), ".claude/skills/hack-onboard"), join(homedir(), ".codex/skills/hack-onboard")];
  add("plugin", pluginDirs.some((d) => existsSync(join(d, "SKILL.md"))) ? "pass" : "warn", null, null, "Re-run the installer to add the hack-* skills: curl -fsSL https://kaneclihack.sh/install.sh | sh");
  if (!cfg.token) add("api", "warn", null, "not paired", "kanehack pair");
  else {
    const r = await api(cfg, "/api/v1/kane/runs?limit=1", { timeout: 10_000 });
    add("api", r.status === 200 || r.status === 403 ? "pass" : "fail", null, r.status === 0 ? "unreachable" : `HTTP ${r.status}`, r.status === 401 ? "kanehack pair (token rejected)" : "Check your network, then try again");
  }

  if (a.flags.json) process.stdout.write(JSON.stringify({ version: VERSION, checks }, null, 2) + "\n");
  else
    for (const ch of checks) {
      const mark = ch.status === "pass" ? ok("✓") : ch.status === "fail" ? bad("✗") : warn("!");
      say(`${mark} ${ch.id.padEnd(11)} ${ch.version ?? ""}${ch.detail ? dim(` (${ch.detail})`) : ""}${ch.status === "pass" ? "" : dim(`  → ${ch.fix}`)}`);
    }
  if (a.flags.report) {
    needToken(cfg);
    const env = await tool(cfg, "readiness_report", { checks: checks.map(({ fix, ...rest }) => (void fix, rest)) });
    printEnvelope(env);
  }
  process.exitCode = checks.some((x) => x.status === "fail") ? 1 : 0;
}

const KIND_BY_EXT = { zip: "zip", png: "screenshot", jpg: "screenshot", jpeg: "screenshot", webp: "screenshot", mp4: "video", webm: "video", ndjson: "ndjson", jsonl: "ndjson", json: "report", pdf: "report", html: "report", md: "testmd", log: "log", txt: "log" };

async function askConsent(cfg) {
  if (cfg.consent === true) return true;
  if (cfg.consent === false) return false;
  if (!process.stdin.isTTY) {
    say(warn("Not sending: run summaries need your OK once. Run `kanehack consent yes` (or `no`)."));
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const a = (await rl.question("Send a redacted summary of Kane runs (exit code, status, test names; no secrets, no local paths) to your team's Proof tab? [y/N] ")).trim().toLowerCase();
  rl.close();
  const yes = a === "y" || a === "yes";
  saveConfig({ consent: yes });
  return yes;
}

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const sha = r.status === 0 ? r.stdout.trim() : null;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return { sha: null, dirty: false };
  const s = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  return { sha, dirty: s.status === 0 && s.stdout.trim().length > 0 };
}

async function report(a) {
  const cmd = a.rest;
  if (!cmd?.length) fail('Usage: kanehack report [--evidence pack.zip] [--objective "…"] -- kane-cli run "…" --agent');
  const cfg = loadConfig();

  // Run Kane exactly as given; stdout is passed through untouched and captured.
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ["inherit", "pipe", "inherit"], shell: platform() === "win32" });
  const chunks = [];
  child.stdout.on("data", (b) => {
    chunks.push(b);
    process.stdout.write(b);
  });
  const exit = await new Promise((resolve) => {
    child.on("error", (e) => resolve({ code: null, error: e }));
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  if (exit.error) fail(`Couldn't start ${cmd[0]}: ${exit.error.code ?? exit.error.message}`, 127);
  // Killed by a signal: Kane didn't exit on its own → treat as cancelled (3).
  const exitCode = exit.code ?? 3;
  const raw = Buffer.concat(chunks).toString("utf8");
  const s = scan(raw);

  say("");
  say(`${exitCode === 0 && s.terminal ? ok("●") : exitCode === 1 ? warn("●") : bad("●")} exit ${exitCode}${s.terminal ? ` · ${s.terminal}` : bad(" · no completion event (not a pass)")}${s.oneLiner ? ` · ${s.oneLiner}` : ""}`);
  if (s.totals) say(dim(`  ${s.totals.tests ?? "?"} tests · ${s.totals.passed ?? "?"} passed · ${s.totals.failed ?? "?"} failed`));
  for (const f of s.failures.slice(0, 5)) say(warn(`  ✗ ${f.path}: ${f.message ?? f.status} (a detection, not yet a confirmed bug)`));

  if (a.flags["no-upload"]) return process.exit(exitCode);
  if (!cfg.token) {
    say(warn("Not reported: this machine isn't paired. Run `kanehack pair`, or log the run by hand on your Proof tab."));
    return process.exit(exitCode);
  }
  if (!(await askConsent(cfg))) return process.exit(exitCode);

  let ndjson = redactText(raw);
  if (ndjson.length > MAX_NDJSON) ndjson = typedOnly(ndjson).slice(-MAX_NDJSON);
  const git = gitHead();
  const commit = a.flags.commit ? String(a.flags.commit) : git.sha;
  if (git.dirty && !a.flags.commit) say(warn("! Uncommitted changes: the run is tied to HEAD, which isn't exactly what ran."));

  let evidenceSha = null;
  let evidencePath = null;
  if (a.flags.evidence) {
    evidencePath = String(a.flags.evidence);
    if (!existsSync(evidencePath)) fail(`No such evidence file: ${evidencePath}`);
    evidenceSha = createHash("sha256").update(readFileSync(evidencePath)).digest("hex");
  }

  const family = s.family === "unknown" ? (cmd.includes("testrun") ? "testrun" : cmd.includes("testmd") ? "testmd" : cmd.includes("cover") ? "cover" : "run") : s.family;
  const execId = s.executionId || s.sessionId || `kanehack-${randomUUID()}`;
  const objective = a.flags.objective ? String(a.flags.objective) : objectiveFrom(cmd, family);
  const payload = {
    source_execution_id: execId,
    exit_code: exitCode,
    command: ["run", "testmd", "testrun", "cover"].includes(family) ? family : family === "assurance" ? "cover" : "other",
    ...(objective ? { objective: objective.slice(0, 500) } : {}),
    ...(commit && /^[0-9a-f]{40}$/.test(commit) ? { commit_sha: commit } : {}),
    ...(evidenceSha ? { evidence_sha256: evidenceSha } : {}),
    ndjson,
  };
  const r = await api(cfg, "/api/v1/kane/runs", { ...json(payload, `kanehack:${execId}:${exitCode}`), timeout: 60_000 });
  if (!r.env) {
    say(bad(`Report failed (${r.error ?? `HTTP ${r.status}`}). Your run still happened; keep the evidence and log it on the Proof tab.`));
    return process.exit(exitCode);
  }
  printEnvelope(r.env);

  const runId = r.env.data?.run_id;
  if (evidencePath && runId) {
    const size = statSync(evidencePath).size;
    if (size > MAX_DIRECT_EVIDENCE) say(warn(`! ${basename(evidencePath)} is over 4 MB: upload it on the Proof tab (it'll be matched by sha256).`));
    else {
      const kind = KIND_BY_EXT[extname(evidencePath).slice(1).toLowerCase()] || "other";
      const form = new FormData();
      form.set("file", new Blob([readFileSync(evidencePath)]), basename(evidencePath));
      form.set("kind", kind);
      form.set("run_id", String(runId));
      form.set("sha256", evidenceSha);
      const e = await api(cfg, "/api/v1/kane/evidence", { method: "POST", body: form, timeout: 120_000 });
      if (e.env) printEnvelope(e.env);
      else say(bad(`Evidence upload failed (${e.error ?? `HTTP ${e.status}`}). Upload it on the Proof tab.`));
    }
  }
  process.exit(exitCode);
}

function objectiveFrom(cmd, family) {
  // kane-cli run "<objective>" … → the objective; testmd/testrun → the file or selection.
  const i = cmd.findIndex((x) => x === "run");
  const next = i >= 0 ? cmd[i + 1] : null;
  if (next && !next.startsWith("-")) return family === "testmd" || family === "testrun" ? basename(next) : next;
  return null;
}

async function status() {
  const cfg = loadConfig();
  needToken(cfg);
  const r = await api(cfg, "/api/v1/kane/runs?limit=10");
  if (!r.env) fail(r.error ?? `HTTP ${r.status}`);
  if (r.env.status === "error") return printEnvelope(r.env);
  for (const run of r.env.data?.runs ?? []) {
    const v = run.source_verified ? ok("VERIFIED") : run.verification_state === "manual_unverified" ? dim("manual") : warn("unverified");
    say(`KR-${run.id}  ${String(run.status).padEnd(9)} exit ${run.exit_code ?? "—"}  ${v}  ${dim(run.commit_sha?.slice(0, 7) ?? "")}  ${run.objective ?? ""}`);
  }
  for (const l of r.env.links ?? []) say(dim(`→ ${l.url}`));
}

async function help(a) {
  const cfg = loadConfig();
  needToken(cfg);
  if (a.flags.status) return printEnvelope(await tool(cfg, "help_get_status", { ticket_id: String(a.flags.status) }));
  const summary = a._.slice(1).join(" ").trim();
  if (summary.length < 5) fail('Usage: kanehack help "what is wrong, in a sentence" [--category kane_cli] [--priority high]');
  const env = await tool(cfg, "help_create", {
    category: String(a.flags.category || "kane_cli"),
    safe_summary: redactText(summary).slice(0, 300),
    ...(a.flags.tried ? { tried: redactText(String(a.flags.tried)).slice(0, 1000) } : {}),
    ...(a.flags.run ? { run_id: String(a.flags.run) } : {}),
    priority: String(a.flags.priority || "normal"),
    idempotency_key: `kanehack-help-${createHash("sha256").update(summary).digest("hex").slice(0, 24)}`,
  });
  printEnvelope(env);
}

async function submit(a) {
  const cfg = loadConfig();
  needToken(cfg);
  if (!a.flags.preflight) {
    say("Finalizing needs your explicit confirmation, so it happens on the Submit tab or through your agent (submission_finalize).");
    say("Run `kanehack submit --preflight` to see what's missing.");
    process.exit(2);
  }
  const env = await tool(cfg, "submission_preflight", {});
  printEnvelope(env);
  process.exitCode = env.data?.ready ? 0 : 1;
}

function consent(a) {
  const v = a._[1];
  if (v !== "yes" && v !== "no") fail("Usage: kanehack consent yes|no");
  saveConfig({ consent: v === "yes" });
  say(v === "yes" ? ok("Run summaries will be sent when you use kanehack report.") : "kanehack report will no longer send anything.");
}

function hook(a) {
  const sub = a._[1] || "status";
  if (sub === "status") return say("Lifecycle hook: off. (It's optional and not available yet; see plugin/hooks/README.md.)");
  if (sub === "disable") return say("Lifecycle hook: off.");
  if (sub === "enable") fail("The lifecycle hook isn't available yet: its endpoint must ship with the same redaction and consent checks first. Nothing was enabled.", 2);
  if (sub === "emit") return; // no-op until the endpoint exists
  fail("Usage: kanehack hook status|enable|disable");
}

function usage() {
  console.log(`kanehack ${VERSION}: Kane CLI Hack Day helper

  kanehack pair [--token khk_…]          pair this machine (device code, or paste a token from your passport)
  kanehack doctor [--json] [--report]    check your setup; --report sends statuses + versions (no paths, no env)
  kanehack report [--evidence FILE] [--objective TEXT] [--commit SHA] [--no-upload] -- <kane-cli command>
                                         run Kane, keep its exit code + NDJSON, send a redacted summary
  kanehack status                        your team's latest runs
  kanehack help "<what's wrong>" [--category kane_cli|auth|…] [--priority low|normal|high]
  kanehack help --status H-0042
  kanehack submit --preflight            what's missing before you can submit
  kanehack consent yes|no                allow / stop sending run summaries
  kanehack hook status|enable|disable    optional lifecycle hook (off)

Server: ${loadConfig().api}   Config: ${CONFIG}
Kane CLI syntax: the official skill, npx @testmuai/kane-cli-skill`);
}

const a = args(process.argv.slice(2));
const cmd = a._[0];
const run = { pair, doctor, report, status, help, submit, consent, hook }[cmd];
if (!cmd || a.flags.help || a.flags.h || cmd === "--help") usage();
else if (a.flags.version || cmd === "version") console.log(VERSION);
else if (!run) {
  usage();
  process.exit(2);
} else
  Promise.resolve(run(a)).catch((e) => {
    say(bad(`kanehack: ${e?.message ?? e}`));
    process.exit(1);
  });
