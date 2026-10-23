import type { ReactNode } from "react";

// A tiny Markdown renderer for the print kit's own trusted documents:
// headings, paragraphs, lists, "- [ ]" check boxes, pipe tables, **bold**
// and `code`. No HTML passthrough, so nothing in a document can inject markup.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[ \])/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={`${key}-${i++}`} className="font-medium text-bright">{t.slice(2, -2)}</strong>);
    else if (t === "[ ]") out.push(<span key={`${key}-${i++}`} aria-label="check box" className="mx-0.5 inline-block h-3 w-3 translate-y-0.5 border border-bright" />);
    else out.push(<code key={`${key}-${i++}`} className="bg-surface-2 px-1 text-[0.95em] text-bright">{t.slice(1, -1)}</code>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ md }: { md: string }) {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const key = `b${k++}`;
    if (line.startsWith("# ")) {
      blocks.push(<h2 key={key} className="font-display text-xl font-bold text-bright sm:text-2xl">{inline(line.slice(2), key)}</h2>);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={key} className="mt-2 font-pixel text-[11px] uppercase tracking-[0.2em] text-lightgray">{inline(line.slice(3), key)}</h3>);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-xs">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border border-hairline px-2 py-1.5 font-medium text-bright">{inline(c, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="print-avoid-break">
                  {r.map((c, j) => (
                    <td key={j} className="h-7 border border-hairline px-2 py-1.5 align-top">{inline(c, `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^(\d+\.|-)\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|-)\s/.test(lines[i])) {
        items.push(lines[i].replace(/^(\d+\.|-)\s/, ""));
        i++;
      }
      const cls = `space-y-1.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`;
      const children = items.map((t, j) => <li key={j}>{inline(t, `${key}i${j}`)}</li>);
      blocks.push(ordered ? <ol key={key} className={cls}>{children}</ol> : <ul key={key} className={cls}>{children}</ul>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||\d+\.\s|-\s)/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
    }
  }
  return <div className="space-y-3 font-plex text-[13px] leading-relaxed text-lightgray">{blocks}</div>;
}
