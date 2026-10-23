// Pure help-desk rules (no database, so unit tests can import them):
// what a mentor may read on a ticket, and how a paper slip's time is read.

// ── Secrets never go on a ticket ─────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk)-(?:proj-|live-|test-|ant-)?[A-Za-z0-9_-]{16,}\b/g, // OpenAI / Anthropic / Stripe style keys
  /\bkh[kpbh]_[A-Za-z0-9_-]{10,}\b/g, // our own bearer / pairing tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, // pasted Authorization headers
  /(?<=:\/\/[^\s/:@]+:)[^\s/@]+(?=@)/g, // the password in postgres://user:pass@host
  // KEY=value, "api_key": "…", OPENAI_API_KEY=… (but not max_tokens=1024)
  /\b((?:[A-Za-z0-9]+[_-])*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key))(?![A-Za-z])["']?\s*[:=]\s*["']?(?!\[redacted)[^\s"',;]+/gi,
];

const SECRET_NOTE = "[redacted: secret]";

/** Strip anything that looks like a credential. Tickets are read by many mentors and go to Slack. */
export function scrubSecrets(text: string): { text: string; redacted: boolean } {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, label?: unknown) => (typeof label === "string" && /[:=]/.test(m) ? `${label}=${SECRET_NOTE}` : SECRET_NOTE));
  }
  return { text: out, redacted: out !== text };
}

// ── What a mentor may read ───────────────────────────────────────────────────
//
// The participant who wrote a ticket always sees their own words. Everyone
// else (mentors, organizers, the REST and MCP staff views) gets a copy with:
//   - secrets (again: rows from before a pattern existed, and replies);
//   - excerpts from a private repository nobody has shared with them: the
//     text after "from our private repo x/y:" (or after a linked private
//     repo's name) and a code block that follows such a line;
//   - biometric data: face templates / embeddings / vectors, and references
//     to selfie files.
// Plain mentions ("can't push to x/y"), stack traces and code with no private
// flag stay, so a mentor can still help.

export type RedactionKind = "secret" | "private_repo" | "biometric" | "selfie";

export const REDACTION_LABEL: Record<RedactionKind, string> = {
  secret: "secrets",
  private_repo: "private repository excerpts",
  biometric: "biometric data",
  selfie: "selfie attachments",
};

export type RedactContext = {
  /** Full names ("org/repo") of the team's linked private repositories. */
  privateRepos: string[];
  /** Viewer may read private-repo excerpts (a teammate). Mentors never are unless shared. */
  repoAccess: boolean;
};

const BIOMETRIC_TERM =
  /\b(?:biometric\w*|face\s*(?:print|id\s+data)|faceprint|(?:face|facial|selfie)[\s_-]*(?:template|embedding|vector|descriptor|encoding|landmarks?|signature|features?))\b/i;
// What makes a biometric line carry data, not just talk about it.
const BIOMETRIC_PAYLOAD = /\[\s*-?\d*\.\d+(?:\s*,\s*-?\d*\.\d+){2,}|[A-Za-z0-9+/]{24,}={0,2}|\b[0-9a-f]{32,}\b/i;
// A long bare float vector is an embedding whatever it's called.
const EMBEDDING_VECTOR = /\[\s*-?\d*\.\d+(?:\s*,\s*-?\d*\.\d+){31,}\s*\]/g;
const SELFIE_REF = /(?:https?:\/\/\S*?)?\b[\w./-]*selfies?[\w./-]*\.(?:jpe?g|png|heic|heif|webp|gif)\b|(?:https?:\/\/\S*)?\/selfies?\/\S+/gi;
const IMAGE_DATA_URI = /data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]{16,}/gi;

