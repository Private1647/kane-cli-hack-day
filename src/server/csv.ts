// CSV in and out for the roster import, ledgers and exports. RFC 4180:
// quoted fields, doubled quotes, CRLF or LF, an optional UTF-8 BOM.
// No "server-only" here: the parser is pure and also handy in tests.

/** Parse CSV text into rows of trimmed cells. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Header row → lower_snake keys; each data row → { key: value }. `line` is the 1-based file line. */
export function csvObjects(text: string): { headers: string[]; rows: { line: number; values: Record<string, string> }[] } {
  const [head = [], ...body] = parseCsv(text);
  const headers = head.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );
  return {
    headers,
    rows: body.map((cells, i) => ({
      line: i + 2,
      values: Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ""])),
    })),
  };
}

/** One CSV cell, quoted, with leading formula characters neutralised for spreadsheet apps. */
export function csvCell(v: unknown) {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Headers for a CSV download that must never be cached. */
export function csvHeaders(filename: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    "cache-control": "no-store",
    ...extra,
  };
}
