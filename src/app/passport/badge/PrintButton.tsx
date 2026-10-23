"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="min-h-11 bg-black px-4 py-2.5 font-plex text-sm text-white hover:opacity-80">
      Print
    </button>
  );
}
