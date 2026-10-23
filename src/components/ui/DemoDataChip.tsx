// Marks fictional / staging numbers so they can't be mistaken for real ones
// (the blueprint's prototype-note, in our style). Render it wherever
// hack_events.is_demo or a row's is_demo is true. Production /live must not
// render demo values at all; this chip is for staging and previews.
export default function DemoDataChip({ fixed = false, children = "Illustrative · demo data" }: { fixed?: boolean; children?: string }) {
  return (
    <span
      role="note"
      className={`inline-flex items-center gap-1.5 border border-dashed border-warning bg-ink px-2 py-1 font-pixel text-[10px] uppercase tracking-[0.2em] text-warning ${
        fixed ? "fixed right-4 bottom-4 z-50" : ""
      }`}
    >
      <span aria-hidden="true">!</span>
      {children}
    </span>
  );
}
