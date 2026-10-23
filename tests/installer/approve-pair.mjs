#!/usr/bin/env node
// Approve a `kanehack pair` code the way a person does: sign in on /passport/login,
// open /pair?code=…, press Approve. It submits the real server-rendered forms the
// way a browser without JavaScript does (React's progressive-enhancement fields
// included), so it exercises the real pages and server actions, not a shortcut.
//
//   node tests/installer/approve-pair.mjs <site> <email> <password> <user_code> [approve|deny]
//
// Exits 0 when the /pair page redirects to result=approved (or denied).

const [site, email, password, code, decision = "approve"] = process.argv.slice(2);
if (!site || !email || !password || !code) {
  console.error("usage: approve-pair.mjs <site> <email> <password> <user_code> [approve|deny]");
  process.exit(2);
}
const base = site.replace(/\/$/, "");
const jar = new Map();

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name.replace(/[$]/g, "\\$")}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : null;
};

async function req(path, init = {}) {
  const headers = { ...(init.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
  const res = await fetch(new URL(path, base), { ...init, headers, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
  return res;
}

/** The first <form> whose markup contains `marker`, as { action, fields: [[name, value]] }. */
function findForm(html, marker) {
  for (const m of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
    const f = m[0];
    if (!f.includes(marker)) continue;
    const fields = [];
    for (const t of f.matchAll(/<input\b[^>]*>/g)) {
      const name = attr(t[0], "name");
      if (!name) continue;
      fields.push([name, attr(t[0], "value") ?? ""]);
    }
    return { action: attr(f.match(/<form\b[^>]*>/)[0], "action"), fields };
  }
  return null;
}

async function submit(pagePath, form, overrides) {
  const fd = new FormData();
  const seen = new Set();
  for (const [k, v] of form.fields) {
    if (k in overrides) {
      if (!seen.has(k)) fd.append(k, overrides[k]);
      seen.add(k);
    } else fd.append(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) if (!seen.has(k)) fd.append(k, v);
  const target = form.action && !form.action.startsWith("javascript:") ? form.action : pagePath;
  return req(target, { method: "POST", body: fd });
}

const pairPath = `/pair?code=${encodeURIComponent(code)}`;
const loginPath = `/passport/login?next=${encodeURIComponent(pairPath)}`;

// 1. Sign in.
let html = await (await req(loginPath)).text();
const login = findForm(html, 'name="password"');
if (!login) throw new Error("approve-pair: no password sign-in form on /passport/login");
let res = await submit(loginPath, login, { email, password });
if (res.status >= 400) throw new Error(`approve-pair: sign-in POST answered HTTP ${res.status}`);
if (![...jar.keys()].length) throw new Error(`approve-pair: sign-in set no cookie (HTTP ${res.status}); wrong password?`);

// 2. Open the pairing page and press the button.
html = await (await req(pairPath)).text();
const form = findForm(html, 'name="decision"');
if (!form) throw new Error(`approve-pair: /pair shows no Approve form for ${code} (expired, used, or not signed in)`);
res = await submit(pairPath, form, { decision });
const loc = res.headers.get("location") ?? "";
let final = loc;
if (!loc) {
  // Some Next versions answer a no-JS action with the rendered page (200) instead of a 303.
  final = res.url;
  const body = await res.text();
  if (/Approved|Denied/.test(body)) final += `&result=${decision === "approve" ? "approved" : "denied"}`;
}
const want = decision === "approve" ? "result=approved" : "result=denied";
if (!final.includes(want)) throw new Error(`approve-pair: expected a redirect with ${want}, got HTTP ${res.status} ${final || "(no location)"}`);
console.log(`approve-pair: ${code} ${decision}d as ${email}`);
