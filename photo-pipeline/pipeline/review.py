"""Review queue: a single local page (Flask) at http://127.0.0.1:REVIEW_PORT.

The page polls /api/state every few seconds and renders cards client-side, never touching a card
you are editing. All mutating endpoints require a JSON body, which a cross-site form cannot send,
so other websites can't drive this page from your browser.
"""
from __future__ import annotations

import logging
import re

from flask import Flask, abort, jsonify, request, send_file

from . import actions
from .config import Config
from .db import DB, loads

log = logging.getLogger("review")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")


def _team_name(teams: dict, slug: str) -> str:
    return (teams.get(slug) or {}).get("name") or slug


def build_state(cfg: Config, db: DB) -> dict:
    teams = actions.known_teams(cfg)
    tags = db.all("""SELECT t.*, p.filename, p.faces_total, p.faces_used, p.note, p.created_at AS photo_created
                     FROM tags t JOIN photos p ON p.hash=t.photo_hash ORDER BY t.created_at""")
    by_photo: dict[str, list] = {}
    for t in tags:
        by_photo.setdefault(t["photo_hash"], []).append(t)

    def card(t) -> dict:
        in_frame = loads(t["members"], [])
        team = teams.get(t["team"], {})
        others = [o for o in by_photo[t["photo_hash"]]
                  if o["team"] != t["team"] and o["state"] not in ("rejected", "reassigned")]
        return {
            "hash": t["photo_hash"], "team": t["team"], "team_name": _team_name(teams, t["team"]),
            "track": team.get("track"), "idea": team.get("idea"),
            "score": t["score"], "source": t["source"], "ambiguous": bool(t["ambiguous"]),
            "runner_up": t["runner_up"], "runner_up_name": _team_name(teams, t["runner_up"]) if t["runner_up"] else None,
            "margin": t["margin"], "faces": t["faces"], "in_frame": in_frame,
            "team_members": [dict(m, consent=m.get("consent_social") is True,
                                  in_frame=m.get("consent_social") is True and m.get("name") in in_frame)
                             for m in team.get("members", [])],
            "others": [{"team": o["team"], "name": _team_name(teams, o["team"]), "score": o["score"]} for o in others],
            "state": t["state"], "publish": t["publish"], "publish_error": t["publish_error"],
            "draft_status": t["draft"], "draft_error": t["draft_error"],
            "draft": loads(t["draft_json"], None), "problems": loads(t["draft_problems"], []),
            "final": loads(t["final_json"], None), "slot": t["slot"],
            "filename": t["filename"], "created_at": t["created_at"],
        }

    review = [card(t) for t in tags if t["state"] == "review" and t["draft"] == "ready"]
    drafting = [card(t) for t in tags if t["state"] == "review" and t["draft"] != "ready"]
    approved = sorted((card(t) for t in tags if t["state"] == "approved"), key=lambda c: c["slot"] or "")
    unresolved = [dict(r) for r in db.all(
        "SELECT hash, filename, faces_total, faces_used, note, created_at FROM photos "
        "WHERE status='unresolved' ORDER BY created_at")]
    failed = [c for c in (card(t) for t in tags) if c["publish"] == "failed"]
    return {
        "teams": sorted(({"slug": s, "name": v.get("name") or s} for s, v in teams.items()),
                        key=lambda x: x["name"].lower()),
        "review": review, "drafting": drafting, "approved": approved, "unresolved": unresolved,
        "failed": failed,
        "config": {"match_threshold": cfg.match_threshold, "gallery_auto_threshold": cfg.gallery_auto_threshold,
                   "queue_csv": str(cfg.queue_csv), "slot_minutes": cfg.slot_minutes},
    }


