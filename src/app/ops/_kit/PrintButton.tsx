"use client";

/** Opens the browser's print dialog. Hidden on paper. */
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink transition-colors hover:bg-lime">
      {label}
    </button>
  );
}
