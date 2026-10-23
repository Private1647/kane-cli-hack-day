"use client";

export default function PrintButton({ children = "Print" }: { children?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex min-h-11 items-center bg-bright px-4 font-plex text-sm text-ink transition-colors hover:bg-lime"
    >
      {children}
    </button>
  );
}