def create_app(cfg: Config, db: DB, on_change=None) -> Flask:
    app = Flask(__name__)
    app.json.sort_keys = False
    notify = on_change or (lambda: None)

    def body() -> dict:
        if not request.is_json:
            abort(415)
        return request.get_json(silent=True) or {}

    @app.errorhandler(actions.ActionError)
    def _action_error(e):
        return jsonify({"ok": False, "error": str(e)}), 400

    @app.get("/")
    def index():
        return PAGE

    @app.get("/api/state")
    def state():
        return jsonify(build_state(cfg, db))

    @app.get("/photo/<h>.jpg")
    def photo(h: str):
        if not HASH_RE.match(h):
            abort(404)
        path = cfg.photos_dir / f"{h}.jpg"
        if not path.exists():
            abort(404)
        resp = send_file(path, mimetype="image/jpeg", max_age=86400)
        return resp

    @app.post("/api/approve")
    def approve():
        b = body()
        res = actions.approve(cfg, db, b["hash"], b["team"], b)
        notify()
        return jsonify({"ok": True, **res})

    @app.post("/api/reject")
    def reject():
        b = body()
        res = actions.reject(cfg, db, b["hash"], b["team"])
        return jsonify({"ok": True, **res})

    @app.post("/api/reassign")
    def reassign():
        b = body()
        res = actions.reassign(cfg, db, b["hash"], b["team"], b["to_team"])
        notify()
        return jsonify({"ok": True, **res})

    @app.post("/api/assign")
    def assign():
        b = body()
        res = actions.assign(cfg, db, b["hash"], b["team"])
        notify()
        return jsonify({"ok": True, **res})

    @app.post("/api/discard")
    def discard():
        b = body()
        return jsonify({"ok": True, **actions.discard(cfg, db, b["hash"])})

    @app.post("/api/redraft")
    def redraft():
        b = body()
        res = actions.redraft(cfg, db, b["hash"], b["team"])
        notify()
        return jsonify({"ok": True, **res})

    return app


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Photo Review Queue</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#1d1d1b;--mute:#6b6b66;--line:#e2e2dc;--ok:#1f7a3a;--warn:#a76200;--bad:#b42318;--acc:#2647d1;--chip:#eef0f7}
@media (prefers-color-scheme: dark){:root{--bg:#141413;--card:#1e1e1c;--ink:#ecece8;--mute:#9a9a93;--line:#33332f;--ok:#4cc27a;--warn:#e0a03a;--bad:#f0645a;--acc:#8ea2ff;--chip:#2a2c36}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{font-size:16px;margin:0}.stat{color:var(--mute)}.stat b{color:var(--ink)}
.keys{margin-left:auto;color:var(--mute);font-size:12px}kbd{border:1px solid var(--line);border-radius:4px;padding:0 4px;background:var(--card);font-size:11px}
main{max-width:1280px;margin:0 auto;padding:16px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute);margin:24px 0 8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:16px;padding:14px;margin-bottom:14px}
.card.focus{outline:2px solid var(--acc)}
.card img{width:100%;border-radius:6px;display:block;background:#0002}
.meta{font-size:13px;margin-top:8px}.meta div{margin:3px 0}
.badge{display:inline-block;padding:1px 7px;border-radius:99px;font-size:12px;font-weight:600;background:var(--chip)}
.b-ok{color:var(--ok)}.b-warn{color:var(--warn)}.b-bad{color:var(--bad)}
.ppl a{color:var(--acc);text-decoration:none}.ppl .inframe{font-weight:700}.ppl .nocons{color:var(--mute);text-decoration:line-through}.ppl .nocons .badge{text-decoration:none;display:inline-block}
label{display:block;font-size:12px;color:var(--mute);margin:8px 0 2px}
textarea{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;resize:vertical}
textarea.li{min-height:150px}textarea.xp{min-height:80px}textarea.sm{min-height:44px}
.count{float:right;font-size:12px}.over{color:var(--bad);font-weight:700}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
button,select{font:inherit;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 12px;cursor:pointer}
button.primary{background:var(--ok);border-color:var(--ok);color:#fff;font-weight:600}
button.danger{color:var(--bad)}
.problems{background:#a7620015;border-left:3px solid var(--warn);padding:6px 10px;font-size:12px;margin-top:8px}
.alert{background:#b4231815;border-left:3px solid var(--bad);padding:6px 10px;font-size:12px;margin-top:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.mini{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:12px}
.mini img{width:100%;border-radius:4px;display:block;aspect-ratio:4/3;object-fit:cover}
.mini select{width:100%;margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:13px;background:var(--card)}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
.empty{color:var(--mute);padding:8px 0}
.toggle{display:flex;gap:4px}.toggle button.on{background:var(--acc);border-color:var(--acc);color:#fff}
#toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:8px;display:none;z-index:9}
@media (max-width:760px){.card{grid-template-columns:1fr}.keys{display:none}}
</style></head><body>
<header><h1>Photo review</h1>
<span class="stat">to review <b id="n-review">0</b></span><span class="stat">drafting <b id="n-drafting">0</b></span>
<span class="stat">unresolved <b id="n-unresolved">0</b></span><span class="stat">scheduled <b id="n-approved">0</b></span>
<span class="keys"><kbd>j</kbd>/<kbd>k</kbd> move <kbd>a</kbd> approve <kbd>x</kbd> reject <kbd>t</kbd> A/B <kbd>r</kbd> reassign <kbd>e</kbd> edit <kbd>Esc</kbd> leave field</span>
</header>
<main>
<div id="failed"></div>
<h2>Ready for review</h2><div id="review"></div>
<h2>Unresolved photos</h2><div id="unresolved" class="grid"></div>
<h2>Drafting</h2><div id="drafting" class="grid"></div>
<h2>Scheduled</h2><div id="approved"></div>
</main><div id="toast"></div>
<script>
const S = {teams: [], cards: new Map(), focus: null, cfg: {}};
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const keyOf = c => c.hash + "|" + c.team;
function toast(msg){const t=$("#toast");t.textContent=msg;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>t.style.display="none",3500)}
async function post(url, data){
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const j = await r.json().catch(()=>({ok:false,error:"HTTP "+r.status}));
  if(!j.ok) throw new Error(j.error||"failed"); return j;
}
function scoreBadge(c){
  if(c.source==="hard") return `<span class="badge b-ok">filename tag</span>`;
  if(c.source==="manual") return `<span class="badge b-ok">assigned by you</span>`;
  const cls = c.ambiguous ? "b-bad" : (c.score >= S.cfg.gallery_auto_threshold ? "b-ok" : "b-warn");
  return `<span class="badge ${cls}">face ${c.score.toFixed(2)}${c.ambiguous?" ambiguous":""}</span>`;
}
function pubBadge(c){
  const m = {published:["b-ok","in gallery"],pending:["b-warn","publishing to gallery"],publishing:["b-warn","publishing"],
             held:["","gallery: waits for approval"],failed:["b-bad","gallery publish failed"]}[c.publish]||["",c.publish];
  return `<span class="badge ${m[0]}" data-pub>${m[1]}</span>`;
}
function teamOptions(exclude){
  return `<option value="">Reassign to team...</option>` + S.teams.filter(t=>t.slug!==exclude)
    .map(t=>`<option value="${esc(t.slug)}">${esc(t.name)} (${esc(t.slug)})</option>`).join("");
}
function people(c){
  if(!c.team_members.length) return "";
  return `<div class="ppl">People: ` + c.team_members.map(m => {
    if(!m.consent) return `<span class="nocons" title="Did not consent (or was not asked): do not name or tag">${esc(m.name)} <span class="badge b-bad">no consent, don't name/tag</span></span>`;
    const links = [m.linkedin?`<a href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`:"",
                   m.x_handle?`<a href="https://x.com/${esc(m.x_handle)}" target="_blank" rel="noopener">@${esc(m.x_handle)}</a>`:""].filter(Boolean).join(" ");
    return `<span class="${m.in_frame?"inframe":""}" title="${m.in_frame?"in frame (face match)":"team member, not identified in frame"}">${esc(m.name)} <span class="badge b-ok">consented</span>${m.in_frame?" (in frame)":""}${links?" "+links:""}</span>`;
  }).join(" · ") + `</div>`;
}
function metaBlock(c){
  let h = `<div class="meta"><div><b>${esc(c.team_name)}</b> <span class="stat">${esc(c.team)}${c.track?" · "+esc(c.track):""}</span></div>
    <div>${scoreBadge(c)} ${pubBadge(c)}</div>`;
  if(c.ambiguous && c.runner_up) h += `<div class="b-bad">Close second: ${esc(c.runner_up_name)} (margin ${c.margin})</div>`;
  if(c.others.length) h += `<div>Also tagged in this photo: ${c.others.map(o=>esc(o.name)+" ("+o.score.toFixed(2)+")").join(", ")}</div>`;
  h += people(c);
  if(c.idea) h += `<div class="stat">Idea: ${esc(c.idea)}</div>`;
  h += `<div class="stat">${esc(c.filename)}</div></div>`;
  if(c.publish==="failed") h += `<div class="alert">Gallery: ${esc(c.publish_error)}</div>`;
  return h;
}
function wordCount(t){const body=t.trim().split("\n");if(body.length&&body[body.length-1].includes("#"))body.pop();return body.join(" ").split(/\s+/).filter(Boolean).length}
function counters(el){
  el.querySelectorAll("textarea[data-f]").forEach(ta=>{
    const out = ta.previousElementSibling.querySelector(".count"); if(!out) return;
    const f = ta.dataset.f, v = ta.value;
    if(f==="x_post"){out.textContent=v.length+"/240";out.className="count"+(v.length>=240?" over":"")}
    else if(f.startsWith("linkedin")){const n=wordCount(v);out.textContent=n+" words";out.className="count"+((n<60||n>110)?" over":"")}
    if(/—/.test(v)) out.textContent += " (em dash will be replaced)";
  });
}
function reviewCard(c){
  const d = c.draft || {};
  const el = document.createElement("div"); el.className="card"; el.dataset.key = keyOf(c); el.tabIndex=-1;
  el.innerHTML = `<div><img loading="lazy" src="/photo/${c.hash}.jpg" alt="${esc(d.alt_text||"")}">${metaBlock(c)}</div>
  <div>
    <div class="row" style="margin-top:0"><span class="stat">LinkedIn</span>
      <span class="toggle"><button data-ab="a" class="on">A</button><button data-ab="b">B (use alternate)</button></span></div>
    <label>LinkedIn A<span class="count"></span></label><textarea class="li" data-f="linkedin_a">${esc(d.linkedin_a)}</textarea>
    <label style="display:none">LinkedIn B<span class="count"></span></label><textarea class="li" data-f="linkedin_b" style="display:none">${esc(d.linkedin_b)}</textarea>
    <label>X<span class="count"></span></label><textarea class="xp" data-f="x_post">${esc(d.x_post)}</textarea>
    <label>Gallery caption</label><textarea class="sm" data-f="caption">${esc(d.caption)}</textarea>
    <label>Alt text</label><textarea class="sm" data-f="alt_text">${esc(d.alt_text)}</textarea>
    ${(d.tag_names||[]).length?`<div class="meta">Tag: ${d.tag_names.map(esc).join(", ")}</div>`:""}
    ${c.problems.length?`<div class="problems">Check: ${c.problems.map(esc).join("; ")}</div>`:""}
    <div class="row"><button class="primary" data-act="approve">Approve (a)</button><button class="danger" data-act="reject">Reject (x)</button>
      <select data-act="reassign">${teamOptions(c.team)}</select><button data-act="redraft">Redraft</button></div>
  </div>`;
  el._useAlt = false;
  const setAB = alt => {
    el._useAlt = alt;
    el.querySelectorAll("[data-ab]").forEach(b=>b.classList.toggle("on",(b.dataset.ab==="b")===alt));
    const a = el.querySelector('[data-f="linkedin_a"]'), b = el.querySelector('[data-f="linkedin_b"]');
    a.style.display = alt?"none":""; a.previousElementSibling.style.display = alt?"none":"";
    b.style.display = alt?"":"none"; b.previousElementSibling.style.display = alt?"":"none";
  };
  el._toggle = () => setAB(!el._useAlt);
  el.querySelectorAll("[data-ab]").forEach(b=>b.onclick=()=>setAB(b.dataset.ab==="b"));
  el.addEventListener("input", ()=>{el._dirty=true;counters(el)});
  el.addEventListener("focusin", ()=>setFocus(el, false));
  el.querySelector('[data-act="approve"]').onclick = ()=>act(el,"approve");
  el.querySelector('[data-act="reject"]').onclick = ()=>act(el,"reject");
  el.querySelector('[data-act="redraft"]').onclick = ()=>act(el,"redraft");
  el.querySelector('select[data-act="reassign"]').onchange = e=>{ if(e.target.value) act(el,"reassign",e.target.value) };
  counters(el); el._card = c; return el;
}
async function act(el, what, arg){
  const c = el._card;
  try{
    if(what==="approve"){
      const data = {hash:c.hash, team:c.team, use_alt:el._useAlt};
      el.querySelectorAll("textarea[data-f]").forEach(t=>data[t.dataset.f]=t.value);
      const r = await post("/api/approve", data);
      toast(`Approved ${c.team_name}, slot ${fmtSlot(r.slot)}`);
    } else if(what==="reject"){
      const r = await post("/api/reject", {hash:c.hash, team:c.team});
      toast(r.already_published ? `Rejected. Note: already in ${c.team_name}'s gallery, remove it on the site if wrong.` : "Rejected");
    } else if(what==="reassign"){
      const name = (S.teams.find(t=>t.slug===arg)||{}).name||arg;
      if(!confirm(`Move this photo from ${c.team_name} to ${name}? A new draft will be written.`)){el.querySelector("select").value="";return}
      const r = await post("/api/reassign", {hash:c.hash, team:c.team, to_team:arg});
      toast(r.already_published ? `Reassigned. It was already in ${c.team_name}'s gallery: remove it there.` : `Reassigned to ${name}`);
    } else if(what==="redraft"){
      await post("/api/redraft", {hash:c.hash, team:c.team}); toast("Redrafting");
    }
    const next = el.nextElementSibling; S.cards.delete(keyOf(c)); el.remove();
    if(next && next.classList.contains("card")) setFocus(next); refresh();
  }catch(e){toast("Error: "+e.message)}
}
function fmtSlot(s){try{return new Date(s).toLocaleString([], {weekday:"short",hour:"2-digit",minute:"2-digit"})}catch(e){return s}}
function setFocus(el, scroll=true){
  document.querySelectorAll(".card.focus").forEach(c=>c.classList.remove("focus"));
  if(!el) return; el.classList.add("focus"); S.focus = el.dataset.key;
  if(scroll) el.scrollIntoView({block:"start",behavior:"smooth"});
}
function renderReview(list){
  const box = $("#review"), want = new Set(list.map(keyOf));
  for(const [k, el] of S.cards){ if(!want.has(k) && !el.contains(document.activeElement)){el.remove();S.cards.delete(k)} }
  for(const c of list){
    const k = keyOf(c); let el = S.cards.get(k);
    if(!el){ el = reviewCard(c); S.cards.set(k, el); box.appendChild(el); }
    else { el._card = c; const b = el.querySelector("[data-pub]"); if(b) b.outerHTML = pubBadge(c); }
  }
  if(!list.length && !box.children.length) box.innerHTML = `<div class="empty">Nothing waiting. New drafts appear here automatically.</div>`;
  else box.querySelectorAll(".empty").forEach(e=>e.remove());
  if(!document.querySelector(".card.focus") && box.querySelector(".card")) setFocus(box.querySelector(".card"), false);
}
function renderUnresolved(list){
  const box = $("#unresolved");
  if(box.contains(document.activeElement)) return;  // don't yank the picker from under you
  box.innerHTML = list.length ? "" : `<div class="empty">None.</div>`;
  for(const p of list){
    const el = document.createElement("div"); el.className="mini";
    el.innerHTML = `<img loading="lazy" src="/photo/${p.hash}.jpg" alt=""><div>${esc(p.filename)}</div>
      <div class="stat">${p.faces_used} usable face(s) of ${p.faces_total}${p.note?" · "+esc(p.note):""}</div>
      <select><option value="">Assign to team...</option>${S.teams.map(t=>`<option value="${esc(t.slug)}">${esc(t.name)}</option>`).join("")}</select>
      <div class="row"><button class="danger">Discard</button></div>`;
    el.querySelector("select").onchange = async e => { const v=e.target.value; if(!v) return;
      try{ await post("/api/assign",{hash:p.hash, team:v}); toast("Assigned, drafting now"); el.remove(); refresh(); }catch(err){toast("Error: "+err.message)} };
    el.querySelector("button").onclick = async () => { try{ await post("/api/discard",{hash:p.hash}); el.remove(); refresh(); }catch(err){toast("Error: "+err.message)} };
    box.appendChild(el);
  }
}
function renderDrafting(list){
  const box = $("#drafting");
  if(box.contains(document.activeElement)) return;
  box.innerHTML = list.length ? "" : `<div class="empty">None.</div>`;
  for(const c of list){
    const el = document.createElement("div"); el.className="mini";
    el.innerHTML = `<img loading="lazy" src="/photo/${c.hash}.jpg" alt=""><div><b>${esc(c.team_name)}</b> ${scoreBadge(c)}</div>
      <div>${c.draft_status==="error"?`<span class="b-bad">draft failed: ${esc(c.draft_error)}</span>`:c.draft_status==="writing"?"writing...":"queued"+(c.draft_error?` (retrying: ${esc(c.draft_error)})`:"")}</div>
      <select>${teamOptions(c.team)}</select>
      <div class="row">${c.draft_status==="error"?`<button data-r>Retry</button>`:""}<button class="danger" data-x>Reject</button></div>`;
    el._card = c;
    el.querySelector("select").onchange = e => e.target.value && act(el,"reassign",e.target.value);
    el.querySelector("[data-x]").onclick = () => act(el,"reject");
    const r = el.querySelector("[data-r]"); if(r) r.onclick = () => act(el,"redraft");
    box.appendChild(el);
  }
}
function renderApproved(list){
  $("#approved").innerHTML = list.length ? `<table><tr><th>Slot</th><th>Team</th><th>Gallery</th><th>LinkedIn</th><th>X</th></tr>` +
    list.map(c=>{const f=c.final||{};return `<tr><td>${esc(fmtSlot(c.slot))}</td><td>${esc(c.team_name)}</td><td>${pubBadge(c)}</td>
      <td>${esc(((f.use_alt?f.linkedin_b:f.linkedin_a)||"").slice(0,120))}...</td><td>${esc(f.x_post)}</td></tr>`}).join("") +
    `</table><div class="stat" style="margin-top:6px">Buffer CSV: ${esc(S.cfg.queue_csv)}</div>` : `<div class="empty">Nothing approved yet.</div>`;
}
function renderFailed(list){
  $("#failed").innerHTML = list.length ? `<div class="alert"><b>Gallery publish failed</b> for: ${list.map(c=>esc(c.team_name)+" ("+esc(c.publish_error)+")").join("; ")}</div>` : "";
}
async function refresh(){
  try{
    const s = await (await fetch("/api/state")).json();
    S.teams = s.teams; S.cfg = s.config;
    renderReview(s.review); renderUnresolved(s.unresolved); renderDrafting(s.drafting); renderApproved(s.approved); renderFailed(s.failed);
    for(const k of ["review","drafting","unresolved","approved"]) $("#n-"+k).textContent = s[k].length;
    document.title = (s.review.length?`(${s.review.length}) `:"") + "Photo Review Queue";
  }catch(e){ console.error(e) }
}
document.addEventListener("keydown", e => {
  const tag = (e.target.tagName||"").toLowerCase();
  if(e.key==="Escape"){ if(["textarea","input","select"].includes(tag)) e.target.blur(); return; }
  if(["textarea","input","select"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
  const cards = [...document.querySelectorAll("#review .card")]; if(!cards.length) return;
  let i = cards.findIndex(c=>c.classList.contains("focus")); if(i<0) i=0; const cur = cards[i];
  if(e.key==="j"){ setFocus(cards[Math.min(i+1,cards.length-1)]); }
  else if(e.key==="k"){ setFocus(cards[Math.max(i-1,0)]); }
  else if(e.key==="a"){ act(cur,"approve"); }
  else if(e.key==="x"){ act(cur,"reject"); }
  else if(e.key==="t"){ cur._toggle(); }
  else if(e.key==="r"){ cur.querySelector('select[data-act="reassign"]').focus(); }
  else if(e.key==="e"){ const t=[...cur.querySelectorAll("textarea[data-f]")].find(t=>t.style.display!=="none"); if(t) t.focus(); }
  else return;
  e.preventDefault();
});
refresh(); setInterval(refresh, 4000);
</script></body></html>"""
