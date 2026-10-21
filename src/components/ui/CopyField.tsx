"use client";

import { useState } from "react";

// A monospace value (command, WiFi password…) with a one-click copy button.
export default function CopyField({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); the text stays selectable.
    }
  };
  return (
    <div className={`flex items-start justify-between gap-3 border border-dashed border-hairline bg-surface px-3 py-2 ${className}`}>
      <pre className="min-w-0 overflow-x-auto font-plex text-xs leading-relaxed whitespace-pre text-bright">{value}</pre>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray transition-colors hover:text-lime"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
