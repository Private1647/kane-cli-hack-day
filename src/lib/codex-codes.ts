// Parsing and masking OpenAI Codex credit codes (pure; unit tested).
//
// Accepted upload formats (file or paste):
//   1. CSV with a header row that has a `code` column (any case, any position).
//      Every other column is kept per code in `extra` (amount, expiry, notes…).
//      Quoted fields ("a,b") are supported.
//   2. One code per line, no header.
// Blank lines are ignored. Codes are trimmed; a code is 4–128 characters of
// letters, digits, '-', '_' or '.'. Repeats inside the file are counted once.

export type ParsedCode = { code: string; extra: Record<string, string> };
export type ParsedCodes = { rows: ParsedCode[]; duplicatesInFile: number; invalid: { line: number; value: string }[] };

const VALID = /^[A-Za-z0-9][A-Za-z0-9._-]{3,127}$/;

/** Split one CSV line, honouring double quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCodexCodes(text: string): ParsedCodes {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const rows: ParsedCode[] = [];
  const invalid: ParsedCodes["invalid"] = [];
  const seen = new Set<string>();
  let duplicatesInFile = 0;
  if (first < 0) return { rows, duplicatesInFile, invalid };

  const header = splitCsvLine(lines[first]).map((h) => h.toLowerCase());
  const codeCol = header.indexOf("code");
  const hasHeader = codeCol >= 0;
  const names = splitCsvLine(lines[first]);

  for (let i = hasHeader ? first + 1 : first; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = hasHeader ? splitCsvLine(raw) : [raw.trim()];
    const code = (hasHeader ? cells[codeCol] : cells[0])?.trim() ?? "";
    if (!VALID.test(code)) {
      invalid.push({ line: i + 1, value: code.slice(0, 40) });
      continue;
    }
    if (seen.has(code)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(code);
    const extra: Record<string, string> = {};
    if (hasHeader) names.forEach((n, j) => j !== codeCol && n && cells[j] && (extra[n.slice(0, 40)] = cells[j].slice(0, 200)));
    rows.push({ code, extra });
  }
  return { rows, duplicatesInFile, invalid };
}

/** "ABCD-EFGH-9F2A" → "••••-9F2A". Never shows more than the last four characters. */
export function maskCode(code: string) {
  return `••••-${code.slice(-4)}`;
}