const PRIVATE_FLAG = /\b(?:private|internal|proprietary|confidential)\s+(?:git\s*hub\s+)?(?:repo(?:sitory)?|codebase|code|source)\b|\(private\)|\bunder\s+NDA\b/i;
const FENCE = /^\s*(```|~~~)/;
// Pasting, not just naming the repo.
const EXCERPT_INTENT = /\b(?:from|excerpt|snippet|copied|pasted|here'?s|here is)\b/i;
const CODE_LIKE = /[;{}]|=>|\b(?:const|let|var|def|class|import|function|return|export|package|func)\b/;

/** A fenced or 4-space-indented block starting at line `start`: its last line. */
function codeBlockAt(lines: string[], start: number): { end: number } | null {
  const first = lines[start] ?? "";
  const f = FENCE.exec(first);
  if (f) {
    let j = start + 1;
    while (j < lines.length && !lines[j].trimStart().startsWith(f[1])) j++;
    return { end: Math.min(j, lines.length - 1) };
  }
  if (!/^(?: {4}|\t)\S/.test(first)) return null;
  let j = start;
  while (j + 1 < lines.length && /^(?: {4}|\t)/.test(lines[j + 1])) j++;
  return { end: j };
}

const note = (what: string) => `[redacted: ${what}]`;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Where on a line a private repo is named or flagged, with the repo's name if known. */
function privateMention(line: string, repos: string[]): { end: number; repo: string | null } | null {
  for (const full of repos) {
    const short = full.split("/").pop() ?? "";
    for (const name of [full, short.length >= 5 ? short : ""]) {
      if (!name) continue;
      const m = new RegExp(`(?<![\\w.-])${escapeRe(name)}(?![\\w-])(?:\\s*\\(private\\))?`, "i").exec(line);
      if (m) return { end: m.index + m[0].length, repo: full };
    }
  }
  const f = PRIVATE_FLAG.exec(line);
  if (!f) return null;
  // "private repo acme/core (private):" → keep the name, cut after it.
  const after = /^\s*[\w.-]+\/[\w.-]+(?:\s*\(private\))?/.exec(line.slice(f.index + f[0].length));
  return { end: f.index + f[0].length + (after?.[0].length ?? 0), repo: after ? after[0].replace(/\(private\)/i, "").trim() : null };
}

/**
 * The copy of a ticket's text a viewer other than its author may read.
 * Returns which kinds were removed so the UI can say so.
 */
export function redactRestricted(text: string, ctx: RedactContext): { text: string; kinds: RedactionKind[] } {
  const kinds = new Set<RedactionKind>();
  const s = scrubSecrets(text);
  if (s.redacted) kinds.add("secret");

  const lines = s.text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (!ctx.repoAccess) {
      const m = privateMention(line, ctx.privateRepos);
      if (m) {
        const what = `private repository excerpt${m.repo ? ` (${m.repo})` : ""}`;
        const colon = line.indexOf(":", m.end);
        const rest = colon >= 0 ? line.slice(colon + 1) : "";
        // Cut what follows "…from our private repo x/y:" when it is pasted
        // content, not an error message ("can't push to x/y: denied" stays).
        if (rest.trim() && (EXCERPT_INTENT.test(line.slice(0, colon)) || CODE_LIKE.test(rest))) {
          line = `${line.slice(0, colon + 1)} ${note(what)}`;
          kinds.add("private_repo");
        }
        // And a code block (fenced, or indented) that starts on the next line.
        const block = codeBlockAt(lines, i + 1);
        if (block && (EXCERPT_INTENT.test(line) || CODE_LIKE.test(lines.slice(i + 1, block.end + 1).join("\n")))) {
          out.push(line, note(what));
          kinds.add("private_repo");
          i = block.end;
          continue;
        }
      }
    }

    // Biometrics: a line that names face data and carries some.
    const b = BIOMETRIC_TERM.exec(line);
    if (b && BIOMETRIC_PAYLOAD.test(line.slice(b.index))) {
      line = `${line.slice(0, b.index)}${note("biometric data")}`;
      kinds.add("biometric");
    }
    line = line.replace(EMBEDDING_VECTOR, () => {
      kinds.add("biometric");
      return note("biometric data");
    });
    line = line.replace(SELFIE_REF, () => {
      kinds.add("selfie");
      return note("selfie attachment");
    });
    line = line.replace(IMAGE_DATA_URI, () => {
      kinds.add("selfie");
      return note("image data");
    });
    out.push(line);
  }
  return { text: out.join("\n"), kinds: [...kinds] };
}

// ── Paper slip times ─────────────────────────────────────────────────────────

export type PaperTime = { ok: true; value: string; local: boolean } | { ok: false; message: string };

/**
 * A time written on a paper slip → a value for Postgres. Accepted:
 *   "2026-10-23 00:15", "2026-10-23T00:15" (the date-time picker), "00:15",
 *   "13:05", "1:05 PM", "2026-10-24 1:05 pm", or ISO with an offset.
 * Times without a date use `eventDate`. Local times are in the event zone.
 * "1:05" with no AM/PM is refused: 24-hour times need two digits (01:05, 13:05).
 */
export function parsePaperTime(raw: string, eventDate: string): PaperTime {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { ok: false, message: "Copy the time written on the slip." };
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? { ok: false, message: `"${raw}" isn't a real time.` } : { ok: true, value: d.toISOString(), local: false };
  }
  const m = /^(?:(\d{4})-(\d{2})-(\d{2})[T ])?(\d{1,2}):(\d{2})(?::(\d{2}))?(?: ?([ap])\.?m\.?)?$/i.exec(s);
  if (!m) return { ok: false, message: `"${raw}" isn't a time. Use 24-hour time like 00:15 or 13:05, or add AM/PM (1:05 PM).` };
  const [, y, mo, d, hs, mi, sec, ap] = m;
  let h = Number(hs);
  if (Number(mi) > 59 || Number(sec ?? 0) > 59) return { ok: false, message: `"${raw}" isn't a real time.` };
  if (ap) {
    if (h < 1 || h > 12) return { ok: false, message: `"${raw}": with AM/PM the hour is 1–12. For 24-hour time drop the AM/PM.` };
    if (ap.toLowerCase() === "p" && h < 12) h += 12;
    if (ap.toLowerCase() === "a" && h === 12) h = 0;
  } else {
    if (h > 23) return { ok: false, message: `"${raw}" isn't a real time.` };
    if (hs.length === 1) {
      return { ok: false, message: `"${raw}" could be AM or PM. Write it as 24-hour time (0${h}:${mi} or ${h + 12}:${mi}) or add AM/PM.` };
    }
  }
  const date = y ? `${y}-${mo}-${d}` : eventDate;
  if (y) {
    const check = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== date) return { ok: false, message: `"${raw}" isn't a real date.` };
  }
  return { ok: true, value: `${date} ${String(h).padStart(2, "0")}:${mi}:${sec ?? "00"}`, local: true };
}

/** "00:15" → "12:15 AM": the same wall time read back in words, so AM/PM can be checked against the slip. */
export function wallClockWords(hhmm: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const h = Number(m[1]);
  const when = h === 0 ? " (just after midnight)" : h === 12 ? " (noon)" : h < 5 ? " (night)" : "";
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}${when}`;
}

/** A slip time this long before entry is backdated: the form asks why it was entered late. */
export const PAPER_LATE_AFTER_MINUTES = 15;
